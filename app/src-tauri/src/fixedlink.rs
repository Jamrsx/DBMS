//! A public link that stays the same, on the user's own ngrok or Cloudflare account.
//!
//! The provider always points at http://localhost:8899 on this PC (Cloudflare is set up that way
//! once, in its dashboard). NexDB runs a small forwarder on 8899 to whichever project uses the
//! fixed link, with the password page in front when asked. One fixed link runs at a time.

use std::io::Read;
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
    let gate = crate::gate::start_on(port, password, FIXED_PORT)?;
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

#[cfg(test)]
mod tests {
    use super::*;

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
