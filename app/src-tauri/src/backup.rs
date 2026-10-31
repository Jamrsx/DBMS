//! Database backups: `.sql` files made with MySQL's own `mysqldump`, restored with `mysql`.
//! They live in `<install root>\backups`. The root password is handed to the tools through a
//! temporary options file that is deleted right after, never on a command line.

use crate::db::valid_name;
use serde::Serialize;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, Serialize, PartialEq)]
pub struct BackupFile {
    /// File name, e.g. `shop__2026-10-31_09-52-10.sql`.
    pub name: String,
    /// The database it was made from, when the name says so.
    pub database: Option<String>,
    pub size_bytes: u64,
    /// Seconds since 1970, when the file was written.
    pub created: u64,
    pub path: String,
}

pub fn backups_dir(root: &Path) -> PathBuf {
    root.join("backups")
}

/// `shop__2026-10-31_09-52-10.sql`: the database name, then the local date and time.
pub fn file_name(database: &str, stamp: &str) -> String {
    format!("{database}__{stamp}.sql")
}

fn now_stamp() -> String {
    let format = time::macros::format_description!("[year]-[month]-[day]_[hour]-[minute]-[second]");
    let now = time::OffsetDateTime::now_local().unwrap_or_else(|_| time::OffsetDateTime::now_utc());
    now.format(&format).unwrap_or_else(|_| "backup".into())
}

/// Every `.sql` file in the backups folder, newest first.
pub fn list(root: &Path) -> Vec<BackupFile> {
    let mut files: Vec<BackupFile> = fs::read_dir(backups_dir(root))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("sql")))
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let name = e.file_name().to_string_lossy().to_string();
            let database = name.split_once("__").map(|(db, _)| db.to_string()).filter(|db| valid_name(db));
            let created = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            Some(BackupFile { name, database, size_bytes: meta.len(), created, path: e.path().display().to_string() })
        })
        .collect();
    files.sort_by(|a, b| b.created.cmp(&a.created).then(b.name.cmp(&a.name)));
    files
}

/// A `[client]` options file with the connection details, removed when dropped.
struct ClientOptions(PathBuf);

impl ClientOptions {
    fn new(root: &Path, port: u16, password: Option<&str>) -> Result<Self, String> {
        let dir = root.join("tmp");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(format!("nexdb-client-{}.cnf", std::process::id()));
        let mut text = format!("[client]\nuser=root\nhost=127.0.0.1\nport={port}\nprotocol=TCP\n");
        if let Some(pw) = password.filter(|p| !p.is_empty()) {
            // Option files read quoted values literally apart from \\ and \".
            text.push_str(&format!("password=\"{}\"\n", pw.replace('\\', "\\\\").replace('"', "\\\"")));
        }
        fs::write(&path, text).map_err(|e| format!("Couldn't prepare the backup: {e}"))?;
        Ok(ClientOptions(path))
    }

    fn arg(&self) -> String {
        format!("--defaults-extra-file={}", self.0.display())
    }
}

impl Drop for ClientOptions {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

/// The last line MySQL printed on failure, made readable.
fn mysql_error(stderr: &str) -> String {
    let line = stderr
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.contains("[Warning]"))
        .last()
        .unwrap_or("MySQL stopped without saying why.");
    let line = line.trim_start_matches("mysqldump: ").trim_start_matches("mysql: ");
    if line.contains("2003") || line.contains("Can't connect") {
        return "MySQL isn't running. Start it from the Dashboard, then try again.".into();
    }
    if line.contains("1045") || line.contains("Access denied") {
        return "MySQL refused the root password. Connect on the Database page first, then try again.".into();
    }
    if line.contains("1049") || line.contains("Unknown database") {
        return "That database doesn't exist any more.".into();
    }
    line.to_string()
}

/// Writes `database` to a new `.sql` file in the backups folder.
pub fn export(mysql_bin: &Path, root: &Path, port: u16, password: Option<&str>, database: &str) -> Result<BackupFile, String> {
    if !valid_name(database) {
        return Err(format!("\"{database}\" can't be backed up from here."));
    }
    let dir = backups_dir(root);
    fs::create_dir_all(&dir).map_err(|e| format!("Couldn't create the backups folder: {e}"))?;
    let target = dir.join(file_name(database, &now_stamp()));
    let partial = target.with_extension("sql.part");
    let options = ClientOptions::new(root, port, password)?;
    let out = hidden(
        Command::new(mysql_bin.join("mysqldump.exe"))
            .arg(options.arg())
            .args([
                "--single-transaction",
                "--routines",
                "--events",
                "--triggers",
                "--default-character-set=utf8mb4",
                "--set-gtid-purged=OFF",
                "--no-tablespaces",
            ])
            .arg(format!("--result-file={}", partial.display()))
            .arg(database)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped()),
    )
    .output()
    .map_err(|e| format!("Couldn't run MySQL's backup tool: {e}"))?;
    drop(options);
    if !out.status.success() {
        let _ = fs::remove_file(&partial);
        return Err(mysql_error(&String::from_utf8_lossy(&out.stderr)));
    }
    fs::rename(&partial, &target).map_err(|e| format!("Couldn't save the backup: {e}"))?;
    list(root)
        .into_iter()
        .find(|b| Path::new(&b.path) == target)
        .ok_or_else(|| "The backup was written but can't be found.".into())
}

/// Runs a `.sql` file against `database` (which must exist).
pub fn import(mysql_bin: &Path, root: &Path, port: u16, password: Option<&str>, database: &str, file: &Path) -> Result<(), String> {
    if !valid_name(database) {
        return Err(format!("\"{database}\" can't be restored into from here."));
    }
    let mut head = [0u8; 4];
    let mut f = File::open(file).map_err(|e| format!("Couldn't open {}: {e}", file.display()))?;
    let n = f.read(&mut head).unwrap_or(0);
    // Compressed files would be fed to MySQL as gibberish.
    if n >= 2 && (head[..2] == [0x1f, 0x8b] || head[..2] == *b"PK") {
        return Err("This file is compressed. Unzip it first, then import the .sql file inside.".into());
    }
    let input = File::open(file).map_err(|e| format!("Couldn't open {}: {e}", file.display()))?;
    let options = ClientOptions::new(root, port, password)?;
    let out = hidden(
        Command::new(mysql_bin.join("mysql.exe"))
            .arg(options.arg())
            .arg("--default-character-set=utf8mb4")
            .arg(database)
            .stdin(Stdio::from(input))
            .stdout(Stdio::null())
            .stderr(Stdio::piped()),
    )
    .output()
    .map_err(|e| format!("Couldn't run the MySQL client: {e}"))?;
    drop(options);
    if out.status.success() { Ok(()) } else { Err(mysql_error(&String::from_utf8_lossy(&out.stderr))) }
}

/// Deletes a backup file by name; only `.sql` files inside the backups folder.
pub fn delete(root: &Path, name: &str) -> Result<(), String> {
    if name.contains(['/', '\\']) || !name.to_ascii_lowercase().ends_with(".sql") {
        return Err("That isn't a backup file.".into());
    }
    let path = backups_dir(root).join(name);
    fs::remove_file(&path).map_err(|e| format!("Couldn't delete {name}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_backups_newest_first_and_reads_the_database() {
        let dir = tempfile::tempdir().unwrap();
        let backups = backups_dir(dir.path());
        fs::create_dir_all(&backups).unwrap();
        fs::write(backups.join("shop__2026-10-30_09-00-00.sql"), "old").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(backups.join("shop__2026-10-31_09-00-00.sql"), "newer").unwrap();
        fs::write(backups.join("imported.sql"), "x").unwrap();
        fs::write(backups.join("notes.txt"), "x").unwrap();
        let found = list(dir.path());
        assert_eq!(found.len(), 3);
        assert_eq!(found.iter().filter(|b| b.database.as_deref() == Some("shop")).count(), 2);
        assert!(found.iter().any(|b| b.name == "imported.sql" && b.database.is_none()));
        assert!(found[0].created >= found[1].created);
    }

    #[test]
    fn delete_stays_in_the_backups_folder() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(backups_dir(dir.path())).unwrap();
        fs::write(backups_dir(dir.path()).join("a__1.sql"), "x").unwrap();
        assert!(delete(dir.path(), "..\\etc\\devmanager.json").is_err());
        assert!(delete(dir.path(), "a__1.txt").is_err());
        delete(dir.path(), "a__1.sql").unwrap();
        assert!(list(dir.path()).is_empty());
    }

    #[test]
    fn errors_read_like_sentences() {
        assert!(mysql_error("mysqldump: Got error: 2003: Can't connect to MySQL server").contains("isn't running"));
        assert!(mysql_error("ERROR 1045 (28000): Access denied for user 'root'").contains("password"));
        assert_eq!(mysql_error("ERROR 1064 (42000) at line 3: You have an error in your SQL syntax"), "ERROR 1064 (42000) at line 3: You have an error in your SQL syntax");
        assert!(file_name("shop", "2026-10-31_09-52-10").ends_with(".sql"));
    }

    /// A throwaway NexDB MySQL with a tricky password: back up, wipe, restore and compare.
    /// `cargo test real_backup_roundtrip -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_backup_roundtrip() {
        use crate::supervisor::{ServiceSpec, StopMethod, Supervisor};
        let base = crate::settings::load(Path::new(r"C:\NexDB")).expect("NexDB must be installed in C:/NexDB");
        let mysql_dir = PathBuf::from(&base.components.iter().find(|c| c.id == "mysql").unwrap().path);
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let (data, logs) = (root.join("data"), root.join("logs"));
        fs::create_dir_all(&logs).unwrap();
        let ini = root.join("my.ini");
        let port = 3395;
        let password = "p\"a\\ss w0rd";
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
        db.query(Some("shop"), "CREATE TABLE items (id INT PRIMARY KEY, name VARCHAR(40), note TEXT); \
            INSERT INTO items VALUES (1,'Café ☕','line1\nline2'),(2,'O''Brien',NULL),(3,'emoji 🎉','x');").unwrap();

        let bin = mysql_dir.join("bin");
        let made = export(&bin, root, port, db.password().as_deref(), "shop").unwrap();
        println!("backup: {} ({} bytes)", made.name, made.size_bytes);
        assert_eq!(made.database.as_deref(), Some("shop"));
        assert!(made.size_bytes > 100);
        assert!(!root.join("tmp").read_dir().unwrap().any(|e| e.unwrap().file_name().to_string_lossy().ends_with(".cnf")), "options file removed");

        db.drop_database("shop").unwrap();
        db.create_database("shop_restored").unwrap();
        import(&bin, root, port, db.password().as_deref(), "shop_restored", Path::new(&made.path)).unwrap();
        let rows = db.query(Some("shop_restored"), "SELECT id, name, note FROM items ORDER BY id").unwrap();
        let r = &rows.sets[0].rows;
        println!("{r:?}");
        assert_eq!(r.len(), 3);
        assert_eq!(r[0][1], serde_json::json!("Café ☕"));
        assert_eq!(r[0][2], serde_json::json!("line1\nline2"));
        assert_eq!(r[1][1], serde_json::json!("O'Brien"));
        assert_eq!(r[2][1], serde_json::json!("emoji 🎉"));

        // A wrong password and a bad file give readable errors.
        assert!(export(&bin, root, port, Some("wrong"), "shop_restored").unwrap_err().contains("password"));
        let bad = root.join("bad.sql");
        fs::write(&bad, "SELEKT nonsense;").unwrap();
        let err = import(&bin, root, port, db.password().as_deref(), "shop_restored", &bad).unwrap_err();
        println!("bad file: {err}");
        assert!(err.contains("1064"), "{err}");
        sup.stop_all();
    }
}
