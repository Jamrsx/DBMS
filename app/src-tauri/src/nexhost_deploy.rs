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
    let (s, d) = (std::fs::canonicalize(src)?, std::fs::canonicalize(dst)?);
    if s.starts_with(&d) || d.starts_with(&s) {
        return Err(std::io::Error::other("the project and the site folder are inside each other"));
    }
    // npm run dev's marker (public/hot) never belongs on a site: it isn't copied (kept()), and a
    // copy left by an older import is removed, or pages load from a dev server visitors can't reach.
    if dst.join("public").join("hot").is_file() {
        std::fs::remove_file(dst.join("public").join("hot"))?;
        report.removed += 1;
    }
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


/// The project folder behind a web root: a Laravel site serves `myapp/public`, its project is `myapp`.
pub fn project_dir(web_root: &Path) -> PathBuf {
    let is_public = web_root.file_name().is_some_and(|n| n.eq_ignore_ascii_case("public"));
    match web_root.parent() {
        Some(parent) if is_public && (parent.join("artisan").is_file() || parent.join("composer.json").is_file() || parent.join("package.json").is_file()) => parent.to_path_buf(),
        _ => web_root.to_path_buf(),
    }
}

/// Something that stops a site from working, how to fix it by hand, and whether NexDB can.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Problem {
    pub id: &'static str,
    pub title: &'static str,
    pub why: &'static str,
    pub manual: &'static str,
}

fn uses_vite(project: &Path) -> bool {
    ["vite.config.js", "vite.config.ts", "vite.config.mjs", "vite.config.mts"].iter().any(|f| project.join(f).is_file())
}

fn app_key_empty(env: &str) -> bool {
    env.lines().any(|l| l.trim() == "APP_KEY=" || l.trim() == "APP_KEY=\"\"")
}

/// The site's problems, most blocking first. Empty: nothing found.
pub fn problems(project: &Path) -> Vec<Problem> {
    let mut out = Vec::new();
    let laravel = project.join("artisan").is_file();
    if project.join("public").join("hot").is_file() {
        out.push(Problem {
            id: "hot",
            title: "Pages load from a dev server visitors can't reach",
            why: "public/hot is left over from npm run dev, so every page asks a Vite dev server (like [::1]:5173) for its CSS and JS, and stays blank.",
            manual: "Delete public\\hot in the site's folder, then reload the page.",
        });
    }
    if project.join("composer.json").is_file() && !project.join("vendor").join("autoload.php").is_file() {
        out.push(Problem {
            id: "packages",
            title: "PHP packages aren't installed",
            why: "composer.json lists packages, but vendor/ is missing, so PHP stops with \"vendor/autoload.php not found\".",
            manual: "In the Deploy tab's terminal run: composer install",
        });
    }
    if laravel && !project.join(".env").is_file() {
        out.push(Problem {
            id: "env",
            title: "The .env file is missing",
            why: "Laravel reads its settings (app key, database) from .env; without it pages show a 500 error.",
            manual: "Copy .env.example to .env, then run: php artisan key:generate",
        });
    } else if laravel && std::fs::read_to_string(project.join(".env")).is_ok_and(|e| app_key_empty(&e)) {
        out.push(Problem {
            id: "key",
            title: "The app key is empty",
            why: "APP_KEY in .env is blank, so Laravel can't encrypt sessions and shows \"No application encryption key has been specified\".",
            manual: "Run: php artisan key:generate",
        });
    }
    let built = project.join("public").join("build").join("manifest.json").is_file() || project.join("public").join("build").join(".vite").join("manifest.json").is_file();
    if uses_vite(project) && !built && !project.join("public").join("hot").is_file() {
        out.push(Problem {
            id: "build",
            title: "The site was never built",
            why: "This project uses Vite, but public/build is missing, so Laravel stops with \"Vite manifest not found\".",
            manual: "In the Deploy tab press Run build, or run: npm install, then npm run build",
        });
    }
    out
}

/// Fixes a problem's files; returns the commands still to run (from `commands`) for the rest.
pub fn fix(project: &Path, id: &str) -> Result<Vec<&'static str>, String> {
    match id {
        "hot" => {
            std::fs::remove_file(project.join("public").join("hot")).map_err(|e| format!("Couldn't delete public\\hot: {e}"))?;
            Ok(vec![])
        }
        "env" => {
            let example = project.join(".env.example");
            if !example.is_file() {
                return Err("There's no .env.example to start from. Make a .env in the Files tab instead.".into());
            }
            if !project.join(".env").exists() {
                std::fs::copy(&example, project.join(".env")).map_err(|e| format!("Couldn't make .env: {e}"))?;
            }
            Ok(vec!["php artisan key:generate --force"])
        }
        "key" => Ok(vec!["php artisan key:generate --force"]),
        "packages" => commands("install", project, !project.join("node_modules").is_dir()),
        "build" => commands("build", project, !project.join("node_modules").is_dir()),
        _ => Err(format!("Unknown problem {id}.")),
    }
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
        Err(format!("{command} stopped with an error (code {}). The Output box below shows why.", status.code().unwrap_or(-1)))
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

    /// public/hot means "npm run dev is running": copied to a site, every page loads from a dev
    /// server visitors can't reach (a black page). A pull never brings it and removes it.
    #[test]
    fn the_dev_server_marker_never_reaches_the_site() {
        let d = tempfile::tempdir().unwrap();
        let (www, site) = (d.path().join("www"), d.path().join("site"));
        write(&www.join("public/hot"), "http://[::1]:5173");
        write(&www.join("public/index.php"), "<?php");
        write(&site.join("public/hot"), "http://[::1]:5173");
        mirror(&www, &site).unwrap();
        assert!(!site.join("public/hot").exists());
        assert!(site.join("public/index.php").is_file());
    }

    #[test]
    fn finds_what_stops_a_site_and_fixes_it() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("app");
        write(&p.join("artisan"), "");
        write(&p.join("composer.json"), "{}");
        write(&p.join("vite.config.ts"), "");
        write(&p.join(".env.example"), "APP_KEY=\nDB_DATABASE=laravel\n");
        write(&p.join("public/index.php"), "<?php");
        write(&p.join("public/hot"), "http://[::1]:5173");
        assert_eq!(project_dir(&p.join("public")), p, "a Laravel web root's project is its parent");
        assert_eq!(project_dir(&p), p);

        let ids = |p: &Path| problems(p).iter().map(|x| x.id).collect::<Vec<_>>();
        assert_eq!(ids(&p), ["hot", "packages", "env"], "build waits while hot is there");

        assert!(fix(&p, "hot").unwrap().is_empty());
        assert!(!p.join("public/hot").exists());
        assert_eq!(fix(&p, "env").unwrap(), ["php artisan key:generate --force"]);
        assert!(p.join(".env").is_file(), ".env made from .env.example");
        assert_eq!(ids(&p), ["packages", "key", "build"]);

        write(&p.join("vendor/autoload.php"), "");
        write(&p.join(".env"), "APP_KEY=base64:abc\n");
        write(&p.join("public/build/manifest.json"), "{}");
        assert!(problems(&p).is_empty(), "a working site has no problems");
        assert!(fix(&p, "rm -rf").is_err());
    }

    #[test]
    fn never_pulls_into_itself() {
        let d = tempfile::tempdir().unwrap();
        let src = d.path().join("www");
        std::fs::create_dir_all(src.join("inner")).unwrap();
        assert!(mirror(&src, &src.join("inner")).is_err(), "target inside the source");
        assert!(mirror(&src.join("inner"), &src).is_err(), "source inside the target");
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
