//! One project's details (database, Git, PHP) and the changes the details page makes:
//! rename, and delete to the Recycle Bin.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::settings::Settings;

#[derive(Serialize)]
pub struct Git {
    pub branch: String,
    /// Files changed or added but not committed.
    pub changes: usize,
}

#[derive(Serialize)]
pub struct Php {
    /// The version this project runs on.
    pub current: Option<String>,
    pub default: Option<String>,
    /// Set when the project picked a version other than the default.
    pub chosen: Option<String>,
    pub installed: Vec<String>,
}

#[derive(Serialize)]
pub struct Details {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub url: String,
    pub local_url: String,
    /// The database the project's own config points at, when it says.
    pub database: Option<String>,
    pub git: Option<Git>,
    pub php: Php,
}

/// The database name in a Laravel `.env` (MySQL/MariaDB only) or WordPress `wp-config.php`.
pub fn database_of(dir: &Path) -> Option<String> {
    if let Ok(env) = fs::read_to_string(dir.join(".env")) {
        let value = |key: &str| {
            env.lines()
                .filter(|l| !l.trim_start().starts_with('#'))
                .find_map(|l| l.split_once('=').filter(|(k, _)| k.trim() == key).map(|(_, v)| v.trim().trim_matches(['"', '\'']).to_string()))
        };
        if matches!(value("DB_CONNECTION").as_deref(), Some("mysql" | "mariadb")) {
            return value("DB_DATABASE").filter(|d| !d.is_empty());
        }
        return None;
    }
    let wp = fs::read_to_string(dir.join("wp-config.php")).ok()?;
    let line = wp.lines().find(|l| l.contains("'DB_NAME'"))?;
    let parts: Vec<&str> = line.split('\'').collect();
    parts.get(3).map(|s| s.to_string()).filter(|s| !s.is_empty())
}

/// `## main...origin/main` then one line per changed file.
pub fn parse_git_status(text: &str) -> Option<Git> {
    let mut lines = text.lines();
    let head = lines.next()?.strip_prefix("## ")?;
    let branch = head.split("...").next().unwrap_or(head);
    let branch = branch.strip_prefix("No commits yet on ").unwrap_or(branch).trim().to_string();
    Some(Git { branch, changes: lines.filter(|l| !l.trim().is_empty()).count() })
}

fn git_exe(root: &Path, settings: &Settings) -> PathBuf {
    crate::terminal::tool_dirs(root, settings)
        .into_iter()
        .map(|d| d.join("git.exe"))
        .find(|p| p.is_file())
        .unwrap_or_else(|| PathBuf::from("git"))
}

fn git_status(root: &Path, settings: &Settings, dir: &Path) -> Option<Git> {
    if !dir.join(".git").exists() {
        return None;
    }
    let mut cmd = Command::new(git_exe(root, settings));
    cmd.arg("-C").arg(dir).args(["status", "--porcelain=v1", "-b"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().ok().filter(|o| o.status.success())?;
    parse_git_status(&String::from_utf8_lossy(&out.stdout))
}

pub fn details(root: &Path, settings: &Settings, name: &str) -> Result<Details, String> {
    let www = PathBuf::from(&settings.www_dir);
    let port = settings.apache_port.unwrap_or(80);
    let mut project = crate::projects::list(&www, port)
        .into_iter()
        .find(|p| p.name == name)
        .ok_or("That project doesn't exist any more.")?;
    if settings.preferences.https {
        crate::projects::use_https(std::slice::from_mut(&mut project), settings.preferences.https_port);
    }
    let dir = PathBuf::from(&project.path);
    let default = crate::phpver::default_version(settings);
    let installed: Vec<String> = crate::phpver::installed(root, settings).into_keys().collect();
    let chosen = settings.preferences.project_php.get(name).cloned().filter(|v| installed.contains(v));
    Ok(Details {
        database: database_of(&dir),
        git: git_status(root, settings, &dir),
        php: Php { current: chosen.clone().or(default.clone()), default, chosen, installed },
        name: project.name,
        path: project.path,
        kind: project.kind,
        url: project.url,
        local_url: project.local_url,
    })
}

/// Renames the project folder, and its own address in a Laravel `.env` (APP_URL).
pub fn rename(www: &Path, old: &str, new: &str) -> Result<(), String> {
    if crate::projects::host_label(new).is_none() {
        return Err("Use lowercase letters, numbers and hyphens only, for example my-shop.".into());
    }
    let (from, to) = (www.join(old), www.join(new));
    if !from.is_dir() {
        return Err("That project doesn't exist any more.".into());
    }
    if to.exists() {
        return Err(format!("A project named \"{new}\" already exists."));
    }
    fs::rename(&from, &to).map_err(|e| {
        if e.raw_os_error() == Some(5) || e.raw_os_error() == Some(32) {
            "Windows says a file in the project is in use. Close its terminal, editor and dev server, then try again."
                .to_string()
        } else {
            format!("Couldn't rename the folder: {e}")
        }
    })?;
    let env = to.join(".env");
    if let Ok(text) = fs::read_to_string(&env) {
        let updated = text.replace(&format!("APP_URL=http://{old}.test"), &format!("APP_URL=http://{new}.test"));
        if updated != text {
            let _ = fs::write(&env, updated);
        }
    }
    Ok(())
}

/// Moves the project folder to the Recycle Bin, so it can still be brought back.
pub fn recycle(www: &Path, name: &str) -> Result<(), String> {
    let dir = www.join(name);
    if crate::projects::host_label(name).is_none() || !dir.is_dir() {
        return Err("That project doesn't exist any more.".into());
    }
    let path = dir.display().to_string().replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('{path}', 'OnlyErrorDialogs', 'SendToRecycleBin')"
    );
    let mut cmd = Command::new(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().map_err(|e| format!("Couldn't run PowerShell: {e}"))?;
    if dir.exists() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(if err.contains("being used") || err.contains("in use") {
            "Windows says a file in the project is in use. Close its terminal, editor and dev server, then try again.".into()
        } else {
            format!("Couldn't move the project to the Recycle Bin. {}", err.lines().next().unwrap_or("").trim())
        });
    }
    Ok(())
}

/// Deletes a project's database, and the user NexDB made for it (same name), if there is one.
pub fn drop_database(port: u16, root_password: Option<&str>, database: &str) -> Result<(), String> {
    let db = crate::db::Db::default();
    db.connect(port, root_password).map_err(|e| {
        if e == "NEEDS_PASSWORD" {
            "NexDB needs your MySQL password to delete the database: open the Database page and connect once, then try again.".to_string()
        } else {
            e
        }
    })?;
    db.drop_database(database)?;
    if crate::db::valid_name(database) {
        db.query(None, &format!("DROP USER IF EXISTS '{database}'@'localhost', '{database}'@'127.0.0.1';"))?;
    }
    db.disconnect();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_database_a_project_uses() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(".env"), "DB_CONNECTION=mysql\n# DB_DATABASE=old\nDB_DATABASE=\"shop_db\"\n").unwrap();
        assert_eq!(database_of(dir.path()).as_deref(), Some("shop_db"));
        fs::write(dir.path().join(".env"), "DB_CONNECTION=sqlite\nDB_DATABASE=x\n").unwrap();
        assert_eq!(database_of(dir.path()), None);
        fs::remove_file(dir.path().join(".env")).unwrap();
        fs::write(dir.path().join("wp-config.php"), "define( 'DB_NAME', 'blog' );\n").unwrap();
        assert_eq!(database_of(dir.path()).as_deref(), Some("blog"));
    }

    #[test]
    fn reads_git_branch_and_changes() {
        let g = parse_git_status("## main...origin/main [ahead 1]\n M app.php\n?? new.txt\n").unwrap();
        assert_eq!((g.branch.as_str(), g.changes), ("main", 2));
        let g = parse_git_status("## No commits yet on master\n").unwrap();
        assert_eq!((g.branch.as_str(), g.changes), ("master", 0));
    }

    #[test]
    fn rename_moves_the_folder_and_its_address() {
        let www = tempfile::tempdir().unwrap();
        fs::create_dir_all(www.path().join("shop")).unwrap();
        fs::write(www.path().join("shop/.env"), "APP_URL=http://shop.test\n").unwrap();
        rename(www.path(), "shop", "store").unwrap();
        assert!(!www.path().join("shop").exists());
        assert_eq!(fs::read_to_string(www.path().join("store/.env")).unwrap(), "APP_URL=http://store.test\n");
        assert!(rename(www.path(), "store", "Bad Name").is_err());
    }

    /// Sends a temp folder to the real Recycle Bin.
    /// `cargo test real_recycle -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_recycle() {
        let www = tempfile::tempdir().unwrap();
        fs::create_dir_all(www.path().join("nexdb-recycle-test")).unwrap();
        fs::write(www.path().join("nexdb-recycle-test/a.txt"), "x").unwrap();
        recycle(www.path(), "nexdb-recycle-test").unwrap();
        assert!(!www.path().join("nexdb-recycle-test").exists());
    }
}
