//! A public link that stays the same, on the user's own ngrok or Cloudflare account.
//!
//! The provider always points at http://localhost:8899 on this PC (Cloudflare is set up that way
//! once, in its dashboard). NexDB runs a small forwarder on 8899 to whichever project uses the
//! fixed link, with the password page in front when asked. One fixed link runs at a time.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Where the provider sends visitors on this PC.
pub const FIXED_PORT: u16 = 8899;

/// The user's fixed-link account, saved in NexDB's settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Account {
    /// "ngrok" or "cloudflare".
    pub provider: String,
    /// The fixed address: an ngrok domain (my-app.ngrok-free.app) or a Cloudflare hostname.
    pub address: String,
    /// ngrok's authtoken or Cloudflare's tunnel token. Kept on this PC; never sent to the window.
    pub token: String,
    /// Where ngrok.exe is, when it isn't on PATH.
    #[serde(default)]
    pub ngrok_path: Option<String>,
}

struct Running {
    /// Which share uses it (tunnel key: "blog", "blog#dev").
    key: String,
    url: String,
    password: Option<String>,
    child: Child,
    _gate: crate::gate::Gate,
    #[cfg(windows)]
    _job: crate::supervisor::job::Job,
}

static RUNNING: Mutex<Option<Running>> = Mutex::new(None);

/// `https://my-app.ngrok-free.app` from whatever the user pasted (with or without https://, a path…).
pub fn clean_address(raw: &str) -> Result<String, String> {
    let a = raw.trim().trim_start_matches("https://").trim_start_matches("http://");
    let a = a.split('/').next().unwrap_or("").trim().to_ascii_lowercase();
    let ok = a.contains('.')
        && a.split('.').all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    if ok { Ok(a) } else { Err(format!("\"{}\" isn't an address like my-app.ngrok-free.app or dev.example.com.", raw.trim())) }
}

/// ngrok.exe: the saved path, then PATH, then where ngrok's installer puts it.
pub fn find_ngrok(saved: Option<&str>) -> Option<PathBuf> {
    if let Some(p) = saved.map(PathBuf::from).filter(|p| p.is_file()) {
        return Some(p);
    }
    let path = std::env::var_os("PATH").unwrap_or_default();
    for dir in std::env::split_paths(&path) {
        let p = dir.join("ngrok.exe");
        if p.is_file() {
            return Some(p);
        }
    }
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    [local.as_ref().map(|l| l.join("ngrok").join("ngrok.exe")), local.map(|l| l.join("Microsoft").join("WindowsApps").join("ngrok.exe"))]
        .into_iter()
        .flatten()
        .find(|p| p.is_file())
}

/// The command for the provider. Tokens go in the environment, never on the command line.
pub fn command(account: &Account, cloudflared: Option<&Path>) -> Result<Command, String> {
    match account.provider.as_str() {
        "ngrok" => {
            let exe = find_ngrok(account.ngrok_path.as_deref())
                .ok_or("NexDB can't find ngrok. Install it from ngrok.com, then pick ngrok.exe in Settings.")?;
            let mut cmd = Command::new(exe);
            cmd.args(["http", &format!("127.0.0.1:{FIXED_PORT}"), "--url", &format!("https://{}", account.address), "--log", "stderr", "--log-format", "logfmt"])
                .env("NGROK_AUTHTOKEN", &account.token);
            Ok(cmd)
        }
        "cloudflare" => {
            let exe = cloudflared.ok_or("Install public links on a project's Share tab first; Cloudflare's tunnel comes with it.")?;
            let mut cmd = Command::new(exe);
            cmd.args(["tunnel", "--no-autoupdate", "run"]).env("TUNNEL_TOKEN", &account.token);
            Ok(cmd)
        }
        other => Err(format!("\"{other}\" isn't a link provider NexDB knows.")),
    }
}

/// The provider's last error, in words people can act on.
pub fn explain(provider: &str, output: &str) -> String {
    let low = output.to_ascii_lowercase();
    if provider == "ngrok" {
        if low.contains("err_ngrok_105") || low.contains("authtoken") && low.contains("invalid") {
            return "ngrok didn't accept the authtoken. Copy it again from dashboard.ngrok.com (Your Authtoken).".into();
        }
        if low.contains("err_ngrok_3200") || low.contains("err_ngrok_15002") || low.contains("domain") && (low.contains("not") || low.contains("reserved")) {
            return "ngrok didn't accept the domain. Use the free static domain shown in dashboard.ngrok.com under Domains.".into();
        }
        if low.contains("err_ngrok_108") || low.contains("simultaneous") {
            return "This ngrok account is already online somewhere else (the free plan allows one at a time). Stop it there first.".into();
        }
    } else if low.contains("token") && (low.contains("not valid") || low.contains("invalid")) {
        return "Cloudflare didn't accept the tunnel token. Copy it again from the tunnel's page in the Cloudflare dashboard.".into();
    }
    let last = output.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("it stopped without saying why").trim().to_string();
    format!("The fixed link stopped right away: {last}")
}

/// Starts the fixed link for one share (`port` on this PC), replacing any other.
pub fn start(account: &Account, cloudflared: Option<&Path>, key: &str, port: u16, password: Option<&str>) -> Result<String, String> {
    stop();
    router_stop();
    let gate = crate::gate::start_on(port, password, FIXED_PORT)?;
    #[cfg(windows)]
    let (child, job) = spawn_tunnel(account, cloudflared)?;
    #[cfg(not(windows))]
    let (child, _) = spawn_tunnel(account, cloudflared)?;
    let url = format!("https://{}", account.address);
    *RUNNING.lock().unwrap() = Some(Running {
        key: key.to_string(),
        url: url.clone(),
        password: password.map(str::to_string),
        child,
        _gate: gate,
        #[cfg(windows)]
        _job: job,
    });
    Ok(url)
}

#[cfg(windows)]
type TunnelJob = crate::supervisor::job::Job;
#[cfg(not(windows))]
type TunnelJob = ();

/// Starts the provider's tunnel and waits a moment: a wrong token or domain exits at once.
fn spawn_tunnel(account: &Account, cloudflared: Option<&Path>) -> Result<(Child, TunnelJob), String> {
    let mut cmd = command(account, cloudflared)?;
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    crate::scan::hide_console(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start the fixed link: {e}"))?;
    #[cfg(windows)]
    let job = match crate::supervisor::job::Job::kill_on_close().and_then(|j| j.assign(&child).map(|_| j)) {
        Ok(j) => j,
        Err(e) => {
            let _ = child.kill();
            return Err(format!("Couldn't contain the fixed link: {e}"));
        }
    };
    // Give it a moment: a wrong token or domain makes it exit straight away.
    let mut err = child.stderr.take();
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            let mut text = String::new();
            if let Some(e) = err.as_mut() {
                let _ = e.read_to_string(&mut text);
            }
            return Err(explain(&account.provider, &text));
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    // Keep reading what it says, so its pipe never fills up.
    if let Some(mut e) = err {
        std::thread::spawn(move || {
            let mut sink = [0u8; 4096];
            while matches!(e.read(&mut sink), Ok(n) if n > 0) {}
        });
    }
    #[cfg(windows)]
    return Ok((child, job));
    #[cfg(not(windows))]
    Ok((child, ()))
}

pub fn stop() {
    if let Some(mut r) = RUNNING.lock().unwrap().take() {
        let _ = r.child.kill();
        let _ = r.child.wait();
    }
}

/// The share using the fixed link, its address and password, while it runs.
pub fn current() -> Option<(String, String, Option<String>)> {
    let mut guard = RUNNING.lock().unwrap();
    let alive = guard.as_mut().is_some_and(|r| matches!(r.child.try_wait(), Ok(None)));
    if !alive {
        *guard = None;
        return None;
    }
    guard.as_ref().map(|r| (r.key.clone(), r.url.clone(), r.password.clone()))
}

// ---------- NexHost router ----------

/// `Shop.MyShop.com:443.` -> `shop.myshop.com`.
pub fn host_key(raw: &str) -> String {
    let host = raw.trim();
    // "[::1]:443" keeps its brackets; "name:443" loses the port.
    let host = if host.starts_with('[') { host.split(']').next().map(|h| format!("{h}]")).unwrap_or_default() } else { host.split(':').next().unwrap_or("").to_string() };
    host.trim_end_matches('.').to_ascii_lowercase()
}

/// The local port for a visitor's Host, if a live site has it.
pub fn route_for<'a, V>(table: &'a HashMap<String, V>, host: &str) -> Option<&'a V> {
    let key = host_key(host);
    if key.is_empty() { None } else { table.get(&key) }
}

/// What visitors see for an address no live site has.
pub fn offline_page(host: &str) -> String {
    let safe: String = host_key(host).chars().filter(|c| c.is_ascii_alphanumeric() || ".-".contains(*c)).collect();
    format!(
        "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Offline</title>\
<body style=\"font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#16181d\">\
<h1>This site is offline</h1><p>{safe} is hosted on someone's own computer with NexHost, and it isn't online right now. Try again later.</p></body>"
    )
}

/// One live site: visitors for its host go through its gate (password page or plain forward).
struct Route {
    gate_port: u16,
    _gate: crate::gate::Gate,
}

/// Sends each visitor to the live site their address belongs to. Listens on 127.0.0.1; the
/// user's Cloudflare or ngrok tunnel brings visitors to it. Each connection carries one request
/// (the gate closes after one answer), so a reused tunnel connection can't reach another site.
pub struct Router {
    pub port: u16,
    table: Arc<Mutex<HashMap<String, Route>>>,
    stop: Arc<AtomicBool>,
    tunnel: Option<Child>,
    #[cfg(windows)]
    _job: Option<crate::supervisor::job::Job>,
}

impl Router {
    /// Only the router, no tunnel (port 0 picks a free one).
    pub fn listen(port: u16) -> Result<Router, String> {
        let listener = std::net::TcpListener::bind(("127.0.0.1", port)).map_err(|_| {
            format!("Port {port} is in use by another program, so NexHost can't go online. Close that program and try again.")
        })?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let table: Arc<Mutex<HashMap<String, Route>>> = Arc::default();
        let stop = Arc::new(AtomicBool::new(false));
        let (t, flag) = (table.clone(), stop.clone());
        std::thread::spawn(move || {
            for conn in listener.incoming() {
                if flag.load(Ordering::SeqCst) {
                    break;
                }
                let Ok(conn) = conn else { continue };
                let t = t.clone();
                std::thread::spawn(move || {
                    let _ = serve_routed(conn, &t);
                });
            }
        });
        Ok(Router { port, table, stop, tunnel: None, #[cfg(windows)] _job: None })
    }

    /// The router on `FIXED_PORT` plus the user's tunnel. Stops a project's fixed link first.
    pub fn start(account: &Account, cloudflared: Option<&Path>) -> Result<Router, String> {
        stop();
        let mut router = Router::listen(FIXED_PORT)?;
        let (child, job) = spawn_tunnel(account, cloudflared)?;
        router.tunnel = Some(child);
        #[cfg(windows)]
        {
            router._job = Some(job);
        }
        #[cfg(not(windows))]
        let _ = job;
        Ok(router)
    }

    /// Sends visitors for `host` to the site on `site_port`, behind a password when given.
    pub fn set(&self, host: &str, site_port: u16, password: Option<&str>) -> Result<(), String> {
        let gate = crate::gate::start_on(site_port, password, 0)?;
        let route = Route { gate_port: gate.port, _gate: gate };
        self.table.lock().unwrap().insert(host_key(host), route);
        Ok(())
    }

    pub fn remove(&self, host: &str) {
        self.table.lock().unwrap().remove(&host_key(host));
    }

    pub fn hosts(&self) -> Vec<String> {
        let mut h: Vec<String> = self.table.lock().unwrap().keys().cloned().collect();
        h.sort();
        h
    }

    /// Whether the tunnel process is still running (always true without one).
    pub fn alive(&mut self) -> bool {
        self.tunnel.as_mut().is_none_or(|c| matches!(c.try_wait(), Ok(None)))
    }
}

impl Drop for Router {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = std::net::TcpStream::connect(("127.0.0.1", self.port));
        if let Some(mut c) = self.tunnel.take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

fn serve_routed(mut conn: std::net::TcpStream, table: &Mutex<HashMap<String, Route>>) -> std::io::Result<()> {
    conn.set_read_timeout(Some(Duration::from_secs(30)))?;
    let Some((raw, rest)) = crate::gate::read_head(&mut conn) else { return Ok(()) };
    let text = String::from_utf8_lossy(&raw).to_string();
    let Some(head) = crate::gate::parse_head(&text) else { return Ok(()) };
    let host = head.header("host").unwrap_or("").to_string();
    let port = route_for(&table.lock().unwrap(), &host).map(|r| r.gate_port);
    let Some(port) = port else {
        return crate::gate::respond(conn, "404 Not Found", "text/html; charset=utf-8", &[], &offline_page(&host));
    };
    let mut up = match std::net::TcpStream::connect(("127.0.0.1", port)) {
        Ok(s) => s,
        Err(_) => return crate::gate::respond(conn, "502 Bad Gateway", "text/html; charset=utf-8", &[], &offline_page(&host)),
    };
    up.write_all(&raw)?;
    up.write_all(&rest)?;
    conn.set_read_timeout(None)?;
    crate::gate::pipe(conn, up)
}

/// The NexHost router while it runs (one tunnel at a time, shared with project fixed links).
pub static ROUTER: Mutex<Option<Router>> = Mutex::new(None);

pub fn router_stop() {
    ROUTER.lock().unwrap().take();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosts_are_matched_loosely() {
        let t = HashMap::from([("shop.myshop.com".to_string(), 8301u16)]);
        assert_eq!(route_for(&t, "Shop.MyShop.com:443"), Some(&8301));
        assert_eq!(route_for(&t, "shop.myshop.com."), Some(&8301));
        assert_eq!(route_for(&t, "blog.myshop.com"), None);
        assert_eq!(route_for(&t, ""), None);
    }

    #[test]
    fn offline_page_says_so() {
        let page = offline_page("x.com<script>");
        assert!(page.contains("This site is offline"));
        assert!(!page.contains("<script>"), "the host is escaped");
    }

    fn answer_with(body: &'static str) -> u16 {
        let l = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for conn in l.incoming().flatten() {
                let mut conn = conn;
                let mut buf = [0u8; 2048];
                let _ = conn.read(&mut buf);
                let _ = std::io::Write::write_all(&mut conn, format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes());
            }
        });
        port
    }

    fn get(port: u16, host: &str) -> String {
        let mut c = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        std::io::Write::write_all(&mut c, format!("GET / HTTP/1.1\r\nHost: {host}\r\n\r\n").as_bytes()).unwrap();
        let mut out = String::new();
        let _ = c.read_to_string(&mut out);
        out
    }

    #[test]
    fn router_forwards_by_host() {
        let (a, b) = (answer_with("site-A"), answer_with("site-B"));
        let router = Router::listen(0).unwrap();
        router.set("a.test", a, None).unwrap();
        router.set("B.test", b, None).unwrap();
        assert!(get(router.port, "a.test").ends_with("site-A"));
        assert!(get(router.port, "b.test:443").ends_with("site-B"));
        assert!(get(router.port, "c.test").contains("This site is offline"));
        router.remove("a.test");
        assert!(get(router.port, "a.test").contains("This site is offline"));
        assert_eq!(router.hosts(), vec!["b.test".to_string()]);
    }

    #[test]
    fn addresses_are_cleaned_up() {
        assert_eq!(clean_address("https://My-App.ngrok-free.app/").unwrap(), "my-app.ngrok-free.app");
        assert_eq!(clean_address(" dev.example.com/path ").unwrap(), "dev.example.com");
        assert!(clean_address("not an address").is_err());
        assert!(clean_address("localhost").is_err());
    }

    #[test]
    fn tokens_stay_off_the_command_line() {
        let a = Account { provider: "cloudflare".into(), address: "dev.example.com".into(), token: "SECRET".into(), ngrok_path: None };
        let cmd = command(&a, Some(Path::new("cloudflared.exe"))).unwrap();
        let args: Vec<String> = cmd.get_args().map(|s| s.to_string_lossy().to_string()).collect();
        assert_eq!(args, vec!["tunnel", "--no-autoupdate", "run"]);
        assert!(cmd.get_envs().any(|(k, v)| k == "TUNNEL_TOKEN" && v.is_some_and(|v| v == "SECRET")));
        assert!(!args.iter().any(|x| x.contains("SECRET")));
    }

    #[test]
    fn errors_read_like_sentences() {
        assert!(explain("ngrok", "t=1 lvl=eror msg=\"authentication failed\" err=\"ERR_NGROK_105\"").contains("authtoken"));
        assert!(explain("ngrok", "ERR_NGROK_108 simultaneous").contains("one at a time"));
        assert!(explain("cloudflare", "Provided Tunnel token is not valid.").contains("tunnel token"));
        assert!(explain("ngrok", "something odd\n").contains("something odd"));
        let e = command(&Account { provider: "other".into(), ..Default::default() }, None).unwrap_err();
        assert!(e.contains("isn't a link provider"));
    }
}
