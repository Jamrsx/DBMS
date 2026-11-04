//! "Check my setup": what could stop the stack, the sites or sharing from working, each problem
//! in plain words with the fix NexDB can do, and a support report (.zip) with passwords removed.

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::settings::Settings;
use crate::supervisor::{State, Supervisor};

/// One finding. `level` is "ok", "info", "warn" or "bad".
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Check {
    /// "Services", "Sites", "Sharing", "Projects" or "This PC".
    pub area: String,
    pub level: String,
    pub title: String,
    pub detail: Option<String>,
    pub fix: Option<Fix>,
}

/// What the button next to a finding does: "firewall", "hosts", "configs", "trust",
/// "dashboard", "versions" or "project:<name>".
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Fix {
    pub action: String,
    pub label: String,
}

fn check(area: &str, level: &str, title: impl Into<String>, detail: Option<String>, fix: Option<(&str, &str)>) -> Check {
    Check {
        area: area.into(),
        level: level.into(),
        title: title.into(),
        detail,
        fix: fix.map(|(action, label)| Fix { action: action.into(), label: label.into() }),
    }
}

/// Runs every check. Slow parts (config tests, netstat, certutil) take a few seconds in all.
pub fn run(root: &Path, settings: &Settings, sup: &Supervisor) -> Vec<Check> {
    let mut out = Vec::new();
    services(settings, sup, &mut out);
    sites(root, settings, &mut out);
    sharing(&mut out);
    projects(settings, &mut out);
    this_pc(root, settings, &mut out);
    out
}

fn services(settings: &Settings, sup: &Supervisor, out: &mut Vec<Check>) {
    let before = out.len();
    for m in crate::versions::missing(settings) {
        out.push(check(
            "Services",
            "bad",
            format!("{} {} is missing", m.name, m.version.unwrap_or_default()).replace("  ", " "),
            Some(format!("Its files at {} were deleted, so it can't run. Your settings and projects are kept.", m.path)),
            Some(("versions", "Reinstall on Versions")),
        ));
    }
    for s in sup.status() {
        if !s.managed || s.state == State::Running || s.state == State::Starting {
            continue;
        }
        // Stopped or failed: is something else holding its port?
        let port = crate::scan::port_status(s.port, &s.name);
        if port.in_use {
            let who = match (&port.process, port.pid) {
                (Some(p), Some(pid)) => format!("{p} (PID {pid})"),
                (None, Some(pid)) => format!("another program (PID {pid})"),
                _ => "another program".into(),
            };
            out.push(check(
                "Services",
                "bad",
                format!("Port {} is already in use by {who}", s.port),
                Some(format!(
                    "{} can't start while it does. Close that program, or change {}'s port in Settings.",
                    s.name, s.name
                )),
                Some(("dashboard", "Open Dashboard")),
            ));
        } else if s.state == State::Failed {
            out.push(check(
                "Services",
                "bad",
                format!("{} couldn't start", s.name),
                s.message.clone(),
                Some(("dashboard", "Open Dashboard")),
            ));
        }
    }
    if out.len() == before {
        out.push(check("Services", "ok", "Every service can run: nothing else holds their ports", None, None));
    }
}

fn component_dir(settings: &Settings, id: &str) -> Option<PathBuf> {
    let c = settings.components.iter().find(|c| c.id == id)?;
    let p = PathBuf::from(&c.path);
    // Older installs stored the executable: Apache's is bin\httpd.exe, two levels down.
    if p.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) {
        let up = if id == "apache" { p.parent()?.parent()? } else { p.parent()? };
        Some(up.to_path_buf())
    } else {
        Some(p)
    }
}

fn sites(root: &Path, settings: &Settings, out: &mut Vec<Check>) {
    let before = out.len();
    let etc = root.join("etc");
    if let Some((web, port)) = settings.web() {
        let result = if web == "apache" {
            component_dir(settings, "apache").map(|d| crate::configure::check_apache(&d, &etc.join("apache").join("httpd.conf")))
        } else {
            component_dir(settings, "nginx").map(|d| crate::configure::check_nginx(&d, &etc.join("nginx").join("nginx.conf")))
        };
        if let Some(Err(e)) = result {
            let name = if web == "apache" { "Apache" } else { "nginx" };
            out.push(check(
                "Sites",
                "bad",
                format!("{name}'s settings have a mistake, so it won't start"),
                Some(e),
                Some(("configs", "Rewrite the settings")),
            ));
        }
        // Each project's name.test address must be in the Windows hosts file.
        let wanted: Vec<String> =
            crate::projects::list(Path::new(&settings.www_dir), port).into_iter().filter_map(|p| p.host).collect();
        let hosts = fs::read_to_string(crate::projects::hosts_path()).unwrap_or_default();
        let missing = crate::projects::missing_hosts(&wanted, &hosts);
        if !missing.is_empty() {
            out.push(check(
                "Sites",
                "warn",
                format!("{} project address{} not set up", missing.len(), if missing.len() == 1 { " is" } else { "es are" }),
                Some(format!(
                    "{} only open as localhost/name until Windows knows them. Windows asks once.",
                    missing.join(", ")
                )),
                Some(("hosts", "Set up addresses")),
            ));
        }
    } else {
        out.push(check(
            "Sites",
            "warn",
            "No web server is installed",
            Some("Projects need Apache or nginx to open in the browser.".into()),
            Some(("versions", "Install on Versions")),
        ));
    }
    if settings.preferences.https {
        let ca = crate::admin::ensure_ca(&crate::admin::ca_dir());
        if let Ok(ca) = ca {
            if !crate::admin::is_trusted(&ca.thumbprint) {
                out.push(check(
                    "Sites",
                    "warn",
                    "Browsers don't trust NexDB's HTTPS certificate yet",
                    Some("https:// sites show a warning until Windows trusts it. Windows asks you to confirm.".into()),
                    Some(("trust", "Trust the certificate")),
                ));
            }
        }
    }
    if out.len() == before {
        out.push(check("Sites", "ok", "Web server settings are valid and every address is set up", None, None));
    }
}

fn sharing(out: &mut Vec<Check>) {
    let before = out.len();
    match crate::share::lan_ip() {
        None => out.push(check(
            "Sharing",
            "info",
            "This PC isn't on a network",
            Some("Phones can't open shared projects until it is.".into()),
            None,
        )),
        Some(ip) => {
            if crate::share::network_private() == Some(false) {
                out.push(check(
                    "Sharing",
                    "warn",
                    "Windows treats this network as public, so phones are kept out",
                    Some(format!(
                        "If this is your home or office Wi-Fi, set it to Private in Windows Settings → Network & internet → Wi-Fi → your network. (This PC is {ip}.)"
                    )),
                    None,
                ));
            }
        }
    }
    if !crate::share::firewall_ready() {
        out.push(check(
            "Sharing",
            "info",
            "Windows Firewall blocks phones from shared projects",
            Some("One rule for ports 8181 to 8199 on private networks lets them in. Windows asks for your permission.".into()),
            Some(("firewall", "Allow phones")),
        ));
    }
    if out.len() == before {
        out.push(check("Sharing", "ok", "Phones on this network can open shared projects", None, None));
    }
}

fn projects(settings: &Settings, out: &mut Vec<Check>) {
    let before = out.len();
    let www = Path::new(&settings.www_dir);
    for p in crate::projects::list_with(www, 80, &settings.preferences.site_root) {
        let dir = Path::new(&p.path);
        let tasks = crate::quickstart::setup_plan(dir);
        if !tasks.is_empty() {
            out.push(check(
                "Projects",
                "warn",
                format!("{} isn't set up yet", p.name),
                Some(format!(
                    "It still needs: {}.",
                    tasks.iter().map(|t| t.label.to_lowercase()).collect::<Vec<_>>().join("; ")
                )),
                Some((&format!("project:{}", p.name), "Open project")),
            ));
        } else if crate::projects::needs_site_folder(dir)
            && !settings.preferences.site_root.contains_key(&p.name)
            && crate::projects::app_parts(dir).is_none()
        {
            out.push(check(
                "Projects",
                "warn",
                format!("{}'s address only lists its files", p.name),
                Some("Its app is in a subfolder. Pick its Site folder on its Overview tab.".into()),
                Some((&format!("project:{}", p.name), "Open project")),
            ));
        }
    }
    if out.len() == before {
        out.push(check("Projects", "ok", "Every project is set up", None, None));
    }
}

fn this_pc(root: &Path, settings: &Settings, out: &mut Vec<Check>) {
    let before = out.len();
    if let Some(disk) = crate::scan::disk_space(root) {
        let gb = disk.free_bytes as f64 / 1e9;
        let level = if gb < 0.5 { "bad" } else if gb < 2.0 { "warn" } else { "" };
        if !level.is_empty() {
            out.push(check(
                "This PC",
                level,
                format!("Only {gb:.1} GB free on {}", disk.mount),
                Some("Databases and packages need room; MySQL stops writing when the disk is full.".into()),
                None,
            ));
        }
    }
    // Other terminals (not NexDB's) may find another PHP first.
    let nexdb_php = component_dir(settings, "php");
    let first_php = std::env::var("PATH").unwrap_or_default().split(';').map(PathBuf::from).find(|d| d.join("php.exe").is_file());
    if let Some(dir) = first_php {
        if nexdb_php.as_ref().is_none_or(|p| !dir.starts_with(p)) && !dir.starts_with(root) {
            out.push(check(
                "This PC",
                "info",
                format!("Other terminals use PHP from {}", dir.display()),
                Some("NexDB's own terminal always uses NexDB's PHP, Composer and Node. Windows' other terminals find this PHP first on PATH.".into()),
                None,
            ));
        }
    }
    if out.len() == before {
        out.push(check("This PC", "ok", "Enough disk space", None, None));
    }
}

/// Blanks the value of any line that names a password, secret, token or key.
pub fn redact(text: &str) -> String {
    let words = ["password", "passwd", "pwd", "secret", "token", "api_key", "apikey", "private_key"];
    text.lines()
        .map(|line| {
            let lower = line.to_lowercase();
            let Some(i) = line.find(['=', ':']) else { return line.to_string() };
            if words.iter().any(|w| lower[..i].contains(w)) {
                format!("{}[removed]", &line[..=i])
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The end of a file, at most `max` bytes, as text.
fn tail(path: &Path, max: u64) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = fs::File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    f.seek(SeekFrom::Start(len.saturating_sub(max))).ok()?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf).into_owned())
}

fn files_under(dir: &Path, out: &mut Vec<PathBuf>) {
    for e in fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_dir() {
            files_under(&p, out);
        } else {
            out.push(p);
        }
    }
}

/// Writes the support report: what's installed and running, this check's findings, NexDB's
/// configs and the end of each log, with passwords and keys removed. No project files.
pub fn support_report(root: &Path, settings: &Settings, sup: &Supervisor, checks: &[Check], target: &Path) -> Result<(), String> {
    let file = fs::File::create(target).map_err(|e| format!("Couldn't create the report: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut add = |name: &str, text: &str| -> Result<(), String> {
        zip.start_file(name.replace('\\', "/"), opts).map_err(|e| e.to_string())?;
        zip.write_all(text.as_bytes()).map_err(|e| e.to_string())
    };

    let mut report = format!("NexDB {}\nInstall folder: {}\nProjects folder: {}\n\n", env!("CARGO_PKG_VERSION"), root.display(), settings.www_dir);
    report.push_str("Components\n");
    for c in &settings.components {
        report.push_str(&format!("  {} {}  {}\n", c.id, c.version.clone().unwrap_or_default(), c.path));
    }
    report.push_str("\nServices\n");
    for s in sup.status() {
        report.push_str(&format!("  {}  port {}  {:?}{}\n", s.name, s.port, s.state, s.message.map(|m| format!("  ({m})")).unwrap_or_default()));
    }
    report.push_str("\nCheck my setup\n");
    for c in checks {
        report.push_str(&format!("  [{}] {}: {}\n", c.level, c.area, c.title));
        if let Some(d) = &c.detail {
            report.push_str(&format!("        {d}\n"));
        }
    }
    add("report.txt", &report)?;

    if let Ok(json) = fs::read_to_string(root.join("etc").join("devmanager.json")) {
        add("etc/devmanager.json", &redact(&json))?;
    }
    // Configs NexDB wrote, but never certificates or keys.
    let mut confs = Vec::new();
    files_under(&root.join("etc"), &mut confs);
    for p in confs {
        let rel = p.strip_prefix(root).unwrap_or(&p).display().to_string();
        let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if rel.to_lowercase().contains("ssl") || !["conf", "ini", "cnf"].contains(&ext.as_str()) {
            continue;
        }
        if let Some(text) = tail(&p, 512 * 1024) {
            add(&rel, &redact(&text))?;
        }
    }
    let mut logs = Vec::new();
    files_under(&root.join("logs"), &mut logs);
    for p in logs {
        let rel = p.strip_prefix(root).unwrap_or(&p).display().to_string();
        if let Some(text) = tail(&p, 256 * 1024) {
            add(&rel, &redact(&text))?;
        }
    }
    zip.finish().map_err(|e| format!("Couldn't finish the report: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_passwords_from_reports() {
        let text = "DB_PASSWORD=hunter2\nport=3306\n\"root_password\": \"abc\",\npassword = \"x\"\nAPP_KEY=base64:zzz\nuser=root";
        let out = redact(text);
        assert!(!out.contains("hunter2") && !out.contains("abc") && !out.contains("\"x\""), "{out}");
        assert!(out.contains("port=3306") && out.contains("user=root"));
        assert!(out.contains("DB_PASSWORD=[removed]"));
    }

    /// Runs the check on this PC's NexDB and writes a support report.
    /// `cargo test real_health_check -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_health_check() {
        let root = Path::new(r"C:\NexDB");
        let settings = crate::settings::load(root).expect("NexDB must be installed in C:/NexDB");
        let sup = Supervisor::new(crate::supervisor::specs_for(root, &settings));
        let checks = run(root, &settings, &sup);
        for c in &checks {
            println!("[{}] {}: {} {}", c.level, c.area, c.title, c.detail.clone().unwrap_or_default());
        }
        for area in ["Services", "Sites", "Sharing", "Projects", "This PC"] {
            assert!(checks.iter().any(|c| c.area == area), "{area} is checked");
        }
        let dir = tempfile::tempdir().unwrap();
        let zip_path = dir.path().join("report.zip");
        support_report(root, &settings, &sup, &checks, &zip_path).unwrap();
        let mut archive = zip::ZipArchive::new(fs::File::open(&zip_path).unwrap()).unwrap();
        let names: Vec<String> = (0..archive.len()).map(|i| archive.by_index(i).unwrap().name().unwrap().to_string()).collect();
        println!("{} files: {:?}", names.len(), &names[..names.len().min(12)]);
        assert!(names.iter().any(|n| n == "report.txt"));
        assert!(!names.iter().any(|n| n.ends_with(".key") || n.ends_with(".pem")));
    }
}
