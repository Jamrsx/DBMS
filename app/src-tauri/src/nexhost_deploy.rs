//! NexHost Deploy: pull a site's updates from the www project it was imported from (only what
//! changed), then install packages, build and clear caches in the site, like a hosting panel.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::settings::Settings;

/// What a pull did.
#[derive(Debug, Default, PartialEq, Eq, serde::Serialize)]
pub struct PullReport {
    pub copied: u32,
    pub removed: u32,
    /// composer.lock or package-lock.json changed, so packages need installing again.
    pub composer_changed: bool,
    pub npm_changed: bool,
}

/// The site keeps these; a pull never copies over or deletes them. `rel` uses `/`.
pub fn kept(rel: &str) -> bool {
    let lower = rel.to_ascii_lowercase();
    let first = lower.split('/').next().unwrap_or("");
    lower == ".env"
        || ["storage", "vendor", "bootstrap/cache"].iter().any(|d| lower == *d || lower.starts_with(&format!("{d}/")))
        || first == "storage"
        || lower == "public/build"
        || lower.starts_with("public/build/")
        || lower == "public/hot"
        || lower.split('/').any(|part| part == "node_modules" || part == ".git")
}

/// Makes `dst` match `src`: new and changed files (by size and time) are copied, files gone from
/// `src` are removed. Kept paths are left alone on both sides; links and junctions are skipped.
pub fn mirror(src: &Path, dst: &Path) -> std::io::Result<PullReport> {
    let mut report = PullReport::default();
    std::fs::create_dir_all(dst)?;
    copy_changed(src, dst, "", &mut report)?;
    remove_extra(src, dst, "", &mut report)?;
    Ok(report)
}

fn rel_join(rel: &str, name: &str) -> String {
    if rel.is_empty() { name.to_string() } else { format!("{rel}/{name}") }
}

fn is_link(p: &Path) -> bool {
    std::fs::symlink_metadata(p).is_ok_and(|m| m.file_type().is_symlink())
}

fn copy_changed(src: &Path, dst: &Path, rel: &str, report: &mut PullReport) -> std::io::Result<()> {
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let r = rel_join(rel, &name);
        let from = entry.path();
        if kept(&r) || is_link(&from) {
            continue;
        }
        let to = dst.join(&name);
        if from.is_dir() {
            if to.is_file() {
                std::fs::remove_file(&to)?;
            }
            std::fs::create_dir_all(&to)?;
            copy_changed(&from, &to, &r, report)?;
            continue;
        }
        let a = entry.metadata()?;
        let same = std::fs::metadata(&to).is_ok_and(|b| b.is_file() && b.len() == a.len() && b.modified().ok() == a.modified().ok());
        if same {
            continue;
        }
        if to.is_dir() {
            std::fs::remove_dir_all(&to)?;
        }
        std::fs::copy(&from, &to)?;
        // Same time as the original, so the next pull sees it as unchanged.
        if let Ok(t) = a.modified() {
            let _ = std::fs::File::options().write(true).open(&to).and_then(|f| f.set_modified(t));
        }
        report.copied += 1;
        match r.as_str() {
            "composer.lock" | "composer.json" => report.composer_changed = true,
            "package-lock.json" | "package.json" => report.npm_changed = true,
            _ => {}
        }
    }
    Ok(())
}

fn remove_extra(src: &Path, dst: &Path, rel: &str, report: &mut PullReport) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dst)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let r = rel_join(rel, &name);
        let here = entry.path();
        if kept(&r) || is_link(&here) {
            continue;
        }
        let there = src.join(&name);
        let gone = !there.exists() || is_link(&there) || (here.is_dir() != there.is_dir());
        if here.is_dir() {
            // Walk in even when the folder is gone from www: a kept path inside it (public/build)
            // must stay. The folder goes only once nothing is left in it.
            remove_extra(&there, &here, &r, report)?;
            if gone && std::fs::read_dir(&here)?.next().is_none() {
                std::fs::remove_dir(&here)?;
            }
        } else if gone {
            std::fs::remove_file(&here)?;
            report.removed += 1;
        }
    }
    Ok(())
}


/// One deploy action and the commands it runs, in order, in the site's project folder.
pub fn commands(step: &str, folder: &Path, first_npm: bool) -> Result<Vec<&'static str>, String> {
    let laravel = folder.join("artisan").is_file();
    let composer = folder.join("composer.json").is_file();
    let npm = folder.join("package.json").is_file();
    let lock = folder.join("package-lock.json").is_file();
    let mut out = Vec::new();
    match step {
        "install" => {
            if composer {
                out.push("composer install --no-interaction --prefer-dist");
            }
            if npm {
                out.push(if lock { "npm ci" } else { "npm install" });
            }
        }
        "npm-install" if npm => out.push(if lock { "npm ci" } else { "npm install" }),
        "build" if npm => {
            if first_npm {
                out.push(if lock { "npm ci" } else { "npm install" });
            }
            out.push("npm run build");
        }
        "clear" if laravel => out.push("php artisan optimize:clear"),
        "migrate" if laravel => out.push("php artisan migrate --force"),
        "npm-install" | "build" => return Err("This project has no package.json, so there is nothing to build.".into()),
        "clear" | "migrate" => return Err("This isn't a Laravel project (no artisan file).".into()),
        _ => return Err(format!("Unknown step {step}.")),
    }
    if out.is_empty() {
        return Err("This project has no composer.json or package.json, so there is nothing to install.".into());
    }
    Ok(out)
}

/// Runs one command in `dir` with NexDB's PHP, Composer and Node first on PATH. Every output
/// line goes to `line`. The command comes from `commands`, never from the user.
pub fn run(root: &Path, settings: &Settings, dir: &Path, command: &str, line: &dyn Fn(&str)) -> Result<(), String> {
    let existing = std::env::var("PATH").unwrap_or_default();
    let dirs: Vec<PathBuf> = crate::terminal::tool_dirs(root, settings);
    let mut cmd = Command::new("cmd");
    cmd.arg("/C").arg(command).current_dir(dir).env("PATH", crate::terminal::path_with(&dirs, &existing));
    cmd.env("COMPOSER_NO_INTERACTION", "1").env("NO_COLOR", "1").env("npm_config_color", "false");
    cmd.env("npm_config_fund", "false").env("npm_config_update_notifier", "false").env("npm_config_audit", "false");
    let php_dir = root.join("etc").join("php");
    if php_dir.join("php.ini").is_file() {
        cmd.env("PHPRC", &php_dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Couldn't run {command}: {e}"))?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let mut readers = Vec::new();
    if let Some(out) = child.stdout.take() {
        let tx = tx.clone();
        readers.push(std::thread::spawn(move || {
            for l in BufReader::new(out).split(b'\n').map_while(Result::ok) {
                let _ = tx.send(String::from_utf8_lossy(&l).trim_end().to_string());
            }
        }));
    }
    if let Some(err) = child.stderr.take() {
        let tx = tx.clone();
        readers.push(std::thread::spawn(move || {
            for l in BufReader::new(err).split(b'\n').map_while(Result::ok) {
                let _ = tx.send(String::from_utf8_lossy(&l).trim_end().to_string());
            }
        }));
    }
    drop(tx);
    for l in rx {
        if !l.trim().is_empty() {
            line(&l);
        }
    }
    for r in readers {
        let _ = r.join();
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("{command} stopped with an error (code {}). The output above says why.", status.code().unwrap_or(-1)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(p: &Path, text: &str) {
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    #[test]
    fn keeps_the_sites_own_files() {
        for k in [".env", "storage", "storage/logs/laravel.log", "vendor/autoload.php", "public/build/manifest.json", "node_modules/x", "a/node_modules/y", ".git/HEAD", "bootstrap/cache/config.php", "public/hot"] {
            assert!(kept(k), "{k} is the site's own");
        }
        for k in [".env.example", "app/Models/User.php", "public/index.php", "resources/js/app.tsx", "composer.lock", "storageroom.php"] {
            assert!(!kept(k), "{k} comes from www");
        }
    }

    #[test]
    fn pulls_only_what_changed_and_removes_what_is_gone() {
        let d = tempfile::tempdir().unwrap();
        let (www, site) = (d.path().join("www"), d.path().join("site"));
        write(&www.join("app/A.php"), "a");
        write(&www.join("app/B.php"), "b");
        write(&www.join("routes/web.php"), "r");
        write(&www.join(".env"), "DB_DATABASE=www_db");
        write(&www.join("node_modules/x/i.js"), "x");
        let first = mirror(&www, &site).unwrap();
        assert_eq!(first.copied, 3);
        assert!(!site.join(".env").exists() && !site.join("node_modules").exists());

        // The site has its own .env, uploads and build; nothing changed in www.
        write(&site.join(".env"), "DB_DATABASE=nh_site");
        write(&site.join("storage/app/photo.jpg"), "p");
        write(&site.join("public/build/app.js"), "built");
        assert_eq!(mirror(&www, &site).unwrap(), PullReport::default(), "nothing changed, nothing copied");

        // Edit one file, add one, delete one (and a whole folder).
        std::thread::sleep(std::time::Duration::from_millis(20));
        write(&www.join("app/A.php"), "a2");
        write(&www.join("app/C.php"), "c");
        std::fs::remove_file(www.join("app/B.php")).unwrap();
        std::fs::remove_dir_all(www.join("routes")).unwrap();
        write(&www.join("composer.lock"), "{}");
        let r = mirror(&www, &site).unwrap();
        assert_eq!((r.copied, r.removed), (3, 2), "{r:?}");
        assert!(r.composer_changed && !r.npm_changed);
        assert_eq!(std::fs::read_to_string(site.join("app/A.php")).unwrap(), "a2");
        assert!(!site.join("app/B.php").exists() && !site.join("routes").exists());
        assert_eq!(std::fs::read_to_string(site.join(".env")).unwrap(), "DB_DATABASE=nh_site", ".env kept");
        assert!(site.join("storage/app/photo.jpg").is_file() && site.join("public/build/app.js").is_file());
    }

    #[test]
    fn deploy_steps_fit_the_project() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path();
        assert!(commands("build", p, false).is_err(), "nothing to build without package.json");
        assert!(commands("clear", p, false).is_err(), "not Laravel");
        write(&p.join("artisan"), "");
        write(&p.join("composer.json"), "{}");
        write(&p.join("package.json"), "{}");
        assert_eq!(commands("build", p, true).unwrap(), ["npm install", "npm run build"]);
        write(&p.join("package-lock.json"), "{}");
        assert_eq!(commands("build", p, false).unwrap(), ["npm run build"]);
        assert_eq!(commands("install", p, false).unwrap(), ["composer install --no-interaction --prefer-dist", "npm ci"]);
        assert_eq!(commands("clear", p, false).unwrap(), ["php artisan optimize:clear"]);
        assert_eq!(commands("migrate", p, false).unwrap(), ["php artisan migrate --force"]);
        assert!(commands("rm -rf", p, false).is_err());
    }
}
