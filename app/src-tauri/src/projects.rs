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
    /// Uses of code newer PHP warns about ("Deprecated: …"), which NexDB can fix.
    #[serde(default)]
    pub php_warnings: usize,
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
    list_with(www, port, &SiteRoots::new())
}

/// Like `list`, with the site folders projects chose (a subfolder that is the website).
pub fn list_with(www: &Path, port: u16, roots: &SiteRoots) -> Vec<Project> {
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
            let chosen = roots.get(&name).map(|r| path.join(r)).filter(|d| d.is_dir());
            let doc_root = chosen.unwrap_or_else(|| if path.join("public").is_dir() { path.join("public") } else { path.clone() });
            let host = host_label(&name).map(|h| format!("{h}.{TLD}"));
            Some(Project {
                url: host.as_ref().map(|h| format!("http://{h}{suffix}/")).unwrap_or_default(),
                local_url: format!("http://localhost{suffix}/{name}/"),
                name,
                path: path.display().to_string(),
                kind: kind.into(),
                doc_root: doc_root.display().to_string(),
                host,
                php_warnings: 0,
            })
        })
        .collect();
    projects.sort_by_key(|p| p.name.to_lowercase());
    projects
}

/// Project -> the subfolder that is its website, relative to the project ("Backend/public").
pub type SiteRoots = std::collections::BTreeMap<String, String>;

/// A folder inside a project that can be its website.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SiteFolder {
    /// Relative to the project, with forward slashes ("Backend/public").
    pub path: String,
    /// What it looks like, in plain words ("Laravel app").
    pub label: String,
}

/// A front-end app inside a project that runs on its own dev server (Vite, Next.js…).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DevApp {
    /// Relative to the project; empty for the project folder itself.
    pub path: String,
    pub label: String,
    /// The port its dev server usually uses.
    pub port: u16,
}

fn subfolders(dir: &Path) -> Vec<String> {
    let mut subs: Vec<String> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| !n.starts_with('.') && !["node_modules", "vendor"].contains(&n.as_str()))
        .collect();
    subs.sort_by_key(|n| n.to_lowercase());
    subs
}

/// Folders one level down that look like a website, for projects that keep their app in a
/// subfolder (an API in `Backend/public`, a built front end in `web/dist`).
pub fn site_folders(dir: &Path) -> Vec<SiteFolder> {
    let mut out = Vec::new();
    for sub in subfolders(dir) {
        let base = dir.join(&sub);
        let (path, label) = if base.join("public").join("index.php").is_file() {
            (format!("{sub}/public"), if base.join("artisan").is_file() { "Laravel app" } else { "PHP app" })
        } else if base.join("index.php").is_file() {
            (sub, "PHP site")
        } else if base.join("dist").join("index.html").is_file() {
            (format!("{sub}/dist"), "Built front end")
        } else if base.join("index.html").is_file() && !base.join("package.json").is_file() {
            (sub, "Static site")
        } else {
            continue;
        };
        out.push(SiteFolder { path, label: label.into() });
    }
    out
}

/// True when the project folder itself has no page to show, so the web server would only list
/// its files.
pub fn needs_site_folder(dir: &Path) -> bool {
    !["index.php", "index.html", "public"].iter().any(|f| dir.join(f).exists())
}

/// Front-end apps with a dev server, in the project folder or one level down.
pub fn dev_apps(dir: &Path) -> Vec<DevApp> {
    let mut found = Vec::new();
    let candidates = std::iter::once(String::new()).chain(subfolders(dir));
    for sub in candidates {
        let Ok(text) = fs::read_to_string(dir.join(&sub).join("package.json")) else { continue };
        let has = |dep: &str| text.contains(&format!("\"{dep}\""));
        let (label, port) = if has("next") {
            ("Next.js", 3000)
        } else if has("nuxt") {
            ("Nuxt", 3000)
        } else if has("@angular/core") {
            ("Angular", 4200)
        } else if has("vite") {
            ("Vite", 5173)
        } else {
            continue;
        };
        found.push(DevApp { path: sub, label: label.into(), port });
    }
    found
}

/// Checks a site folder the user picked: inside the project, no `..`, and it exists.
/// Returns it with forward slashes.
pub fn clean_site_folder(project: &Path, folder: &str) -> Result<String, String> {
    let folder = folder.trim().trim_matches(['/', '\\']).replace('\\', "/");
    let parts: Vec<&str> = folder.split('/').filter(|p| !p.is_empty()).collect();
    if parts.is_empty() || parts.iter().any(|p| *p == ".." || *p == "." || p.contains(':')) {
        return Err("Pick a folder inside the project.".into());
    }
    let joined = parts.join("/");
    if !project.join(&joined).is_dir() {
        return Err(format!("There's no folder named {joined} in this project."));
    }
    Ok(joined)
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

/// Points each project's address at HTTPS (`https://shop.test/`).
pub fn use_https(projects: &mut [Project], port: u16) {
    let suffix = if port == 443 { String::new() } else { format!(":{port}") };
    for p in projects {
        if let Some(host) = &p.host {
            p.url = format!("https://{host}{suffix}/");
        }
    }
}

/// HTTPS for the virtual hosts: the port and the certificate Apache serves.
pub struct Https<'a> {
    pub port: u16,
    pub cert: &'a Path,
    pub key: &'a Path,
}

/// Writes the sites for the saved settings, for whichever web server serves them (Apache, else
/// nginx), making the HTTPS certificate first when HTTPS is on. The other server's site files
/// are removed, so switching never leaves old ones behind.
pub fn write_site_configs(root: &Path, settings: &crate::settings::Settings) -> Result<(), String> {
    let Some((web, port)) = settings.web() else { return Ok(()) };
    let www = Path::new(&settings.www_dir);
    let etc = root.join("etc");
    let php_ports = crate::phpver::project_ports(root, settings);
    if web == "apache" {
        clear_confs(&etc.join("nginx").join("sites-enabled"))?;
        clear_confs(&etc.join("nginx").join("localhost.d"))?;
    } else {
        clear_confs(&etc.join("apache").join("sites-enabled"))?;
    }
    let cert = if settings.preferences.https {
        let mut names: Vec<String> = vec!["localhost".into(), "127.0.0.1".into(), "::1".into()];
        names.extend(list(www, port).into_iter().filter_map(|p| p.host));
        Some(crate::admin::site_certificate(&crate::admin::ca_dir(), &etc.join("ssl"), &names)?)
    } else {
        None
    };
    let https = cert.as_ref().map(|c| Https { port: settings.preferences.https_port, cert: &c.cert_path, key: &c.key_path });
    let roots = &settings.preferences.site_root;
    if web == "apache" {
        write_vhosts(&etc, www, port, https.as_ref(), &php_ports, roots)?;
        return write_apache_shares(&etc, www, port, &settings.preferences, roots);
    }
    let nginx_dir = settings
        .components
        .iter()
        .find(|c| c.id == "nginx")
        .map(|c| PathBuf::from(&c.path))
        .ok_or("nginx isn't installed.")?;
    write_nginx_sites(&NginxSites {
        etc: &etc,
        www,
        port,
        https: https.as_ref(),
        php_ports: &php_ports,
        fcgi_port: settings.php_fastcgi_port,
        nginx_dir: &nginx_dir,
        phpmyadmin: crate::phpmyadmin::installed(root).then(|| crate::phpmyadmin::dir(root)),
        shared: &settings.preferences.shared,
        share_dev: &settings.preferences.share_dev,
        site_roots: roots,
    })
}

/// Shared projects for Apache: each on its own port with the project as the whole site, so a
/// phone on the same network can open it at the PC's address. Plain HTTP. A project on another
/// PHP version keeps it, through the folder rules in 00-localhost.conf.
fn write_apache_shares(etc: &Path, www: &Path, port: u16, prefs: &crate::settings::Preferences, roots: &SiteRoots) -> Result<(), String> {
    let projects = list_with(www, port, roots);
    let shared = &prefs.shared;
    let mut out = String::from("# Generated by NexDB: projects shared on the local network.\n");
    for (name, share_port) in shared {
        let Some(p) = projects.iter().find(|p| &p.name == name) else { continue };
        let root = conf_path(Path::new(&p.doc_root));
        out.push_str(&format!(
            r#"
Listen {share_port}
<VirtualHost *:{share_port}>
    ServerName {name}.share
    DocumentRoot "{root}"
    # Through a public link the visitor uses https; tell PHP, so the page's links use it too.
    SetEnvIf X-Forwarded-Proto "^https$" HTTPS=on
    <Directory "{root}">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
"#
        ));
    }
    // Dev servers: passed through, websockets too (Vite's live reload), with the Host the dev
    // server expects so its host check lets the request in.
    for (name, dev) in &prefs.share_dev {
        out.push_str(&format!(
            r#"
# {name}'s dev server
Listen {port}
<VirtualHost *:{port}>
    ServerName {name}.dev-share
    ProxyPreserveHost Off
    ProxyPass "/" "http://127.0.0.1:{target}/" upgrade=websocket
    ProxyPassReverse "/" "http://127.0.0.1:{target}/"
</VirtualHost>
"#,
            port = dev.port,
            target = dev.target
        ));
    }
    crate::configure::write_file(&etc.join("apache").join("sites-enabled").join("zz-shared.conf"), &out)
}


/// Removes the generated `.conf` files in `dir`, if it exists.
fn clear_confs(dir: &Path) -> Result<(), String> {
    let Ok(entries) = fs::read_dir(dir) else { return Ok(()) };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().is_some_and(|e| e == "conf") {
            fs::remove_file(&p).map_err(|e| format!("Couldn't remove {}: {e}", p.display()))?;
        }
    }
    Ok(())
}

/// What nginx needs to serve the projects.
pub struct NginxSites<'a> {
    pub etc: &'a Path,
    pub www: &'a Path,
    pub port: u16,
    pub https: Option<&'a Https<'a>>,
    pub php_ports: &'a std::collections::BTreeMap<String, u16>,
    /// The default PHP's FastCGI port.
    pub fcgi_port: u16,
    pub nginx_dir: &'a Path,
    /// phpMyAdmin's folder, when it is installed.
    pub phpmyadmin: Option<PathBuf>,
    /// Projects shared on the local network, each on its own port.
    pub shared: &'a std::collections::BTreeMap<String, u16>,
    /// Dev servers shared on the local network.
    pub share_dev: &'a std::collections::BTreeMap<String, crate::settings::DevShare>,
    pub site_roots: &'a SiteRoots,
}

/// nginx's version of `write_vhosts`: one server block per project in `sites-enabled`, and
/// extras for the localhost server (HTTPS, phpMyAdmin, other PHP versions) in `localhost.d`.
/// Laravel's pretty URLs work through `try_files`, as Apache's .htaccess does.
pub fn write_nginx_sites(s: &NginxSites) -> Result<(), String> {
    let sites = s.etc.join("nginx").join("sites-enabled");
    let local = s.etc.join("nginx").join("localhost.d");
    for dir in [&sites, &local] {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        clear_confs(dir)?;
    }
    let params = conf_path(&s.nginx_dir.join("conf").join("fastcgi_params"));
    let tls = s
        .https
        .map(|h| {
            format!(
                "    listen {} ssl;\n    ssl_certificate \"{}\";\n    ssl_certificate_key \"{}\";\n",
                h.port,
                conf_path(h.cert),
                conf_path(h.key)
            )
        })
        .unwrap_or_default();
    // PHP files go to the FastCGI port of the PHP version in use there.
    let php = |port: u16| {
        format!(
            r#"    location ~ \.php$ {{
        try_files $uri =404;
        fastcgi_pass 127.0.0.1:{port};
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include "{params}";
    }}
"#
        )
    };

    let mut first = String::from("# Generated by NexDB. Included in nginx.conf's localhost server.\n");
    first.push_str(&tls);
    if let Some(pma) = &s.phpmyadmin {
        first.push_str(&format!(
            r#"
# phpMyAdmin, only reachable from this PC.
location = /phpmyadmin {{
    return 301 /phpmyadmin/;
}}
location ^~ /phpmyadmin/ {{
    alias "{dir}/";
    index index.php;
    allow 127.0.0.1;
    allow ::1;
    deny all;
    location ~ \.php$ {{
        if (!-f $request_filename) {{ return 404; }}
        fastcgi_pass 127.0.0.1:{port};
        fastcgi_param SCRIPT_FILENAME $request_filename;
        include "{params}";
    }}
}}
"#,
            dir = conf_path(pma),
            port = s.fcgi_port
        ));
    }
    // Projects on another PHP version, so localhost/name uses it too.
    for (name, php_port) in s.php_ports {
        if host_label(name).is_none() {
            continue;
        }
        first.push_str(&format!("\nlocation ^~ /{name}/ {{\n{}}}\n", php(*php_port)));
    }
    crate::configure::write_file(&local.join("00-localhost.conf"), &first)?;

    for p in list_with(s.www, s.port, s.site_roots) {
        let Some(host) = &p.host else { continue };
        let port = s.php_ports.get(&p.name).copied().unwrap_or(s.fcgi_port);
        let body = format!(
            r#"# Generated by NexDB for {name}
server {{
    listen {listen};
{tls}    server_name {host};
    root "{root}";
    index index.php index.html index.htm;
    autoindex on;

    location / {{
        try_files $uri $uri/ /index.php?$query_string;
    }}
{php}}}
"#,
            name = p.name,
            listen = s.port,
            root = conf_path(Path::new(&p.doc_root)),
            php = php(port),
        );
        crate::configure::write_file(&sites.join(format!("{}.conf", p.name)), &body)?;
    }

    // Shared projects: each on its own port, for phones on the same network. Plain HTTP.
    let projects = list_with(s.www, s.port, s.site_roots);
    // Through a public link the visitor uses https while the tunnel talks plain http; PHP is
    // told, so the page's links (CSS, scripts) use https too.
    let mut shares = String::from(
        "# Generated by NexDB: projects shared on the local network.\nmap $http_x_forwarded_proto $nexdb_https {\n    default \"\";\n    https on;\n}\n",
    );
    let include = format!("include \"{params}\";\n");
    let php_share =
        |port: u16| php(port).replacen(&include, &format!("{include}        fastcgi_param HTTPS $nexdb_https if_not_empty;\n"), 1);
    for (name, share_port) in s.shared {
        let Some(p) = projects.iter().find(|p| &p.name == name) else { continue };
        let port = s.php_ports.get(name).copied().unwrap_or(s.fcgi_port);
        shares.push_str(&format!(
            r#"
server {{
    listen {share_port};
    root "{root}";
    index index.php index.html index.htm;
    autoindex on;

    location / {{
        try_files $uri $uri/ /index.php?$query_string;
    }}
{php}}}
"#,
            root = conf_path(Path::new(&p.doc_root)),
            php = php_share(port),
        ));
    }
    for (name, dev) in s.share_dev {
        shares.push_str(&format!(
            r#"
# {name}'s dev server
server {{
    listen {port};
    location / {{
        proxy_pass http://127.0.0.1:{target};
        proxy_http_version 1.1;
        proxy_set_header Host 127.0.0.1:{target};
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1h;
    }}
}}
"#,
            port = dev.port,
            target = dev.target
        ));
    }
    crate::configure::write_file(&sites.join("zz-shared.conf"), &shares)?;
    Ok(())
}


/// One virtual host per project, plus a first one that keeps `http://localhost/` on the www folder.
/// With `https`, each one is also served over TLS.
/// `php_ports` sends a project's PHP files to another PHP version's FastCGI port.
pub fn write_vhosts(
    etc: &Path,
    www: &Path,
    port: u16,
    https: Option<&Https>,
    php_ports: &std::collections::BTreeMap<String, u16>,
    roots: &SiteRoots,
) -> Result<(), String> {
    let dir = etc.join("apache").join("sites-enabled");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let p = entry.path();
        if p.extension().is_some_and(|e| e == "conf") {
            let _ = fs::remove_file(p);
        }
    }
    let block = |listen: u16, tls: &str, server: &str, doc_root: &Path, aliases: &str| {
        format!(
            "<VirtualHost *:{listen}>\n    ServerName {server}\n{aliases}    DocumentRoot \"{root}\"\n{tls}    <Directory \"{root}\">\n        Options Indexes FollowSymLinks\n        AllowOverride All\n        Require all granted\n    </Directory>\n</VirtualHost>\n",
            root = conf_path(doc_root)
        )
    };
    let tls = https
        .map(|h| {
            format!(
                "    SSLEngine on\n    SSLCertificateFile \"{}\"\n    SSLCertificateKeyFile \"{}\"\n",
                conf_path(h.cert),
                conf_path(h.key)
            )
        })
        .unwrap_or_default();
    let vhost = |server: &str, doc_root: &Path, aliases: &str| {
        let mut out = block(port, "", server, doc_root, aliases);
        if let Some(h) = https {
            out.push_str(&block(h.port, &tls, server, doc_root, aliases));
        }
        out
    };
    let mut first = String::from("# Generated by NexDB. Projects get their own file.\n");
    if let Some(h) = https {
        let logs = etc.parent().unwrap_or(etc).join("logs");
        first.push_str(&format!(
            "LoadModule ssl_module modules/mod_ssl.so\nLoadModule socache_shmcb_module modules/mod_socache_shmcb.so\nListen {}\nSSLSessionCache \"shmcb:{}/ssl_scache(512000)\"\nSSLProtocol -all +TLSv1.2 +TLSv1.3\n\n",
            h.port,
            conf_path(&logs)
        ));
    }
    first.push_str(&vhost("localhost", www, "    ServerAlias 127.0.0.1\n"));
    // Projects on another PHP version: by folder, so both name.test and localhost/name use it.
    // Later <FilesMatch> sections win, so this overrides the default PHP handler.
    for (name, php_port) in php_ports {
        if host_label(name).is_none() {
            continue;
        }
        first.push_str(&format!(
            "\n<Directory \"{}\">\n    <FilesMatch \"\\.php$\">\n        SetHandler \"proxy:fcgi://127.0.0.1:{php_port}/\"\n    </FilesMatch>\n</Directory>\n",
            conf_path(&www.join(name))
        ));
    }
    crate::configure::write_file(&dir.join("00-localhost.conf"), &first)?;
    for p in list_with(www, port, roots) {
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

    /// A monorepo like parish/: an API in Backend/public, a Vite app in web, a built site in docs/dist.
    fn monorepo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        fs::create_dir_all(p.join("Backend/public")).unwrap();
        fs::write(p.join("Backend/public/index.php"), "<?php").unwrap();
        fs::write(p.join("Backend/artisan"), "").unwrap();
        fs::create_dir_all(p.join("web")).unwrap();
        fs::write(p.join("web/index.html"), "<div id=app>").unwrap();
        fs::write(p.join("web/package.json"), r#"{"devDependencies":{"vite":"^8"}}"#).unwrap();
        fs::create_dir_all(p.join("docs/dist")).unwrap();
        fs::write(p.join("docs/dist/index.html"), "built").unwrap();
        fs::create_dir_all(p.join("node_modules/x/public")).unwrap();
        fs::write(p.join("node_modules/x/public/index.php"), "").unwrap();
        dir
    }

    #[test]
    fn finds_site_folders_and_dev_apps_in_a_monorepo() {
        let dir = monorepo();
        assert!(needs_site_folder(dir.path()));
        let folders = site_folders(dir.path());
        let paths: Vec<&str> = folders.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["Backend/public", "docs/dist"], "a Vite source folder is not a site, node_modules is skipped");
        assert_eq!(folders[0].label, "Laravel app");
        let dev = dev_apps(dir.path());
        assert_eq!(dev, [DevApp { path: "web".into(), label: "Vite".into(), port: 5173 }]);
    }

    #[test]
    fn site_folder_must_stay_inside_the_project() {
        let dir = monorepo();
        assert_eq!(clean_site_folder(dir.path(), "\\Backend\\public\\").unwrap(), "Backend/public");
        assert!(clean_site_folder(dir.path(), "../other").is_err());
        assert!(clean_site_folder(dir.path(), "C:/Windows").is_err());
        assert!(clean_site_folder(dir.path(), "missing").is_err());
    }

    #[test]
    fn chosen_site_folder_becomes_the_document_root() {
        let www = tempfile::tempdir().unwrap();
        let parish = www.path().join("parish");
        fs::create_dir_all(parish.join("Backend/public")).unwrap();
        let roots = SiteRoots::from([("parish".to_string(), "Backend/public".to_string())]);
        let p = list_with(www.path(), 80, &roots).pop().unwrap();
        assert_eq!(Path::new(&p.doc_root), parish.join("Backend/public"));
        // A folder that's gone falls back to the usual choice.
        let gone = SiteRoots::from([("parish".to_string(), "nope".to_string())]);
        assert_eq!(Path::new(&list_with(www.path(), 80, &gone).pop().unwrap().doc_root), parish);
    }

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
        write_vhosts(&dir.path().join("etc"), &www, 80, None, &Default::default(), &Default::default()).unwrap();
        let sites = dir.path().join("etc/apache/sites-enabled");
        assert!(fs::read_to_string(sites.join("00-localhost.conf")).unwrap().contains("ServerName localhost"));
        let site = fs::read_to_string(sites.join("site.conf")).unwrap();
        assert!(site.contains("ServerName site.test") && site.contains("site/public"), "{site}");
        assert!(!site.contains("SSLEngine"));

        let (cert, key) = (dir.path().join("sites.crt"), dir.path().join("sites.key"));
        let php_ports = [("site".to_string(), 9087u16)].into_iter().collect();
        write_vhosts(&dir.path().join("etc"), &www, 80, Some(&Https { port: 443, cert: &cert, key: &key }), &php_ports, &Default::default()).unwrap();
        let first = fs::read_to_string(sites.join("00-localhost.conf")).unwrap();
        assert!(first.contains("Listen 443") && first.contains("mod_ssl.so"), "{first}");
        assert!(first.contains("/site\">") && first.contains("proxy:fcgi://127.0.0.1:9087/"), "{first}");
        let site = fs::read_to_string(sites.join("site.conf")).unwrap();
        assert!(site.contains("<VirtualHost *:80>") && site.contains("<VirtualHost *:443>"), "{site}");
        assert_eq!(site.matches("SSLEngine on").count(), 1, "only the HTTPS block has TLS");
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
        fs::write(www.join("beta/public/scheme.php"), "<?php echo empty($_SERVER['HTTPS']) ? 'http' : 'https';").unwrap();
        fs::write(www.join("index.php"), "<?php echo 'root index';").unwrap();

        let mut settings = base.clone();
        settings.www_dir = www.display().to_string();
        settings.apache_port = Some(8098);
        settings.php_fastcgi_port = 9198;
        settings.nginx_port = None;
        settings.mysql = None;
        settings.preferences.https = false;
        settings.preferences.project_php.clear();
        settings.preferences.shared = std::collections::BTreeMap::from([("beta".to_string(), 8195u16)]);
        // gamma's website is a subfolder; a pretend dev server is passed through 8196.
        fs::create_dir_all(www.join("gamma/site")).unwrap();
        fs::write(www.join("gamma/site/index.html"), "gamma subfolder site").unwrap();
        settings.preferences.site_root = std::collections::BTreeMap::from([("gamma".to_string(), "site".to_string())]);
        settings.preferences.share_dev =
            std::collections::BTreeMap::from([("alpha".to_string(), crate::settings::DevShare { port: 8196, target: 5899 })]);
        let dev = std::net::TcpListener::bind("127.0.0.1:5899").unwrap();
        std::thread::spawn(move || {
            for mut c in dev.incoming().flatten() {
                let mut buf = [0u8; 2048];
                let n = c.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                let host = req.lines().find(|l| l.to_lowercase().starts_with("host:")).unwrap_or("").to_string();
                let body = format!("dev server saw {host}");
                let _ = c.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes());
            }
        });
        crate::installer::refresh_configs(dir.path(), &settings).unwrap();

        let sup = Supervisor::new(specs_for(dir.path(), &settings));
        sup.start("php").unwrap();
        sup.start("apache").unwrap();
        assert!(sup.status().iter().filter(|s| s.id == "php" || s.id == "apache").all(|s| s.state == State::Running));

        // Shared on its own port: the project is the whole site, whatever address the phone uses.
        let ip = crate::share::lan_ip().unwrap_or_else(|| "127.0.0.1".into());
        let mut s = TcpStream::connect((ip.as_str(), 8195)).unwrap();
        s.write_all(format!("GET / HTTP/1.0\r\nHost: {ip}:8195\r\n\r\n").as_bytes()).unwrap();
        let mut shared = String::new();
        s.read_to_string(&mut shared).unwrap();
        println!("shared via {ip}: {}", shared.lines().last().unwrap_or(""));
        // The dev server gets the request with the Host it expects (Vite's host check).
        let mut s = TcpStream::connect((ip.as_str(), 8196)).unwrap();
        s.write_all(format!("GET / HTTP/1.0\r\nHost: {ip}:8196\r\n\r\n").as_bytes()).unwrap();
        let mut proxied = String::new();
        s.read_to_string(&mut proxied).unwrap();
        println!("dev share: {}", proxied.lines().last().unwrap_or(""));
        assert!(proxied.contains("dev server saw Host: 127.0.0.1:5899"), "{proxied}");
        assert!(shared.contains("hello from beta/public"), "{shared}");
        // Through Cloudflare's tunnel (X-Forwarded-Proto: https) PHP sees HTTPS, so Laravel
        // links its CSS and scripts with https and the browser doesn't block them.
        let scheme = |forwarded: &str| {
            let mut s = TcpStream::connect(("127.0.0.1", 8195)).unwrap();
            s.write_all(format!("GET /scheme.php HTTP/1.0\r\nHost: x.trycloudflare.com\r\n{forwarded}\r\n").as_bytes()).unwrap();
            let mut out = String::new();
            s.read_to_string(&mut out).unwrap();
            out.lines().last().unwrap_or("").to_string()
        };
        assert_eq!(scheme("X-Forwarded-Proto: https\r\n"), "https");
        assert_eq!(scheme(""), "http");
        println!("public link: PHP sees https");

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
        assert!(get("gamma.test:8098", "/").contains("gamma subfolder site"), "gamma is served from its chosen site folder");
        // localhost and unknown names keep going to the www folder.
        assert!(get("localhost:8098", "/").contains("root index"));
        assert!(get("127.0.0.1:8098", "/").contains("root index"));
        assert!(get("nothing.test:8098", "/").contains("root index"));
        sup.stop_all();
        assert!(!crate::supervisor::port_listening(8098));
    }

    /// Two projects on two PHP versions behind one Apache: the project set to another installed
    /// version gets it, by name.test and by localhost/name, and the other keeps the default.
    /// Needs a second PHP version installed in C:\NexDB.
    /// `cargo test real_php_per_project -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_php_per_project() {
        use crate::supervisor::{Supervisor, specs_for};
        use std::io::{Read, Write};
        use std::net::TcpStream;

        let base = crate::settings::load(Path::new(r"C:\NexDB")).expect("NexDB must be installed in C:/NexDB");
        let default = crate::phpver::default_version(&base).unwrap();
        let other = crate::phpver::installed(Path::new(r"C:\NexDB"), &base)
            .into_keys()
            .find(|v| *v != default)
            .expect("install a second PHP version on the Versions page");
        let dir = tempfile::tempdir().unwrap();
        let www = dir.path().join("www");
        for name in ["older", "newer"] {
            fs::create_dir_all(www.join(name)).unwrap();
            fs::write(www.join(name).join("index.php"), "<?php echo 'v=', PHP_VERSION;").unwrap();
        }
        let mut settings = base.clone();
        settings.www_dir = www.display().to_string();
        settings.apache_port = Some(8096);
        settings.php_fastcgi_port = 9196;
        settings.nginx_port = None;
        settings.mysql = None;
        settings.preferences.https = false;
        settings.preferences.project_php = [("older".to_string(), other.clone())].into_iter().collect();
        crate::installer::refresh_configs(dir.path(), &settings).unwrap();

        let specs = specs_for(dir.path(), &settings);
        let ids: Vec<String> = specs.iter().map(|s| s.id.clone()).collect();
        println!("services: {ids:?}");
        let sup = Supervisor::new(specs);
        for id in &ids {
            sup.start(id).unwrap();
        }
        let get = |host: &str, path: &str| {
            let mut s = TcpStream::connect(("127.0.0.1", 8096)).unwrap();
            s.write_all(format!("GET {path} HTTP/1.0\r\nHost: {host}\r\n\r\n").as_bytes()).unwrap();
            let mut out = String::new();
            s.read_to_string(&mut out).unwrap();
            out
        };
        let older = get("older.test:8096", "/");
        let local = get("localhost:8096", "/older/");
        let newer = get("newer.test:8096", "/");
        sup.stop_all();
        println!("older: {}\nlocal: {}\nnewer: {}", older.lines().last().unwrap(), local.lines().last().unwrap(), newer.lines().last().unwrap());
        assert!(older.ends_with(&format!("v={other}")), "{older}");
        assert!(local.ends_with(&format!("v={other}")), "{local}");
        assert!(newer.ends_with(&format!("v={default}")), "{newer}");
    }

    /// The real Apache serving a project over HTTPS with a certificate from NexDB's local CA,
    /// checked by Windows' own curl against that CA.
    /// `cargo test real_https_vhosts -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_https_vhosts() {
        use crate::supervisor::{Supervisor, specs_for};

        let base = crate::settings::load(Path::new(r"C:\NexDB")).expect("NexDB must be installed in C:/NexDB");
        let dir = tempfile::tempdir().unwrap();
        let www = dir.path().join("www");
        fs::create_dir_all(www.join("alpha")).unwrap();
        fs::write(www.join("alpha/index.php"), "<?php echo 'secure ', $_SERVER['HTTPS'] ?? 'no';").unwrap();

        let mut settings = base.clone();
        settings.www_dir = www.display().to_string();
        settings.apache_port = Some(8097);
        settings.php_fastcgi_port = 9197;
        settings.nginx_port = None;
        settings.mysql = None;
        settings.preferences.https = true;
        settings.preferences.https_port = 8447;
        crate::installer::refresh_configs(dir.path(), &settings).unwrap();

        let sup = Supervisor::new(specs_for(dir.path(), &settings));
        sup.start("php").unwrap();
        sup.start("apache").unwrap();

        let ca = crate::admin::ca_dir().join("devmanager-ca.crt");
        let out = crate::configure::run_quiet(
            Path::new(r"C:\Windows\System32\curl.exe"),
            &[
                "-sS",
                // Local certificates have no revocation server; browsers skip this check for them.
                "--ssl-no-revoke",
                "--cacert",
                &ca.display().to_string(),
                "--resolve",
                "alpha.test:8447:127.0.0.1",
                "https://alpha.test:8447/",
            ],
            std::time::Duration::from_secs(30),
        )
        .unwrap();
        sup.stop_all();
        println!("{}", out.text);
        assert!(out.success && out.text.contains("secure on"), "{}", out.text);
    }
}
