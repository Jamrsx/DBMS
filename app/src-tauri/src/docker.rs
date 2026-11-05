//! Docker containers on the Dashboard: list them, start, stop or restart one, and read its log.
//! NexDB drives the `docker` command Docker Desktop installs; it never installs Docker itself.

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct DockerInfo {
    /// The docker command is on this PC.
    pub installed: bool,
    /// Docker Desktop's engine answers.
    pub running: bool,
    pub version: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct Container {
    pub id: String,
    pub name: String,
    pub image: String,
    /// "running", "exited", "paused", "created", "restarting"…
    pub state: String,
    /// Docker's own words, like "Up 3 minutes" or "Exited (0) 2 hours ago".
    pub status: String,
    /// "0.0.0.0:6379->6379/tcp", as Docker shows it.
    pub ports: String,
}

fn docker_exe() -> Option<PathBuf> {
    let installed = PathBuf::from(r"C:\Program Files\Docker\Docker\resources\bin\docker.exe");
    if installed.is_file() {
        return Some(installed);
    }
    std::env::var_os("PATH").and_then(|path| {
        std::env::split_paths(&path).map(|d| d.join("docker.exe")).find(|p| p.is_file())
    })
}

/// Runs docker with a time limit (a stuck engine shouldn't freeze the Dashboard).
fn run(args: &[&str], limit: Duration) -> Result<String, String> {
    let exe = docker_exe().ok_or("Docker isn't installed on this PC.")?;
    let mut cmd = Command::new(exe);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    crate::scan::hide_console(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Couldn't run docker: {e}"))?;
    let deadline = Instant::now() + limit;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                let _ = child.kill();
                return Err("Docker didn't answer in time. Is Docker Desktop still starting?".into());
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    if out.status.success() {
        Ok(text)
    } else {
        Err(plain_error(&String::from_utf8_lossy(&out.stderr)))
    }
}

/// Docker's errors in plain words.
fn plain_error(stderr: &str) -> String {
    let e = stderr.trim();
    if e.contains("dockerDesktopLinuxEngine") || e.contains("Is the docker daemon running") || e.contains("cannot find the file specified") {
        "Docker Desktop isn't running. Start it, then try again.".into()
    } else if e.contains("No such container") {
        "That container doesn't exist any more.".into()
    } else if e.contains("port is already allocated") || e.contains("address already in use") {
        format!("Another program already uses the container's port. {}", last_line(e))
    } else if e.is_empty() {
        "Docker refused without saying why.".into()
    } else {
        last_line(e).to_string()
    }
}

fn last_line(s: &str) -> &str {
    s.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or(s).trim()
}

pub fn info() -> DockerInfo {
    if docker_exe().is_none() {
        return DockerInfo { installed: false, running: false, version: None };
    }
    match run(&["version", "--format", "{{.Server.Version}}"], Duration::from_secs(6)) {
        Ok(v) => DockerInfo { installed: true, running: true, version: Some(v.trim().to_string()).filter(|v| !v.is_empty()) },
        Err(_) => DockerInfo { installed: true, running: false, version: None },
    }
}

/// `docker ps -a --format "{{json .}}"`: one JSON object per line.
pub fn parse_list(text: &str) -> Vec<Container> {
    let field = |v: &Value, k: &str| v.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let mut list: Vec<Container> = text
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l.trim()).ok())
        .map(|v| Container {
            id: field(&v, "ID"),
            name: field(&v, "Names"),
            image: field(&v, "Image"),
            state: field(&v, "State").to_lowercase(),
            status: field(&v, "Status"),
            ports: field(&v, "Ports"),
        })
        .filter(|c| !c.id.is_empty())
        .collect();
    // Running ones first, then by name.
    list.sort_by(|a, b| (a.state != "running").cmp(&(b.state != "running")).then(a.name.cmp(&b.name)));
    list
}

pub fn list() -> Result<Vec<Container>, String> {
    run(&["ps", "-a", "--no-trunc", "--format", "{{json .}}"], Duration::from_secs(8)).map(|t| parse_list(&t))
}

/// Container ids and names only: letters, digits, `_ . -`, never starting with `-`.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && !id.starts_with('-')
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
}

pub fn action(id: &str, what: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("That isn't a container name.".into());
    }
    let verb = match what {
        "start" | "stop" | "restart" => what,
        _ => return Err(format!("Unknown action: {what}")),
    };
    run(&[verb, id], Duration::from_secs(40)).map(|_| ())
}

/// The end of a container's log (what it printed, errors included).
pub fn logs(id: &str) -> Result<String, String> {
    if !valid_id(id) {
        return Err("That isn't a container name.".into());
    }
    let exe = docker_exe().ok_or("Docker isn't installed on this PC.")?;
    let mut cmd = Command::new(exe);
    cmd.args(["logs", "--tail", "200", id]).stdin(Stdio::null());
    crate::scan::hide_console(&mut cmd);
    let out = cmd.output().map_err(|e| format!("Couldn't run docker: {e}"))?;
    if !out.status.success() {
        return Err(plain_error(&String::from_utf8_lossy(&out.stderr)));
    }
    // Containers write to both streams; show them together.
    Ok(format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr)))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Lines as `docker ps -a --format "{{json .}}"` prints them (Docker 27).
    const SAMPLE: &str = r#"{"Command":"\"docker-entrypoint.s…\"","CreatedAt":"2026-11-01 10:02:11 +0800 PST","ID":"9f1c2a","Image":"postgres:16","Labels":"","LocalVolumes":"1","Mounts":"pgdata","Names":"old-postgres","Networks":"bridge","Ports":"","RunningFor":"4 days ago","Size":"0B","State":"exited","Status":"Exited (0) 2 hours ago"}
{"Command":"\"redis-server\"","CreatedAt":"2026-11-03 09:00:00 +0800 PST","ID":"3b7e11","Image":"redis:7","Labels":"","LocalVolumes":"0","Mounts":"","Names":"cache","Networks":"bridge","Ports":"0.0.0.0:6380->6379/tcp","RunningFor":"2 days ago","Size":"0B","State":"running","Status":"Up 3 minutes"}
not json
"#;

    #[test]
    fn reads_docker_ps_output() {
        let list = parse_list(SAMPLE);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "cache", "running ones first");
        assert_eq!(list[0].ports, "0.0.0.0:6380->6379/tcp");
        assert_eq!(list[1].state, "exited");
        assert_eq!(list[1].status, "Exited (0) 2 hours ago");
    }

    #[test]
    fn only_container_names_reach_docker() {
        assert!(valid_id("cache"));
        assert!(valid_id("my_app-db.1"));
        assert!(!valid_id("--rm"));
        assert!(!valid_id("a b"));
        assert!(!valid_id("x;rm"));
        assert!(!valid_id(""));
    }

    #[test]
    fn docker_errors_in_plain_words() {
        assert!(plain_error("error during connect: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.").contains("isn't running"));
        assert_eq!(plain_error("Error response from daemon: No such container: x"), "That container doesn't exist any more.");
        assert!(plain_error("Bind for 0.0.0.0:6379 failed: port is already allocated").starts_with("Another program"));
    }

    #[test]
    fn says_when_docker_is_missing() {
        if docker_exe().is_none() {
            assert_eq!(info(), DockerInfo { installed: false, running: false, version: None });
            assert!(list().unwrap_err().contains("isn't installed"));
        }
    }
}
