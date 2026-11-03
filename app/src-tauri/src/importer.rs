//! Import from other tools on the PC: Laragon, XAMPP, WAMP and other MySQL, MariaDB or
//! PostgreSQL installs. Their projects are copied into NexDB's www folder and their databases
//! dumped with their own tools and loaded into NexDB's. The originals are only read.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::quickstart::{Emit, Event};
use crate::settings::Settings;

/// Another tool found on the PC, with what can be imported from it.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Source {
    pub id: String,
    /// "Laragon", "XAMPP", "WAMP", or the database server's name.
    pub label: String,
    pub path: String,
    /// Its projects folder, when it has one.
    pub www: Option<String>,
    pub projects: Vec<Candidate>,
    pub servers: Vec<Server>,
}

/// A project folder in another tool's www folder.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Candidate {
    pub name: String,
    pub path: String,
    pub kind: String,
    /// NexDB already has a project with this name.
    pub taken: bool,
}

/// A database server another tool installed.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Server {
    /// "mysql", "mariadb" or "postgres".
    pub engine: String,
    pub version: Option<String>,
    /// The folder with its client tools (mysqldump.exe, pg_dump.exe).
    pub bin: String,
    pub port: u16,
    /// Its usual admin user (root, postgres).
    pub user: String,
    /// Whether something answers on its port right now.
    #[serde(default)]
    pub running: bool,
    /// Its server program and data folder, so NexDB can start it briefly on a spare port when
    /// it isn't running (or its port is NexDB's).
    #[serde(default)]
    pub mysqld: Option<String>,
    #[serde(default)]
    pub data: Option<String>,
    /// It is set to the same port as NexDB's MySQL, so the two can't run at once.
    #[serde(default)]
    pub same_port: bool,
}

/// Folders XAMPP ships in htdocs, which aren't projects.
const NOT_PROJECTS: &[&str] = &["dashboard", "img", "webalizer", "xampp", "forbidden", "restricted", "phpmyadmin"];
/// Databases every server has, which aren't the user's.
const SYSTEM_DBS: &[&str] = &["information_schema", "mysql", "performance_schema", "sys", "phpmyadmin", "postgres"];

fn glob_dirs(parent: &Path) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = fs::read_dir(parent).into_iter().flatten().flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
    dirs.sort();
    dirs
}

/// `port=3306` from a my.ini, or `port = 5432` from a postgresql.conf.
pub fn port_in(conf: &str) -> Option<u16> {
    conf.lines().find_map(|l| {
        let l = l.trim();
        let (k, v) = l.split_once('=')?;
        if k.trim() != "port" {
            return None;
        }
        v.split('#').next()?.trim().parse().ok()
    })
}

/// `datadir=C:/laragon/data/mysql-8` from a my.ini.
fn datadir_in(conf: &str) -> Option<PathBuf> {
    conf.lines().find_map(|l| {
        let (k, v) = l.trim().split_once('=')?;
        (k.trim() == "datadir").then(|| PathBuf::from(v.trim().trim_matches('"')))
    })
}

/// MySQL or MariaDB servers under `bins` (each version in its own folder with a bin folder).
/// `data` guesses the data folder when its my.ini doesn't say.
fn mysql_servers(version_dirs: &[PathBuf], default_port: u16, data: &dyn Fn(&Path) -> Option<PathBuf>) -> Vec<Server> {
    version_dirs
        .iter()
        .filter(|d| d.join("bin").join("mysqldump.exe").is_file() || d.join("bin").join("mariadb-dump.exe").is_file())
        .map(|d| {
            let name = d.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
            let ini = ["my.ini", "bin/my.ini"].iter().find_map(|f| fs::read_to_string(d.join(f)).ok());
            let mariadb = name.contains("mariadb") || d.join("bin").join("mariadb-dump.exe").is_file();
            let mysqld = d.join("bin").join("mysqld.exe");
            let data = ini.as_deref().and_then(datadir_in).or_else(|| data(d)).filter(|p| p.join("mysql").is_dir());
            Server {
                engine: if mariadb { "mariadb" } else { "mysql" }.into(),
                version: crate::scan::extract_version(&name, None),
                bin: d.join("bin").display().to_string(),
                port: ini.as_deref().and_then(port_in).unwrap_or(default_port),
                user: "root".into(),
                running: false,
                mysqld: mysqld.is_file().then(|| mysqld.display().to_string()),
                data: data.map(|p| p.display().to_string()),
                same_port: false,
            }
        })
        .collect()
}

fn candidates(www: &Path, nexdb_www: &Path) -> Vec<Candidate> {
    glob_dirs(www)
        .into_iter()
        .filter_map(|p| {
            let name = p.file_name()?.to_string_lossy().to_string();
            if name.starts_with('.') || NOT_PROJECTS.contains(&name.to_lowercase().as_str()) {
                return None;
            }
            Some(Candidate {
                taken: nexdb_www.join(&name).exists(),
                kind: crate::projects::detect_kind(&p).into(),
                path: p.display().to_string(),
                name,
            })
        })
        .collect()
}

/// Every tool found, with its projects and database servers. NexDB's own install is skipped.
pub fn sources(root: &Path, settings: &Settings) -> Vec<Source> {
    let nexdb_www = PathBuf::from(&settings.www_dir);
    let mut out = Vec::new();
    for drive in ["C", "D"] {
        let laragon = PathBuf::from(format!(r"{drive}:\laragon"));
        if laragon.join("laragon.exe").is_file() {
            let www = laragon.join("www");
            let mut dirs = glob_dirs(&laragon.join("bin").join("mysql"));
            dirs.extend(glob_dirs(&laragon.join("bin").join("mariadb")));
            // Laragon keeps data in data\mysql-8 for mysql-8.0.30-winx64.
            let data_root = laragon.join("data");
            let laragon_data = move |d: &Path| {
                let name = d.file_name()?.to_string_lossy().to_lowercase();
                let (kind, rest) = name.split_once('-')?;
                let major = rest.split('.').next()?;
                Some(data_root.join(format!("{kind}-{major}")))
            };
            out.push(source("laragon", "Laragon", &laragon, Some(&www), &nexdb_www, mysql_servers(&dirs, 3306, &laragon_data)));
        }
        let xampp = PathBuf::from(format!(r"{drive}:\xampp"));
        if xampp.join("htdocs").is_dir() {
            let servers = mysql_servers(&[xampp.join("mysql")], 3306, &|d| Some(d.join("data")));
            out.push(source("xampp", "XAMPP", &xampp, Some(&xampp.join("htdocs")), &nexdb_www, servers));
        }
        for wamp in ["wamp64", "wamp"] {
            let wamp = PathBuf::from(format!(r"{drive}:\{wamp}"));
            if wamp.join("www").is_dir() && wamp.join("bin").is_dir() {
                let own = |d: &Path| Some(d.join("data"));
                let mut servers = mysql_servers(&glob_dirs(&wamp.join("bin").join("mysql")), 3306, &own);
                servers.extend(mysql_servers(&glob_dirs(&wamp.join("bin").join("mariadb")), 3307, &own));
                out.push(source("wamp", "WAMP", &wamp, Some(&wamp.join("www")), &nexdb_www, servers));
            }
        }
    }
    // Standalone servers from their installers.
    // Standalone servers from their installers: "MySQL\MySQL Server 8.0", "MariaDB 11.4".
    let mut dirs = glob_dirs(Path::new(r"C:\Program Files\MySQL"));
    dirs.extend(glob_dirs(Path::new(r"C:\Program Files")).into_iter().filter(|d| {
        d.file_name().is_some_and(|n| n.to_string_lossy().to_lowercase().starts_with("mariadb"))
    }));
    for s in mysql_servers(&dirs, 3306, &|_| None) {
        let engine = if s.engine == "mysql" { "MySQL" } else { "MariaDB" };
        let label = format!("{engine} {}", s.version.clone().unwrap_or_default());
        let path = Path::new(&s.bin).parent().map(Path::to_path_buf).unwrap_or_default();
        out.push(source(&format!("{}-{}", s.engine, out.len()), label.trim(), &path, None, &nexdb_www, vec![s]));
    }
    for dir in glob_dirs(Path::new(r"C:\Program Files\PostgreSQL")) {
        if !dir.join("bin").join("pg_dump.exe").is_file() {
            continue;
        }
        let version = dir.file_name().map(|n| n.to_string_lossy().to_string());
        let port = fs::read_to_string(dir.join("data").join("postgresql.conf")).ok().as_deref().and_then(port_in).unwrap_or(5432);
        let server = Server {
            engine: "postgres".into(),
            version: version.clone(),
            bin: dir.join("bin").display().to_string(),
            port,
            user: "postgres".into(),
            running: false,
            mysqld: None,
            data: None,
            same_port: false,
        };
        let label = format!("PostgreSQL {}", version.unwrap_or_default());
        out.push(source(&format!("postgres-{}", out.len()), label.trim(), &dir, None, &nexdb_www, vec![server]));
    }
    out.retain(|s| !Path::new(&s.path).starts_with(root));
    let nexdb_mysql = settings.mysql.as_ref().map(|m| m.port);
    for s in &mut out {
        for server in &mut s.servers {
            let nexdb_port = if server.engine == "postgres" { Some(crate::supervisor::POSTGRES_PORT) } else { nexdb_mysql };
            server.same_port = nexdb_port == Some(server.port);
            server.running = !server.same_port && crate::supervisor::port_listening(server.port);
        }
    }
    out
}

/// Another install's MySQL started by NexDB on a spare port with its own program and data
/// folder, for as long as an import needs it. Its own users and passwords apply, and only this
/// PC can connect. It is shut down cleanly when dropped.
pub struct TempServer {
    child: std::process::Child,
    pub port: u16,
    admin: PathBuf,
    root: PathBuf,
    user: String,
    password: Option<String>,
    #[cfg(windows)]
    _job: crate::supervisor::job::Job,
}

impl TempServer {
    pub fn start(root: &Path, server: &Server, password: Option<&str>) -> Result<TempServer, String> {
        let (Some(mysqld), Some(data)) = (&server.mysqld, &server.data) else {
            return Err(format!("Start that database server (port {}) in its own app, then try again.", server.port));
        };
        let port = crate::scan::suggest_port(3390).ok_or("No free port to start the other MySQL on.")?;
        let mysqld = Path::new(mysqld);
        let base = mysqld.parent().and_then(Path::parent).ok_or("The other MySQL's folder is odd.")?;
        let log = root.join("logs").join("import-mysqld.log");
        fs::create_dir_all(log.parent().unwrap()).map_err(|e| e.to_string())?;
        let out = fs::File::create(&log).map_err(|e| e.to_string())?;
        let mut cmd = Command::new(mysqld);
        // Its my.ini is skipped: it names the port NexDB uses.
        cmd.arg("--no-defaults")
            .arg(format!("--basedir={}", base.display()))
            .arg(format!("--datadir={data}"))
            .arg(format!("--port={port}"))
            .args(["--bind-address=127.0.0.1", "--console"]);
        if server.engine == "mysql" {
            cmd.args(["--mysqlx=OFF", "--skip-log-bin"]);
        }
        cmd.stdin(Stdio::null()).stdout(out.try_clone().map_err(|e| e.to_string())?).stderr(out);
        hidden(&mut cmd);
        let mut child = cmd.spawn().map_err(|e| format!("Couldn't start the other MySQL: {e}"))?;
        #[cfg(windows)]
        let job = match crate::supervisor::job::Job::kill_on_close().and_then(|j| j.assign(&child).map(|_| j)) {
            Ok(job) => job,
            Err(e) => {
                let _ = child.kill();
                return Err(format!("Couldn't contain the other MySQL: {e}"));
            }
        };
        let bin = Path::new(&server.bin);
        let admin = if bin.join("mysqladmin.exe").is_file() { bin.join("mysqladmin.exe") } else { bin.join("mariadb-admin.exe") };
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(90);
        loop {
            if crate::supervisor::port_listening(port) {
                return Ok(TempServer {
                    child,
                    port,
                    admin,
                    root: root.to_path_buf(),
                    user: server.user.clone(),
                    password: password.map(String::from),
                    #[cfg(windows)]
                    _job: job,
                });
            }
            if let Ok(Some(_)) = child.try_wait() {
                let text = fs::read_to_string(&log).unwrap_or_default();
                return Err(if text.contains("Unable to lock") || text.contains("in use by another") {
                    format!("That MySQL is already running somewhere. Connect to it on its own port (usually {}) instead.", server.port)
                } else {
                    let last = text.lines().filter(|l| l.contains("ERROR")).last().unwrap_or("it stopped without saying why");
                    format!("The other MySQL didn't start: {}", last.trim())
                });
            }
            if std::time::Instant::now() >= deadline {
                let _ = child.kill();
                return Err("The other MySQL took too long to start.".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
    }
}

impl Drop for TempServer {
    fn drop(&mut self) {
        // A clean shutdown, so its data folder is left as its own app expects it.
        if let Ok(options) = crate::backup::ClientOptions::for_user(&self.root, self.port, &self.user, self.password.as_deref()) {
            let _ = hidden(
                Command::new(&self.admin)
                    .arg(options.arg())
                    .arg("shutdown")
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null()),
            )
            .status();
        }
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
        while std::time::Instant::now() < deadline {
            if let Ok(Some(_)) = self.child.try_wait() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// How to reach a MySQL server: on its own port when it runs there (and that port isn't
/// NexDB's), else started briefly by NexDB. Returns the port and the temporary server to keep
/// alive while it's used.
pub fn reach(root: &Path, server: &Server, password: Option<&str>) -> Result<(u16, Option<TempServer>), String> {
    if !server.same_port && crate::supervisor::port_listening(server.port) {
        return Ok((server.port, None));
    }
    let temp = TempServer::start(root, server, password)?;
    Ok((temp.port, Some(temp)))
}

fn source(id: &str, label: &str, path: &Path, www: Option<&Path>, nexdb_www: &Path, servers: Vec<Server>) -> Source {
    Source {
        id: id.into(),
        label: label.into(),
        path: path.display().to_string(),
        www: www.filter(|w| w.is_dir()).map(|w| w.display().to_string()),
        projects: www.map(|w| candidates(w, nexdb_www)).unwrap_or_default(),
        servers,
    }
}

fn hidden(cmd: &mut Command) -> &mut Command {
    crate::backup::hidden(cmd)
}

/// The user's databases on another server, asked with its own client.
pub fn databases(root: &Path, server: &Server, password: Option<&str>) -> Result<Vec<String>, String> {
    let bin = Path::new(&server.bin);
    let mut _temp = None;
    let mut port = server.port;
    if server.engine != "postgres" {
        let (p, temp) = reach(root, server, password)?;
        (port, _temp) = (p, temp);
    }
    let out = if server.engine == "postgres" {
        hidden(
            Command::new(bin.join("psql.exe"))
                .args(["-h", "127.0.0.1", "-p", &server.port.to_string(), "-U", &server.user, "-At", "-d", "postgres"])
                .args(["-c", "SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1"])
                .env("PGPASSWORD", password.unwrap_or_default())
                .env("PGCONNECT_TIMEOUT", "5")
                .stdin(Stdio::null()),
        )
        .output()
    } else {
        let options = crate::backup::ClientOptions::for_user(root, port, &server.user, password)?;
        let client = if bin.join("mysql.exe").is_file() { bin.join("mysql.exe") } else { bin.join("mariadb.exe") };
        let out = hidden(
            Command::new(client)
                .arg(options.arg())
                .args(["-N", "-B", "--connect-timeout=5", "-e", "SELECT schema_name FROM information_schema.schemata ORDER BY 1"])
                .stdin(Stdio::null()),
        )
        .output();
        drop(options);
        out
    }
    .map_err(|e| format!("Couldn't run the database client: {e}"))?;
    if !out.status.success() {
        return Err(server_error(server, &String::from_utf8_lossy(&out.stderr)));
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .filter(|n| !n.is_empty() && !SYSTEM_DBS.contains(&n.to_lowercase().as_str()))
        .map(String::from)
        .collect())
}

/// Why another server refused, in plain words.
fn server_error(server: &Server, stderr: &str) -> String {
    let port = server.port;
    if stderr.contains("2003") || stderr.contains("Can't connect") || stderr.contains("Connection refused") || stderr.contains("could not connect") {
        format!("Nothing answers on port {port}. Start that database server (in its own app), then try again.")
    } else if stderr.contains("1045") || stderr.contains("Access denied") || stderr.contains("password authentication failed") || stderr.contains("no password supplied") {
        format!("The server on port {port} refused user {} with that password.", server.user)
    } else {
        crate::backup::mysql_error(stderr)
    }
}

/// What to import: project folders, and databases from other servers.
#[derive(Debug, Deserialize)]
pub struct Plan {
    pub projects: Vec<ProjectPick>,
    pub databases: Vec<DatabasePick>,
}

#[derive(Debug, Deserialize)]
pub struct ProjectPick {
    pub path: String,
    /// Its name in NexDB.
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct DatabasePick {
    pub server: Server,
    #[serde(default)]
    pub password: Option<String>,
    pub name: String,
}

/// Where NexDB's databases are: its MySQL (port, root password) and its PostgreSQL.
pub struct Target<'a> {
    pub root: &'a Path,
    pub settings: &'a Settings,
    pub mysql_bin: Option<PathBuf>,
    pub mysql_port: Option<u16>,
    pub root_password: Option<String>,
    /// NexDB's PostgreSQL folder, when installed.
    pub postgres_dir: Option<PathBuf>,
}

/// Copies the picked projects and loads the picked databases, step by step, as `quickstart`
/// events under "import". A step that fails is reported and the others go on. Returns notes.
pub fn run(emit: Emit, t: &Target, plan: &Plan) -> Result<Vec<String>, String> {
    let name = "import";
    let mut steps: Vec<String> = plan.projects.iter().map(|p| format!("Copy the project {}", p.name)).collect();
    steps.extend(plan.databases.iter().map(|d| format!("Copy the database {}", d.name)));
    emit(Event::Plan { name: name.into(), steps });
    let line = |text: String| emit(Event::Line { name: name.into(), text });
    let mut notes = Vec::new();
    let mut failed = 0;
    let mut index = 0;
    let www = PathBuf::from(&t.settings.www_dir);
    let mut copied: Vec<PathBuf> = Vec::new();
    for p in &plan.projects {
        emit(Event::Step { name: name.into(), index, status: "running" });
        let target = www.join(&p.name);
        match copy_project(Path::new(&p.path), &target, &line) {
            Ok(()) => copied.push(target),
            Err(e) => {
                failed += 1;
                notes.push(format!("{}: {e}", p.name));
            }
        }
        emit(Event::Step { name: name.into(), index, status: "done" });
        index += 1;
    }
    let mut loaded: Vec<String> = Vec::new();
    // Other MySQL servers NexDB started, kept running until every database from them is copied.
    let mut started: std::collections::HashMap<String, (u16, Option<TempServer>)> = Default::default();
    for d in &plan.databases {
        emit(Event::Step { name: name.into(), index, status: "running" });
        let result = if d.server.engine == "postgres" {
            copy_postgres(t, d, &line)
        } else {
            let way = match started.get(&d.server.bin) {
                Some((port, _)) => Ok(*port),
                None => {
                    if d.server.same_port || !crate::supervisor::port_listening(d.server.port) {
                        line(format!("Starting the other MySQL briefly on a spare port (its data folder: {})", d.server.data.clone().unwrap_or_default()));
                    }
                    reach(t.root, &d.server, d.password.as_deref()).map(|(port, temp)| {
                        started.insert(d.server.bin.clone(), (port, temp));
                        port
                    })
                }
            };
            way.and_then(|port| copy_mysql(t, d, port, &line))
        };
        match result {
            Ok(note) => {
                loaded.push(d.name.to_lowercase());
                notes.extend(note);
            }
            Err(e) => {
                failed += 1;
                notes.push(format!("{}: {e}", d.name));
            }
        }
        emit(Event::Step { name: name.into(), index, status: "done" });
        index += 1;
    }
    if !started.is_empty() {
        line("Stopping the other MySQL again.".into());
    }
    drop(started);
    // Copied Laravel apps whose database came along get a user of their own on NexDB's MySQL.
    for dir in &copied {
        for (folder, app) in laravel_apps(dir) {
            match point_env_at_nexdb(t, &app, &loaded) {
                Ok(Some(db)) => notes.push(format!("{} now uses NexDB's MySQL for {db}.", folder_label(dir, &folder))),
                Ok(None) => {}
                Err(e) => notes.push(format!("{}: {e}", folder_label(dir, &folder))),
            }
        }
        if dir.join("wp-config.php").is_file() {
            let n = dir.file_name().unwrap_or_default().to_string_lossy();
            notes.push(format!("{n} is WordPress: check DB_NAME, DB_USER, DB_PASSWORD and DB_HOST in its wp-config.php."));
        }
    }
    if failed > 0 && failed == plan.projects.len() + plan.databases.len() {
        return Err(notes.join("\n"));
    }
    Ok(notes)
}

fn folder_label(dir: &Path, folder: &str) -> String {
    let n = dir.file_name().unwrap_or_default().to_string_lossy().to_string();
    if folder.is_empty() { n } else { format!("{n}/{folder}") }
}

/// The project's Laravel apps: the folder itself and/or ones one level down.
fn laravel_apps(dir: &Path) -> Vec<(String, PathBuf)> {
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    if dir.join("artisan").is_file() {
        out.push((String::new(), dir.to_path_buf()));
    }
    for sub in glob_dirs(dir) {
        if sub.join("artisan").is_file() {
            out.push((sub.file_name().unwrap_or_default().to_string_lossy().to_string(), sub));
        }
    }
    out
}

/// Copies a project folder with robocopy (long paths, locked files retried briefly). Junctions
/// are left out, so a pnpm `node_modules` may need `npm install` again.
fn copy_project(from: &Path, to: &Path, line: &dyn Fn(String)) -> Result<(), String> {
    if !from.is_dir() {
        return Err("The folder isn't there any more.".into());
    }
    if to.exists() {
        return Err(format!("NexDB already has a project named {}. Pick another name.", to.file_name().unwrap_or_default().to_string_lossy()));
    }
    if crate::projects::host_label(&to.file_name().unwrap_or_default().to_string_lossy()).is_none() {
        line("The name has capitals or spaces, so it gets no .test address; it opens at localhost/name.".into());
    }
    line(format!("> robocopy \"{}\" \"{}\"", from.display(), to.display()));
    let out = hidden(
        Command::new("robocopy")
            .arg(from)
            .arg(to)
            .args(["/E", "/XJ", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NP", "/MT:8"])
            .stdin(Stdio::null()),
    )
    .output()
    .map_err(|e| format!("Couldn't run robocopy: {e}"))?;
    // robocopy: below 8 means copied (with or without extras), 8 and up means some files failed.
    let code = out.status.code().unwrap_or(16);
    let text = String::from_utf8_lossy(&out.stdout);
    for l in text.lines().map(str::trim).filter(|l| l.starts_with("Files :") || l.starts_with("Bytes :")) {
        line(l.to_string());
    }
    if code >= 8 {
        return Err(format!("Some files couldn't be copied (robocopy code {code}). Close programs using them and try again."));
    }
    Ok(())
}

/// A MySQL dump from a MariaDB server can name collations MySQL doesn't have.
pub fn mysql_compatible(sql: &str) -> std::borrow::Cow<'_, str> {
    if !sql.contains("uca1400") {
        return std::borrow::Cow::Borrowed(sql);
    }
    let mut s = sql.to_string();
    for (from, to) in [
        ("utf8mb4_uca1400_ai_ci", "utf8mb4_unicode_ci"),
        ("utf8mb4_uca1400_as_cs", "utf8mb4_bin"),
        ("utf8mb3_uca1400_ai_ci", "utf8mb3_unicode_ci"),
        ("uca1400_ai_ci", "utf8mb4_unicode_ci"),
    ] {
        s = s.replace(from, to);
    }
    std::borrow::Cow::Owned(s)
}

/// Dumps a database with the other server's own mysqldump and loads it into a new database of
/// the same name in NexDB's MySQL. An existing database in NexDB is never overwritten.
fn copy_mysql(t: &Target, d: &DatabasePick, source_port: u16, line: &dyn Fn(String)) -> Result<Option<String>, String> {
    let (bin, port) = t.mysql_bin.as_ref().zip(t.mysql_port).ok_or("NexDB's MySQL isn't installed.")?;
    if !crate::supervisor::port_listening(port) {
        return Err("NexDB's MySQL isn't running. Start it on the Dashboard, then try again.".into());
    }
    if !crate::db::valid_name(&d.name) {
        return Err(format!("\"{}\" can't be a database name in NexDB.", d.name));
    }
    let db = crate::db::Db::default();
    db.connect(port, t.root_password.as_deref()).map_err(|e| {
        if e == "NEEDS_PASSWORD" {
            "NexDB needs your MySQL password: open the Database page and connect once, then try again.".to_string()
        } else {
            e
        }
    })?;
    if db.databases()?.iter().any(|x| x.name.eq_ignore_ascii_case(&d.name)) {
        db.disconnect();
        return Err("NexDB already has a database with this name, so it was left as it is.".into());
    }

    let tmp = t.root.join("tmp");
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let file = tmp.join(format!("import-{}.sql", d.name));
    let source_bin = Path::new(&d.server.bin);
    let dump = if source_bin.join("mysqldump.exe").is_file() { source_bin.join("mysqldump.exe") } else { source_bin.join("mariadb-dump.exe") };
    line(format!("> mysqldump {} (port {source_port})", d.name));
    let options = crate::backup::ClientOptions::for_user(t.root, source_port, &d.server.user, d.password.as_deref())?;
    let mut args = vec!["--single-transaction", "--routines", "--events", "--triggers", "--default-character-set=utf8mb4", "--no-tablespaces"];
    if d.server.engine == "mysql" {
        args.push("--set-gtid-purged=OFF");
    }
    let out = hidden(
        Command::new(dump)
            .arg(options.arg())
            .args(&args)
            .arg(format!("--result-file={}", file.display()))
            .arg(&d.name)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped()),
    )
    .output()
    .map_err(|e| format!("Couldn't run the other server's mysqldump: {e}"))?;
    drop(options);
    if !out.status.success() {
        let _ = fs::remove_file(&file);
        db.disconnect();
        return Err(server_error(&d.server, &String::from_utf8_lossy(&out.stderr)));
    }
    if let Ok(sql) = fs::read_to_string(&file) {
        if let std::borrow::Cow::Owned(fixed) = mysql_compatible(&sql) {
            fs::write(&file, fixed).map_err(|e| e.to_string())?;
            line("Changed MariaDB-only collations to MySQL ones.".into());
        }
    }
    db.create_database(&d.name)?;
    db.disconnect();
    line(format!("> mysql {} < dump", d.name));
    let loaded = crate::backup::import(bin, t.root, port, t.root_password.as_deref(), &d.name, &file);
    let _ = fs::remove_file(&file);
    if let Err(e) = loaded {
        // An empty or half-loaded database would look imported; take it away again.
        let db = crate::db::Db::default();
        if db.connect(port, t.root_password.as_deref()).is_ok() {
            let _ = db.drop_database(&d.name);
            db.disconnect();
        }
        return Err(e);
    }
    Ok(None)
}

/// Dumps a PostgreSQL database with the other server's pg_dump and loads it into NexDB's.
fn copy_postgres(t: &Target, d: &DatabasePick, line: &dyn Fn(String)) -> Result<Option<String>, String> {
    let dir = t.postgres_dir.as_ref().ok_or("NexDB's PostgreSQL isn't installed. Install it on the Versions page first.")?;
    let port = crate::supervisor::POSTGRES_PORT;
    if d.server.port == port {
        return Err(format!(
            "The other PostgreSQL uses port {port} like NexDB's, so both can't run at once. Change its port in its postgresql.conf, restart it, then try again."
        ));
    }
    if !crate::supervisor::port_listening(port) {
        return Err("NexDB's PostgreSQL isn't running. Start it on the Dashboard, then try again.".into());
    }
    if !d.name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err(format!("\"{}\" can't be copied from here.", d.name));
    }
    let tmp = t.root.join("tmp");
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let file = tmp.join(format!("import-{}.pgsql", d.name));
    line(format!("> pg_dump {} (port {})", d.name, d.server.port));
    let out = hidden(
        Command::new(Path::new(&d.server.bin).join("pg_dump.exe"))
            .args(["-h", "127.0.0.1", "-p", &d.server.port.to_string(), "-U", &d.server.user])
            .args(["--no-owner", "--no-acl", "-f"])
            .arg(&file)
            .arg(&d.name)
            .env("PGPASSWORD", d.password.clone().unwrap_or_default())
            .stdin(Stdio::null())
            .stderr(Stdio::piped()),
    )
    .output()
    .map_err(|e| format!("Couldn't run pg_dump: {e}"))?;
    if !out.status.success() {
        let _ = fs::remove_file(&file);
        return Err(server_error(&d.server, &String::from_utf8_lossy(&out.stderr)));
    }
    let psql = dir.join("bin").join("psql.exe");
    let run = |args: &[&str]| {
        hidden(Command::new(&psql).args(["-h", "127.0.0.1", "-p", &port.to_string(), "-U", "postgres", "-v", "ON_ERROR_STOP=1"]).args(args).stdin(Stdio::null()))
            .output()
            .map_err(|e| format!("Couldn't run psql: {e}"))
    };
    let created = run(&["-d", "postgres", "-c", &format!("CREATE DATABASE \"{}\"", d.name)])?;
    if !created.status.success() {
        let _ = fs::remove_file(&file);
        let err = String::from_utf8_lossy(&created.stderr);
        return Err(if err.contains("already exists") {
            "NexDB's PostgreSQL already has a database with this name, so it was left as it is.".into()
        } else {
            err.trim().to_string()
        });
    }
    line(format!("> psql {} < dump", d.name));
    let loaded = run(&["-d", &d.name, "-q", "-f", &file.display().to_string()])?;
    let _ = fs::remove_file(&file);
    if !loaded.status.success() {
        let _ = run(&["-d", "postgres", "-c", &format!("DROP DATABASE \"{}\"", d.name)]);
        let err = String::from_utf8_lossy(&loaded.stderr);
        return Err(err.lines().last().unwrap_or("psql stopped with an error.").trim().to_string());
    }
    Ok(Some(format!("{} is in NexDB's PostgreSQL (user postgres, port {port}).", d.name)))
}

/// Points a copied Laravel app's .env at NexDB's MySQL, with a user of its own, when its
/// database was imported (or already exists there). Returns the database name when changed.
fn point_env_at_nexdb(t: &Target, app: &Path, loaded: &[String]) -> Result<Option<String>, String> {
    let env_path = app.join(".env");
    let Ok(env) = fs::read_to_string(&env_path) else { return Ok(None) };
    let connection = crate::quickstart::env_value(&env, "DB_CONNECTION").unwrap_or_default();
    if !matches!(connection.as_str(), "mysql" | "mariadb") {
        return Ok(None);
    }
    let Some(name) = crate::quickstart::env_value(&env, "DB_DATABASE") else { return Ok(None) };
    if !loaded.contains(&name.to_lowercase()) {
        return Ok(None);
    }
    let port = t.mysql_port.ok_or("NexDB's MySQL isn't installed.")?;
    let (db, _) = crate::quickstart::ensure_database(t.root_password.as_deref(), port, &name)?;
    let mut text = env;
    for (key, value) in [
        ("DB_HOST", "127.0.0.1".to_string()),
        ("DB_PORT", db.port.to_string()),
        ("DB_USERNAME", db.user.clone()),
        ("DB_PASSWORD", db.password.clone()),
    ] {
        text = crate::quickstart::set_env(&text, key, &value);
    }
    fs::write(&env_path, text).map_err(|e| format!("Couldn't update .env: {e}"))?;
    Ok(Some(db.name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_ports_from_server_configs() {
        assert_eq!(port_in("[client]\nport=3306\n[mysqld]\nport=3306"), Some(3306));
        assert_eq!(port_in("#port = 1\nlisten_addresses = '*'\nport = 5433\t\t# (change requires restart)"), Some(5433));
        assert_eq!(port_in("max_port=4"), None);
    }

    #[test]
    fn finds_laragon_style_installs() {
        let dir = tempfile::tempdir().unwrap();
        let mysql = dir.path().join("bin/mysql/mysql-8.0.30-winx64");
        fs::create_dir_all(mysql.join("bin")).unwrap();
        fs::write(mysql.join("bin/mysqldump.exe"), "").unwrap();
        fs::write(mysql.join("my.ini"), "[mysqld]\nport=3310\n").unwrap();
        let servers = mysql_servers(&glob_dirs(&dir.path().join("bin/mysql")), 3306, &|_| None);
        assert_eq!(servers.len(), 1);
        assert_eq!((servers[0].engine.as_str(), servers[0].port, servers[0].version.as_deref()), ("mysql", 3310, Some("8.0.30")));

        let www = dir.path().join("www");
        for p in ["shop", "dashboard", ".git", "parish"] {
            fs::create_dir_all(www.join(p)).unwrap();
        }
        let nexdb = dir.path().join("nexdb-www");
        fs::create_dir_all(nexdb.join("parish")).unwrap();
        let found = candidates(&www, &nexdb);
        let names: Vec<(&str, bool)> = found.iter().map(|c| (c.name.as_str(), c.taken)).collect();
        assert_eq!(names, [("parish", true), ("shop", false)], "XAMPP's own folders and hidden ones are skipped");
    }

    /// Finds this PC's Laragon, lists its MySQL databases (starting Laragon's MySQL briefly
    /// when it isn't running or shares NexDB's port), and copies its smallest project into a
    /// temp www folder. When NexDB's MySQL runs with no root password, one database is copied too.
    /// `cargo test real_import_from_laragon -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_import_from_laragon() {
        let root = Path::new(r"C:\NexDB");
        let mut settings = crate::settings::load(root).expect("NexDB must be installed in C:/NexDB");
        let found = sources(root, &settings);
        let laragon = found.iter().find(|s| s.id == "laragon").expect("Laragon must be installed");
        println!("{} projects; servers: {:?}", laragon.projects.len(), laragon.servers);
        let server = laragon.servers.first().expect("Laragon has a MySQL");
        let dbs = databases(root, server, None).unwrap();
        println!("databases: {dbs:?}");
        assert!(!dbs.iter().any(|d| d == "mysql" || d == "sys"), "system databases are left out");
        assert!(!crate::supervisor::port_listening(3390) || server.running, "the temporary server is stopped again");

        let tmp = tempfile::tempdir().unwrap();
        settings.www_dir = tmp.path().display().to_string();
        let small = laragon
            .projects
            .iter()
            .min_by_key(|p| fs::read_dir(&p.path).map(|d| d.count()).unwrap_or(usize::MAX))
            .unwrap();
        let mysql_port = settings.mysql.as_ref().map(|m| m.port);
        // A Laragon database NexDB doesn't have yet; it is dropped again at the end.
        let nexdb = crate::db::Db::default();
        let pick_db = match mysql_port.map(|p| nexdb.connect(p, None)) {
            Some(Ok(_)) => {
                let have: Vec<String> = nexdb.databases().unwrap().into_iter().map(|d| d.name.to_lowercase()).collect();
                dbs.iter().find(|d| !have.contains(&d.to_lowercase()) && crate::db::valid_name(d)).cloned()
            }
            _ => None,
        };
        let mysql_bin = settings.components.iter().find(|c| c.id == "mysql").map(|c| {
            let p = PathBuf::from(&c.path);
            if p.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) { p.parent().unwrap().to_path_buf() } else { p.join("bin") }
        });
        let target = Target {
            root,
            settings: &settings,
            mysql_bin,
            mysql_port,
            root_password: None,
            postgres_dir: None,
        };
        let plan = Plan {
            projects: vec![ProjectPick { path: small.path.clone(), name: "imported".into() }],
            databases: pick_db.iter().map(|d| DatabasePick { server: server.clone(), password: None, name: d.clone() }).collect(),
        };
        let lines = std::sync::Mutex::new(Vec::new());
        let emit = |e: Event| {
            if let Event::Line { text, .. } = e {
                lines.lock().unwrap().push(text);
            }
        };
        let notes = run(&emit, &target, &plan).unwrap();
        println!("copied {} -> imported: {notes:?}\n{}", small.name, lines.lock().unwrap().join("\n"));
        assert!(tmp.path().join("imported").is_dir());
        assert!(Path::new(&small.path).is_dir(), "the original stays");
        match pick_db {
            Some(d) => {
                let tables = nexdb.tables(&d).unwrap();
                println!("database copy: {d} has {} tables in NexDB", tables.len());
                assert!(!tables.is_empty(), "{d} was copied with its tables");
                nexdb.drop_database(&d).unwrap();
            }
            None => println!("database copy: skipped (NexDB's MySQL needs its password, or has every database)"),
        }
        assert!(!crate::supervisor::port_listening(3390), "the other MySQL is stopped again");
    }

    #[test]
    fn mariadb_collations_become_mysql_ones() {
        let sql = "CREATE TABLE t (a varchar(9)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;";
        assert_eq!(mysql_compatible(sql), "CREATE TABLE t (a varchar(9)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
        assert!(matches!(mysql_compatible("plain"), std::borrow::Cow::Borrowed(_)));
    }
}
