//! Automatic database backups on a schedule (daily or weekly), run in the background while
//! NexDB is open. Only the newest few automatic backups of each database are kept; backups the
//! user made by hand are never deleted.
//!
//! MySQL's root password is never saved, so the schedule uses the password from the Database
//! page's connection in this session, or none. When that isn't enough it says so plainly.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const FIRST_CHECK: Duration = Duration::from_secs(3 * 60);
const EVERY: Duration = Duration::from_secs(15 * 60);

/// What the last automatic run did, kept next to the backups so it survives restarts.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Status {
    /// Seconds since 1970 of the last run that backed everything up.
    pub last_ok: Option<u64>,
    /// How many databases that run backed up.
    pub last_count: usize,
    /// Why the latest attempt didn't back up, in plain words; cleared by a good run.
    pub problem: Option<String>,
}

fn status_path(root: &Path) -> PathBuf {
    crate::backup::backups_dir(root).join("auto-status.json")
}

pub fn load_status(root: &Path) -> Status {
    fs::read_to_string(status_path(root)).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn save_status(root: &Path, status: &Status) {
    let dir = crate::backup::backups_dir(root);
    let _ = fs::create_dir_all(&dir);
    if let Ok(text) = serde_json::to_string_pretty(status) {
        let _ = fs::write(status_path(root), text);
    }
}

/// Seconds between automatic backups for a schedule, or None when it's off.
pub fn interval(schedule: &str) -> Option<u64> {
    match schedule {
        "daily" => Some(24 * 60 * 60),
        "weekly" => Some(7 * 24 * 60 * 60),
        _ => None,
    }
}

/// Whether a backup is due now.
pub fn due(schedule: &str, last_ok: Option<u64>, now: u64) -> bool {
    match (interval(schedule), last_ok) {
        (None, _) => false,
        (Some(_), None) => true,
        (Some(every), Some(last)) => now.saturating_sub(last) >= every,
    }
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Starts the background schedule once per launch.
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            check(&app);
            std::thread::sleep(EVERY);
        }
    });
}

fn check(app: &AppHandle) {
    let stack = app.state::<crate::Stack>();
    let Ok((root, settings, _)) = stack.get() else { return };
    let prefs = &settings.preferences;
    let mut status = load_status(&root);
    if !due(&prefs.auto_backup, status.last_ok, now()) {
        return;
    }
    let db = app.state::<crate::db::Db>().inner().clone_handle();
    match run(&root, &settings, db.password().as_deref(), prefs.auto_backup_keep as usize) {
        Ok(count) => {
            status = Status { last_ok: Some(now()), last_count: count, problem: None };
        }
        Err(problem) => status.problem = Some(problem),
    }
    save_status(&root, &status);
}

/// Backs up every database of the user's own, then trims old automatic backups.
pub fn run(root: &Path, settings: &crate::settings::Settings, password: Option<&str>, keep: usize) -> Result<usize, String> {
    let port = settings.mysql.as_ref().map(|m| m.port).ok_or("MySQL isn't part of this install.")?;
    if !crate::supervisor::port_listening(port) {
        return Err("MySQL wasn't running, so nothing was backed up. NexDB tries again while it's open.".into());
    }
    let bin = crate::mysql_bin(settings)?;
    // A separate connection, so the Database page's own connection is never touched.
    let probe = crate::db::Db::default();
    probe.connect(port, password).map_err(|e| {
        if e == "NEEDS_PASSWORD" {
            "NexDB needs your MySQL password: open the Database page and connect once. It's kept in memory only, never saved.".to_string()
        } else {
            e
        }
    })?;
    let names: Vec<String> = probe.databases()?.into_iter().filter(|d| !d.system).map(|d| d.name).collect();
    probe.disconnect();
    for name in &names {
        crate::backup::export(&bin, root, port, password, name, true)?;
        crate::backup::prune_auto(root, name, keep.max(1));
    }
    Ok(names.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn knows_when_a_backup_is_due() {
        let day = 24 * 60 * 60;
        assert!(!due("off", None, 10 * day));
        assert!(due("daily", None, 10 * day), "never ran: due now");
        assert!(!due("daily", Some(10 * day), 10 * day + day - 60));
        assert!(due("daily", Some(10 * day), 11 * day));
        assert!(!due("weekly", Some(10 * day), 16 * day));
        assert!(due("weekly", Some(10 * day), 17 * day));
    }

    /// The schedule's backup against a throwaway MySQL from NexDB's own install: a wrong
    /// password is explained, two runs with keep=1 leave one automatic backup per database,
    /// and a backup made by hand survives.
    /// `cargo test real_auto_backup -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_auto_backup() {
        use crate::supervisor::{ServiceSpec, StopMethod, Supervisor};
        let base = crate::settings::load(Path::new(r"C:\NexDB")).expect("NexDB must be installed in C:/NexDB");
        let mysql_dir = PathBuf::from(&base.components.iter().find(|c| c.id == "mysql").unwrap().path);
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let (data, logs) = (root.join("data"), root.join("logs"));
        fs::create_dir_all(&logs).unwrap();
        let ini = root.join("my.ini");
        let port = 3396;
        let password = "auto pass";
        crate::configure::write_file(&ini, &crate::configure::mysql_ini(&crate::configure::MysqlConf { base_dir: &mysql_dir, data_dir: &data, port, logs_dir: &logs })).unwrap();
        crate::configure::setup_mysql(&mysql_dir, &ini, &data, port, Some(password)).unwrap();
        let sup = Supervisor::new(vec![ServiceSpec {
            id: "mysql".into(), name: "MySQL".into(), version: None, exe: mysql_dir.join("bin").join("mysqld.exe"),
            args: vec![format!("--defaults-file={}", ini.display()), "--console".into()],
            cwd: mysql_dir.clone(), port, managed: true, stop: StopMethod::MysqlEvent, log: logs.join("mysql_error.log"),
        }]);
        sup.start("mysql").unwrap();
        let db = crate::db::Db::default();
        db.connect(port, Some(password)).unwrap();
        db.create_database("shop").unwrap();
        db.create_database("blog").unwrap();

        let mut settings = base.clone();
        settings.mysql.as_mut().unwrap().port = port;
        let outcome = (|| {
            let err = run(root, &settings, None, 1).unwrap_err();
            assert!(err.contains("Database page"), "{err}");
            let mine = crate::backup::export(&crate::mysql_bin(&settings)?, root, port, Some(password), "shop", false)?;
            assert_eq!(run(root, &settings, Some(password), 1)?, 2);
            std::thread::sleep(Duration::from_millis(1100));
            run(root, &settings, Some(password), 1)?;
            let files = crate::backup::list(root);
            println!("{:?}", files.iter().map(|f| &f.name).collect::<Vec<_>>());
            assert_eq!(files.iter().filter(|f| f.auto).count(), 2, "one automatic backup per database");
            assert!(files.iter().any(|f| f.name == mine.name), "the hand-made backup stays");
            Ok::<(), String>(())
        })();
        sup.stop_all();
        outcome.unwrap();
    }

    #[test]
    fn status_survives_a_restart() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load_status(dir.path()), Status::default());
        let s = Status { last_ok: Some(42), last_count: 3, problem: Some("x".into()) };
        save_status(dir.path(), &s);
        assert_eq!(load_status(dir.path()), s);
    }
}
