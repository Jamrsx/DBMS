//! NexHost: small test sites hosted from this PC (4-year plan). Each site is a folder in
//! `<root>\nexhost\<site>`, served by the web server on its own port on 127.0.0.1 only, and put
//! online through the user's own Cloudflare or ngrok account (see `fixedlink`).

use std::collections::BTreeMap;
use std::ops::RangeInclusive;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Local ports NexHost sites use, one each. Never opened in the firewall.
pub const PORTS: RangeInclusive<u16> = 8201..=8219;

/// What NexDB remembers about a site (settings `preferences.nexhost`).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct NexSite {
    pub port: u16,
    /// The folder the site serves, relative to the site folder; None: detected.
    #[serde(default)]
    pub web_root: Option<String>,
    /// Online through the user's tunnel.
    #[serde(default)]
    pub live: bool,
    /// The public address it uses when live (`shop.myshop.com`).
    #[serde(default)]
    pub address: Option<String>,
    /// Visitors type this first, when set.
    #[serde(default)]
    pub password: Option<String>,
    /// Its database, once made.
    #[serde(default)]
    pub db: Option<String>,
}

/// A site as the NexHost page shows it.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Site {
    pub name: String,
    pub path: String,
    pub web_root: String,
    pub port: u16,
    /// "laravel", "php" or "static".
    pub kind: String,
    pub live: bool,
    pub address: Option<String>,
    pub db: Option<String>,
}

/// Where the sites live.
pub fn dir(root: &Path) -> PathBuf {
    root.join("nexhost")
}

/// Site names: lowercase letters, digits and dashes, 1-40 long, not starting with a dash.
pub fn valid_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= 40
        && !name.starts_with('-')
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if ok {
        Ok(())
    } else {
        Err("Use up to 40 small letters, numbers and dashes for the site name, like my-shop.".into())
    }
}

/// `public/` for Laravel (it has `artisan`), else the site folder itself.
pub fn detect_web_root(site_dir: &Path) -> PathBuf {
    let public = site_dir.join("public");
    if site_dir.join("artisan").is_file() && public.is_dir() {
        public
    } else {
        site_dir.to_path_buf()
    }
}

/// The first NexHost port no site uses and nothing else listens on.
pub fn free_port(used: &BTreeMap<String, NexSite>) -> Option<u16> {
    PORTS.into_iter().find(|p| !used.values().any(|s| s.port == *p) && !crate::supervisor::port_listening(*p))
}

/// Apache: a listener on 127.0.0.1:`port` serving only `web_root`, dotfiles refused.
pub fn apache_listener(name: &str, web_root: &Path, port: u16, fcgi_port: u16) -> String {
    let root = crate::configure::conf_path(web_root);
    format!(
        r#"
# NexHost site {name}: this PC only; the tunnel brings visitors in.
Listen 127.0.0.1:{port}
<VirtualHost 127.0.0.1:{port}>
    ServerName {name}.nexhost
    DocumentRoot "{root}"
    # Visitors come through the tunnel over https; tell PHP, so the page's links use it too.
    SetEnvIf X-Forwarded-Proto "^https$" HTTPS=on
    <Directory "{root}">
        Options FollowSymLinks
        AllowOverride All
        Require all granted
        <FilesMatch "\.php$">
            SetHandler "proxy:fcgi://127.0.0.1:{fcgi_port}/"
        </FilesMatch>
        # .env, .git and other hidden files are never served.
        <FilesMatch "^\.">
            Require all denied
        </FilesMatch>
    </Directory>
    <DirectoryMatch "/\.">
        Require all denied
    </DirectoryMatch>
</VirtualHost>
"#
    )
}

/// nginx: the same as `apache_listener`.
pub fn nginx_listener(name: &str, web_root: &Path, port: u16, fcgi_port: u16, fastcgi_params: &Path) -> String {
    let root = crate::configure::conf_path(web_root);
    let params = crate::configure::conf_path(fastcgi_params);
    format!(
        r#"
# NexHost site {name}: this PC only; the tunnel brings visitors in.
server {{
    listen 127.0.0.1:{port};
    server_name {name}.nexhost;
    root "{root}";
    index index.php index.html index.htm;

    # .env, .git and other hidden files are never served.
    location ~ /\. {{
        deny all;
    }}
    location / {{
        try_files $uri $uri/ /index.php?$query_string;
    }}
    location ~ \.php$ {{
        try_files $uri =404;
        fastcgi_pass 127.0.0.1:{fcgi_port};
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param HTTPS $http_x_forwarded_proto;
        include "{params}";
    }}
}}
"#
    )
}

/// Makes a new site folder with a starter page that says the site works.
pub fn create(root: &Path, name: &str) -> Result<(), String> {
    valid_name(name)?;
    let site = dir(root).join(name);
    if site.exists() {
        return Err(format!("There is already a site named {name}."));
    }
    std::fs::create_dir_all(&site).map_err(|e| format!("Couldn't make the site folder: {e}"))?;
    let page = format!(
        "<?php // NexHost starter page. Replace it with your own files.
?><!doctype html>
<meta charset=\"utf-8\">
<title>{name}</title>
<h1>{name} works</h1>
<p>Put your website's files in this site's folder to replace this page.</p>
<p>PHP <?= PHP_VERSION ?></p>
"
    );
    std::fs::write(site.join("index.php"), page).map_err(|e| format!("Couldn't write the starter page: {e}"))
}

/// "laravel", "php" or "static", from what is in the folder.
fn kind_of(site_dir: &Path) -> &'static str {
    if site_dir.join("artisan").is_file() {
        return "laravel";
    }
    let has_php = std::fs::read_dir(site_dir)
        .map(|it| it.flatten().any(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("php"))))
        .unwrap_or(false);
    if has_php { "php" } else { "static" }
}

/// The sites NexDB knows about whose folder still exists, by name.
pub fn list(root: &Path, prefs: &BTreeMap<String, NexSite>) -> Vec<Site> {
    prefs
        .iter()
        .filter_map(|(name, s)| {
            let path = dir(root).join(name);
            path.is_dir().then(|| Site {
                name: name.clone(),
                path: path.display().to_string(),
                web_root: web_root_of(root, name, s).display().to_string(),
                port: s.port,
                kind: kind_of(&path).into(),
                live: s.live,
                address: s.address.clone(),
                db: s.db.clone(),
            })
        })
        .collect()
}

/// The folder a site serves: its chosen web root, else the detected one.
pub fn web_root_of(root: &Path, name: &str, site: &NexSite) -> PathBuf {
    let site_dir = dir(root).join(name);
    match &site.web_root {
        Some(rel) if !rel.is_empty() => site_dir.join(rel),
        _ => detect_web_root(&site_dir),
    }
}

/// The web server's NexHost config: one listener per site whose folder exists.
pub fn conf(root: &Path, web: &str, sites: &BTreeMap<String, NexSite>, fcgi_port: u16, fastcgi_params: &Path) -> String {
    let mut out = String::from("# Generated by NexDB: NexHost sites (this PC only).
");
    for (name, site) in sites {
        if valid_name(name).is_err() || !dir(root).join(name).is_dir() {
            continue;
        }
        let web_root = web_root_of(root, name, site);
        out.push_str(&if web == "apache" {
            apache_listener(name, &web_root, site.port, fcgi_port)
        } else {
            nginx_listener(name, &web_root, site.port, fcgi_port, fastcgi_params)
        });
    }
    out
}

// ---------- File manager ----------

/// A file or folder in a site, for the file manager.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Entry {
    pub name: String,
    pub dir: bool,
    pub size: u64,
    /// Seconds since 1970.
    pub modified: i64,
}

/// `rel` inside the site folder; refuses anything that would leave it.
pub fn safe_join(site_dir: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.replace('\\', "/");
    let outside = || Err("That place is outside this site's folder.".to_string());
    if rel.starts_with('/') || rel.contains(':') {
        return outside();
    }
    let mut out = site_dir.to_path_buf();
    for part in rel.split('/') {
        match part {
            "" | "." => {}
            ".." => return outside(),
            p => out.push(p),
        }
    }
    Ok(out)
}

/// A single file or folder name: no slashes or characters Windows refuses.
fn check_name(name: &str) -> Result<(), String> {
    let bad = name.trim().is_empty()
        || name == "."
        || name == ".."
        || name.chars().any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control());
    if bad {
        Err("Use a name without / \\ : * ? \" < > |.".into())
    } else {
        Ok(())
    }
}

/// `name` in `dir`, or "name (2).ext", "name (3).ext"... when it is taken.
fn unique(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (2..).map(|n| dir.join(format!("{stem} ({n}){ext}"))).find(|p| !p.exists()).unwrap()
}

fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)? {
            let entry = entry?;
            copy_tree(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        std::fs::copy(from, to).map(|_| ())
    }
}

/// What is in a folder of the site: folders first, then files, by name.
pub fn files(site_dir: &Path, rel: &str) -> Result<Vec<Entry>, String> {
    let folder = safe_join(site_dir, rel)?;
    let mut out: Vec<Entry> = std::fs::read_dir(&folder)
        .map_err(|e| format!("Couldn't open that folder: {e}"))?
        .flatten()
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_secs() as i64);
            Some(Entry { name: e.file_name().to_string_lossy().into_owned(), dir: meta.is_dir(), size: meta.len(), modified })
        })
        .collect();
    out.sort_by(|a, b| b.dir.cmp(&a.dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

/// Copies files and folders (from Explorer) into a folder of the site. A name already there
/// gets " (2)", " (3)"... Returns how many top-level items were added.
pub fn add(site_dir: &Path, rel: &str, sources: &[PathBuf]) -> Result<u32, String> {
    let folder = safe_join(site_dir, rel)?;
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let mut count = 0;
    for src in sources {
        let Some(name) = src.file_name() else { continue };
        let target = unique(&folder, &name.to_string_lossy());
        copy_tree(src, &target).map_err(|e| format!("Couldn't copy {}: {e}", name.to_string_lossy()))?;
        count += 1;
    }
    Ok(count)
}

/// Unpacks a zip into a folder of the site. A zip holding one top folder (a GitHub download)
/// is unwrapped. A zip with any path leaving the folder is refused before anything is written.
/// Returns how many files were written.
pub fn unzip(site_dir: &Path, rel: &str, zip: &Path, progress: impl Fn(u32, u32)) -> Result<u32, String> {
    let folder = safe_join(site_dir, rel)?;
    let file = std::fs::File::open(zip).map_err(|e| format!("Couldn't open the zip: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| "That file isn't a zip NexDB can open.".to_string())?;
    let mut total = 0u32;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.enclosed_name().is_none() {
            return Err("This zip has files that would land outside the site, so NexDB didn't unpack it.".into());
        }
        if !entry.is_dir() {
            total += 1;
        }
    }
    let strip = crate::installer::single_top_folder(&mut archive);
    let mut done = 0u32;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(name) = entry.enclosed_name() else { continue };
        let relative = match &strip {
            Some(prefix) => match name.strip_prefix(prefix) {
                Ok(rest) if rest.as_os_str().is_empty() => continue,
                Ok(rest) => rest.to_path_buf(),
                Err(_) => name,
            },
            None => name,
        };
        let out = folder.join(&relative);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut target = std::fs::File::create(&out).map_err(|e| format!("Couldn't write {}: {e}", relative.display()))?;
        std::io::copy(&mut entry, &mut target).map_err(|e| e.to_string())?;
        done += 1;
        progress(done, total);
    }
    Ok(done)
}

pub fn new_folder(site_dir: &Path, rel: &str, name: &str) -> Result<(), String> {
    check_name(name)?;
    let target = safe_join(site_dir, rel)?.join(name);
    if target.exists() {
        return Err(format!("{name} is already there."));
    }
    std::fs::create_dir_all(target).map_err(|e| format!("Couldn't make the folder: {e}"))
}

/// Renames the file or folder at `rel` (same folder, new name).
pub fn rename(site_dir: &Path, rel: &str, new_name: &str) -> Result<(), String> {
    check_name(new_name)?;
    let from = safe_join(site_dir, rel)?;
    if from == site_dir {
        return Err("Pick a file or folder to rename.".into());
    }
    let to = from.with_file_name(new_name);
    if to.exists() {
        return Err(format!("{new_name} is already there."));
    }
    std::fs::rename(&from, &to).map_err(|e| format!("Couldn't rename it: {e}"))
}

/// Moves `rel` of a site to `<root>/nexhost/.deleted/<time>-<site>-<name>` (restorable by hand).
pub fn remove(root: &Path, site: &str, rel: &str) -> Result<(), String> {
    let site_dir = dir(root).join(site);
    let from = safe_join(&site_dir, rel)?;
    if from == site_dir {
        return Err("Pick a file or folder to delete.".into());
    }
    let name = from.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let bin = dir(root).join(".deleted");
    std::fs::create_dir_all(&bin).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    std::fs::rename(&from, unique(&bin, &format!("{stamp}-{site}-{name}"))).map_err(|e| format!("Couldn't delete it: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_checked() {
        assert!(valid_name("my-shop").is_ok());
        assert!(valid_name("shop2").is_ok());
        let long = "a".repeat(41);
        for bad in ["", "My Shop", "-x", "a/b", "..", "shop_1", long.as_str()] {
            assert!(valid_name(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn laravel_serves_public_only() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(detect_web_root(d.path()), d.path());
        std::fs::write(d.path().join("artisan"), "").unwrap();
        std::fs::create_dir(d.path().join("public")).unwrap();
        assert_eq!(detect_web_root(d.path()), d.path().join("public"));
    }

    #[test]
    fn listeners_are_local_only_and_hide_dotfiles() {
        let a = apache_listener("shop", Path::new("C:/NexDB/nexhost/shop/public"), 8201, 9000);
        assert!(a.contains("Listen 127.0.0.1:8201"));
        assert!(!a.contains("0.0.0.0") && !a.contains("*:8201"));
        assert!(a.contains("<FilesMatch \"^\\.\">"));
        assert!(a.contains("proxy:fcgi://127.0.0.1:9000/"));
        let n = nginx_listener("shop", Path::new("C:/NexDB/nexhost/shop/public"), 8201, 9000, Path::new("C:/nginx/conf/fastcgi_params"));
        assert!(n.contains("listen 127.0.0.1:8201;"));
        assert!(n.contains("location ~ /\\."));
        assert!(n.contains("fastcgi_pass 127.0.0.1:9000;"));
    }

    #[test]
    fn create_makes_a_working_site_and_list_finds_it() {
        let root = tempfile::tempdir().unwrap();
        create(root.path(), "shop").unwrap();
        assert!(dir(root.path()).join("shop").join("index.php").is_file());
        assert!(create(root.path(), "shop").is_err(), "a second site with the same name");
        assert!(create(root.path(), "Bad Name").is_err());

        let prefs = BTreeMap::from([
            ("shop".to_string(), NexSite { port: 8201, ..Default::default() }),
            ("gone".to_string(), NexSite { port: 8202, ..Default::default() }),
        ]);
        let sites = list(root.path(), &prefs);
        assert_eq!(sites.len(), 1);
        assert_eq!((sites[0].name.as_str(), sites[0].kind.as_str(), sites[0].port), ("shop", "php", 8201));
    }

    #[test]
    fn conf_has_every_existing_site_for_the_web_server() {
        let root = tempfile::tempdir().unwrap();
        create(root.path(), "shop").unwrap();
        let prefs = BTreeMap::from([
            ("shop".to_string(), NexSite { port: 8201, ..Default::default() }),
            ("gone".to_string(), NexSite { port: 8202, ..Default::default() }),
        ]);
        let apache = conf(root.path(), "apache", &prefs, 9000, Path::new("x"));
        assert!(apache.contains("Listen 127.0.0.1:8201") && !apache.contains("8202"));
        let nginx = conf(root.path(), "nginx", &prefs, 9000, Path::new("x"));
        assert!(nginx.contains("listen 127.0.0.1:8201;"));
    }

    #[test]
    fn paths_cannot_leave_the_site() {
        let d = Path::new("C:/NexDB/nexhost/shop");
        for bad in ["../x", "a/../../x", "C:/Windows", "/etc", r"\\server\x", r"a\..\..\x"] {
            assert!(safe_join(d, bad).is_err(), "{bad}");
        }
        assert!(safe_join(d, "public/css").unwrap().ends_with("public/css"));
        assert_eq!(safe_join(d, "").unwrap(), d);
    }

    fn make_zip(path: &Path, entries: &[(&str, &str)]) {
        let mut z = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
        let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, body) in entries {
            z.start_file(*name, opts).unwrap();
            std::io::Write::write_all(&mut z, body.as_bytes()).unwrap();
        }
        z.finish().unwrap();
    }

    #[test]
    fn zip_slip_is_refused() {
        let t = tempfile::tempdir().unwrap();
        let site = t.path().join("site");
        std::fs::create_dir(&site).unwrap();
        let z = t.path().join("bad.zip");
        make_zip(&z, &[("ok.txt", "a"), ("../../evil.php", "x")]);
        assert!(unzip(&site, "", &z, |_, _| {}).is_err());
        assert!(!site.join("ok.txt").exists(), "nothing written");
        assert!(!t.path().join("evil.php").exists());
    }

    #[test]
    fn zip_with_one_top_folder_is_unwrapped() {
        let t = tempfile::tempdir().unwrap();
        let site = t.path().join("site");
        std::fs::create_dir(&site).unwrap();
        let z = t.path().join("shop.zip");
        make_zip(&z, &[("shop-main/index.php", "<?php"), ("shop-main/css/a.css", "b")]);
        assert_eq!(unzip(&site, "", &z, |_, _| {}).unwrap(), 2);
        assert!(site.join("index.php").is_file() && site.join("css/a.css").is_file());
    }

    #[test]
    fn add_keeps_both_on_name_clash_and_files_lists_folders_first() {
        let t = tempfile::tempdir().unwrap();
        let site = t.path().join("site");
        std::fs::create_dir(&site).unwrap();
        let a = t.path().join("a.txt");
        std::fs::write(&a, "1").unwrap();
        assert_eq!(add(&site, "", &[a.clone()]).unwrap(), 1);
        assert_eq!(add(&site, "", &[a]).unwrap(), 1);
        assert!(site.join("a (2).txt").is_file());
        new_folder(&site, "", "css").unwrap();
        let names: Vec<String> = files(&site, "").unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["css", "a (2).txt", "a.txt"]);
        rename(&site, "css", "styles").unwrap();
        assert!(site.join("styles").is_dir());
        assert!(rename(&site, "styles", "../x").is_err());
    }

    #[test]
    fn remove_moves_to_deleted() {
        let root = tempfile::tempdir().unwrap();
        create(root.path(), "shop").unwrap();
        remove(root.path(), "shop", "index.php").unwrap();
        assert!(!dir(root.path()).join("shop/index.php").exists());
        let kept = std::fs::read_dir(dir(root.path()).join(".deleted")).unwrap().count();
        assert_eq!(kept, 1);
        assert!(remove(root.path(), "shop", "").is_err(), "not the whole site from here");
    }

    #[test]
    fn ports_run_out_cleanly() {
        let used: BTreeMap<String, NexSite> =
            PORTS.map(|p| (format!("s{p}"), NexSite { port: p, ..Default::default() })).collect();
        assert_eq!(free_port(&used), None);
        let one = BTreeMap::from([("a".to_string(), NexSite { port: *PORTS.start(), ..Default::default() })]);
        assert_ne!(free_port(&one), Some(*PORTS.start()));
    }
}
