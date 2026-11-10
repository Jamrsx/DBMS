//! A password in front of a public link. Cloudflare's tunnel talks to this gate, and the gate
//! passes requests to the real site only for visitors who typed the password: they get NexDB's
//! sign-in page first, then a cookie for as long as the link runs.
//!
//! Every request is checked (Cloudflare reuses connections across visitors), and each one is
//! sent upstream with `Connection: close`, so one checked request is one upstream connection.
//! WebSocket upgrades (Vite's live reload) are checked once, then piped both ways.

use std::io::{Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

const COOKIE: &str = "nexdb_share";
const LOGIN_PATH: &str = "/__nexdb/sign-in";
const MAX_HEAD: usize = 64 * 1024;

/// A running gate: listens on `port` and forwards to `upstream`. Dropping it stops it.
pub struct Gate {
    pub port: u16,
    stop: Arc<AtomicBool>,
}

impl Drop for Gate {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // Wake the accept loop so it sees the flag.
        let _ = TcpStream::connect(("127.0.0.1", self.port));
    }
}

struct Secret {
    /// None: an open forwarder (a fixed link without a password).
    password: Option<String>,
    token: String,
}

pub fn start(upstream: u16, password: &str) -> Result<Gate, String> {
    start_on(upstream, Some(password), 0)
}

/// Like `start`, on a chosen port (0 picks a free one). Without a password it only forwards,
/// which is how a fixed link reaches whichever project uses it.
pub fn start_on(upstream: u16, password: Option<&str>, port: u16) -> Result<Gate, String> {
    if password.is_some_and(|p| p.chars().count() < 4) {
        return Err("Use a password of at least 4 characters.".into());
    }
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| {
        if port != 0 {
            format!("Port {port} is in use by another program, so the fixed link can't start. Close that program, or stop the other fixed link.")
        } else {
            format!("Couldn't start the password page: {e}")
        }
    })?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let stop = Arc::new(AtomicBool::new(false));
    let secret = Arc::new(Secret { password: password.map(str::to_string), token: token()? });
    let flag = stop.clone();
    std::thread::spawn(move || {
        for conn in listener.incoming() {
            if flag.load(Ordering::SeqCst) {
                break;
            }
            let Ok(conn) = conn else { continue };
            let secret = secret.clone();
            std::thread::spawn(move || {
                let _ = serve(conn, upstream, &secret);
            });
        }
    });
    Ok(Gate { port, stop })
}

fn token() -> Result<String, String> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).map_err(|e| format!("Couldn't make a sign-in token: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Compares without stopping at the first difference, so timing says nothing about the password.
fn same(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let mut diff = (a.len() ^ b.len()) as u8;
    for i in 0..a.len().max(b.len()) {
        diff |= a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0);
    }
    diff == 0
}

/// A request's first line and headers.
pub struct Head {
    pub method: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
}

impl Head {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
    }
}

pub fn parse_head(text: &str) -> Option<Head> {
    let mut lines = text.split("\r\n");
    let mut first = lines.next()?.split(' ');
    let method = first.next()?.to_string();
    let path = first.next()?.to_string();
    let headers = lines
        .take_while(|l| !l.is_empty())
        .filter_map(|l| l.split_once(':').map(|(k, v)| (k.trim().to_string(), v.trim().to_string())))
        .collect();
    Some(Head { method, path, headers })
}

/// Whether the request carries the gate's cookie.
pub fn signed_in(head: &Head, token: &str) -> bool {
    head.headers
        .iter()
        .filter(|(k, _)| k.eq_ignore_ascii_case("cookie"))
        .flat_map(|(_, v)| v.split(';'))
        .filter_map(|c| c.trim().split_once('='))
        .any(|(k, v)| k == COOKIE && same(v, token))
}

/// Reads up to the blank line after the headers. Returns the head and any body bytes after it.
pub(crate) fn read_head(conn: &mut TcpStream) -> Option<(Vec<u8>, Vec<u8>)> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        let n = conn.read(&mut chunk).ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(end) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            let rest = buf.split_off(end + 4);
            return Some((buf, rest));
        }
        if buf.len() > MAX_HEAD {
            return None;
        }
    }
}

fn serve(mut conn: TcpStream, upstream: u16, secret: &Secret) -> std::io::Result<()> {
    conn.set_read_timeout(Some(Duration::from_secs(30)))?;
    let Some((raw, rest)) = read_head(&mut conn) else { return Ok(()) };
    let text = String::from_utf8_lossy(&raw).to_string();
    let Some(head) = parse_head(&text) else { return Ok(()) };

    if secret.password.is_some() && head.path.starts_with(LOGIN_PATH) {
        return sign_in(conn, &head, rest, secret);
    }
    if secret.password.is_some() && !signed_in(&head, &secret.token) {
        let wants_page = head.method == "GET" && head.header("accept").is_some_and(|a| a.contains("text/html"));
        let body = if wants_page { page(&head.path, false) } else { "Sign in first: open this link in a browser.".into() };
        let status = if wants_page { "200 OK" } else { "401 Unauthorized" };
        let kind = if wants_page { "text/html; charset=utf-8" } else { "text/plain; charset=utf-8" };
        return respond(conn, status, kind, &[], &body);
    }

    // Signed in: pass the request on, asking upstream to close after one response.
    let upgrade = head.header("upgrade").is_some();
    let mut out = format!("{} {} HTTP/1.1\r\n", head.method, head.path);
    for (k, v) in &head.headers {
        if k.eq_ignore_ascii_case("connection") && !upgrade || k.eq_ignore_ascii_case("keep-alive") {
            continue;
        }
        out.push_str(&format!("{k}: {v}\r\n"));
    }
    if !upgrade {
        out.push_str("Connection: close\r\n");
    }
    out.push_str("\r\n");

    let mut up = match TcpStream::connect(("127.0.0.1", upstream)) {
        Ok(s) => s,
        Err(_) => {
            return respond(conn, "502 Bad Gateway", "text/plain; charset=utf-8", &[], "The shared site isn't running on this PC right now.")
        }
    };
    up.write_all(out.as_bytes())?;
    up.write_all(&rest)?;
    conn.set_read_timeout(None)?;
    pipe(conn, up)
}

/// Copies both ways until either side closes.
pub(crate) fn pipe(client: TcpStream, upstream: TcpStream) -> std::io::Result<()> {
    let (mut c_read, mut u_write) = (client.try_clone()?, upstream.try_clone()?);
    let to_upstream = std::thread::spawn(move || {
        let _ = std::io::copy(&mut c_read, &mut u_write);
        let _ = u_write.shutdown(Shutdown::Write);
    });
    let (mut u_read, mut c_write) = (upstream, client);
    let _ = std::io::copy(&mut u_read, &mut c_write);
    let _ = c_write.shutdown(Shutdown::Both);
    let _ = u_read.shutdown(Shutdown::Both);
    let _ = to_upstream.join();
    Ok(())
}

fn sign_in(mut conn: TcpStream, head: &Head, mut body: Vec<u8>, secret: &Secret) -> std::io::Result<()> {
    if head.method != "POST" {
        return respond(conn, "200 OK", "text/html; charset=utf-8", &[], &page("/", false));
    }
    let len: usize = head.header("content-length").and_then(|v| v.parse().ok()).unwrap_or(0).min(8 * 1024);
    while body.len() < len {
        let mut chunk = [0u8; 1024];
        let n = conn.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..n]);
    }
    let form = String::from_utf8_lossy(&body[..body.len().min(len)]).to_string();
    let field = |name: &str| {
        form.split('&').find_map(|kv| kv.split_once('=').filter(|(k, _)| *k == name).map(|(_, v)| url_decode(v)))
    };
    // Only a path on this site: not //other.site or /\other.site, which browsers treat as another site.
    let next = field("next")
        .filter(|n| n.starts_with('/') && !n.starts_with("//") && !n.contains('\\') && !n.contains(['\r', '\n']))
        .unwrap_or_else(|| "/".into());
    if field("password").is_some_and(|p| secret.password.as_deref().is_some_and(|want| same(&p, want))) {
        let cookie = format!("Set-Cookie: {COOKIE}={}; Path=/; HttpOnly; Secure; SameSite=Lax", secret.token);
        return respond(conn, "303 See Other", "text/plain; charset=utf-8", &[&cookie, &format!("Location: {next}")], "");
    }
    // A wrong password waits a moment, so guessing is slow.
    std::thread::sleep(Duration::from_millis(800));
    respond(conn, "200 OK", "text/html; charset=utf-8", &[], &page(&next, true))
}

pub(crate) fn respond(mut conn: TcpStream, status: &str, kind: &str, extra: &[&str], body: &str) -> std::io::Result<()> {
    let mut out = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n",
        body.len()
    );
    for h in extra {
        out.push_str(h);
        out.push_str("\r\n");
    }
    out.push_str("\r\n");
    out.push_str(body);
    conn.write_all(out.as_bytes())?;
    conn.flush()?;
    let _ = conn.shutdown(Shutdown::Both);
    Ok(())
}

pub fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok());
                match hex {
                    Some(b) => {
                        out.push(b);
                        i += 2;
                    }
                    None => out.push(b'%'),
                }
            }
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// The sign-in page visitors see first.
pub fn page(next: &str, wrong: bool) -> String {
    let error = if wrong { r#"<p class="err" role="alert">That password isn't right. Try again.</p>"# } else { "" };
    format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Password needed</title><meta name="robots" content="noindex">
<style>
:root{{color-scheme:light dark;--bg:#f3f4f6;--card:#fff;--text:#111827;--muted:#4b5563;--accent:#2f6ae0;--bad:#b42318}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0f1114;--card:#1a1d22;--text:#e5e7eb;--muted:#9ca3af;--bad:#f97066}}}}
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif;padding:16px;box-sizing:border-box}}
main{{width:100%;max-width:360px;background:var(--card);border-radius:14px;padding:28px;box-shadow:0 10px 40px rgb(0 0 0/.12)}}
h1{{font-size:20px;margin:0 0 6px}}p{{margin:0 0 18px;color:var(--muted)}}
label{{display:block;font-weight:600;margin-bottom:6px}}
input{{width:100%;box-sizing:border-box;height:42px;padding:0 12px;border:1px solid #9ca3af;border-radius:8px;font:inherit;background:transparent;color:inherit}}
input:focus-visible,button:focus-visible{{outline:3px solid var(--accent);outline-offset:2px}}
button{{margin-top:14px;width:100%;height:42px;border:0;border-radius:8px;background:var(--accent);color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer}}
.err{{color:var(--bad);font-weight:600;margin:12px 0 0}}small{{display:block;margin-top:18px;color:var(--muted);font-size:12px}}
</style></head><body><main>
<h1>Password needed</h1><p>The person who shared this site asked for a password. Type the one they gave you.</p>
<form method="post" action="{LOGIN_PATH}"><input type="hidden" name="next" value="{next}">
<label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
{error}<button type="submit">Open the site</button></form><small>Shared with NexDB</small>
</main></body></html>"#,
        next = escape(next),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get(port: u16, path: &str, extra: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(s, "GET {path} HTTP/1.1\r\nHost: x\r\nAccept: text/html\r\n{extra}\r\n").unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        out
    }

    /// A tiny upstream that answers every request with its path.
    fn upstream() -> u16 {
        let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for c in l.incoming().flatten() {
                std::thread::spawn(move || {
                    let mut c = c;
                    if let Some((raw, _)) = read_head(&mut c) {
                        let head = parse_head(&String::from_utf8_lossy(&raw)).unwrap();
                        let body = format!("site {} close={}", head.path, head.header("connection").unwrap_or(""));
                        let _ = write!(c, "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                    }
                });
            }
        });
        port
    }

    #[test]
    fn asks_for_the_password_then_lets_the_visitor_in() {
        let gate = start(upstream(), "open sesame").unwrap();

        let first = get(gate.port, "/shop?x=1", "");
        assert!(first.contains("Password needed"), "{first}");
        assert!(first.contains(r#"value="/shop?x=1""#), "comes back to the page asked for");
        assert!(!first.contains("site /shop"));

        // Wrong password: the page again, with a message.
        let mut s = TcpStream::connect(("127.0.0.1", gate.port)).unwrap();
        let body = "next=%2Fshop&password=nope";
        write!(s, "POST {LOGIN_PATH} HTTP/1.1\r\nHost: x\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\n\r\n{body}", body.len()).unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        assert!(out.contains("isn't right") && !out.contains("Set-Cookie"), "{out}");

        // Right password: a cookie and back to the page.
        let mut s = TcpStream::connect(("127.0.0.1", gate.port)).unwrap();
        let body = "next=%2Fshop&password=open+sesame";
        write!(s, "POST {LOGIN_PATH} HTTP/1.1\r\nHost: x\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\n\r\n{body}", body.len()).unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        assert!(out.starts_with("HTTP/1.1 303") && out.contains("Location: /shop"), "{out}");
        let cookie = out.lines().find_map(|l| l.strip_prefix("Set-Cookie: ")).unwrap().split(';').next().unwrap().to_string();

        let site = get(gate.port, "/shop", &format!("Cookie: a=b; {cookie}\r\nConnection: keep-alive\r\n"));
        assert!(site.contains("site /shop close=close"), "passed on, one request per connection: {site}");

        // Someone else's cookie doesn't work.
        let other = get(gate.port, "/shop", "Cookie: nexdb_share=0000\r\n");
        assert!(other.contains("Password needed"));

        // Scripts without the cookie get 401, not a page.
        let mut s = TcpStream::connect(("127.0.0.1", gate.port)).unwrap();
        write!(s, "GET /api/x HTTP/1.1\r\nHost: x\r\nAccept: application/json\r\n\r\n").unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        assert!(out.starts_with("HTTP/1.1 401"), "{out}");
    }

    #[test]
    fn without_a_password_it_only_forwards() {
        let gate = start_on(upstream(), None, 0).unwrap();
        let site = get(gate.port, "/blog", "");
        assert!(site.contains("site /blog close=close"), "{site}");
        assert!(!site.contains("Password needed"));
    }

    #[test]
    fn next_must_stay_on_the_site() {
        assert!(page("/a\"><script>", false).contains("/a&quot;&gt;&lt;script&gt;"));
        assert_eq!(url_decode("a+b%2Fc%zz"), "a b/c%zz");
        assert!(start(1, "abc").is_err(), "too short");
        assert!(same("abc", "abc") && !same("abc", "abd") && !same("abc", "ab"));
    }
}
