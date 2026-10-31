//! Projects: every folder in the www directory is a project with its own `<name>.test` address.
//! Apache gets one virtual host per project; the Windows hosts file maps the names to 127.0.0.1
//! (that one step needs an administrator approval).

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const HOSTS_BEGIN: &str = "# NexDB begin (managed block, edited by NexDB)";
const HOSTS_END: &str = "# NexDB end";
pub const TLD: &str = "test";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Project {
    pub name: String,
    pub path: String,
    /// What was recognised in the folder: "laravel", "wordpress", "node", "php", "html" or "empty".
    pub kind: String,
    /// The folder Apache serves (`public` for Laravel-style projects).
    pub doc_root: String,
    /// `<name>.test`, or None when the folder name can't be a host name.
    pub host: Option<String>,
    pub url: String,
    pub local_url: String,
}

/// Lower-case letters, digits and hyphens, not starting or ending with a hyphen.
pub fn host_label(name: &str) -> Option<String> {
    let ok = !name.is_empty()
        && name.len() <= 63
        && !name.starts_with('-')
        && !name.ends_with('-')
        && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    ok.then(|| name.to_string())
}

pub fn detect_kind(dir: &Path) -> &'static str {
    let has = |p: &str| dir.join(p).exists();
    if has("artisan") && has("public") {
        "laravel"
    } else if has("wp-config.php") || has("wp-content") {
        "wordpress"
    } else if has("package.json") && !has("index.php") && !has("index.html") && !has("public") {
        "node"
    } else if has("index.php") || has("public/index.php") {
        "php"
    } else if has("index.html") || has("public/index.html") {
        "html"
    } else {
        "empty"
    }
}

pub fn list(www: &Path, port: u16) -> Vec<Project> {
    let Ok(entries) = fs::read_dir(www) else { return vec![] };
    let suffix = if port == 80 { String::new() } else { format!(":{port}") };
    let mut projects: Vec<Project> = entries
        .filter_map(Result::ok)
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name.eq_ignore_ascii_case("node_modules") {
                return None;
            }
            let path = e.path();
            let kind = detect_kind(&path);
            let doc_root = if path.join("public").is_dir() { path.join("public") } else { path.clone() };
            let host = host_label(&name).map(|h| format!("{h}.{TLD}"));
            Some(Project {
                url: host.as_ref().map(|h| format!("http://{h}{suffix}/")).unwrap_or_default(),
                local_url: format!("http://localhost{suffix}/{name}/"),
                name,
                path: path.display().to_string(),
                kind: kind.into(),
                doc_root: doc_root.display().to_string(),
                host,
            })
        })
        .collect();
    projects.sort_by_key(|p| p.name.to_lowercase());
    projects
}

/// Creates a new project folder with a small starter page.
pub fn create(www: &Path, name: &str, kind: &str) -> Result<(), String> {
    let name = name.trim();
    if host_label(name).is_none() {
        return Err("Use lowercase letters, numbers and hyphens only, for example my-shop.".into());
    }
    let dir = www.join(name);
    if dir.exists() {
        return Err(format!("A project named \"{name}\" already exists."));
    }
    fs::create_dir_all(&dir).map_err(|e| format!("Couldn't create the folder: {e}"))?;
    let (file, body) = match kind {
        "html" => (
            "index.html",
            format!("<!doctype html>\n<title>{name}</title>\n<h1>{name}</h1>\n<p>Edit this file to get started.</p>\n"),
        ),
        "empty" => return Ok(()),
        _ => (
            "index.php",
            format!(
                "<?php\necho '<h1>{name}</h1>';\necho '<p>PHP ' . PHP_VERSION . ' is running on {name}.{TLD}.</p>';\n"
            ),
        ),
    };
    fs::write(dir.join(file), body).map_err(|e| format!("Couldn't write {file}: {e}"))
}

fn conf_path(p: &Path) -> String {
    crate::configure::conf_path(p)
}

/// One virtual host per project, plus a first one that keeps `http://localhost/` on the www folder.
pub fn write_vhosts(etc: &Path, www: &Path, port: u16) -> Result<(), String> {
    let dir = etc.join("apache").join("sites-enabled");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let p = entry.path();
        if p.extension().is_some_and(|e| e == "conf") {
            let _ = fs::remove_file(p);
        }
    }
    let vhost = |server: &str, doc_root: &Path, aliases: &str| {
        format!(
            "<VirtualHost *:{port}>\n    ServerName {server}\n{aliases}    DocumentRoot \"{root}\"\n    <Directory \"{root}\">\n        Options Indexes FollowSymLinks\n        AllowOverride All\n        Require all granted\n    </Directory>\n</VirtualHost>\n",
            root = conf_path(doc_root)
        )
    };
    let mut first = String::from("# Generated by NexDB. Projects get their own file.\n");
    first.push_str(&vhost("localhost", www, "    ServerAlias 127.0.0.1\n"));
    crate::configure::write_file(&dir.join("00-localhost.conf"), &first)?;
    for p in list(www, port) {
        let Some(host) = &p.host else { continue };
        let body = format!("# Generated by NexDB for {}\n{}", p.name, vhost(host, Path::new(&p.doc_root), ""));
        crate::configure::write_file(&dir.join(format!("{}.conf", p.name)), &body)?;
    }
    Ok(())
}

pub fn hosts_path() -> PathBuf {
    let root = std::env::var_os("SystemRoot").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    root.join(r"System32\drivers\etc\hosts")
}

/// The managed block for these project hosts.
pub fn hosts_block(hosts: &[String]) -> String {
    let mut out = format!("{HOSTS_BEGIN}\n");
    for h in hosts {
        out.push_str(&format!("127.0.0.1 {h}\n"));
    }
    out.push_str(HOSTS_END);
    out
}

/// `text` with the managed block replaced (or appended); an empty list removes the block.
pub fn apply_block(text: &str, hosts: &[String]) -> String {
    let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let mut kept: Vec<&str> = Vec::new();
    let mut inside = false;
    for line in text.lines() {
        if line.trim() == HOSTS_BEGIN {
            inside = true;
        } else if inside && line.trim() == HOSTS_END {
            inside = false;
        } else if !inside {
            kept.push(line);
        }
    }
    while kept.last().is_some_and(|l| l.trim().is_empty()) {
        kept.pop();
    }
    let mut out = kept.join(eol);
    if !hosts.is_empty() {
        if !out.is_empty() {
            out.push_str(eol);
            out.push_str(eol);
        }
        out.push_str(&hosts_block(hosts).replace('\n', eol));
    }
    out.push_str(eol);
    out
}

/// Hosts that should be in the file but aren't (the hosts file is readable without admin).
pub fn missing_hosts(wanted: &[String], hosts_text: &str) -> Vec<String> {
    wanted
        .iter()
        .filter(|h| {
            !hosts_text.lines().any(|l| {
                let l = l.split('#').next().unwrap_or("");
                let mut parts = l.split_whitespace();
                parts.next().is_some_and(|ip| ip == "127.0.0.1") && parts.any(|n| n.eq_ignore_ascii_case(h))
            })
        })
        .cloned()
        .collect()
}

/// Writes the hosts block through an elevated PowerShell (one Windows approval prompt).
#[cfg(windows)]
pub fn sync_hosts_elevated(hosts: &[String]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let current = fs::read_to_string(hosts_path()).unwrap_or_default();
    let updated = apply_block(&current, hosts);
    if updated == current {
        return Ok(());
    }
    // The new file contents go through a temp file, so no project name is ever put in a command line.
    let dir = std::env::temp_dir().join(format!("nexdb-hosts-{}", std::process::id()));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let src = dir.join("hosts.new");
    fs::write(&src, &updated).map_err(|e| e.to_string())?;
    let script = dir.join("apply.ps1");
    fs::write(
        &script,
        format!(
            "Copy-Item -LiteralPath '{}' -Destination '{}' -Force\r\n",
            src.display().to_string().replace('\'', "''"),
            hosts_path().display().to_string().replace('\'', "''")
        ),
    )
    .map_err(|e| e.to_string())?;
    let launcher = format!(
        "$p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','{}'; exit $p.ExitCode",
        script.display().to_string().replace('\'', "''")
    );
    let out = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &launcher])
        .creation_flags(0x0800_0000)
        .output()
        .map_err(|e| format!("Couldn't ask Windows for permission: {e}"))?;
    let _ = fs::remove_dir_all(&dir);
    if !out.status.success() {
        return Err("Windows didn't allow the change. Choose Yes on the permission prompt to add the project addresses.".into());
    }
    if fs::read_to_string(hosts_path()).unwrap_or_default() != updated {
        return Err("The hosts file didn't change. Security software may be blocking it.".into());
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn sync_hosts_elevated(_: &[String]) -> Result<(), String> {
    Err("Project addresses are only available on Windows.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_labels() {
        assert_eq!(host_label("my-shop2").as_deref(), Some("my-shop2"));
        for bad in ["", "My Shop", "-a", "a-", "a_b", "a.b", "ü"] {
            assert!(host_label(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn detects_project_kinds_and_serves_public() {
        let dir = tempfile::tempdir().unwrap();
        let mk = |name: &str, files: &[&str]| {
            let d = dir.path().join(name);
            fs::create_dir_all(&d).unwrap();
            for f in files {
                let p = d.join(f);
                fs::create_dir_all(p.parent().unwrap()).unwrap();
                fs::write(&p, "x").unwrap();
            }
        };
        mk("shop", &["artisan", "public/index.php"]);
        mk("blog", &["wp-config.php"]);
        mk("api", &["package.json"]);
        mk("page", &["index.html"]);
        mk("Bad Name", &["index.php"]);
        mk("node_modules", &["x"]);
        let found = list(dir.path(), 80);
        let by = |n: &str| found.iter().find(|p| p.name == n).unwrap();
        assert_eq!(by("shop").kind, "laravel");
        assert!(by("shop").doc_root.ends_with("public"));
        assert_eq!(by("blog").kind, "wordpress");
        assert_eq!(by("api").kind, "node");
        assert_eq!(by("page").kind, "html");
        assert_eq!(by("shop").url, "http://shop.test/");
        assert!(by("Bad Name").host.is_none());
        assert!(found.iter().all(|p| p.name != "node_modules"));
        assert_eq!(list(dir.path(), 8080).iter().find(|p| p.name == "page").unwrap().url, "http://page.test:8080/");
    }

    #[test]
    fn creating_projects_validates_names() {
        let dir = tempfile::tempdir().unwrap();
        create(dir.path(), "demo", "php").unwrap();
        assert!(fs::read_to_string(dir.path().join("demo/index.php")).unwrap().contains("demo.test"));
        assert!(create(dir.path(), "demo", "php").unwrap_err().contains("already exists"));
        assert!(create(dir.path(), "../evil", "php").is_err());
        assert!(create(dir.path(), "Has Space", "php").is_err());
        create(dir.path(), "plain", "html").unwrap();
        assert!(dir.path().join("plain/index.html").is_file());
    }

    #[test]
    fn hosts_block_is_replaced_not_duplicated() {
        let original = "127.0.0.1 localhost\r\n::1 localhost\r\n";
        let one = apply_block(original, &["a.test".into()]);
        assert!(one.starts_with(original.trim_end()));
        assert!(one.contains("127.0.0.1 a.test"));
        let two = apply_block(&one, &["a.test".into(), "b.test".into()]);
        assert_eq!(two.matches(HOSTS_BEGIN).count(), 1);
        assert!(two.contains("127.0.0.1 b.test"));
        assert!(!two.replace("\r\n", "").contains('\n'), "line endings stay CRLF");
        assert_eq!(apply_block(&two, &[]), original);
    }

    #[test]
    fn finds_missing_hosts() {
        let text = "127.0.0.1 localhost\n127.0.0.1 a.test # mine\n# 127.0.0.1 b.test\n";
        assert_eq!(missing_hosts(&["a.test".into(), "b.test".into()], text), ["b.test"]);
    }

    #[test]
    fn writes_a_default_vhost_first() {
        let dir = tempfile::tempdir().unwrap();
        let www = dir.path().join("www");
        fs::create_dir_all(www.join("site/public")).unwrap();
        write_vhosts(&dir.path().join("etc"), &www, 80).unwrap();
        let sites = dir.path().join("etc/apache/sites-enabled");
        assert!(fs::read_to_string(sites.join("00-localhost.conf")).unwrap().contains("ServerName localhost"));
        let site = fs::read_to_string(sites.join("site.conf")).unwrap();
        assert!(site.contains("ServerName site.test") && site.contains("site/public"), "{site}");
    }

    /// Uses the real Apache and PHP installed by NexDB, in a temp root on spare ports: projects get
    /// their own virtual hosts, Laravel-style folders are served from public/, and PHP works in each.
    /// `cargo test real_project_vhosts -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_project_vhosts() {
        use crate::supervisor::{State, Supervisor, specs_for};
        use std::io::{Read, Write};
        use std::net::TcpStream;

        let base = crate::settings::load(Path::new(r"C:\NexDB")).expect("NexDB must be installed in C:/NexDB");
        let dir = tempfile::tempdir().unwrap();
        let www = dir.path().join("www");
        for (name, file) in [("alpha", "index.php"), ("beta/public", "index.php"), ("gamma", "index.html")] {
            fs::create_dir_all(www.join(name)).unwrap();
            let body = if file.ends_with("php") { format!("<?php echo 'hello from {name} ', $_SERVER['HTTP_HOST'];") } else { "plain gamma".to_string() };
            fs::write(www.join(name).join(file), body).unwrap();
        }
        fs::write(www.join("beta/artisan"), "x").unwrap();
        fs::write(www.join("index.php"), "<?php echo 'root index';").unwrap();

        let mut settings = base.clone();
        settings.www_dir = www.display().to_string();
        settings.apache_port = Some(8098);
        settings.php_fastcgi_port = 9198;
        settings.nginx_port = None;
        settings.mysql = None;
        crate::installer::refresh_configs(dir.path(), &settings).unwrap();

        let sup = Supervisor::new(specs_for(dir.path(), &settings));
        sup.start("php").unwrap();
        sup.start("apache").unwrap();
        assert!(sup.status().iter().all(|s| s.state == State::Running));

        let get = |host: &str, path: &str| {
            let mut s = TcpStream::connect(("127.0.0.1", 8098)).unwrap();
            s.write_all(format!("GET {path} HTTP/1.0\r\nHost: {host}\r\n\r\n").as_bytes()).unwrap();
            let mut out = String::new();
            s.read_to_string(&mut out).unwrap();
            out
        };
        let alpha = get("alpha.test:8098", "/");
        assert!(alpha.contains("200 OK") && alpha.contains("hello from alpha alpha.test:8098"), "{alpha}");
        let beta = get("beta.test:8098", "/");
        assert!(beta.contains("hello from beta/public beta.test:8098"), "beta is served from public/: {beta}");
        assert!(get("gamma.test:8098", "/").contains("plain gamma"));
        // localhost and unknown names keep going to the www folder.
        assert!(get("localhost:8098", "/").contains("root index"));
        assert!(get("127.0.0.1:8098", "/").contains("root index"));
        assert!(get("nothing.test:8098", "/").contains("root index"));
        sup.stop_all();
        assert!(!crate::supervisor::port_listening(8098));
    }
}
