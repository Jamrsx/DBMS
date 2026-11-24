//! `.test` sites while NexDB is in Free: they pause, nothing is deleted, and each address shows a
//! small local page with the project's `localhost` link until the license comes back.

use crate::configure::{conf_path, write_file};
use crate::projects::{list_with, SiteRoots};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Component, Path};

/// The folder under `etc` that holds the paused page. It also marks that Free configs are in place.
pub const PAUSED_DIR: &str = "nexdb-paused";

/// A `.test` site that is paused while NexDB is in Free.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PausedSite {
    pub name: String,
    pub host: String,
    pub local_url: String,
    /// A Laravel project whose `APP_URL` still points at its `.test` address.
    pub can_use_localhost: bool,
}

fn encode(part: &str) -> String {
    part.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// The project's address on `localhost`, down to the folder the web server serves.
pub fn local_url(www: &Path, doc_root: &Path, port: u16) -> String {
    let path: String = doc_root
        .strip_prefix(www)
        .unwrap_or(Path::new(""))
        .components()
        .filter_map(|c| match c {
            Component::Normal(part) => Some(format!("/{}", encode(&part.to_string_lossy()))),
            _ => None,
        })
        .collect();
    let host = if port == 80 { "localhost".to_string() } else { format!("localhost:{port}") };
    format!("http://{host}{path}/")
}

/// Every project that has a `.test` address.
pub fn paused_sites(www: &Path, port: u16, roots: &SiteRoots) -> Vec<PausedSite> {
    list_with(www, port, roots)
        .into_iter()
        .filter_map(|p| {
            let host = p.host?;
            let can_use_localhost = fs::read_to_string(Path::new(&p.path).join(".env")).is_ok_and(|env| points_at_test(&env, &host));
            Some(PausedSite { local_url: local_url(www, Path::new(&p.doc_root), port), name: p.name, host, can_use_localhost })
        })
        .collect()
}

/// Keeps only sites the hosts file really knows, so someone who never had `.test` addresses
/// isn't told their folders are "paused".
pub fn in_hosts_file(sites: Vec<PausedSite>, hosts: &str) -> Vec<PausedSite> {
    let known: HashSet<String> = hosts
        .lines()
        .map(|line| line.split('#').next().unwrap_or(""))
        .flat_map(|line| line.split_whitespace().skip(1))
        .map(str::to_lowercase)
        .collect();
    sites.into_iter().filter(|s| known.contains(&s.host.to_lowercase())).collect()
}

/// A change "Use localhost" made, so it can be undone after an upgrade.
#[derive(Debug, Serialize, Deserialize)]
struct UrlChange {
    old: String,
    new: String,
}

type UrlChanges = BTreeMap<String, UrlChange>;

const CHANGES_FILE: &str = "free-url-changes.json";

fn load_changes(etc: &Path) -> UrlChanges {
    fs::read_to_string(etc.join(CHANGES_FILE)).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn save_changes(etc: &Path, changes: &UrlChanges) -> Result<(), String> {
    let path = etc.join(CHANGES_FILE);
    if changes.is_empty() {
        return match fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        };
    }
    write_file(&path, &serde_json::to_string_pretty(changes).map_err(|e| e.to_string())?)
}

/// The value of the `APP_URL` line, without its line ending.
fn app_url(env: &str) -> Option<&str> {
    env.lines().find_map(|line| line.strip_prefix("APP_URL=")).map(|v| v.trim_end_matches('\r'))
}

fn points_at_test(env: &str, host: &str) -> bool {
    app_url(env).is_some_and(|v| v == format!("http://{host}") || v == format!("https://{host}"))
}

/// The same file with only the `APP_URL` value replaced; every other byte stays as it was.
fn with_app_url(env: &str, value: &str) -> String {
    env.split_inclusive('\n')
        .map(|line| {
            if !line.starts_with("APP_URL=") {
                return line.to_string();
            }
            let ending = &line[line.trim_end_matches(['\r', '\n']).len()..];
            format!("APP_URL={value}{ending}")
        })
        .collect()
}

/// Points a paused Laravel project at `localhost`. The first copy of its `.env` is kept outside
/// the project, so passwords in it can't be committed to git by accident.
pub fn use_localhost(etc: &Path, project_dir: &Path, name: &str, host: &str, local_url: &str) -> Result<(), String> {
    let path = project_dir.join(".env");
    let env = fs::read_to_string(&path).map_err(|_| "This project has no readable .env file.".to_string())?;
    if !points_at_test(&env, host) {
        return Err(format!("APP_URL in this project isn't {host}, so NexDB left it alone."));
    }
    let old = app_url(&env).unwrap_or_default().to_string();
    let new = local_url.trim_end_matches('/').to_string();
    let backup = etc.join("free-url-backups").join(format!("{name}.env"));
    if !backup.exists() {
        write_file(&backup, &env)?;
    }
    let mut changes = load_changes(etc);
    changes.insert(name.to_string(), UrlChange { old, new: new.clone() });
    save_changes(etc, &changes)?;
    fs::write(&path, with_app_url(&env, &new)).map_err(|e| format!("Couldn't update .env: {e}"))
}

/// Puts back every `.test` address "Use localhost" changed, unless the line was edited since.
/// Returns how many were restored.
pub fn restore_urls(etc: &Path, www: &Path) -> Result<usize, String> {
    let changes = load_changes(etc);
    let mut restored = 0;
    for (name, change) in &changes {
        let path = www.join(name).join(".env");
        let Ok(env) = fs::read_to_string(&path) else { continue };
        if app_url(&env) == Some(change.new.as_str()) {
            fs::write(&path, with_app_url(&env, &change.old)).map_err(|e| format!("Couldn't update .env: {e}"))?;
            restored += 1;
        }
    }
    save_changes(etc, &UrlChanges::new())?;
    Ok(restored)
}

const PAGE_TOP: &str = r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>This site is paused - NexDB</title>
<style>
:root { color-scheme: light dark; --bg: #f6f7f9; --card: #fff; --text: #16181d; --muted: #444b58; --line: #cdd2d9; --accent: #2563eb; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f1114; --card: #171a1f; --text: #e4e7ec; --muted: #b3b9c4; --line: #363c46; --accent: #3987e5; } }
* { box-sizing: border-box; }
body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: var(--bg); color: var(--text); font: 16px/1.5 "Segoe UI", system-ui, -apple-system, sans-serif; }
main { width: min(520px, 100%); padding: 32px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
h1 { margin: 0 0 8px; font-size: 24px; line-height: 1.25; overflow-wrap: anywhere; }
p { margin: 0 0 12px; color: var(--muted); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
a { display: inline-block; padding: 9px 14px; border: 1px solid var(--line); border-radius: 7px; color: var(--text); font-weight: 600; text-decoration: none; }
a.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
</style>
</head>
<body>
<main>
<h1 id="title">This site is paused</h1>
<p>Your files and databases are safe. Nothing was deleted.</p>
<p><code>.test</code> addresses are part of the full NexDB, and this one returns when you renew or upgrade.</p>
<div class="actions"><a id="local" class="primary" hidden>Open at localhost</a><a id="renew">Renew or upgrade</a></div>
</main>
<script>
const nexdb = "#;

const PAGE_BOTTOM: &str = r#";
const site = nexdb.sites[location.hostname.toLowerCase()];
document.getElementById("renew").href = nexdb.renew;
if (site) {
  document.getElementById("title").textContent = site.name + " is paused";
  const local = document.getElementById("local");
  local.href = site.url;
  local.hidden = false;
}
</script>
</body>
</html>
"#;

/// The static page every paused `.test` address shows.
pub fn paused_page(sites: &[PausedSite], renew_url: &str) -> String {
    let map: serde_json::Map<String, serde_json::Value> = sites
        .iter()
        .map(|s| (s.host.to_lowercase(), serde_json::json!({ "name": s.name, "url": s.local_url })))
        .collect();
    // A project name can't end the script early: `<` never appears in the data as itself.
    let data = serde_json::json!({ "sites": map, "renew": renew_url }).to_string().replace('<', "\\u003c");
    format!("{PAGE_TOP}{data}{PAGE_BOTTOM}")
}

/// Writes the paused page and the web server's catch-all for `*.test`, reachable only from this PC.
pub fn write_paused(etc: &Path, web: &str, port: u16, sites: &[PausedSite], renew_url: &str) -> Result<(), String> {
    let folder = etc.join(PAUSED_DIR);
    write_file(&folder.join("index.html"), &paused_page(sites, renew_url))?;
    let paused = conf_path(&folder);
    let conf = if web == "apache" {
        format!(
            "# Generated by NexDB: .test sites are paused in Free. Only reachable from this PC.\n\
             <VirtualHost *:{port}>\n    ServerName nexdb-paused.test\n    ServerAlias *.test\n    DocumentRoot \"{paused}\"\n    \
             AliasMatch \"^/.*$\" \"{paused}/index.html\"\n    <Directory \"{paused}\">\n        Require local\n    </Directory>\n</VirtualHost>\n"
        )
    } else {
        format!(
            "# Generated by NexDB: .test sites are paused in Free. Only reachable from this PC.\n\
             server {{\n    listen {port};\n    server_name ~^.+\\.test$;\n    root \"{paused}\";\n    allow 127.0.0.1;\n    allow ::1;\n    deny all;\n    \
             location / {{ try_files /index.html =404; }}\n}}\n"
        )
    };
    write_file(&etc.join(web).join("sites-enabled").join("01-paused.conf"), &conf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::write_vhosts;

    #[test]
    fn paused_page_survives_hostile_project_names() {
        let site = PausedSite { name: "a</script><b>".into(), host: "x.test".into(), local_url: "http://localhost/a%3C/".into(), can_use_localhost: false };
        let page = paused_page(&[site], "https://example.test/#price");
        assert_eq!(page.matches("</script>").count(), 1);
        assert!(page.contains("\\u003c/script"));
    }

    #[test]
    fn local_url_encodes_and_includes_the_public_folder() {
        assert_eq!(local_url(Path::new("C:/www"), Path::new("C:/www/My Shop/public"), 80), "http://localhost/My%20Shop/public/");
        assert_eq!(local_url(Path::new("C:/www"), Path::new("C:/www/blog"), 8080), "http://localhost:8080/blog/");
    }

    #[test]
    fn local_url_encodes_non_english_names() {
        assert_eq!(local_url(Path::new("C:/www"), Path::new("C:/www/café"), 80), "http://localhost/caf%C3%A9/");
    }

    fn www_with_shop(dir: &Path) -> std::path::PathBuf {
        let www = dir.join("www");
        fs::create_dir_all(www.join("shop")).unwrap();
        www
    }

    #[test]
    fn free_apache_config_has_localhost_and_the_catch_all_but_no_project_sites() {
        let dir = tempfile::tempdir().unwrap();
        let (www, etc) = (www_with_shop(dir.path()), dir.path().join("etc"));
        write_vhosts(&etc, &www, 80, None, &Default::default(), &Default::default(), false).unwrap();
        write_paused(&etc, "apache", 80, &[], "https://example.test/#price").unwrap();
        let sites = etc.join("apache").join("sites-enabled");
        assert!(sites.join("00-localhost.conf").is_file());
        assert!(!sites.join("shop.conf").exists());
        let paused = fs::read_to_string(sites.join("01-paused.conf")).unwrap();
        assert!(paused.contains("ServerAlias *.test") && paused.contains("Require local"), "{paused}");
        assert!(etc.join(PAUSED_DIR).join("index.html").is_file());
    }

    #[test]
    fn full_apache_config_is_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let (www, etc) = (www_with_shop(dir.path()), dir.path().join("etc"));
        write_vhosts(&etc, &www, 80, None, &Default::default(), &Default::default(), true).unwrap();
        let sites = etc.join("apache").join("sites-enabled");
        assert!(sites.join("shop.conf").is_file());
        assert!(!sites.join("01-paused.conf").exists());
    }

    fn laravel(dir: &Path, env: &str) -> (std::path::PathBuf, std::path::PathBuf, std::path::PathBuf) {
        let (www, etc) = (dir.join("www"), dir.join("etc"));
        let project = www.join("shop");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&etc).unwrap();
        fs::write(project.join(".env"), env).unwrap();
        (www, etc, project)
    }

    const ENV: &str = "APP_NAME=Shop\r\nAPP_URL=http://shop.test\r\nDB_PASSWORD=s3cret\r\n";
    const LOCAL: &str = "http://localhost/shop/public/";

    #[test]
    fn use_localhost_changes_only_app_url_and_keeps_crlf() {
        let dir = tempfile::tempdir().unwrap();
        let (_, etc, project) = laravel(dir.path(), ENV);
        use_localhost(&etc, &project, "shop", "shop.test", LOCAL).unwrap();
        assert_eq!(fs::read_to_string(project.join(".env")).unwrap(), "APP_NAME=Shop\r\nAPP_URL=http://localhost/shop/public\r\nDB_PASSWORD=s3cret\r\n");
        assert_eq!(fs::read_to_string(etc.join("free-url-backups").join("shop.env")).unwrap(), ENV);
        assert_eq!(fs::read_dir(&project).unwrap().count(), 1, "no backup with secrets inside the project");
    }

    #[test]
    fn use_localhost_refuses_when_app_url_is_missing_or_different() {
        for env in ["APP_NAME=Shop\n", "APP_URL=http://example.local\n"] {
            let dir = tempfile::tempdir().unwrap();
            let (_, etc, project) = laravel(dir.path(), env);
            assert!(use_localhost(&etc, &project, "shop", "shop.test", LOCAL).is_err());
            assert_eq!(fs::read_to_string(project.join(".env")).unwrap(), env);
            assert!(!etc.join("free-url-changes.json").exists());
        }
    }

    #[test]
    fn restore_puts_back_the_test_address() {
        let dir = tempfile::tempdir().unwrap();
        let (www, etc, project) = laravel(dir.path(), ENV);
        use_localhost(&etc, &project, "shop", "shop.test", LOCAL).unwrap();
        assert_eq!(restore_urls(&etc, &www).unwrap(), 1);
        assert_eq!(fs::read_to_string(project.join(".env")).unwrap(), ENV);
        assert!(!etc.join("free-url-changes.json").exists());
    }

    #[test]
    fn restore_never_overwrites_a_hand_edit() {
        let dir = tempfile::tempdir().unwrap();
        let (www, etc, project) = laravel(dir.path(), ENV);
        use_localhost(&etc, &project, "shop", "shop.test", LOCAL).unwrap();
        let edited = "APP_NAME=Shop\r\nAPP_URL=http://example.local\r\nDB_PASSWORD=s3cret\r\n";
        fs::write(project.join(".env"), edited).unwrap();
        assert_eq!(restore_urls(&etc, &www).unwrap(), 0);
        assert_eq!(fs::read_to_string(project.join(".env")).unwrap(), edited);
    }

    #[test]
    fn restore_skips_a_project_that_was_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let (www, etc, project) = laravel(dir.path(), ENV);
        use_localhost(&etc, &project, "shop", "shop.test", LOCAL).unwrap();
        fs::remove_dir_all(&project).unwrap();
        assert_eq!(restore_urls(&etc, &www).unwrap(), 0);
    }

    #[test]
    fn only_sites_that_really_had_a_test_address_count_as_paused() {
        let site = |name: &str| PausedSite { name: name.into(), host: format!("{name}.test"), local_url: String::new(), can_use_localhost: false };
        let hosts = "# comment mentions old.test\r\n127.0.0.1 shop.test blog.test\r\n";
        let names: Vec<String> = in_hosts_file(vec![site("shop"), site("new"), site("old")], hosts).into_iter().map(|s| s.name).collect();
        assert_eq!(names, ["shop"]);
    }

    #[test]
    fn free_nginx_config_has_the_catch_all() {
        let dir = tempfile::tempdir().unwrap();
        let etc = dir.path().join("etc");
        write_paused(&etc, "nginx", 8080, &[], "https://example.test/#price").unwrap();
        let paused = fs::read_to_string(etc.join("nginx").join("sites-enabled").join("01-paused.conf")).unwrap();
        assert!(paused.contains(r"server_name ~^.+\.test$;") && paused.contains("deny all;") && paused.contains("listen 8080;"), "{paused}");
    }
}
