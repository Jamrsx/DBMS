//! Laravel tools for a project: artisan's everyday commands (migrate, seed, storage:link, clear
//! caches) with plain-language results, its log as readable entries, and a queue worker and
//! scheduler that run in the background until stopped or NexDB closes.

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use crate::settings::Settings;

/// The PHP a project runs on (its own version, else NexDB's default) and its php.ini folder.
pub fn php_for(root: &Path, settings: &Settings, project: &str) -> Option<(PathBuf, PathBuf)> {
    if let Some(extra) = crate::phpver::for_project(root, settings, project) {
        return Some((extra.dir.join("php.exe"), extra.ini_dir));
    }
    let c = settings.components.iter().find(|c| c.id == "php")?;
    let path = PathBuf::from(&c.path);
    let exe = if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) { path } else { path.join("php.exe") };
    exe.is_file().then(|| (exe, root.join("etc").join("php")))
}

/// `php artisan …` for a project, with NexDB's tools on PATH, so artisan's own calls (composer,
/// node) find them too.
fn artisan_command(root: &Path, settings: &Settings, project: &str, dir: &Path, args: &[&str]) -> Result<Command, String> {
    let (php, ini) = php_for(root, settings, project).ok_or("PHP isn't installed. Install it on the Versions page.")?;
    let existing = std::env::var("PATH").unwrap_or_default();
    let path = crate::terminal::path_with(&crate::terminal::tool_dirs(root, settings), &existing);
    let mut cmd = Command::new(php);
    cmd.arg("artisan").args(args).current_dir(dir).env("PATH", path).env("NO_COLOR", "1").stdin(Stdio::null());
    if ini.join("php.ini").is_file() {
        cmd.env("PHPRC", &ini);
    }
    crate::scan::hide_console(&mut cmd);
    Ok(cmd)
}

/// What an artisan button did, in plain words, with artisan's own output one click away.
#[derive(Debug, Serialize, PartialEq)]
pub struct Outcome {
    pub ok: bool,
    pub summary: String,
    pub output: String,
}

/// The artisan arguments for a button.
fn action_args(action: &str) -> Option<&'static [&'static str]> {
    Some(match action {
        "migrate" => &["migrate", "--force", "--no-interaction"],
        "seed" => &["db:seed", "--force", "--no-interaction"],
        "storage_link" => &["storage:link", "--no-interaction"],
        "clear" => &["optimize:clear", "--no-interaction"],
        _ => return None,
    })
}

/// Runs one of the Laravel buttons in the project's Laravel folder.
pub fn run(root: &Path, settings: &Settings, project: &str, dir: &Path, action: &str) -> Result<Outcome, String> {
    let args = action_args(action).ok_or("Unknown Laravel action.")?;
    if !dir.join("artisan").is_file() {
        return Err("This folder isn't a Laravel app (it has no artisan file).".into());
    }
    let out = artisan_command(root, settings, project, dir, args)?
        .output()
        .map_err(|e| format!("Couldn't run php artisan: {e}"))?;
    let text = crate::quickstart::strip_ansi(&format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    ));
    Ok(outcome(action, out.status.success(), text.trim()))
}

/// Says what happened, from artisan's output.
pub fn outcome(action: &str, ok: bool, output: &str) -> Outcome {
    let summary = if ok {
        match action {
            "migrate" => {
                let ran = output.lines().filter(|l| l.contains("DONE")).count();
                if output.contains("Nothing to migrate") || ran == 0 {
                    "The database tables were already up to date.".to_string()
                } else {
                    format!("Created or changed tables: {ran} migration{} ran.", if ran == 1 { "" } else { "s" })
                }
            }
            "seed" => "Sample data was added to the database.".into(),
            "storage_link" => {
                if output.contains("already exists") {
                    "Uploaded files were already reachable at /storage.".into()
                } else {
                    "Uploaded files are now reachable at /storage.".into()
                }
            }
            _ => "Cleared the cached config, routes, views and events.".into(),
        }
    } else {
        problem(output)
    };
    Outcome { ok, summary, output: output.to_string() }
}

/// The likely cause of a failed artisan command, in plain words.
pub fn problem(output: &str) -> String {
    let has = |s: &str| output.contains(s);
    if has("vendor/autoload.php") || has("vendor\\autoload.php") {
        "The project's PHP packages aren't installed. Use Set up this project on the Overview tab.".into()
    } else if has("[2002]") || has("Connection refused") || has("actively refused") {
        "Can't reach the database. Start MySQL on the Dashboard, then try again.".into()
    } else if has("[1049]") || has("Unknown database") {
        "The database named in .env doesn't exist. Create it on the Database page, or use Set up this project.".into()
    } else if has("[1045]") || has("Access denied") {
        "MySQL refused the user name and password in .env (DB_USERNAME and DB_PASSWORD).".into()
    } else if has("could not find driver") {
        "PHP has no driver for the database in .env (DB_CONNECTION). Check that it names mysql, pgsql or sqlite.".into()
    } else if has("No application encryption key") {
        "The app has no key yet. Use Set up this project on the Overview tab.".into()
    } else if has("Target class [DatabaseSeeder] does not exist") || has("DatabaseSeeder") && has("does not exist") {
        "The project has no database seeder (database/seeders/DatabaseSeeder.php).".into()
    } else {
        let last = output.lines().map(str::trim).filter(|l| !l.is_empty()).last().unwrap_or("artisan stopped with an error.");
        format!("It didn't work: {last}")
    }
}

/// One entry of the Laravel log.
#[derive(Debug, Serialize, PartialEq)]
pub struct LogEntry {
    pub time: String,
    /// "error", "warning" or "info".
    pub level: String,
    pub message: String,
    /// Where it happened ("app/Http/Controllers/MemberController.php line 42"), when known.
    pub place: Option<String>,
    /// The stack trace and other lines that came with it.
    pub detail: String,
}

#[derive(Debug, Serialize)]
pub struct LogView {
    /// The log file shown, relative to the project.
    pub file: Option<String>,
    /// Newest first.
    pub entries: Vec<LogEntry>,
}

/// The newest `.log` file in the Laravel app's storage/logs (daily logs make one per day).
fn newest_log(dir: &Path) -> Option<PathBuf> {
    fs::read_dir(dir.join("storage").join("logs"))
        .ok()?
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "log"))
        .max_by_key(|e| e.metadata().and_then(|m| m.modified()).ok())
        .map(|e| e.path())
}

/// The last entries of the Laravel log, newest first. Only the end of a big log is read.
pub fn logs(project: &Path, laravel: &Path, limit: usize) -> LogView {
    let Some(file) = newest_log(laravel) else { return LogView { file: None, entries: vec![] } };
    let text = read_tail(&file, 512 * 1024).unwrap_or_default();
    let mut entries = parse_log(&text, laravel);
    entries.reverse();
    entries.truncate(limit);
    let rel = file.strip_prefix(project).map(|p| p.display().to_string().replace('\\', "/")).ok();
    LogView { file: rel, entries }
}

fn read_tail(file: &Path, max: u64) -> std::io::Result<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = fs::File::open(file)?;
    let len = f.metadata()?.len();
    f.seek(SeekFrom::Start(len.saturating_sub(max)))?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

/// Splits Laravel's log (`[2026-11-03 10:15:02] local.ERROR: message {"exception":…}`) into
/// entries. A partial first entry from reading only the end of the file is dropped.
pub fn parse_log(text: &str, laravel: &Path) -> Vec<LogEntry> {
    let mut out: Vec<LogEntry> = Vec::new();
    for line in text.lines() {
        if let Some((time, level, message)) = header(line) {
            let (message, context) = match message.find(" {\"") {
                Some(i) => (&message[..i], &message[i..]),
                None => (message, ""),
            };
            out.push(LogEntry {
                time: time.into(),
                level: level.into(),
                message: message.trim().into(),
                place: place(context, laravel),
                detail: String::new(),
            });
        } else if let Some(last) = out.last_mut() {
            if last.detail.lines().count() < 60 {
                last.detail.push_str(line);
                last.detail.push('\n');
            }
            if last.place.is_none() {
                last.place = place(line, laravel);
            }
        }
    }
    for e in &mut out {
        e.detail = e.detail.trim_end().to_string();
    }
    out
}

fn header(line: &str) -> Option<(&str, &'static str, &str)> {
    let rest = line.strip_prefix('[')?;
    let (time, rest) = rest.split_once("] ")?;
    if time.len() < 19 || !time.as_bytes()[0].is_ascii_digit() {
        return None;
    }
    let (channel, message) = rest.split_once(": ")?;
    let level = channel.rsplit('.').next()?;
    let level = match level {
        "EMERGENCY" | "ALERT" | "CRITICAL" | "ERROR" => "error",
        "WARNING" => "warning",
        "NOTICE" | "INFO" | "DEBUG" => "info",
        _ => return None,
    };
    Some((&time[..19], level, message))
}

/// "at C:\\…\\app\\Models\\User.php:42)" -> "app/Models/User.php line 42", relative to the app.
fn place(text: &str, laravel: &Path) -> Option<String> {
    let at = text.rfind(" at ")?;
    let rest = &text[at + 4..];
    let end = rest.find(')').unwrap_or(rest.len());
    let (file, line) = rest[..end].rsplit_once(':')?;
    let line: u32 = line.trim().parse().ok()?;
    let file = file.replace("\\\\", "\\").replace('\\', "/");
    let base = laravel.display().to_string().replace('\\', "/");
    let rel = file.strip_prefix(&base).map(|r| r.trim_start_matches('/').to_string()).unwrap_or(file);
    Some(format!("{rel} line {line}"))
}

/// A queue worker or scheduler running for a project.
struct Worker {
    child: Child,
    log: PathBuf,
    #[cfg(windows)]
    _job: crate::supervisor::job::Job,
}

/// Background artisan processes by `project#kind`; they end when NexDB closes.
#[derive(Default)]
pub struct Workers(Mutex<HashMap<String, Worker>>);

/// The artisan command for a worker kind.
fn worker_args(kind: &str) -> Option<&'static [&'static str]> {
    Some(match kind {
        "queue" => &["queue:work", "--tries=3", "--no-interaction"],
        "schedule" => &["schedule:work", "--no-interaction"],
        _ => return None,
    })
}

pub fn worker_log(root: &Path, project: &str, kind: &str) -> PathBuf {
    root.join("logs").join("projects").join(format!("{project}-{kind}.log"))
}

#[derive(Debug, Serialize)]
pub struct WorkerInfo {
    pub kind: String,
    pub running: bool,
    /// Its last output lines.
    pub tail: Vec<String>,
}

impl Workers {
    pub fn running(&self, key: &str) -> bool {
        let mut map = self.0.lock().unwrap();
        let alive = map.get_mut(key).is_some_and(|w| matches!(w.child.try_wait(), Ok(None)));
        if !alive {
            map.remove(key);
        }
        alive
    }

    pub fn start(&self, root: &Path, settings: &Settings, project: &str, dir: &Path, kind: &str) -> Result<(), String> {
        let args = worker_args(kind).ok_or("Unknown worker.")?;
        let key = format!("{project}#{kind}");
        if self.running(&key) {
            return Ok(());
        }
        if !dir.join("artisan").is_file() {
            return Err("This folder isn't a Laravel app (it has no artisan file).".into());
        }
        let log = worker_log(root, project, kind);
        fs::create_dir_all(log.parent().unwrap()).map_err(|e| e.to_string())?;
        let open = || fs::OpenOptions::new().create(true).append(true).open(&log).map_err(|e| e.to_string());
        let mut cmd = artisan_command(root, settings, project, dir, args)?;
        cmd.stdout(open()?).stderr(open()?);
        let mut child = cmd.spawn().map_err(|e| format!("Couldn't start php artisan {}: {e}", args[0]))?;
        #[cfg(windows)]
        let job = match crate::supervisor::job::Job::kill_on_close().and_then(|j| j.assign(&child).map(|_| j)) {
            Ok(job) => job,
            Err(e) => {
                let _ = child.kill();
                return Err(format!("Couldn't contain the worker: {e}"));
            }
        };
        // A worker that stops at once (no packages, bad .env) says why in its log.
        std::thread::sleep(std::time::Duration::from_millis(1500));
        if let Ok(Some(_)) = child.try_wait() {
            let text = fs::read_to_string(&log).unwrap_or_default();
            let recent: String = text.lines().rev().take(20).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
            return Err(problem(&recent));
        }
        self.0.lock().unwrap().insert(
            key,
            Worker {
                child,
                log,
                #[cfg(windows)]
                _job: job,
            },
        );
        Ok(())
    }

    pub fn stop(&self, key: &str) {
        if let Some(mut w) = self.0.lock().unwrap().remove(key) {
            let _ = w.child.kill();
            let _ = w.child.wait();
        }
    }

    /// Stops every worker of a project (before it is renamed or deleted).
    pub fn stop_project(&self, project: &str) {
        for kind in ["queue", "schedule"] {
            self.stop(&format!("{project}#{kind}"));
        }
    }

    pub fn info(&self, root: &Path, project: &str) -> Vec<WorkerInfo> {
        ["queue", "schedule"]
            .into_iter()
            .map(|kind| {
                let key = format!("{project}#{kind}");
                let running = self.running(&key);
                let log = self.0.lock().unwrap().get(&key).map(|w| w.log.clone()).unwrap_or_else(|| worker_log(root, project, kind));
                let tail = read_tail(&log, 8 * 1024)
                    .map(|t| {
                        let lines: Vec<String> = t.lines().map(|l| l.trim_end().to_string()).filter(|l| !l.trim().is_empty()).collect();
                        lines[lines.len().saturating_sub(12)..].to_vec()
                    })
                    .unwrap_or_default();
                WorkerInfo { kind: kind.into(), running, tail }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrate_outcomes_in_plain_words() {
        let ran = "INFO  Running migrations.\n  2024_01_01_000000_create_users_table ... 12ms DONE\n  2024_01_02_000000_create_jobs_table ... 5ms DONE";
        assert_eq!(outcome("migrate", true, ran).summary, "Created or changed tables: 2 migrations ran.");
        assert_eq!(outcome("migrate", true, "INFO  Nothing to migrate.").summary, "The database tables were already up to date.");
        let down = "SQLSTATE[HY000] [2002] No connection could be made because the target machine actively refused it";
        assert!(outcome("migrate", false, down).summary.starts_with("Can't reach the database"));
        assert!(problem("Unknown database 'parish'").contains("doesn't exist"));
        assert!(problem("Failed opening required 'vendor/autoload.php'").contains("Set up this project"));
        assert_eq!(problem("Something odd\nfinal line"), "It didn't work: final line");
    }

    /// A temp copy of a set-up Laravel app (C:\NexDB\www\inertia) on SQLite: migrate twice,
    /// storage:link, clear caches, then a queue worker and scheduler started and stopped.
    /// `cargo test real_laravel_tools -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_laravel_tools() {
        fn copy(from: &Path, to: &Path) {
            fs::create_dir_all(to).unwrap();
            for e in fs::read_dir(from).unwrap().flatten() {
                let name = e.file_name();
                if name == "node_modules" || name == ".git" {
                    continue;
                }
                if e.file_type().unwrap().is_dir() {
                    copy(&e.path(), &to.join(&name));
                } else {
                    fs::copy(e.path(), to.join(&name)).unwrap();
                }
            }
        }
        let root = Path::new(r"C:\NexDB");
        let settings = crate::settings::load(root).expect("NexDB must be installed in C:/NexDB");
        let tmp = tempfile::tempdir().unwrap();
        let app = tmp.path().join("app");
        copy(&root.join("www").join("inertia"), &app);
        let db = tmp.path().join("test.sqlite");
        fs::write(&db, "").unwrap();
        let env: String = fs::read_to_string(app.join(".env"))
            .unwrap()
            .lines()
            .filter(|l| !l.starts_with("DB_") && !l.starts_with("QUEUE_CONNECTION"))
            .map(|l| format!("{l}\n"))
            .collect();
        fs::write(app.join(".env"), format!("{env}DB_CONNECTION=sqlite\nDB_DATABASE={}\nQUEUE_CONNECTION=database\n", db.display())).unwrap();
        let _ = fs::remove_dir_all(app.join("public").join("storage"));
        let _ = fs::remove_file(app.join("public").join("storage"));

        let name = "nexdb-real-test";
        let first = run(root, &settings, name, &app, "migrate").unwrap();
        println!("migrate: {}", first.summary);
        assert!(first.ok && first.summary.contains("migration"), "{}", first.output);
        let again = run(root, &settings, name, &app, "migrate").unwrap();
        assert_eq!(again.summary, "The database tables were already up to date.");
        let link = run(root, &settings, name, &app, "storage_link").unwrap();
        println!("storage:link: {}", link.summary);
        assert!(link.ok, "{}", link.output);
        let clear = run(root, &settings, name, &app, "clear").unwrap();
        assert!(clear.ok, "{}", clear.output);

        let workers = Workers::default();
        for kind in ["queue", "schedule"] {
            workers.start(root, &settings, name, &app, kind).unwrap();
            assert!(workers.running(&format!("{name}#{kind}")), "{kind} keeps running");
        }
        std::thread::sleep(std::time::Duration::from_secs(2));
        let info = workers.info(root, name);
        println!("{info:#?}");
        assert!(info.iter().all(|w| w.running));
        workers.stop_project(name);
        assert!(workers.info(root, name).iter().all(|w| !w.running));
        for kind in ["queue", "schedule"] {
            let _ = fs::remove_file(worker_log(root, name, kind));
        }
    }

    #[test]
    fn reads_laravel_log_entries() {
        let app = Path::new(r"C:\NexDB\www\parish\Backend");
        let log = r#"tail of an earlier entry
[2026-11-03 09:00:01] local.INFO: User signed in {"id":4}
[2026-11-03 09:05:12] local.ERROR: Call to undefined method App\Models\Member::churches() {"userId":4,"exception":"[object] (BadMethodCallException(code: 0): Call to undefined method App\\Models\\Member::churches() at C:\\NexDB\\www\\parish\\Backend\\app\\Http\\Controllers\\MemberController.php:42)
[stacktrace]
#0 C:\\NexDB\\www\\parish\\Backend\\vendor\\laravel\\framework\\src\\Illuminate\\Support\\Traits\\ForwardsCalls.php(67)
"}
[2026-11-03 09:06:00] production.WARNING: Slow query"#;
        let entries = parse_log(log, app);
        assert_eq!(entries.len(), 3, "the partial first lines are dropped");
        assert_eq!((entries[0].level.as_str(), entries[0].message.as_str()), ("info", "User signed in"));
        assert_eq!(entries[1].level, "error");
        assert_eq!(entries[1].message, r"Call to undefined method App\Models\Member::churches()");
        assert_eq!(entries[1].place.as_deref(), Some("app/Http/Controllers/MemberController.php line 42"));
        assert!(entries[1].detail.contains("[stacktrace]"));
        assert_eq!((entries[2].level.as_str(), entries[2].time.as_str()), ("warning", "2026-11-03 09:06:00"));
    }
}
