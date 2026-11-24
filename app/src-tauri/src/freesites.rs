//! `.test` sites while NexDB is in Free: they pause, nothing is deleted, and each address shows a
//! small local page with the project's `localhost` link until the license comes back.

use crate::configure::{conf_path, write_file};
use crate::projects::{list_with, SiteRoots};
use serde::Serialize;
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
            Some(PausedSite { local_url: local_url(www, Path::new(&p.doc_root), port), name: p.name, host, can_use_localhost: false })
        })
        .collect()
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
    use std::fs;
    use std::path::Path;

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

    #[test]
    fn free_nginx_config_has_the_catch_all() {
        let dir = tempfile::tempdir().unwrap();
        let etc = dir.path().join("etc");
        write_paused(&etc, "nginx", 8080, &[], "https://example.test/#price").unwrap();
        let paused = fs::read_to_string(etc.join("nginx").join("sites-enabled").join("01-paused.conf")).unwrap();
        assert!(paused.contains(r"server_name ~^.+\.test$;") && paused.contains("deny all;") && paused.contains("listen 8080;"), "{paused}");
    }
}
