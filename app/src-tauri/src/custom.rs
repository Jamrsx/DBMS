//! Services you define yourself: any program NexDB should start and stop with the others, like
//! a queue worker binary, Elasticsearch or a game server. It counts as running once it answers
//! on its port.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::supervisor::{ServiceSpec, StopMethod};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct CustomService {
    /// "custom-" and the name in lowercase letters and dashes.
    pub id: String,
    pub name: String,
    pub exe: String,
    /// As you'd type them after the program's name; "quotes" keep spaces together.
    #[serde(default)]
    pub args: String,
    pub port: u16,
}

/// "Search engine" → "custom-search-engine".
pub fn id_for(name: &str) -> String {
    let slug: String = name
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    format!("custom-{}", if slug.is_empty() { "service".into() } else { slug })
}

/// `-p 9200 --name "my node"` → ["-p", "9200", "--name", "my node"].
pub fn split_args(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    let mut any = false;
    for c in s.chars() {
        match c {
            '"' => {
                quoted = !quoted;
                any = true;
            }
            c if c.is_whitespace() && !quoted => {
                if any {
                    out.push(std::mem::take(&mut cur));
                    any = false;
                }
            }
            c => {
                cur.push(c);
                any = true;
            }
        }
    }
    if any {
        out.push(cur);
    }
    out
}

/// Checks a new service before it's saved: a real program, a free port, a new name.
pub fn check(
    name: &str,
    exe: &str,
    args: &str,
    port: u16,
    taken: &[(String, u16)],
) -> Result<CustomService, String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 40 {
        return Err("Give it a short name, like Search engine.".into());
    }
    let path = Path::new(exe.trim());
    if !path.is_file() || !path.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) {
        return Err("Pick the program's .exe file.".into());
    }
    if port < 1024 {
        return Err("Use a port from 1024 to 65535.".into());
    }
    let id = id_for(name);
    if taken.iter().any(|(i, _)| *i == id) {
        return Err(format!("There's already a service called {name}."));
    }
    if let Some((other, _)) = taken.iter().find(|(_, p)| *p == port) {
        return Err(format!("Port {port} is already {other}'s. Pick another."));
    }
    Ok(CustomService { id, name: name.into(), exe: path.display().to_string(), args: args.trim().into(), port })
}

pub fn spec(c: &CustomService, logs: &Path) -> ServiceSpec {
    let exe = PathBuf::from(&c.exe);
    ServiceSpec {
        id: c.id.clone(),
        name: c.name.clone(),
        version: None,
        cwd: exe.parent().map(Path::to_path_buf).unwrap_or_else(|| logs.to_path_buf()),
        exe,
        args: split_args(&c.args),
        port: c.port,
        managed: true,
        stop: StopMethod::Kill,
        log: logs.join(format!("{}.log", c.id)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_become_ids() {
        assert_eq!(id_for("Search engine"), "custom-search-engine");
        assert_eq!(id_for("  My  API!! "), "custom-my-api");
        assert_eq!(id_for("***"), "custom-service");
    }

    #[test]
    fn arguments_split_like_a_command_line() {
        assert_eq!(split_args(r#"-p 9200 --name "my node"  -v"#), vec!["-p", "9200", "--name", "my node", "-v"]);
        assert_eq!(split_args(r#""""#), vec![""]);
        assert!(split_args("   ").is_empty());
    }

    #[test]
    fn checks_before_saving() {
        let exe = std::env::current_exe().unwrap();
        let exe = exe.display().to_string();
        let taken = vec![("mysql".to_string(), 3306), ("custom-api".to_string(), 9000)];
        assert!(check("", &exe, "", 9100, &taken).is_err());
        assert!(check("Thing", r"C:\nope\missing.exe", "", 9100, &taken).unwrap_err().contains(".exe"));
        assert!(check("Thing", &exe, "", 80, &taken).unwrap_err().contains("1024"));
        assert!(check("API", &exe, "", 9100, &taken).unwrap_err().contains("already a service"));
        assert!(check("Thing", &exe, "", 3306, &taken).unwrap_err().contains("mysql"));
        let ok = check("Search engine", &exe, "-p 9200", 9200, &taken).unwrap();
        assert_eq!(ok.id, "custom-search-engine");
        let s = spec(&ok, Path::new("C:/logs"));
        assert_eq!(s.args, vec!["-p", "9200"]);
        assert!(s.managed && s.port == 9200);
    }

    /// A service you add runs like NexDB's own: started, answering on its port, then stopped.
    /// A stand-in program (Python) on a spare port, so nothing on this PC is touched.
    #[test]
    #[ignore]
    fn real_own_service_starts_and_stops() {
        use crate::supervisor::{State, Supervisor};
        let out = std::process::Command::new("where").arg("python").output().expect("where");
        let python = String::from_utf8_lossy(&out.stdout).lines().next().expect("python on PATH").trim().to_string();
        let port = 47821;
        let args = format!(r#"-c "import socket,time; s=socket.socket(); s.bind(('127.0.0.1',{port})); s.listen(); time.sleep(60)""#);
        let service = check("Stand-in server", &python, &args, port, &[]).unwrap();
        let logs = std::env::temp_dir().join("nexdb-custom-test");
        let _ = std::fs::create_dir_all(&logs);
        let sup = Supervisor::new(vec![spec(&service, &logs)]);
        assert!(sup.start_many(&sup.ids()).is_empty());
        let st = &sup.status()[0];
        assert_eq!((st.id.as_str(), st.state), ("custom-stand-in-server", State::Running));
        sup.stop_all();
        assert_eq!(sup.status()[0].state, State::Stopped);
    }
}
