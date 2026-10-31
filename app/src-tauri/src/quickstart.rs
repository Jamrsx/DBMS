//! Quick-start projects: a ready-to-run Laravel (plain or with the React/Vue Inertia starter
//! kits), WordPress, Vite or Next.js app in the projects folder, using NexDB's own PHP, Composer
//! and Node. Projects that need a database get their own, with their own MySQL user and a random
//! password, so MySQL's root password is never written into a project's files.

use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::settings::Settings;

/// A starter the New project form offers.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Starter {
    Laravel,
    LaravelReact,
    LaravelVue,
    WordPress,
    ViteReact,
    ViteVue,
    NextJs,
}

impl Starter {
    pub fn parse(kind: &str) -> Option<Self> {
        Some(match kind {
            "laravel" => Self::Laravel,
            "laravel-react" => Self::LaravelReact,
            "laravel-vue" => Self::LaravelVue,
            "wordpress" => Self::WordPress,
            "vite-react" => Self::ViteReact,
            "vite-vue" => Self::ViteVue,
            "nextjs" => Self::NextJs,
            _ => return None,
        })
    }

    fn label(self) -> &'static str {
        match self {
            Self::Laravel => "Laravel",
            Self::LaravelReact => "Laravel with React",
            Self::LaravelVue => "Laravel with Vue",
            Self::WordPress => "WordPress",
            Self::ViteReact => "React (Vite)",
            Self::ViteVue => "Vue (Vite)",
            Self::NextJs => "Next.js",
        }
    }

    fn laravel(self) -> bool {
        matches!(self, Self::Laravel | Self::LaravelReact | Self::LaravelVue)
    }

    fn needs_database(self) -> bool {
        self.laravel() || self == Self::WordPress
    }

    /// The steps the user sees, in order.
    pub fn steps(self) -> Vec<&'static str> {
        let mut steps = Vec::new();
        if self.needs_database() {
            steps.push("Creating the database");
        }
        match self {
            Self::Laravel | Self::LaravelReact | Self::LaravelVue => {
                steps.push("Downloading Laravel");
                steps.push("Connecting it to the database");
                steps.push("Setting up the tables");
                if self != Self::Laravel {
                    steps.push("Installing JavaScript packages");
                    steps.push("Building the frontend");
                }
            }
            Self::WordPress => {
                steps.push("Downloading WordPress");
                steps.push("Connecting it to the database");
            }
            Self::ViteReact | Self::ViteVue => {
                steps.push("Creating the app");
                steps.push("Installing JavaScript packages");
            }
            Self::NextJs => steps.push("Creating the app and installing packages"),
        }
        steps
    }
}

/// Progress for the New project view, sent as `quickstart` events.
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Event {
    Plan { name: String, steps: Vec<String> },
    Step { name: String, index: usize, status: &'static str },
    Line { name: String, text: String },
}

/// What the user needs to know when a project is ready.
#[derive(Serialize)]
pub struct Created {
    /// For apps with their own dev server: the command to start it.
    pub run_hint: Option<String>,
    pub database: Option<String>,
}

/// Database and user name for a project: `my-shop` becomes `my_shop`.
pub fn db_name(project: &str) -> String {
    project.replace('-', "_").chars().take(32).collect()
}

/// A random password of letters and digits, safe in `.env` and PHP strings.
fn random_password() -> Result<String, String> {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).map_err(|e| format!("Couldn't make a password: {e}"))?;
    Ok(bytes.iter().map(|b| CHARS[*b as usize % CHARS.len()] as char).collect())
}

/// Sets `key=value` in a `.env` file's text, replacing the line (even when commented out, as
/// Laravel ships the MySQL lines) or adding it at the end.
pub fn set_env(text: &str, key: &str, value: &str) -> String {
    let mut done = false;
    let mut lines: Vec<String> = text
        .lines()
        .map(|line| {
            let bare = line.trim_start().trim_start_matches('#').trim_start();
            if !done && bare.split_once('=').is_some_and(|(k, _)| k.trim() == key) {
                done = true;
                format!("{key}={value}")
            } else {
                line.to_string()
            }
        })
        .collect();
    if !done {
        lines.push(format!("{key}={value}"));
    }
    lines.join("\n") + "\n"
}

/// `wp-config.php` from WordPress's sample with the database details and fresh secret keys.
pub fn wp_config(sample: &str, database: &str, user: &str, password: &str, port: u16) -> Result<String, String> {
    let mut out = sample
        .replace("database_name_here", database)
        .replace("username_here", user)
        .replace("password_here", password)
        .replace("'localhost'", &format!("'127.0.0.1:{port}'"));
    while let Some(pos) = out.find("put your unique phrase here") {
        let key = random_password()? + &random_password()?;
        out.replace_range(pos..pos + "put your unique phrase here".len(), &key);
    }
    Ok(out)
}

pub type Emit<'a> = &'a (dyn Fn(Event) + Sync);

struct Run<'a> {
    emit: Emit<'a>,
    name: &'a str,
    root: &'a Path,
    settings: &'a Settings,
    /// Set when the last command's output showed a briefly locked file.
    locked: std::cell::Cell<bool>,
}

impl Run<'_> {
    fn step(&self, index: usize, status: &'static str) {
        (self.emit)(Event::Step { name: self.name.into(), index, status });
    }

    fn line(&self, text: &str) {
        let text = text.trim_end();
        if !text.is_empty() {
            (self.emit)(Event::Line { name: self.name.into(), text: text.into() });
        }
    }

    /// Like `exec`, but tries once more when Windows briefly locked a file npm just unpacked
    /// (antivirus scanning a new `.exe` gives EBUSY/EPERM), which is common and harmless.
    fn exec_retry(&self, cwd: &Path, command: &str) -> Result<(), String> {
        match self.exec(cwd, command) {
            Err(e) if self.locked.get() => {
                self.locked.set(false);
                self.line("A file was busy (often antivirus checking it); trying again…");
                std::thread::sleep(std::time::Duration::from_secs(5));
                self.exec(cwd, command).map_err(|_| e)
            }
            other => other,
        }
    }

    /// Runs a command (through cmd, so `.bat`/`.cmd` tools work) with NexDB's tools first on
    /// PATH, sending every output line to the progress view.
    fn exec(&self, cwd: &Path, command: &str) -> Result<(), String> {
        self.line(&format!("> {command}"));
        let existing = std::env::var("PATH").unwrap_or_default();
        let path = crate::terminal::path_with(&crate::terminal::tool_dirs(self.root, self.settings), &existing);
        let mut cmd = Command::new("cmd");
        cmd.arg("/C").arg(command).current_dir(cwd).env("PATH", path).env("COMPOSER_NO_INTERACTION", "1");
        cmd.env("npm_config_yes", "true").env("npm_config_fund", "false").env("npm_config_update_notifier", "false");
        let php_dir = self.root.join("etc").join("php");
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
        let stderr = child.stderr.take().map(BufReader::new);
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        let err_thread = stderr.map(|r| {
            let tx = tx.clone();
            std::thread::spawn(move || {
                for line in r.split(b'\n').map_while(Result::ok) {
                    let _ = tx.send(String::from_utf8_lossy(&line).into_owned());
                }
            })
        });
        if let Some(out) = child.stdout.take() {
            let tx = tx.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(out).split(b'\n').map_while(Result::ok) {
                    let _ = tx.send(String::from_utf8_lossy(&line).into_owned());
                }
            });
        }
        drop(tx);
        let mut last = Vec::new();
        for line in rx {
            if line.contains("EBUSY") || line.contains("EPERM") {
                self.locked.set(true);
            }
            self.line(&line);
            last.push(line);
            if last.len() > 6 {
                last.remove(0);
            }
        }
        if let Some(t) = err_thread {
            let _ = t.join();
        }
        let status = child.wait().map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            let tail = last.iter().map(|l| l.trim()).filter(|l| !l.is_empty()).last().unwrap_or("");
            Err(format!("{command} didn't finish ({tail}). The full output is in the details below."))
        }
    }
}

/// The MySQL details a new project gets.
struct ProjectDb {
    name: String,
    user: String,
    password: String,
    port: u16,
}

/// Creates the database and a user that can only use it.
fn make_database(root_password: Option<&str>, port: u16, project: &str) -> Result<ProjectDb, String> {
    let db = crate::db::Db::default();
    db.connect(port, root_password).map_err(|e| {
        if e == "NEEDS_PASSWORD" {
            "NexDB needs your MySQL password to make the project's database: open the Database page and connect once, then try again. The password isn't saved.".to_string()
        } else {
            e
        }
    })?;
    let name = db_name(project);
    if db.databases()?.iter().any(|d| d.name.eq_ignore_ascii_case(&name)) {
        return Err(format!("A database named {name} already exists. Pick another project name, or delete that database first."));
    }
    db.create_database(&name)?;
    let password = random_password()?;
    let sql = format!(
        "CREATE USER IF NOT EXISTS '{name}'@'localhost' IDENTIFIED BY '{password}';\
         CREATE USER IF NOT EXISTS '{name}'@'127.0.0.1' IDENTIFIED BY '{password}';\
         ALTER USER '{name}'@'localhost' IDENTIFIED BY '{password}';\
         ALTER USER '{name}'@'127.0.0.1' IDENTIFIED BY '{password}';\
         GRANT ALL PRIVILEGES ON `{name}`.* TO '{name}'@'localhost';\
         GRANT ALL PRIVILEGES ON `{name}`.* TO '{name}'@'127.0.0.1';"
    );
    db.query(None, &sql)?;
    db.disconnect();
    Ok(ProjectDb { user: name.clone(), name, password, port })
}

/// Makes the project. Progress goes out as `quickstart` events; on failure the half-made folder
/// is removed so the same name can be tried again.
pub fn create(
    emit: Emit,
    root: &Path,
    settings: &Settings,
    sup: &crate::supervisor::Supervisor,
    root_password: Option<String>,
    name: &str,
    starter: Starter,
) -> Result<Created, String> {
    let www = PathBuf::from(&settings.www_dir);
    let dir = www.join(name);
    if crate::projects::host_label(name).is_none() {
        return Err("Use lowercase letters, numbers and hyphens only, for example my-shop.".into());
    }
    if dir.exists() {
        return Err(format!("A project named \"{name}\" already exists."));
    }
    let steps = starter.steps();
    emit(Event::Plan { name: name.into(), steps: steps.iter().map(|s| s.to_string()).collect() });

    let result = run(emit, root, settings, sup, root_password, name, starter, &www, &dir);
    if result.is_err() && dir.exists() {
        let _ = std::fs::remove_dir_all(&dir);
    }
    result
}

#[allow(clippy::too_many_arguments)]
fn run(
    emit: Emit,
    root: &Path,
    settings: &Settings,
    sup: &crate::supervisor::Supervisor,
    root_password: Option<String>,
    name: &str,
    starter: Starter,
    www: &Path,
    dir: &Path,
) -> Result<Created, String> {
    let r = Run { emit, name, root, settings, locked: std::cell::Cell::new(false) };
    let mut index = 0;
    let mut begin = |r: &Run| {
        r.step(index, "running");
        index += 1;
        index - 1
    };
    let finish = |r: &Run, i: usize| r.step(i, "done");

    let need = |id: &str, what: &str| {
        if settings.components.iter().any(|c| c.id == id) {
            Ok(())
        } else {
            Err(format!("{} needs {what}. Install it on the Versions page first.", starter.label()))
        }
    };

    let mut database = None;
    if starter.needs_database() {
        need("mysql", "MySQL")?;
        let i = begin(&r);
        let port = settings.mysql.as_ref().map(|m| m.port).ok_or("MySQL isn't part of this install.")?;
        if !crate::supervisor::port_listening(port) {
            r.line("Starting MySQL…");
            sup.start("mysql").map_err(|e| format!("MySQL isn't running and didn't start: {e}"))?;
        }
        let made = make_database(root_password.as_deref(), port, name)?;
        r.line(&format!("Database {} with its own user {}", made.name, made.user));
        finish(&r, i);
        database = Some(made);
    }

    match starter {
        Starter::Laravel | Starter::LaravelReact | Starter::LaravelVue => {
            need("php", "PHP")?;
            need("composer", "Composer")?;
            if starter != Starter::Laravel {
                need("node", "Node.js")?;
            }
            let package = match starter {
                Starter::LaravelReact => "laravel/react-starter-kit",
                Starter::LaravelVue => "laravel/vue-starter-kit",
                _ => "laravel/laravel",
            };
            let i = begin(&r);
            r.exec(www, &format!("composer create-project {package} {name} --prefer-dist --no-interaction"))?;
            finish(&r, i);

            let i = begin(&r);
            let db = database.as_ref().expect("Laravel has a database");
            let env_path = dir.join(".env");
            let mut env = std::fs::read_to_string(&env_path).unwrap_or_default();
            for (k, v) in [
                ("APP_URL", format!("http://{name}.test")),
                ("DB_CONNECTION", "mysql".into()),
                ("DB_HOST", "127.0.0.1".into()),
                ("DB_PORT", db.port.to_string()),
                ("DB_DATABASE", db.name.clone()),
                ("DB_USERNAME", db.user.clone()),
                ("DB_PASSWORD", db.password.clone()),
            ] {
                env = set_env(&env, k, &v);
            }
            std::fs::write(&env_path, env).map_err(|e| format!("Couldn't write .env: {e}"))?;
            finish(&r, i);

            let i = begin(&r);
            r.exec(dir, "php artisan migrate --force --no-interaction")?;
            finish(&r, i);

            if starter != Starter::Laravel {
                let i = begin(&r);
                r.exec_retry(dir, "npm install")?;
                finish(&r, i);
                let i = begin(&r);
                r.exec(dir, "npm run build")?;
                finish(&r, i);
            }
            Ok(Created { run_hint: None, database: database.map(|d| d.name) })
        }
        Starter::WordPress => {
            let i = begin(&r);
            // This runs on a worker thread, so the async downloads can be waited on here.
            let md5 = tauri::async_runtime::block_on(async {
                reqwest::get("https://wordpress.org/latest.zip.md5")
                    .await
                    .and_then(|r| r.error_for_status())
                    .map_err(|e| format!("Couldn't reach wordpress.org: {e}"))?
                    .text()
                    .await
                    .map_err(|e| e.to_string())
            })?;
            let md5 = md5.split_whitespace().next().unwrap_or("").to_lowercase();
            if md5.len() != 32 {
                return Err("wordpress.org didn't send a checksum, so the download can't be verified.".into());
            }
            let download = crate::catalog::Download {
                url: "https://wordpress.org/latest.zip".into(),
                size: None,
                checksum: crate::catalog::Checksum { algo: "md5".into(), value: md5 },
            };
            r.line("Downloading https://wordpress.org/latest.zip (checked against wordpress.org's checksum)");
            tauri::async_runtime::block_on(crate::installer::install_archive(&download, root, dir, "wordpress", &|_| {}))?;
            finish(&r, i);

            let i = begin(&r);
            let db = database.as_ref().expect("WordPress has a database");
            let sample = std::fs::read_to_string(dir.join("wp-config-sample.php"))
                .map_err(|e| format!("WordPress's sample config is missing: {e}"))?;
            let config = wp_config(&sample, &db.name, &db.user, &db.password, db.port)?;
            std::fs::write(dir.join("wp-config.php"), config).map_err(|e| format!("Couldn't write wp-config.php: {e}"))?;
            finish(&r, i);
            Ok(Created { run_hint: None, database: database.map(|d| d.name) })
        }
        Starter::ViteReact | Starter::ViteVue => {
            need("node", "Node.js")?;
            let template = if starter == Starter::ViteReact { "react-ts" } else { "vue-ts" };
            let i = begin(&r);
            r.exec(www, &format!("npm create vite@latest {name} -- --template {template} --no-interactive"))?;
            finish(&r, i);
            let i = begin(&r);
            r.exec_retry(dir, "npm install")?;
            finish(&r, i);
            Ok(Created { run_hint: Some("npm run dev".into()), database: None })
        }
        Starter::NextJs => {
            need("node", "Node.js")?;
            let i = begin(&r);
            r.exec(www, &format!("npx --yes create-next-app@latest {name} --yes --use-npm --disable-git"))?;
            finish(&r, i);
            Ok(Created { run_hint: Some("npm run dev".into()), database: None })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_lines_are_replaced_even_when_commented() {
        let laravel = "APP_URL=http://localhost\nDB_CONNECTION=sqlite\n# DB_HOST=127.0.0.1\n# DB_PORT=3306\n# DB_DATABASE=laravel\n";
        let mut env = set_env(laravel, "DB_CONNECTION", "mysql");
        env = set_env(&env, "DB_HOST", "127.0.0.1");
        env = set_env(&env, "DB_DATABASE", "my_shop");
        env = set_env(&env, "DB_PASSWORD", "abc");
        assert!(env.contains("DB_CONNECTION=mysql\n"));
        assert!(env.contains("\nDB_HOST=127.0.0.1\n"));
        assert!(env.contains("\nDB_DATABASE=my_shop\n"));
        assert!(env.contains("# DB_PORT=3306"), "untouched lines stay");
        assert!(env.ends_with("DB_PASSWORD=abc\n"), "missing keys are added");
        assert_eq!(env.matches("DB_HOST").count(), 1);
    }

    #[test]
    fn names_and_passwords_are_safe() {
        assert_eq!(db_name("my-shop"), "my_shop");
        assert!(crate::db::valid_name(&db_name("a-very-long-project-name-that-goes-on-and-on")));
        let pw = random_password().unwrap();
        assert_eq!(pw.len(), 24);
        assert!(pw.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn wp_config_gets_database_and_unique_keys() {
        let sample = "define( 'DB_NAME', 'database_name_here' );\ndefine( 'DB_USER', 'username_here' );\ndefine( 'DB_PASSWORD', 'password_here' );\ndefine( 'DB_HOST', 'localhost' );\ndefine( 'AUTH_KEY', 'put your unique phrase here' );\ndefine( 'SECURE_AUTH_KEY', 'put your unique phrase here' );\n";
        let c = wp_config(sample, "blog", "blog", "pw123", 3306).unwrap();
        assert!(c.contains("'DB_NAME', 'blog'") && c.contains("'DB_PASSWORD', 'pw123'"));
        assert!(c.contains("'127.0.0.1:3306'"));
        assert!(!c.contains("put your unique phrase here"));
        let keys: Vec<&str> = c.lines().filter(|l| l.contains("AUTH_KEY")).collect();
        assert_ne!(keys[0].split('\'').nth(3), keys[1].split('\'').nth(3), "each key is different");
    }

    /// Makes real projects with NexDB's own PHP, Composer and Node into a temp projects folder,
    /// against a throwaway MySQL. Pick starters with NEXDB_STARTERS (comma list), default all.
    /// `cargo test real_quickstart -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_quickstart() {
        use crate::supervisor::{ServiceSpec, StopMethod, Supervisor};
        use std::fs;
        let root = Path::new(r"C:\NexDB");
        let base = crate::settings::load(root).expect("NexDB must be installed in C:/NexDB");
        let mysql_dir = PathBuf::from(&base.components.iter().find(|c| c.id == "mysql").unwrap().path);
        let dir = tempfile::tempdir().unwrap();
        let (data, logs, www) = (dir.path().join("data"), dir.path().join("logs"), dir.path().join("www"));
        fs::create_dir_all(&logs).unwrap();
        fs::create_dir_all(&www).unwrap();
        let ini = dir.path().join("my.ini");
        let port = 3397;
        crate::configure::write_file(&ini, &crate::configure::mysql_ini(&crate::configure::MysqlConf { base_dir: &mysql_dir, data_dir: &data, port, logs_dir: &logs })).unwrap();
        crate::configure::setup_mysql(&mysql_dir, &ini, &data, port, Some("rootpw")).unwrap();
        let sup = Supervisor::new(vec![ServiceSpec {
            id: "mysql".into(), name: "MySQL".into(), version: None, exe: mysql_dir.join("bin").join("mysqld.exe"),
            args: vec![format!("--defaults-file={}", ini.display()), "--console".into()],
            cwd: mysql_dir.clone(), port, managed: true, stop: StopMethod::MysqlEvent, log: logs.join("mysql_error.log"),
        }]);
        sup.start("mysql").unwrap();
        let mut settings = base.clone();
        settings.www_dir = www.display().to_string();
        settings.mysql.as_mut().unwrap().port = port;

        let wanted = std::env::var("NEXDB_STARTERS")
            .unwrap_or_else(|_| "laravel,laravel-react,wordpress,vite-react,nextjs".into());
        let emit = |e: Event| match e {
            Event::Step { index, status, .. } => println!("  step {index}: {status}"),
            Event::Line { text, .. } if text.starts_with("> ") || text.contains("rror") => println!("    {text}"),
            _ => {}
        };
        let mut failures = Vec::new();
        for kind in wanted.split(',') {
            let starter = Starter::parse(kind).unwrap();
            let name = format!("qs-{kind}");
            println!("== {kind}");
            let started = std::time::Instant::now();
            match create(&emit, root, &settings, &sup, Some("rootpw".into()), &name, starter) {
                Ok(_) => {
                    let p = www.join(&name);
                    let ok = match starter {
                        Starter::Laravel | Starter::LaravelReact | Starter::LaravelVue => {
                            let env = fs::read_to_string(p.join(".env")).unwrap();
                            let check = crate::db::Db::default();
                            check.connect(port, Some("rootpw")).unwrap();
                            let tables = check.tables(&db_name(&name)).unwrap();
                            println!("  tables: {}", tables.iter().map(|t| t.name.as_str()).collect::<Vec<_>>().join(", "));
                            env.contains(&format!("DB_DATABASE={}", db_name(&name)))
                                && tables.iter().any(|t| t.name == "migrations")
                                && (starter == Starter::Laravel || p.join("public/build/manifest.json").is_file())
                        }
                        Starter::WordPress => fs::read_to_string(p.join("wp-config.php")).unwrap().contains("127.0.0.1:3397"),
                        Starter::ViteReact | Starter::ViteVue => p.join("node_modules").is_dir(),
                        Starter::NextJs => p.join("node_modules/next").is_dir(),
                    };
                    println!("  {} in {:?}", if ok { "OK" } else { "MISSING PARTS" }, started.elapsed());
                    if !ok {
                        failures.push(format!("{kind}: missing parts"));
                    }
                }
                Err(e) => {
                    println!("  FAILED: {e}");
                    failures.push(format!("{kind}: {e}"));
                    assert!(!www.join(&name).exists(), "a failed project is cleaned up");
                }
            }
        }
        sup.stop_all();
        assert!(failures.is_empty(), "{failures:#?}");
    }

    #[test]
    fn every_starter_has_steps() {
        for k in ["laravel", "laravel-react", "laravel-vue", "wordpress", "vite-react", "vite-vue", "nextjs"] {
            let s = Starter::parse(k).unwrap();
            assert!(!s.steps().is_empty());
            assert_eq!(s.needs_database(), k.starts_with("laravel") || k == "wordpress");
        }
        assert_eq!(Starter::parse("laravel-react").unwrap().steps().len(), 6);
    }
}
