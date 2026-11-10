//! Share a project: on its own port so phones on the same Wi-Fi can open it (with a QR code),
//! and optionally through a temporary public link from Cloudflare's quick tunnels.

use std::collections::{BTreeMap, HashMap};
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Ports shared projects use, one each. The firewall rule covers exactly this range.
pub const PORTS: std::ops::RangeInclusive<u16> = 8181..=8199;
const FIREWALL_RULE: &str = "NexDB shared sites";

/// The first share port no other project uses and nothing else is listening on.
pub fn free_port(shared: &BTreeMap<String, u16>) -> Option<u16> {
    PORTS.into_iter().find(|p| !shared.values().any(|q| q == p) && !crate::supervisor::port_listening(*p))
}

/// Whether a dev server answers on `port` on this PC. Node's dev servers often listen on
/// IPv6 `[::1]` only (what `localhost` means to them), so both loopback addresses are tried.
pub fn dev_listening(port: u16) -> bool {
    use std::net::{SocketAddr, TcpStream};
    let tries: [SocketAddr; 2] = [([127, 0, 0, 1], port).into(), (std::net::Ipv6Addr::LOCALHOST, port).into()];
    tries.iter().any(|a| TcpStream::connect_timeout(a, Duration::from_millis(150)).is_ok())
}

/// This PC's address on the local network. Connecting a UDP socket sends nothing; it only
/// asks Windows which network card would be used.
pub fn lan_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then(|| ip.to_string())
}

/// A QR code for `text` as an SVG image, dark modules in `currentColor` so it follows the theme.
pub fn qr_svg(text: &str) -> Result<String, String> {
    let code = qrcode::QrCode::new(text.as_bytes()).map_err(|e| format!("Couldn't make a QR code: {e}"))?;
    Ok(code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(180, 180)
        .quiet_zone(true)
        .dark_color(qrcode::render::svg::Color("#000"))
        .light_color(qrcode::render::svg::Color("#fff"))
        .build())
}

/// Runs a short PowerShell command without a window and returns its trimmed output.
fn powershell(script: &str) -> Option<String> {
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]).stdin(Stdio::null());
    crate::scan::hide_console(&mut cmd);
    let out = cmd.output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Whether NexDB's firewall rule exists (reading rules needs no administrator).
pub fn firewall_ready() -> bool {
    powershell(&format!("@(Get-NetFirewallRule -DisplayName '{FIREWALL_RULE}' -ErrorAction SilentlyContinue).Count"))
        .is_some_and(|n| n != "0" && !n.is_empty())
}

/// Whether Windows treats the current network as private. Phones are only let in on private
/// networks (home, office), never on public Wi-Fi.
pub fn network_private() -> Option<bool> {
    let category = powershell("(Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' } | Select-Object -First 1).NetworkCategory")?;
    Some(matches!(category.as_str(), "Private" | "DomainAuthenticated"))
}

/// Adds the inbound rule for the share ports on private networks, through one Windows approval.
#[cfg(windows)]
pub fn allow_firewall() -> Result<(), String> {
    let (first, last) = (PORTS.start(), PORTS.end());
    let rule = format!(
        "New-NetFirewallRule -DisplayName '{FIREWALL_RULE}' -Description 'Lets phones on your home or office network open projects you share in NexDB.' -Direction Inbound -Action Allow -Protocol TCP -LocalPort {first}-{last} -Profile Private | Out-Null"
    );
    // The elevated PowerShell gets the rule as -EncodedCommand (UTF-16LE, base64): no quoting.
    let launcher = format!(
        "$p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','{}'; exit $p.ExitCode",
        encode_command(&rule)
    );
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &launcher]);
    crate::scan::hide_console(&mut cmd);
    let out = cmd.output().map_err(|e| format!("Couldn't ask Windows for permission: {e}"))?;
    if !out.status.success() || !firewall_ready() {
        return Err("Windows didn't allow it. Choose Yes on the permission prompt to let phones in.".into());
    }
    Ok(())
}

/// A script in the form `powershell -EncodedCommand` takes: UTF-16LE bytes in base64.
pub(crate) fn encode_command(script: &str) -> String {
    const ABC: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |n, (i, b)| n | (*b as u32) << (16 - 8 * i));
        for i in 0..4 {
            out.push(if i <= chunk.len() { ABC[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
        }
    }
    out
}

#[cfg(not(windows))]
pub fn allow_firewall() -> Result<(), String> {
    Err("Sharing is only available on Windows.".into())
}

/// A running quick tunnel and the public address Cloudflare gave it.
struct Tunnel {
    child: Child,
    url: Arc<Mutex<Option<String>>>,
    /// The password page in front of it, when the link asks for one (stops when dropped).
    _gate: Option<crate::gate::Gate>,
    password: Option<String>,
    #[cfg(windows)]
    _job: crate::supervisor::job::Job,
}

/// Public links by project.
#[derive(Default)]
pub struct Tunnels(Mutex<HashMap<String, Tunnel>>);

impl Tunnels {
    /// The project's public link, if its tunnel is still running.
    pub fn url(&self, project: &str) -> Option<String> {
        let mut map = self.0.lock().unwrap();
        let alive = map.get_mut(project).is_some_and(|t| matches!(t.child.try_wait(), Ok(None)));
        if !alive {
            map.remove(project);
            return None;
        }
        map.get(project).and_then(|t| t.url.lock().unwrap().clone())
    }

    /// The password a running link asks for, if any.
    pub fn password(&self, project: &str) -> Option<String> {
        self.url(project)?;
        self.0.lock().unwrap().get(project).and_then(|t| t.password.clone())
    }

    /// Starts `cloudflared` for `http://127.0.0.1:port` and waits for its public address. With a
    /// password, visitors sign in on NexDB's page first. A running link with a different
    /// password setting is restarted.
    pub fn start(&self, cloudflared: &Path, project: &str, port: u16, password: Option<&str>) -> Result<String, String> {
        if let Some(url) = self.url(project) {
            if self.password(project).as_deref() == password {
                return Ok(url);
            }
            self.stop(project);
        }
        let gate = password.map(|p| crate::gate::start(port, p)).transpose()?;
        let target = gate.as_ref().map_or(port, |g| g.port);
        let mut cmd = Command::new(cloudflared);
        cmd.args(["tunnel", "--no-autoupdate", "--url", &format!("http://127.0.0.1:{target}")])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        crate::scan::hide_console(&mut cmd);
        let mut child = cmd.spawn().map_err(|e| format!("Couldn't start Cloudflare's tunnel: {e}"))?;
        #[cfg(windows)]
        let job = match crate::supervisor::job::Job::kill_on_close().and_then(|j| j.assign(&child).map(|_| j)) {
            Ok(job) => job,
            Err(e) => {
                let _ = child.kill();
                return Err(format!("Couldn't contain the tunnel: {e}"));
            }
        };
        // cloudflared prints its address to stderr; keep reading so the pipe never fills up.
        let url = Arc::new(Mutex::new(None));
        let found = url.clone();
        let stderr = child.stderr.take().ok_or("The tunnel gave no output.")?;
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if found.lock().unwrap().is_none() {
                    if let Some(u) = tunnel_url(&line) {
                        *found.lock().unwrap() = Some(u);
                    }
                }
            }
        });
        let deadline = Instant::now() + Duration::from_secs(40);
        loop {
            if let Some(u) = url.lock().unwrap().clone() {
                self.0.lock().unwrap().insert(
                    project.to_string(),
                    Tunnel {
                        child,
                        url: url.clone(),
                        _gate: gate,
                        password: password.map(str::to_string),
                        #[cfg(windows)]
                        _job: job,
                    },
                );
                return Ok(u);
            }
            if let Ok(Some(_)) = child.try_wait() {
                return Err("Cloudflare's tunnel stopped before it gave a link. Check your internet connection and try again.".into());
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                return Err("Cloudflare didn't give a link in time. Check your internet connection and try again.".into());
            }
            std::thread::sleep(Duration::from_millis(200));
        }
    }

    pub fn stop(&self, project: &str) {
        if let Some(mut t) = self.0.lock().unwrap().remove(project) {
            let _ = t.child.kill();
            let _ = t.child.wait();
        }
    }

    /// Ends every public link (the license no longer includes them).
    pub fn stop_all(&self) {
        for (_, mut t) in self.0.lock().unwrap().drain() {
            let _ = t.child.kill();
            let _ = t.child.wait();
        }
    }
}

/// The `https://….trycloudflare.com` address in a line of cloudflared's output.
pub fn tunnel_url(line: &str) -> Option<String> {
    let start = line.find("https://")?;
    let url: String = line[start..].chars().take_while(|c| !c.is_whitespace() && *c != '|').collect();
    url.trim_end_matches('/').ends_with(".trycloudflare.com").then(|| url.trim_end_matches('/').to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn stop_all_ends_every_public_link() {
        let tunnels = Tunnels::default();
        for name in ["shop", "blog"] {
            let child = Command::new("cmd").args(["/C", "ping -n 30 127.0.0.1 >nul"]).spawn().unwrap();
            let job = crate::supervisor::job::Job::kill_on_close().unwrap();
            tunnels.0.lock().unwrap().insert(
                name.into(),
                Tunnel { child, url: Arc::new(Mutex::new(None)), _gate: None, password: None, _job: job },
            );
        }
        tunnels.stop_all();
        assert!(tunnels.0.lock().unwrap().is_empty());
    }

    #[test]
    fn finds_the_quick_tunnel_address() {
        let line = "2026-11-03T01:02:03Z INF |  https://brave-otter-sample.trycloudflare.com                                |";
        assert_eq!(tunnel_url(line).as_deref(), Some("https://brave-otter-sample.trycloudflare.com"));
        assert_eq!(tunnel_url("INF Visit https://www.cloudflare.com/website-terms/"), None);
    }

    #[test]
    fn picks_a_port_no_project_uses() {
        let shared = BTreeMap::from([("shop".to_string(), *PORTS.start())]);
        let port = free_port(&shared).unwrap();
        assert!(PORTS.contains(&port) && port != *PORTS.start());
    }

    #[test]
    fn encodes_powershell_commands() {
        // [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('Get-Date'))
        assert_eq!(encode_command("Get-Date"), "RwBlAHQALQBEAGEAdABlAA==");
        assert_eq!(encode_command("ab"), "YQBiAA==");
    }

    #[test]
    fn qr_code_is_an_svg() {
        let svg = qr_svg("http://192.168.1.20:8181/").unwrap();
        assert!(svg.contains("<svg") && svg.contains("</svg>"));
    }
}
