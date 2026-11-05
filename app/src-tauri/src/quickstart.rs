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
    LaravelLivewire,
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
            "laravel-livewire" => Self::LaravelLivewire,
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
            Self::LaravelLivewire => "Laravel with Livewire",
            Self::WordPress => "WordPress",
            Self::ViteReact => "React (Vite)",
            Self::ViteVue => "Vue (Vite)",
            Self::NextJs => "Next.js",
        }
    }

    fn laravel(self) -> bool {
        matches!(self, Self::Laravel | Self::LaravelReact | Self::LaravelVue | Self::LaravelLivewire)
    }

    /// Composer package and flags. Starter kits come from their latest code (as `laravel new`
    /// does), since their tagged releases on Packagist stopped at Laravel 12.
    fn package(self) -> (&'static str, &'static str) {
        match self {
            Self::LaravelReact => ("laravel/react-starter-kit", "--stability=dev"),
            Self::LaravelVue => ("laravel/vue-starter-kit", "--stability=dev"),
            Self::LaravelLivewire => ("laravel/livewire-starter-kit", "--stability=dev"),
            _ => ("laravel/laravel", ""),
        }
    }

    fn needs_database(self) -> bool {
        self.laravel() || self == Self::WordPress
    }

    /// The steps the user sees, in order.
    pub fn steps(self, opts: &Options) -> Vec<&'static str> {
        let mut steps = Vec::new();
        if self.needs_database() {
            steps.push("Creating the database");
        }
        match self {
            Self::Laravel | Self::LaravelReact | Self::LaravelVue | Self::LaravelLivewire => {
                steps.push("Downloading Laravel");
                steps.push("Connecting it to the database");
                steps.push("Setting up the tables");
                if self != Self::Laravel {
                    steps.push("Installing JavaScript packages");
                    steps.push("Building the frontend");
                }
                if opts.ai {
                    steps.push("Setting up AI assistant support (Laravel Boost)");
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

/// Choices made in the New project wizard.
#[derive(Debug, Default, serde::Deserialize)]
pub struct Options {
    /// Database name; the project name (with _ for -) when empty.
    #[serde(default)]
    pub db_name: Option<String>,
    /// Laravel only: set up Laravel Boost so AI coding assistants know the project.
    #[serde(default)]
    pub ai: bool,
}

/// Progress for the New project view, sent as `quickstart` events.
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Event {
    Plan { name: String, steps: Vec<String> },
    Step { name: String, index: usize, status: &'static str },
    Line { name: String, text: String },
    /// How far the running step is, when the tool says (Composer packages, downloads).
    Percent { name: String, index: usize, percent: u8 },
}

/// Removes terminal colour codes (ESC [ ... letter) so the log reads as plain text.
pub fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for n in chars.by_ref() {
                    if n.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else if c != '\r' {
            out.push(c);
        }
    }
    out
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
pub(crate) fn random_password() -> Result<String, String> {
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

/// Composer's "requires php 8.1 - 8.4 -> your php version (8.5.12) does not satisfy": the
/// versions the packages need, and the one that ran.
pub fn composer_php_mismatch(line: &str) -> Option<(String, String)> {
    let (_, rest) = line.split_once("requires php ")?;
    let (needs, rest) = rest.split_once(" -> your php version (")?;
    let ran = rest.split(')').next()?;
    Some((needs.trim().to_string(), ran.trim().to_string()))
}

/// The percentage in git's "Receiving objects:  45% (450/1000)".
pub fn git_percent(line: &str) -> Option<u8> {
    let rest = line.trim().strip_prefix("Receiving objects:")?;
    rest.trim().split('%').next()?.trim().parse().ok()
}

/// A Git address NexDB can clone: https, ssh or git@host:path, with no spaces and nothing that
/// git or cmd could read as an option or a command.
pub fn clean_repo_url(url: &str) -> Result<String, String> {
    let u = url.trim();
    let ok_scheme = u.starts_with("https://") || u.starts_with("http://") || u.starts_with("ssh://") || u.starts_with("git@");
    if !ok_scheme || u.contains(char::is_whitespace) || u.contains(['"', '`', '&', '|', '<', '>', '^', '%']) {
        return Err("Paste the repository's address, like https://github.com/you/app.git or git@github.com:you/app.git.".into());
    }
    Ok(u.to_string())
}

/// Clones a repository into the projects folder as `name`, with git's progress as `quickstart`
/// events under that name. A half-done clone is removed again.
pub fn clone_repo(emit: Emit, root: &Path, settings: &Settings, url: &str, name: &str, branch: Option<&str>) -> Result<(), String> {
    let url = clean_repo_url(url)?;
    if crate::projects::host_label(name).is_none() {
        return Err("Use lowercase letters, numbers and hyphens only, for example my-shop.".into());
    }
    let www = PathBuf::from(&settings.www_dir);
    let dir = www.join(name);
    if dir.exists() {
        return Err(format!("A project named \"{name}\" already exists. Pick another name."));
    }
    let branch = branch.map(str::trim).filter(|b| !b.is_empty());
    if let Some(b) = branch {
        if b.starts_with('-') || !b.chars().all(|c| c.is_ascii_alphanumeric() || "-_./".contains(c)) {
            return Err(format!("\"{b}\" can't be a branch name."));
        }
    }
    emit(Event::Plan { name: name.into(), steps: vec![format!("Download {url}")] });
    let r = Run {
        emit,
        name,
        root,
        settings,
        locked: std::cell::Cell::new(false),
        current: std::cell::Cell::new(0),
        ops: std::cell::Cell::new((0, 0)),
    };
    r.step(0, "running");
    let command = match branch {
        // No quotes: cmd would pass them on to git. The address and name have no spaces.
        Some(b) => format!("git clone --progress --branch {b} -- {url} {name}"),
        None => format!("git clone --progress -- {url} {name}"),
    };
    if let Err(e) = r.exec(&www, &command) {
        let _ = std::fs::remove_dir_all(&dir);
        return Err(clone_problem(&e));
    }
    r.step(0, "done");
    Ok(())
}

/// Why a clone failed, in plain words.
fn clone_problem(err: &str) -> String {
    if err.contains("Repository not found") || err.contains("not found") {
        "Git couldn't find that repository. Check the address; for a private one, sign in when Git asks.".into()
    } else if err.contains("Authentication failed") || err.contains("Permission denied") {
        "The repository refused the sign-in. Sign in when Git asks, or use an address you have access to.".into()
    } else if err.contains("Could not resolve host") || err.contains("unable to access") {
        "Git couldn't reach the server. Check your internet connection and the address.".into()
    } else if err.contains("Remote branch") {
        "That branch doesn't exist in the repository. Leave Branch empty to use its main one.".into()
    } else {
        err.to_string()
    }
}

pub type Emit<'a> = &'a (dyn Fn(Event) + Sync);

struct Run<'a> {
    emit: Emit<'a>,
    name: &'a str,
    root: &'a Path,
    settings: &'a Settings,
    /// Set when the last command's output showed a briefly locked file.
    locked: std::cell::Cell<bool>,
    /// The running step, and Composer's package count (total, done) for its percentage.
    current: std::cell::Cell<usize>,
    ops: std::cell::Cell<(usize, usize)>,
}

impl Run<'_> {
    fn step(&self, index: usize, status: &'static str) {
        if status == "running" {
            self.current.set(index);
            self.ops.set((0, 0));
        }
        (self.emit)(Event::Step { name: self.name.into(), index, status });
    }

    fn percent(&self, percent: u8) {
        (self.emit)(Event::Percent { name: self.name.into(), index: self.current.get(), percent: percent.min(100) });
    }

    /// Composer prints "Package operations: 110 installs, ..." then one "- Installing" per package;
    /// git prints "Receiving objects:  45% (450/1000)".
    fn track(&self, line: &str) {
        if let Some(p) = git_percent(line) {
            self.percent(p.min(99));
            return;
        }
        let (total, done) = self.ops.get();
        if let Some(rest) = line.split("Package operations:").nth(1) {
            let n = rest.split_whitespace().next().and_then(|n| n.parse().ok()).unwrap_or(0);
            self.ops.set((n, 0));
        } else if total > 0 && line.trim_start().starts_with("- Installing ") {
            let done = done + 1;
            self.ops.set((total, done));
            self.percent(((done * 100) / total).min(99) as u8);
        }
    }

    fn line(&self, text: &str) {
        let clean = strip_ansi(text);
        let text = clean.trim_end();
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
        // The project's own PHP version comes first, so Composer and artisan run on it too.
        let own_php = crate::phpver::for_project(self.root, self.settings, self.name);
        let mut dirs = crate::terminal::tool_dirs(self.root, self.settings);
        if let Some(extra) = &own_php {
            dirs.insert(0, extra.dir.clone());
        }
        // And the Node its .nvmrc names, so npm install runs on it.
        let www = std::path::PathBuf::from(&self.settings.www_dir);
        if let Some(node) = crate::nodever::project_of(&www, cwd).and_then(|p| crate::nodever::dir_for(self.root, self.settings, &p)) {
            dirs.insert(0, node);
        }
        let path = crate::terminal::path_with(&dirs, &existing);
        let mut cmd = Command::new("cmd");
        cmd.arg("/C").arg(command).current_dir(cwd).env("PATH", path).env("COMPOSER_NO_INTERACTION", "1");
        cmd.env("NO_COLOR", "1").env("npm_config_color", "false");
        cmd.env("npm_config_yes", "true").env("npm_config_fund", "false").env("npm_config_update_notifier", "false");
        // composer.bat runs NEXDB_PHP_EXE when set (as the project terminal does), else the default.
        if let Some(extra) = &own_php {
            cmd.env("NEXDB_PHP_EXE", extra.dir.join("php.exe"));
            cmd.env("NEXDB_PHP_INI", extra.ini_dir.join("php-cli.ini"));
        }
        let php_dir = own_php.map(|e| e.ini_dir).unwrap_or_else(|| self.root.join("etc").join("php"));
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
        let err_thread = stderr.map(|mut r| {
            let tx = tx.clone();
            std::thread::spawn(move || {
                // Git redraws its progress with \r on one line; each redraw counts as a line, so
                // its percentage moves while it downloads.
                let mut buf = Vec::new();
                let mut byte = [0u8; 1];
                while let Ok(1) = std::io::Read::read(&mut r, &mut byte) {
                    if byte[0] == b'\n' || byte[0] == b'\r' {
                        if !buf.is_empty() {
                            let _ = tx.send(String::from_utf8_lossy(&buf).into_owned());
                            buf.clear();
                        }
                    } else {
                        buf.push(byte[0]);
                    }
                }
                if !buf.is_empty() {
                    let _ = tx.send(String::from_utf8_lossy(&buf).into_owned());
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
        let mut php_mismatch = None;
        for line in rx {
            if php_mismatch.is_none() {
                php_mismatch = composer_php_mismatch(&line);
            }
            if line.contains("EBUSY") || line.contains("EPERM") {
                self.locked.set(true);
            }
            let plain = strip_ansi(&line);
            self.track(&plain);
            self.line(&plain);
            last.push(plain);
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
        } else if let Some((needs, ran)) = php_mismatch {
            Err(format!(
                "This project's packages need PHP {needs}, but it ran on PHP {ran}. Pick a matching version under PHP version on this page, click Use this version, then set it up again."
            ))
        } else {
            let tail = last.iter().map(|l| l.trim()).filter(|l| !l.is_empty()).last().unwrap_or("");
            Err(format!("{command} didn't finish ({tail}). The full output is in the details below."))
        }
    }
}

/// The MySQL details a new project gets.
pub(crate) struct ProjectDb {
    pub name: String,
    pub user: String,
    pub password: String,
    pub port: u16,
}

/// Creates the database and a user that can only use it.
fn make_database(root_password: Option<&str>, port: u16, name: &str) -> Result<ProjectDb, String> {
    let db = crate::db::Db::default();
    db.connect(port, root_password).map_err(|e| {
        if e == "NEEDS_PASSWORD" {
            "NexDB needs your MySQL password to make the project's database: open the Database page and connect once, then try again. The password isn't saved.".to_string()
        } else {
            e
        }
    })?;
    let name = name.to_string();
    if !crate::db::valid_name(&name) || name.len() > 32 {
        return Err(format!("\"{name}\" can't be a database name: use up to 32 letters, numbers and _."));
    }
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

/// Something a cloned project still needs before it runs, in one of its folders.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SetupTask {
    /// Relative to the project; empty for the project folder itself.
    pub folder: String,
    /// "composer", "env", "key", "npm".
    pub kind: &'static str,
    /// One plain line for the checklist.
    pub label: String,
}

/// The app folders of a project: the project folder and the ones one level down.
fn app_folders(dir: &Path) -> Vec<(String, PathBuf)> {
    let mut found = vec![(String::new(), dir.to_path_buf())];
    let mut subs: Vec<String> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| !n.starts_with('.') && !["node_modules", "vendor"].contains(&n.as_str()))
        .collect();
    subs.sort_by_key(|n| n.to_lowercase());
    found.extend(subs.into_iter().map(|s| (s.clone(), dir.join(s))));
    found
}

/// What a project (often a cloned one) is missing: PHP packages, a `.env` with its database
/// and app key, Node packages. Empty when it's ready.
pub fn setup_plan(dir: &Path) -> Vec<SetupTask> {
    let mut tasks = Vec::new();
    for (folder, path) in app_folders(dir) {
        let where_ = if folder.is_empty() { String::new() } else { format!("{folder}: ") };
        let laravel = path.join("artisan").is_file() && path.join("composer.json").is_file();
        if laravel {
            if !path.join("vendor").join("autoload.php").is_file() {
                tasks.push(SetupTask { folder: folder.clone(), kind: "composer", label: format!("{where_}install its PHP packages (composer install)") });
            }
            if !path.join(".env").is_file() && path.join(".env.example").is_file() {
                tasks.push(SetupTask { folder: folder.clone(), kind: "env", label: format!("{where_}create .env from .env.example, with its own database user") });
                tasks.push(SetupTask { folder: folder.clone(), kind: "key", label: format!("{where_}generate the app key") });
            } else if let Ok(env) = std::fs::read_to_string(path.join(".env")) {
                if env.lines().any(|l| l.trim() == "APP_KEY=") {
                    tasks.push(SetupTask { folder: folder.clone(), kind: "key", label: format!("{where_}generate the app key") });
                }
            }
        } else if folder.is_empty() && path.join("composer.json").is_file() && !path.join("vendor").is_dir() {
            tasks.push(SetupTask { folder: folder.clone(), kind: "composer", label: format!("{where_}install its PHP packages (composer install)") });
        }
        if path.join("package.json").is_file() && !path.join("node_modules").is_dir() {
            tasks.push(SetupTask { folder: folder.clone(), kind: "npm", label: format!("{where_}install its Node packages (npm install)") });
        }
    }
    tasks
}

/// A `.env` value, without quotes.
pub(crate) fn env_value(text: &str, key: &str) -> Option<String> {
    text.lines().find_map(|l| {
        let (k, v) = l.split_once('=')?;
        (k.trim() == key).then(|| v.trim().trim_matches('"').trim_matches('\'').to_string())
    })
}

/// The project's MySQL database: the one its `.env.example` names, made when it doesn't exist
/// (kept as it is when it does), with a user of its own that can only use it.
pub(crate) fn ensure_database(root_password: Option<&str>, port: u16, name: &str) -> Result<(ProjectDb, bool), String> {
    let db = crate::db::Db::default();
    db.connect(port, root_password).map_err(|e| {
        if e == "NEEDS_PASSWORD" {
            "NexDB needs your MySQL password to set up the project's database: open the Database page and connect once, then try again. The password isn't saved.".to_string()
        } else {
            e
        }
    })?;
    if !crate::db::valid_name(name) || name.len() > 32 {
        return Err(format!("\"{name}\" can't be a database name: use up to 32 letters, numbers and _."));
    }
    let existed = db.databases()?.iter().any(|d| d.name.eq_ignore_ascii_case(name));
    if !existed {
        db.create_database(name)?;
    }
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
    Ok((ProjectDb { user: name.to_string(), name: name.to_string(), password, port }, existed))
}

/// Runs the setup plan of an existing project. Progress goes out as `quickstart` events under
/// the project's name, like a new project. Nothing is deleted on failure.
pub fn setup(
    emit: Emit,
    root: &Path,
    settings: &Settings,
    sup: &crate::supervisor::Supervisor,
    root_password: Option<String>,
    name: &str,
) -> Result<Vec<String>, String> {
    let dir = PathBuf::from(&settings.www_dir).join(name);
    if !dir.is_dir() {
        return Err("That project doesn't exist any more.".into());
    }
    let tasks = setup_plan(&dir);
    emit(Event::Plan { name: name.into(), steps: tasks.iter().map(|t| t.label.clone()).collect() });
    let r = Run {
        emit,
        name,
        root,
        settings,
        locked: std::cell::Cell::new(false),
        current: std::cell::Cell::new(0),
        ops: std::cell::Cell::new((0, 0)),
    };
    let has = |id: &str| settings.components.iter().any(|c| c.id == id);
    let mut notes = Vec::new();
    for (i, task) in tasks.iter().enumerate() {
        r.step(i, "running");
        let path = dir.join(&task.folder);
        match task.kind {
            "composer" => {
                if !has("composer") {
                    return Err("Installing PHP packages needs Composer. Install it on the Versions page first.".into());
                }
                r.exec(&path, "composer install --no-interaction --prefer-dist")?;
            }
            "env" => {
                let example = std::fs::read_to_string(path.join(".env.example")).map_err(|e| format!("Couldn't read .env.example: {e}"))?;
                let mut env = example.clone();
                let connection = env_value(&example, "DB_CONNECTION").unwrap_or_else(|| "mysql".into());
                if matches!(connection.as_str(), "mysql" | "mariadb") {
                    let port = settings.mysql.as_ref().map(|m| m.port).ok_or("This project uses MySQL, which isn't part of this install.")?;
                    if !crate::supervisor::port_listening(port) {
                        r.line("Starting MySQL…");
                        sup.start("mysql").map_err(|e| format!("MySQL isn't running and didn't start: {e}"))?;
                    }
                    let wanted = env_value(&example, "DB_DATABASE").filter(|d| !d.is_empty()).unwrap_or_else(|| db_name(name));
                    let (db, existed) = ensure_database(root_password.as_deref(), port, &wanted)?;
                    for (k, v) in [
                        ("DB_HOST", "127.0.0.1".to_string()),
                        ("DB_PORT", db.port.to_string()),
                        ("DB_DATABASE", db.name.clone()),
                        ("DB_USERNAME", db.user.clone()),
                        ("DB_PASSWORD", db.password.clone()),
                    ] {
                        env = set_env(&env, k, &v);
                    }
                    if existed {
                        r.line(&format!("Using the existing database {}; its data stays as it is", db.name));
                        notes.push(format!("{} uses your existing {} database, so NexDB didn't run migrations.", task.folder, db.name));
                    } else {
                        r.line(&format!("Made database {} with its own user", db.name));
                        notes.push(format!("{} has a new, empty {} database: run php artisan migrate in its folder to create the tables.", task.folder, db.name));
                    }
                } else if connection == "sqlite" {
                    let file = path.join("database").join("database.sqlite");
                    if !file.exists() {
                        let _ = std::fs::create_dir_all(path.join("database"));
                        std::fs::write(&file, "").map_err(|e| format!("Couldn't create the SQLite file: {e}"))?;
                    }
                }
                if has("mailpit") {
                    for (k, v) in [("MAIL_MAILER", "smtp"), ("MAIL_HOST", "127.0.0.1"), ("MAIL_PORT", "1025")] {
                        env = set_env(&env, k, v);
                    }
                }
                std::fs::write(path.join(".env"), env).map_err(|e| format!("Couldn't write .env: {e}"))?;
            }
            "key" => r.exec(&path, "php artisan key:generate --force --no-interaction")?,
            "npm" => {
                if !has("node") {
                    return Err("Installing Node packages needs Node.js. Install it on the Versions page first.".into());
                }
                r.exec_retry(&path, "npm install")?;
            }
            _ => {}
        }
        r.step(i, "done");
    }
    // Older configs use constants PHP 8.5 warns about.
    if let Ok(n) = crate::phpfix::fix(&dir) {
        if n > 0 {
            r.line(&format!("Updated {n} line(s) for PHP 8.5, so no \"Deprecated\" warnings show"));
        }
    }
    Ok(notes)
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
    opts: &Options,
) -> Result<Created, String> {
    let www = PathBuf::from(&settings.www_dir);
    let dir = www.join(name);
    if crate::projects::host_label(name).is_none() {
        return Err("Use lowercase letters, numbers and hyphens only, for example my-shop.".into());
    }
    if dir.exists() {
        return Err(format!("A project named \"{name}\" already exists."));
    }
    let steps = starter.steps(opts);
    emit(Event::Plan { name: name.into(), steps: steps.iter().map(|s| s.to_string()).collect() });

    let result = run(emit, root, settings, sup, root_password, name, starter, opts, &www, &dir);
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
    opts: &Options,
    www: &Path,
    dir: &Path,
) -> Result<Created, String> {
    let r = Run {
        emit,
        name,
        root,
        settings,
        locked: std::cell::Cell::new(false),
        current: std::cell::Cell::new(0),
        ops: std::cell::Cell::new((0, 0)),
    };
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
        let wanted = opts.db_name.clone().map(|n| n.trim().to_string()).filter(|n| !n.is_empty()).unwrap_or_else(|| db_name(name));
        let made = make_database(root_password.as_deref(), port, &wanted)?;
        r.line(&format!("Database {} with its own user {}", made.name, made.user));
        finish(&r, i);
        database = Some(made);
    }

    match starter {
        Starter::Laravel | Starter::LaravelReact | Starter::LaravelVue | Starter::LaravelLivewire => {
            need("php", "PHP")?;
            need("composer", "Composer")?;
            if starter != Starter::Laravel {
                need("node", "Node.js")?;
            }
            let i = begin(&r);
            let (package, flags) = starter.package();
            r.exec(www, &format!("composer create-project {package} {name} {flags} --prefer-dist --no-interaction"))?;
            // Older configs use constants PHP 8.5 warns about; update them so pages stay clean.
            if let Ok(n) = crate::phpfix::fix(dir) {
                if n > 0 {
                    r.line(&format!("Updated {n} line(s) for PHP 8.5, so no \"Deprecated\" warnings show"));
                }
            }
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
            // Mail goes to NexDB's mail catcher when it's installed. (Laravel's Redis defaults
            // already point at 127.0.0.1:6379.)
            if settings.components.iter().any(|c| c.id == "mailpit") {
                for (k, v) in [("MAIL_MAILER", "smtp"), ("MAIL_HOST", "127.0.0.1"), ("MAIL_PORT", "1025")] {
                    env = set_env(&env, k, v);
                }
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
            if opts.ai {
                let i = begin(&r);
                // "~2.2" (2.2 up to 3.0) instead of "^2.2": cmd treats ^ as an escape and quotes
                // inside `cmd /C` get mangled, which garbled Composer's arguments.
                r.exec(dir, "composer require laravel/boost:~2.2 --dev -W --no-interaction")?;
                r.exec(dir, "php artisan boost:install --no-interaction")?;
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
                subdir: None,
                file: None,
            };
            r.line("Downloading https://wordpress.org/latest.zip (checked against wordpress.org's checksum)");
            let report = |p: crate::installer::Progress| {
                if let Some(total) = p.bytes_total.filter(|t| *t > 0) {
                    r.percent(((p.bytes_done * 100) / total) as u8);
                }
            };
            tauri::async_runtime::block_on(crate::installer::install_archive(&download, root, dir, "wordpress", &report))?;
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
    fn reads_repository_addresses() {
        assert!(clean_repo_url("https://github.com/me/app.git").is_ok());
        assert!(clean_repo_url("--upload-pack=calc").is_err());
        assert!(clean_repo_url("https://x.com/a b").is_err());
        assert!(clean_repo_url("https://x.com/a&calc").is_err());
        assert_eq!(git_percent("Receiving objects:  45% (450/1000)"), Some(45));
        assert_eq!(git_percent("Cloning into 'app'..."), None);
    }

    /// Clones a small public repository into a temp projects folder with NexDB's Git.
    /// `cargo test real_clone_repo -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_clone_repo() {
        let root = PathBuf::from(r"C:\NexDB");
        let mut settings = crate::settings::load(&root).expect("NexDB must be installed in C:/NexDB");
        let www = tempfile::tempdir().unwrap();
        settings.www_dir = www.path().display().to_string();
        let percents = std::sync::Mutex::new(Vec::new());
        let emit = |e: Event| {
            if let Event::Percent { percent, .. } = e {
                percents.lock().unwrap().push(percent);
            }
        };
        clone_repo(&emit, &root, &settings, "https://github.com/octocat/Hello-World.git", "hello-world", None).unwrap();
        assert!(www.path().join("hello-world").join("README").is_file());
        assert!(www.path().join("hello-world").join(".git").is_dir());
        println!("percent updates: {:?}", percents.lock().unwrap());
        let again = clone_repo(&emit, &root, &settings, "https://github.com/octocat/Hello-World.git", "hello-world", None);
        assert!(again.unwrap_err().contains("already exists"));
        let missing = clone_repo(&emit, &root, &settings, "https://github.com/octocat/no-such-repo-nexdb-test.git", "nope", None);
        println!("{}", missing.as_ref().unwrap_err());
        assert!(missing.is_err() && !www.path().join("nope").exists(), "a failed clone leaves nothing behind");
    }

    #[test]
    fn reads_composer_php_version_mismatch() {
        let line = "    - nette/schema v1.3.2 requires php 8.1 - 8.4 -> your php version (8.5.12) does not satisfy that requirement.";
        assert_eq!(composer_php_mismatch(line), Some(("8.1 - 8.4".into(), "8.5.12".into())));
        assert_eq!(composer_php_mismatch("Installing dependencies from lock file"), None);
    }

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
            let opts = Options { ai: std::env::var("NEXDB_AI").is_ok(), ..Default::default() };
            match create(&emit, root, &settings, &sup, Some("rootpw".into()), &name, starter, &opts) {
                Ok(_) => {
                    let p = www.join(&name);
                    let ok = match starter {
                        Starter::Laravel | Starter::LaravelReact | Starter::LaravelVue | Starter::LaravelLivewire => {
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
        for k in ["laravel", "laravel-react", "laravel-vue", "laravel-livewire", "wordpress", "vite-react", "vite-vue", "nextjs"] {
            let s = Starter::parse(k).unwrap();
            assert!(!s.steps(&Options::default()).is_empty());
            assert_eq!(s.needs_database(), k.starts_with("laravel") || k == "wordpress");
        }
        assert_eq!(Starter::parse("laravel-react").unwrap().steps(&Options::default()).len(), 6);
        assert_eq!(Starter::parse("laravel").unwrap().steps(&Options { ai: true, ..Default::default() }).len(), 5);
    }

    #[test]
    fn colour_codes_are_removed() {
        assert_eq!(strip_ansi("\u{1b}[32mbuilt in 7.15s\u{1b}[39m\r"), "built in 7.15s");
        assert_eq!(strip_ansi("\u{1b}[2mpublic/build/\u{1b}[22m\u{1b}[36massets/app.js"), "public/build/assets/app.js");
    }

    /// A cloned monorepo like parish: a Laravel API without vendor or .env, a Vite app already
    /// installed, and a mobile app without node_modules.
    #[test]
    fn setup_plan_lists_what_a_cloned_project_needs() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        for f in ["Backend", "web/node_modules", "mobile"] {
            std::fs::create_dir_all(p.join(f)).unwrap();
        }
        for (f, body) in [
            ("Backend/artisan", ""),
            ("Backend/composer.json", "{}"),
            ("Backend/package.json", "{}"),
            ("Backend/.env.example", "APP_KEY=\nDB_CONNECTION=mysql\nDB_DATABASE=parish\n"),
            ("web/package.json", "{}"),
            ("mobile/package.json", "{}"),
        ] {
            std::fs::write(p.join(f), body).unwrap();
        }
        let plan = setup_plan(p);
        let kinds: Vec<(&str, &str)> = plan.iter().map(|t| (t.folder.as_str(), t.kind)).collect();
        assert_eq!(
            kinds,
            [("Backend", "composer"), ("Backend", "env"), ("Backend", "key"), ("Backend", "npm"), ("mobile", "npm")]
        );
        assert!(plan[0].label.starts_with("Backend: install its PHP packages"));

        // Once set up, only a missing key would be asked for.
        std::fs::create_dir_all(p.join("Backend/vendor")).unwrap();
        std::fs::write(p.join("Backend/vendor/autoload.php"), "").unwrap();
        std::fs::write(p.join("Backend/.env"), "APP_KEY=\n").unwrap();
        std::fs::create_dir_all(p.join("Backend/node_modules")).unwrap();
        std::fs::create_dir_all(p.join("mobile/node_modules")).unwrap();
        let kinds: Vec<&str> = setup_plan(p).iter().map(|t| t.kind).collect();
        assert_eq!(kinds, ["key"]);
        assert_eq!(env_value("DB_DATABASE=\"parish\"\n", "DB_DATABASE").as_deref(), Some("parish"));
    }

    /// Sets up a copy of a real cloned Laravel app (C:\NexDB\www\parish\Backend) with SQLite:
    /// composer install, .env and app key, then checks that artisan runs.
    /// `cargo test real_setup_cloned_laravel -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_setup_cloned_laravel() {
        let base = crate::settings::load(Path::new(r"C:\NexDB")).expect("NexDB must be installed in C:/NexDB");
        let source = PathBuf::from(&base.www_dir).join("parish").join("Backend");
        let www = tempfile::tempdir().unwrap();
        let target = www.path().join("clone").join("Backend");
        let out = Command::new("robocopy")
            .args([source.to_str().unwrap(), target.to_str().unwrap(), "/E", "/XD", "vendor", "node_modules", "/XF", ".env", "/NFL", "/NDL", "/NJH", "/NJS"])
            .output()
            .unwrap();
        assert!(out.status.code().unwrap_or(16) < 8, "robocopy failed");
        // The project may have dropped its .env.example; a minimal one is enough for this test.
        let example = std::fs::read_to_string(target.join(".env.example"))
            .unwrap_or_else(|_| "APP_NAME=Laravel\nAPP_ENV=local\nAPP_KEY=\nAPP_DEBUG=true\nDB_CONNECTION=sqlite\n".into());
        std::fs::write(target.join(".env.example"), set_env(&example, "DB_CONNECTION", "sqlite")).unwrap();
        // Node packages are left out of this test; it is about the PHP side.
        std::fs::remove_file(target.join("package.json")).ok();

        let mut settings = base.clone();
        settings.www_dir = www.path().display().to_string();
        let sup = crate::supervisor::Supervisor::new(vec![]);
        let emit = |e: Event| {
            if let Event::Line { text, .. } = e {
                if text.starts_with('>') {
                    println!("{text}");
                }
            }
        };
        let root = PathBuf::from(r"C:\NexDB");
        setup(&emit, &root, &settings, &sup, None, "clone").unwrap();
        assert!(target.join("vendor/autoload.php").is_file());
        let env = std::fs::read_to_string(target.join(".env")).unwrap();
        assert!(env.lines().any(|l| l.starts_with("APP_KEY=base64:")), "app key generated");
        assert!(setup_plan(&target.parent().unwrap()).is_empty(), "nothing left to set up");
    }

    /// A copy of OCC-Admission's Web app, whose packages need PHP 8.4 or older, set up with the
    /// project set to another installed PHP: composer install must run on that version.
    /// `cargo test real_setup_uses_project_php -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_setup_uses_project_php() {
        let root = PathBuf::from(r"C:\NexDB");
        let base = crate::settings::load(&root).expect("NexDB must be installed in C:/NexDB");
        let older = crate::phpver::installed(&root, &base)
            .into_keys()
            .find(|v| v.starts_with("8.4"))
            .expect("install PHP 8.4 on the Versions page");
        let source = PathBuf::from(&base.www_dir).join("OCC-Admission").join("Web");
        let www = tempfile::tempdir().unwrap();
        let target = www.path().join("Admission-Copy").join("Web");
        let out = Command::new("robocopy")
            .args([source.to_str().unwrap(), target.to_str().unwrap(), "/E", "/XD", "vendor", "node_modules", "/XF", ".env", "/NFL", "/NDL", "/NJH", "/NJS"])
            .output()
            .unwrap();
        assert!(out.status.code().unwrap_or(16) < 8, "robocopy failed");
        // The project may have dropped its .env.example; a minimal one is enough for this test.
        let example = std::fs::read_to_string(target.join(".env.example"))
            .unwrap_or_else(|_| "APP_NAME=Laravel\nAPP_ENV=local\nAPP_KEY=\nAPP_DEBUG=true\nDB_CONNECTION=sqlite\n".into());
        std::fs::write(target.join(".env.example"), set_env(&example, "DB_CONNECTION", "sqlite")).unwrap();
        std::fs::remove_file(target.join("package.json")).ok();

        let mut settings = base.clone();
        settings.www_dir = www.path().display().to_string();
        settings.preferences.project_php = [("Admission-Copy".to_string(), older.clone())].into_iter().collect();
        let sup = crate::supervisor::Supervisor::new(vec![]);
        let emit = |e: Event| {
            if let Event::Line { text, .. } = e {
                if text.starts_with('>') {
                    println!("{text}");
                }
            }
        };
        setup(&emit, &root, &settings, &sup, None, "Admission-Copy").unwrap();
        assert!(target.join("vendor/autoload.php").is_file(), "composer install ran on PHP {older}");
    }
}
