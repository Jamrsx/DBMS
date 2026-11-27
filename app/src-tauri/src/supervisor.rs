//! Starts, stops and watches the stack's services (Apache, nginx, PHP FastCGI, MySQL).
//! Services keep running when NexDB quits, like XAMPP's: only Stop (or Stop all in the tray)
//! stops them, through the shutdown signal each service's own tools use. NexDB writes the
//! running services (id, process id, program, start time) to `etc/services-running.json`, and on
//! the next launch takes back the ones still alive whose program is the same file, so the
//! dashboard shows them as Running and Stop and Logs work by process id. Uninstalling stops them.

use crate::settings::Settings;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const START_TIMEOUT: Duration = Duration::from_secs(30);
const STOP_TIMEOUT: Duration = Duration::from_secs(20);
const LOG_TAIL_BYTES: u64 = 48 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopMethod {
    /// Apache's `ap<pid>_shutdown` event, the signal `httpd -k shutdown` sends.
    ApacheEvent,
    /// MySQL's `mysqld<pid>_shutdown` event, so InnoDB shuts down cleanly without a password.
    MysqlEvent,
    /// `nginx -s quit` with the same prefix and config.
    NginxQuit,
    /// `redis-cli shutdown`, so Redis saves its data before it exits.
    RedisShutdown,
    /// `pg_ctl stop -m fast` on the same data folder: a clean PostgreSQL shutdown.
    PgCtl,
    /// MongoDB's own `shutdown` command over its port, so it closes its files cleanly.
    MongoShutdown,
    /// Stateless (php-cgi): end the process.
    Kill,
}

#[derive(Debug, Clone)]
pub struct ServiceSpec {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub exe: PathBuf,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub port: u16,
    /// False for installs DevManager only watches (an existing MySQL).
    pub managed: bool,
    pub stop: StopMethod,
    /// The file the dashboard shows as this service's log.
    pub log: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Stopped,
    Starting,
    Running,
    Failed,
    /// Not managed by DevManager; running or not according to its port.
    External,
}

#[derive(Debug, Serialize)]
pub struct ServiceStatus {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub port: u16,
    pub managed: bool,
    pub state: State,
    /// For external services: whether something answers on the port.
    pub listening: bool,
    pub pid: Option<u32>,
    pub uptime_secs: Option<u64>,
    pub message: Option<String>,
    /// It couldn't start because another program holds its port, so the dashboard can offer
    /// the next free port.
    pub port_taken: bool,
}

/// A service NexDB started: by this NexDB (with its `Child`) or by an earlier one that has since
/// quit (taken back by process id).
struct Running {
    pid: u32,
    /// Only for services this NexDB started; on macOS waiting on it also clears the ended process.
    child: Option<Child>,
    /// Seconds since 1970, so the uptime carries over a NexDB restart.
    started: u64,
}

impl Running {
    /// Some once the process has ended, with its exit code when NexDB can know it.
    fn ended(&mut self) -> Option<Option<i32>> {
        match &mut self.child {
            Some(child) => child.try_wait().ok().flatten().map(|s| s.code()),
            None => (!pid_alive(self.pid)).then_some(None),
        }
    }
}

/// Why a launch failed, and whether it was because the port was taken.
struct LaunchError {
    message: String,
    port_taken: bool,
}

impl From<String> for LaunchError {
    fn from(message: String) -> Self {
        LaunchError { message, port_taken: false }
    }
}

/// One entry of `etc/services-running.json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, serde::Deserialize)]
pub struct SavedService {
    pub id: String,
    pub pid: u32,
    pub exe: PathBuf,
    pub started: u64,
}

/// The file in the NexDB folder that lists the services left running.
pub fn state_file(root: &Path) -> PathBuf {
    root.join("etc").join("services-running.json")
}

fn read_saved(file: &Path) -> Vec<SavedService> {
    fs::read_to_string(file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

#[derive(Default)]
struct Inner {
    running: HashMap<String, Running>,
    errors: HashMap<String, String>,
    /// Services whose last start failed because their port was taken.
    port_taken: HashSet<String>,
    /// Launched and not answering yet, so its row says Starting (each on its own).
    launching: HashSet<String>,
}

pub struct Supervisor {
    specs: Vec<ServiceSpec>,
    inner: Mutex<Inner>,
    /// Where the running services are written; None for throwaway supervisors (tests, checks).
    state: Option<PathBuf>,
}

/// Service definitions for a saved install, in start order (PHP and MySQL before web servers).
/// `httpd -f <conf>`. On macOS Apache otherwise detaches into the background and its starter
/// exits at once, so NexDB would lose track of it ("already running" on the next Start).
fn apache_args(conf: &Path) -> Vec<String> {
    let mut args = vec!["-f".to_string(), conf.display().to_string()];
    if cfg!(not(windows)) {
        args.push("-DFOREGROUND".into());
    }
    args
}

pub fn specs_for(root: &Path, settings: &Settings) -> Vec<ServiceSpec> {
    let etc = root.join("etc");
    let logs = root.join("logs");
    let component = |id: &str| settings.components.iter().find(|c| c.id == id);
    // New installs store their folder; existing ones store the executable.
    let dir_of = |path: &str| {
        let p = PathBuf::from(path);
        if p.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) { p.parent().map(Path::to_path_buf) } else { Some(p) }
    };
    let above_bin = |dir: PathBuf| {
        if dir.file_name().is_some_and(|n| n.eq_ignore_ascii_case("bin")) { dir.parent().map(Path::to_path_buf).unwrap_or(dir) } else { dir }
    };
    let has_web = settings.apache_port.is_some() || settings.nginx_port.is_some();
    let mut specs = Vec::new();

    if let (true, Some(php)) = (has_web, component("php")) {
        if let Some(dir) = dir_of(&php.path) {
            let port = settings.php_fastcgi_port;
            specs.push(ServiceSpec {
                id: "php".into(),
                name: "PHP (FastCGI)".into(),
                version: php.version.clone(),
                exe: dir.join(crate::platform::exe("php-cgi.exe")),
                args: vec!["-b".into(), format!("127.0.0.1:{port}"), "-c".into(), etc.join("php").join("php.ini").display().to_string()],
                cwd: dir,
                port,
                managed: true,
                stop: StopMethod::Kill,
                log: logs.join("php.log"),
            });
        }
        // Other PHP versions projects chose, each on its own port.
        for extra in crate::phpver::extras(root, settings) {
            specs.push(ServiceSpec {
                id: format!("php-{}", extra.version),
                name: format!("PHP {} (FastCGI)", extra.version),
                version: Some(extra.version.clone()),
                exe: extra.dir.join(crate::platform::exe("php-cgi.exe")),
                args: vec![
                    "-b".into(),
                    format!("127.0.0.1:{}", extra.port),
                    "-c".into(),
                    extra.ini_dir.join("php.ini").display().to_string(),
                ],
                cwd: extra.dir.clone(),
                port: extra.port,
                managed: true,
                stop: StopMethod::Kill,
                log: logs.join(format!("php-{}.log", extra.version)),
            });
        }
    }

    if let Some(mysql) = &settings.mysql {
        if mysql.existing {
            specs.push(ServiceSpec {
                id: "mysql".into(),
                name: "MySQL".into(),
                version: None,
                exe: component("mysql").map(|c| PathBuf::from(&c.path)).unwrap_or_default(),
                args: vec![],
                cwd: root.to_path_buf(),
                port: mysql.port,
                managed: false,
                stop: StopMethod::Kill,
                log: logs.join("mysql_error.log"),
            });
        } else if let Some(dir) = component("mysql").and_then(|c| dir_of(&c.path)) {
            specs.push(ServiceSpec {
                id: "mysql".into(),
                name: "MySQL".into(),
                version: component("mysql").and_then(|c| c.version.clone()),
                exe: dir.join("bin").join(crate::platform::exe("mysqld.exe")),
                args: vec![format!("--defaults-file={}", etc.join("mysql").join("my.ini").display()), "--console".into()],
                cwd: dir,
                port: mysql.port,
                managed: true,
                stop: StopMethod::MysqlEvent,
                log: logs.join("mysql_error.log"),
            });
        }
    }

    if let (Some(port), Some(apache)) = (settings.apache_port, component("apache")) {
        if let Some(root_dir) = dir_of(&apache.path).map(above_bin) {
            specs.push(ServiceSpec {
                id: "apache".into(),
                name: "Apache".into(),
                version: apache.version.clone(),
                exe: root_dir.join("bin").join(crate::platform::exe("httpd.exe")),
                args: apache_args(&etc.join("apache").join("httpd.conf")),
                cwd: root_dir,
                port,
                managed: true,
                stop: StopMethod::ApacheEvent,
                log: logs.join("apache_error.log"),
            });
        }
    }

    if let (Some(port), Some(nginx)) = (settings.nginx_port, component("nginx")) {
        if let Some(dir) = dir_of(&nginx.path) {
            specs.push(ServiceSpec {
                id: "nginx".into(),
                name: "nginx".into(),
                version: nginx.version.clone(),
                exe: dir.join(crate::platform::exe("nginx.exe")),
                args: vec!["-p".into(), format!("{}/", dir.display()), "-c".into(), etc.join("nginx").join("nginx.conf").display().to_string()],
                cwd: dir,
                port,
                managed: true,
                stop: StopMethod::NginxQuit,
                log: logs.join("nginx_error.log"),
            });
        }
    }

    // Helpers installed from the Versions page: PostgreSQL, the mail catcher and Redis.
    let data = root.join("data");
    if let Some(dir) = component("postgres").and_then(|c| dir_of(&c.path)) {
        specs.push(ServiceSpec {
            id: "postgres".into(),
            name: "PostgreSQL".into(),
            version: component("postgres").and_then(|c| c.version.clone()),
            exe: dir.join("bin").join(crate::platform::exe("postgres.exe")),
            args: vec![
                "-D".into(),
                data.join("postgres").display().to_string(),
                "-p".into(),
                POSTGRES_PORT.to_string(),
                "-c".into(),
                "listen_addresses=127.0.0.1".into(),
            ],
            cwd: dir,
            port: POSTGRES_PORT,
            managed: true,
            stop: StopMethod::PgCtl,
            log: logs.join("postgres.log"),
        });
    }
    if let Some(dir) = component("mariadb").and_then(|c| dir_of(&c.path)) {
        specs.push(ServiceSpec {
            id: "mariadb".into(),
            name: "MariaDB".into(),
            version: component("mariadb").and_then(|c| c.version.clone()),
            exe: dir.join("bin").join(crate::platform::exe("mariadbd.exe")),
            args: vec![format!("--defaults-file={}", etc.join("mariadb").join("my.ini").display()), "--console".into()],
            cwd: dir,
            port: crate::extradb::MARIADB_PORT,
            managed: true,
            // MariaDB keeps MySQL's shutdown event on Windows.
            stop: StopMethod::MysqlEvent,
            log: logs.join("mariadb_error.log"),
        });
    }
    if let Some(dir) = component("mongodb").and_then(|c| dir_of(&c.path)) {
        specs.push(ServiceSpec {
            id: "mongodb".into(),
            name: "MongoDB".into(),
            version: component("mongodb").and_then(|c| c.version.clone()),
            exe: dir.join("bin").join(crate::platform::exe("mongod.exe")),
            args: vec![
                "--dbpath".into(),
                data.join("mongodb").display().to_string(),
                "--port".into(),
                crate::extradb::MONGODB_PORT.to_string(),
                "--bind_ip".into(),
                "127.0.0.1".into(),
                "--logpath".into(),
                logs.join("mongodb.log").display().to_string(),
                "--logappend".into(),
            ],
            cwd: dir,
            port: crate::extradb::MONGODB_PORT,
            managed: true,
            stop: StopMethod::MongoShutdown,
            log: logs.join("mongodb.log"),
        });
    }
    if let Some(dir) = component("mailpit").and_then(|c| dir_of(&c.path)) {
        specs.push(ServiceSpec {
            id: "mailpit".into(),
            name: "Mail catcher".into(),
            version: component("mailpit").and_then(|c| c.version.clone()),
            exe: dir.join(crate::platform::exe("mailpit.exe")),
            args: vec![
                "--smtp".into(),
                format!("127.0.0.1:{MAIL_SMTP_PORT}"),
                "--listen".into(),
                format!("127.0.0.1:{MAIL_WEB_PORT}"),
                "--database".into(),
                crate::configure::conf_path(&data.join("mailpit.db")),
            ],
            cwd: dir,
            port: MAIL_WEB_PORT,
            managed: true,
            stop: StopMethod::Kill,
            log: logs.join("mailpit.log"),
        });
    }
    if let Some(dir) = component("memcached").and_then(|c| dir_of(&c.path)) {
        specs.push(ServiceSpec {
            id: "memcached".into(),
            name: "Memcached".into(),
            version: component("memcached").and_then(|c| c.version.clone()),
            exe: dir.join("bin").join(crate::platform::exe("memcached.exe")),
            // 64 MB of memory, TCP only, this PC only.
            args: vec![
                "-p".into(),
                MEMCACHED_PORT.to_string(),
                "-U".into(),
                "0".into(),
                "-l".into(),
                "127.0.0.1".into(),
                "-m".into(),
                "64".into(),
            ],
            cwd: dir,
            port: MEMCACHED_PORT,
            managed: true,
            // A cache: nothing to save, so ending it is fine.
            stop: StopMethod::Kill,
            log: logs.join("memcached.log"),
        });
    }
    if let Some(dir) = component("redis").and_then(|c| dir_of(&c.path)) {
        specs.push(ServiceSpec {
            id: "redis".into(),
            name: "Redis".into(),
            version: component("redis").and_then(|c| c.version.clone()),
            exe: dir.join(crate::platform::exe("redis-server.exe")),
            args: vec![
                "--port".into(),
                REDIS_PORT.to_string(),
                "--bind".into(),
                "127.0.0.1".into(),
                "--dir".into(),
                crate::configure::conf_path(&data.join("redis")),
            ],
            cwd: dir,
            port: REDIS_PORT,
            managed: true,
            stop: StopMethod::RedisShutdown,
            log: logs.join("redis.log"),
        });
    }
    // The user's own services, last.
    for c in &settings.preferences.custom_services {
        specs.push(crate::custom::spec(c, &logs));
    }
    specs
}

/// Where apps send mail (SMTP) and where the inbox opens in the browser.
pub const MAIL_SMTP_PORT: u16 = 1025;
pub const MAIL_WEB_PORT: u16 = 8025;
pub const REDIS_PORT: u16 = 6379;
pub const MEMCACHED_PORT: u16 = 11211;
pub const POSTGRES_PORT: u16 = 5432;

impl Supervisor {
    pub fn new(specs: Vec<ServiceSpec>) -> Self {
        Supervisor { specs, inner: Mutex::new(Inner::default()), state: None }
    }

    /// The app's supervisor: remembers its running services in `file` and takes back the ones an
    /// earlier NexDB left running that are still alive.
    pub fn persistent(specs: Vec<ServiceSpec>, file: PathBuf) -> Self {
        let saved = read_saved(&file);
        let sup = Supervisor { specs, inner: Mutex::new(Inner::default()), state: Some(file) };
        sup.adopt(saved, pid_alive, process_exe);
        sup
    }

    /// Takes back each saved service that is still alive and still runs this service's program.
    /// The checks are passed in so tests can stand in for real processes.
    fn adopt(&self, saved: Vec<SavedService>, alive: impl Fn(u32) -> bool, exe_of: impl Fn(u32) -> Option<PathBuf>) {
        {
            let mut inner = self.inner.lock().unwrap();
            for s in saved {
                let Some(spec) = self.specs.iter().find(|spec| spec.id == s.id) else { continue };
                if !spec.managed || !same_file(&s.exe, &spec.exe) || inner.running.contains_key(&s.id) || !alive(s.pid) {
                    continue;
                }
                // A process id can be reused: it must still be this service's own program.
                if !exe_of(s.pid).is_some_and(|exe| same_file(&exe, &spec.exe)) {
                    continue;
                }
                inner.running.insert(s.id, Running { pid: s.pid, child: None, started: s.started });
            }
        }
        self.save();
    }

    /// Writes the running services to the state file. Best effort: a failed write only means
    /// NexDB won't recognise them after a restart.
    fn save(&self) {
        let Some(file) = &self.state else { return };
        let mut list: Vec<SavedService> = {
            let inner = self.inner.lock().unwrap();
            inner
                .running
                .iter()
                .filter_map(|(id, r)| {
                    let spec = self.specs.iter().find(|s| &s.id == id)?;
                    Some(SavedService { id: id.clone(), pid: r.pid, exe: spec.exe.clone(), started: r.started })
                })
                .collect()
        };
        list.sort_by(|a, b| a.id.cmp(&b.id));
        if let Some(dir) = file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(text) = serde_json::to_string_pretty(&list) {
            let _ = fs::write(file, text);
        }
    }

    fn spec(&self, id: &str) -> Result<&ServiceSpec, String> {
        self.specs.iter().find(|s| s.id == id).ok_or_else(|| format!("Unknown service: {id}"))
    }

    pub fn ids(&self) -> Vec<String> {
        self.specs.iter().map(|s| s.id.clone()).collect()
    }

    /// Starts a service and waits until it answers on its port. Blocking.
    pub fn start(&self, id: &str) -> Result<(), String> {
        let spec = self.spec(id)?.clone();
        if !spec.managed {
            return Err(format!("{} is managed outside DevManager.", spec.name));
        }
        {
            let mut inner = self.inner.lock().unwrap();
            if let Some(r) = inner.running.get_mut(id) {
                if r.ended().is_none() {
                    return Ok(());
                }
                inner.running.remove(id);
            }
            inner.errors.remove(id);
            inner.port_taken.remove(id);
            inner.launching.insert(id.into());
        }
        let result = self.launch(&spec);
        {
            let mut inner = self.inner.lock().unwrap();
            inner.launching.remove(id);
            if let Err(e) = &result {
                inner.errors.insert(id.into(), e.message.clone());
                if e.port_taken {
                    inner.port_taken.insert(id.into());
                }
            }
        }
        self.save();
        result.map_err(|e| e.message)
    }

    /// Starts several services at the same time (none needs another to be up first), so the
    /// slowest one sets the wait instead of all of them added up. Watched-only services are
    /// skipped. Returns each failure's message.
    pub fn start_many(&self, ids: &[String]) -> Vec<String> {
        std::thread::scope(|scope| {
            let jobs: Vec<_> = ids.iter().map(|id| scope.spawn(move || self.start(id))).collect();
            jobs.into_iter()
                .filter_map(|job| match job.join() {
                    Ok(Ok(())) => None,
                    Ok(Err(e)) if e.contains("managed outside") => None,
                    Ok(Err(e)) => Some(e),
                    Err(_) => Some("A service crashed NexDB's starter; try Start again.".into()),
                })
                .collect()
        })
    }

    fn launch(&self, spec: &ServiceSpec) -> Result<(), LaunchError> {
        if !spec.exe.is_file() {
            return Err(format!("{} isn't installed: its files at {} are missing. Reinstall it on the Versions page.", spec.name, spec.exe.display()).into());
        }
        #[cfg(unix)]
        if port_listening(spec.port) {
            stop_leftover(spec);
        }
        if port_listening(spec.port) {
            let owner = crate::scan::port_status(spec.port, &spec.name);
            return Err(LaunchError {
                message: format!(
                    "Port {} is already in use by {}{}. Stop that program, then press Start.",
                    spec.port,
                    owner.process.unwrap_or_else(|| "another program".into()),
                    owner.pid.map(|p| format!(" (PID {p})")).unwrap_or_default(),
                ),
                port_taken: true,
            });
        }
        if let Some(dir) = spec.log.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let console = spec.log.with_extension("console.log");
        let mut out = OpenOptions::new().create(true).append(true).open(&console)
            .map_err(|e| LaunchError::from(format!("Couldn't open {}: {e}", console.display())))?;
        let _ = writeln!(out, "--- {} starting ---", spec.name);
        let err = out.try_clone().map_err(|e| LaunchError::from(e.to_string()))?;

        let mut command = Command::new(&spec.exe);
        command
            .args(&spec.args)
            .current_dir(&spec.cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::from(out))
            .stderr(Stdio::from(err));
        if spec.id == "php" {
            command.env("PHP_FCGI_MAX_REQUESTS", "0");
        }
        crate::scan::hide_console(&mut command);
        // macOS: own process group, so stopping reaches Apache's and PHP's worker processes too.
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        // No Job Object that ends it with NexDB, and on macOS its own process group: the service
        // keeps running after NexDB quits, and stopping still reaches its worker processes.
        let child = command.spawn().map_err(|e| LaunchError::from(format!("Couldn't start {}: {e}", spec.name)))?;
        let pid = child.id();
        // Written down at once, so a NexDB that quits while this is still starting finds it
        // again on the next launch instead of reporting its port as taken.
        self.inner.lock().unwrap().running.insert(spec.id.clone(), Running { pid, child: Some(child), started: now_secs() });
        self.save();

        let deadline = Instant::now() + START_TIMEOUT;
        let failure = loop {
            let ended = self.inner.lock().unwrap().running.get_mut(&spec.id).map_or(Some(None), Running::ended);
            if let Some(code) = ended {
                break format!(
                    "{} stopped while starting (exit code {}). {}",
                    spec.name,
                    code.map(|c| c.to_string()).unwrap_or_else(|| "unknown".into()),
                    last_lines(&[&spec.log, &console], 3)
                );
            }
            if port_listening(spec.port) {
                return Ok(());
            }
            if Instant::now() >= deadline {
                if let Some(mut r) = self.inner.lock().unwrap().running.remove(&spec.id) {
                    kill(&mut r);
                }
                break format!("{} didn't start listening on port {} in time.", spec.name, spec.port);
            }
            std::thread::sleep(Duration::from_millis(200));
        };
        self.inner.lock().unwrap().running.remove(&spec.id);
        Err(failure.into())
    }

    /// Asks a service to shut down cleanly, ending it after a timeout. Blocking.
    pub fn stop(&self, id: &str) -> Result<(), String> {
        let spec = self.spec(id)?.clone();
        let Some(mut running) = self.inner.lock().unwrap().running.remove(id) else {
            return Ok(());
        };
        self.save();
        let pid = running.pid;
        let asked = match spec.stop {
            // macOS: Apache and MySQL shut down cleanly on SIGTERM.
            #[cfg(unix)]
            StopMethod::ApacheEvent | StopMethod::MysqlEvent => signal_group(pid, "TERM"),
            #[cfg(windows)]
            StopMethod::ApacheEvent => signal_event(&[format!("ap{pid}_shutdown"), format!("Global\\ap{pid}_shutdown")]),
            // The name mysqld.exe creates (`mysqld%d_shutdown`); MariaDB's older name as fallback.
            #[cfg(windows)]
            StopMethod::MysqlEvent => signal_event(&[format!("mysqld{pid}_shutdown"), format!("MySQLShutdown{pid}")]),
            StopMethod::NginxQuit => {
                let mut args: Vec<String> = vec!["-s".into(), "quit".into()];
                args.extend(spec.args.iter().cloned());
                let mut cmd = Command::new(&spec.exe);
                cmd.args(&args).current_dir(&spec.cwd).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
                crate::scan::hide_console(&mut cmd);
                cmd.status().is_ok_and(|s| s.success())
            }
            StopMethod::RedisShutdown => {
                let mut cmd = Command::new(spec.exe.with_file_name(crate::platform::exe("redis-cli.exe")));
                cmd.args(["-p", &spec.port.to_string(), "shutdown"])
                    .current_dir(&spec.cwd)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                crate::scan::hide_console(&mut cmd);
                cmd.status().is_ok_and(|s| s.success())
            }
            StopMethod::PgCtl => {
                let data = spec.args.iter().skip_while(|a| *a != "-D").nth(1).cloned().unwrap_or_default();
                let mut cmd = Command::new(spec.exe.with_file_name(crate::platform::exe("pg_ctl.exe")));
                cmd.args(["stop", "-D", &data, "-m", "fast", "-s"])
                    .current_dir(&spec.cwd)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                crate::scan::hide_console(&mut cmd);
                cmd.status().is_ok_and(|s| s.success())
            }
            StopMethod::MongoShutdown => crate::extradb::mongodb_shutdown(spec.port),
            StopMethod::Kill => false,
        };
        if asked {
            let deadline = Instant::now() + STOP_TIMEOUT;
            while Instant::now() < deadline {
                if running.ended().is_some() {
                    return Ok(());
                }
                std::thread::sleep(Duration::from_millis(200));
            }
        }
        // Not asked, or didn't stop in time: end it and the processes it started.
        kill(&mut running);
        Ok(())
    }

    pub fn stop_all(&self) {
        for spec in self.specs.iter().rev() {
            let _ = self.stop(&spec.id);
        }
    }

    pub fn status(&self) -> Vec<ServiceStatus> {
        let mut gone = false;
        let list: Vec<ServiceStatus> = {
        let mut inner = self.inner.lock().unwrap();
        self.specs
            .iter()
            .map(|spec| {
                let listening = port_listening(spec.port);
                if !spec.managed {
                    return ServiceStatus {
                        id: spec.id.clone(),
                        name: spec.name.clone(),
                        version: spec.version.clone(),
                        port: spec.port,
                        managed: false,
                        state: State::External,
                        listening,
                        pid: None,
                        uptime_secs: None,
                        message: Some("Managed outside DevManager".into()),
                        port_taken: false,
                    };
                }
                // A process that exited on its own is a failure worth showing.
                let exited = inner.running.get_mut(&spec.id).and_then(Running::ended);
                if let Some(code) = exited {
                    inner.running.remove(&spec.id);
                    gone = true;
                    inner.errors.insert(
                        spec.id.clone(),
                        match code {
                            Some(c) => format!("{} stopped unexpectedly (exit code {c}).", spec.name),
                            None => format!("{} stopped unexpectedly.", spec.name),
                        },
                    );
                }
                let running = inner.running.get(&spec.id);
                let state = match (running, listening) {
                    (Some(_), true) => State::Running,
                    (Some(_), false) => State::Starting,
                    (None, _) if inner.launching.contains(&spec.id) => State::Starting,
                    (None, _) if inner.errors.contains_key(&spec.id) => State::Failed,
                    (None, _) => State::Stopped,
                };
                ServiceStatus {
                    id: spec.id.clone(),
                    name: spec.name.clone(),
                    version: spec.version.clone(),
                    port: spec.port,
                    managed: true,
                    state,
                    listening,
                    pid: running.map(|r| r.pid),
                    uptime_secs: running.map(|r| now_secs().saturating_sub(r.started)),
                    message: inner.errors.get(&spec.id).cloned(),
                    port_taken: inner.port_taken.contains(&spec.id) && inner.errors.contains_key(&spec.id),
                }
            })
            .collect()
        };
        // A service that ended on its own is no longer left running.
        if gone {
            self.save();
        }
        list
    }

    /// Empties a service's log files (its own log and the console output NexDB captures).
    /// Files that don't exist yet are fine; a service that is running keeps writing to them.
    pub fn clear_log(&self, id: &str) -> Result<(), String> {
        let spec = self.spec(id)?;
        let console = spec.log.with_extension("console.log");
        for path in [&spec.log, &console] {
            match fs::OpenOptions::new().write(true).truncate(true).open(path) {
                Ok(_) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(format!("Couldn't clear {}: {e}", path.file_name().unwrap_or_default().to_string_lossy())),
            }
        }
        Ok(())
    }

    /// The end of a service's log, newest last.
    pub fn log_tail(&self, id: &str) -> Result<String, String> {
        let spec = self.spec(id)?;
        let console = spec.log.with_extension("console.log");
        let mut text = String::new();
        for path in [&spec.log, &console] {
            if let Ok(tail) = read_tail(path, LOG_TAIL_BYTES) {
                if !tail.trim().is_empty() {
                    text.push_str(&format!("== {} ==\n{}\n", path.file_name().unwrap_or_default().to_string_lossy(), tail.trim_end()));
                }
            }
        }
        Ok(if text.is_empty() { "No log output yet.".into() } else { text })
    }
}

pub fn port_listening(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(150)).is_ok()
}

/// Stops the services an earlier NexDB left running in this NexDB folder (the uninstaller does
/// this, so no server keeps running without NexDB to stop it).
pub fn stop_saved(root: &Path, settings: &Settings) {
    Supervisor::persistent(specs_for(root, settings), state_file(root)).stop_all();
}

/// Whether two paths name the same file (case and `..` don't matter).
fn same_file(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    if let (Ok(x), Ok(y)) = (a.canonicalize(), b.canonicalize()) {
        return x == y;
    }
    cfg!(windows) && a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy())
}

/// Ends a service and the processes it started, then clears it (a child of this NexDB).
fn kill(r: &mut Running) {
    #[cfg(unix)]
    {
        signal_group(r.pid, "KILL");
        // SAFETY: kill only sends a signal to the service's own process.
        unsafe { libc::kill(r.pid as libc::pid_t, libc::SIGKILL) };
    }
    #[cfg(windows)]
    {
        // The whole tree: Apache's worker process too.
        let mut cmd = Command::new("taskkill");
        cmd.args(["/PID", &r.pid.to_string(), "/T", "/F"]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        crate::scan::hide_console(&mut cmd);
        let _ = cmd.status();
    }
    if let Some(child) = &mut r.child {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Whether a process with this id is running.
#[cfg(unix)]
fn pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    // SAFETY: signal 0 only checks that the process exists.
    let r = unsafe { libc::kill(pid as libc::pid_t, 0) };
    r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(windows)]
fn pid_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    const STILL_ACTIVE: u32 = 259;
    if pid == 0 {
        return false;
    }
    // SAFETY: the handle is checked and closed; `code` outlives the call.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut code = 0u32;
        let ok = GetExitCodeProcess(handle, &mut code) != 0;
        CloseHandle(handle);
        ok && code == STILL_ACTIVE
    }
}

/// The program file a running process was started from.
#[cfg(unix)]
fn process_exe(pid: u32) -> Option<PathBuf> {
    crate::platform::unix::process_path(pid)
}

#[cfg(windows)]
fn process_exe(pid: u32) -> Option<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    // SAFETY: the handle is checked and closed; the buffer and its length outlive the call.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut buf = vec![0u16; 32768];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len) != 0;
        CloseHandle(handle);
        ok.then(|| PathBuf::from(std::ffi::OsString::from_wide(&buf[..len as usize])))
    }
}

fn read_tail(path: &Path, max: u64) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(max)))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    // Drop a partial first line when the tail started mid-line.
    Ok(if len > max { text.split_once('\n').map(|(_, rest)| rest.to_string()).unwrap_or(text) } else { text })
}

fn last_lines(paths: &[&Path], n: usize) -> String {
    let lines: Vec<String> = paths
        .iter()
        .filter_map(|p| read_tail(p, 8 * 1024).ok())
        .flat_map(|t| t.lines().filter(|l| !l.trim().is_empty() && !l.starts_with("---")).map(str::to_string).collect::<Vec<_>>())
        .collect();
    lines[lines.len().saturating_sub(n)..].join(" | ")
}

/// Sets the first named event that exists. Returns whether one was signalled.
#[cfg(windows)]
fn signal_event(names: &[String]) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenEventW, SetEvent, EVENT_MODIFY_STATE};
    names.iter().any(|name| {
        let wide: Vec<u16> = name.encode_utf16().chain([0]).collect();
        // SAFETY: `wide` is NUL-terminated and outlives the call; the handle is closed below.
        unsafe {
            let handle = OpenEventW(EVENT_MODIFY_STATE, 0, wide.as_ptr());
            if handle.is_null() {
                return false;
            }
            let ok = SetEvent(handle) != 0;
            CloseHandle(handle);
            ok
        }
    })
}

/// macOS: a copy of this very service left running by an earlier NexDB (one that crashed, or an
/// Apache that detached itself) holds its port. When the program on the port is this service's
/// own file in NexDB's folder, it's stopped cleanly (then forcibly) so Start can go ahead.
/// Anything else on the port (another program, another MySQL) is never touched.
#[cfg(unix)]
fn stop_leftover(spec: &ServiceSpec) {
    let Some(pid) = crate::scan::port_status(spec.port, &spec.name).pid else { return };
    let Some(path) = crate::platform::unix::process_path(pid) else { return };
    let same = |a: &Path, b: &Path| a == b || matches!((a.canonicalize(), b.canonicalize()), (Ok(x), Ok(y)) if x == y);
    if !same(&path, &spec.exe) {
        return;
    }
    // Its whole group (Apache's workers too), unless it shares NexDB's own group.
    // SAFETY: getpgid and getpgrp only read process ids.
    let (group, ours) = unsafe { (libc::getpgid(pid as libc::pid_t), libc::getpgrp()) };
    let send = |signal: &str| {
        if group > 0 && group != ours {
            signal_group(group as u32, signal);
        } else {
            let sig = if signal == "KILL" { libc::SIGKILL } else { libc::SIGTERM };
            // SAFETY: kill only sends a signal to the process found on our port.
            unsafe { libc::kill(pid as libc::pid_t, sig) };
        }
    };
    send("TERM");
    let deadline = Instant::now() + STOP_TIMEOUT;
    while port_listening(spec.port) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(200));
    }
    if port_listening(spec.port) {
        send("KILL");
        std::thread::sleep(Duration::from_millis(500));
    }
}

/// macOS: sends a signal to a service's whole process group (it was started as its leader).
#[cfg(unix)]
fn signal_group(pid: u32, signal: &str) -> bool {
    let sig = if signal == "KILL" { libc::SIGKILL } else { libc::SIGTERM };
    // SAFETY: killpg only sends a signal; the group id is our own child's pid.
    unsafe { libc::killpg(pid as libc::pid_t, sig) == 0 }
}

#[cfg(windows)]
pub(crate) mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// A Job Object whose processes are ended when it closes (including if DevManager crashes).
    pub struct Job(HANDLE);

    // SAFETY: a job handle can be used and closed from any thread.
    unsafe impl Send for Job {}

    impl Job {
        pub fn kill_on_close() -> Result<Self, String> {
            // SAFETY: plain Win32 calls with valid pointers; the handle is owned by `Job`.
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return Err("CreateJobObject failed".into());
                }
                let job = Job(handle);
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const _,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                if ok == 0 {
                    return Err("SetInformationJobObject failed".into());
                }
                Ok(job)
            }
        }

        pub fn assign(&self, child: &Child) -> Result<(), String> {
            // SAFETY: both handles are valid for the duration of the call.
            let ok = unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) };
            if ok == 0 { Err("AssignProcessToJobObject failed".into()) } else { Ok(()) }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: the handle is owned and closed exactly once.
            unsafe { CloseHandle(self.0) };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::configure;

    fn settings(json: &str) -> Settings {
        serde_json::from_str(json).unwrap()
    }

    // Uses Windows paths (C:\..., .exe); macOS behaviour is covered by the Mac check run.

    #[cfg(windows)]

    #[test]
    fn builds_specs_for_new_and_existing_components() {
        let s = settings(r#"{"install_root":"C:\\D","www_dir":"C:\\D\\www","php_fastcgi_port":9085,
            "components":[
              {"id":"php","version":"8.5.12","path":"C:\\D\\bin\\php\\php-8.5.12","existing":false},
              {"id":"apache","version":null,"path":"C:\\laragon\\bin\\apache\\Apache24\\bin\\httpd.exe","existing":true},
              {"id":"mysql","version":null,"path":"C:\\laragon\\bin\\mysql\\x\\bin\\mysqld.exe","existing":true}],
            "apache_port":80,"nginx_port":null,"mysql":{"port":3306,"existing":true,"data_dir":null,"autostart":false}}"#);
        let specs = specs_for(Path::new(r"C:\D"), &s);
        let ids: Vec<&str> = specs.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["php", "mysql", "apache"]);
        assert_eq!(specs[0].exe, PathBuf::from(r"C:\D\bin\php\php-8.5.12\php-cgi.exe"));
        assert!(!specs[1].managed, "an existing MySQL is only watched");
        assert_eq!(specs[2].exe, PathBuf::from(r"C:\laragon\bin\apache\Apache24\bin\httpd.exe"));
        assert_eq!(specs[2].cwd, PathBuf::from(r"C:\laragon\bin\apache\Apache24"));
        assert_eq!(specs[2].stop, StopMethod::ApacheEvent);
    }

    #[test]
    fn php_service_needs_a_web_server() {
        let s = settings(r#"{"install_root":"C:\\D","www_dir":"C:\\D\\www","php_fastcgi_port":9085,
            "components":[{"id":"php","version":"8.5.12","path":"C:\\D\\bin\\php\\php-8.5.12","existing":false}],
            "apache_port":null,"nginx_port":null,"mysql":null}"#);
        assert!(specs_for(Path::new(r"C:\D"), &s).is_empty());
    }

    #[test]
    fn clearing_logs_empties_both_files() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("apache_error.log");
        fs::write(&log, "old line\n").unwrap();
        fs::write(log.with_extension("console.log"), "--- Apache starting ---\n").unwrap();
        let sup = Supervisor::new(vec![ServiceSpec {
            id: "apache".into(), name: "Apache".into(), version: None,
            exe: dir.path().join(crate::platform::exe("httpd.exe")), args: vec![], cwd: dir.path().into(), port: 1,
            managed: true, stop: StopMethod::Kill, log: log.clone(),
        }]);
        sup.clear_log("apache").unwrap();
        assert_eq!(fs::read_to_string(&log).unwrap(), "");
        assert_eq!(fs::read_to_string(log.with_extension("console.log")).unwrap(), "");
        assert_eq!(sup.log_tail("apache").unwrap(), "No log output yet.");
        // A service that hasn't logged anything yet is fine too.
        fs::remove_file(&log).unwrap();
        sup.clear_log("apache").unwrap();
        assert!(sup.clear_log("nope").is_err());
    }

    fn spec_at(id: &str, exe: PathBuf, port: u16, dir: &Path) -> ServiceSpec {
        ServiceSpec {
            id: id.into(), name: id.into(), version: None, exe, args: vec![], cwd: dir.into(), port,
            managed: true, stop: StopMethod::Kill, log: dir.join(format!("{id}.log")),
        }
    }

    #[test]
    fn takes_back_only_live_services_running_their_own_program() {
        let dir = tempfile::tempdir().unwrap();
        let (php, apache, mysql) = (dir.path().join("php-cgi"), dir.path().join("httpd"), dir.path().join("mysqld"));
        let file = dir.path().join("etc").join("services-running.json");
        let sup = Supervisor {
            specs: vec![
                spec_at("php", php.clone(), 1, dir.path()),
                spec_at("apache", apache.clone(), 1, dir.path()),
                spec_at("mysql", mysql.clone(), 1, dir.path()),
            ],
            inner: Mutex::new(Inner::default()),
            state: Some(file.clone()),
        };
        let started = now_secs() - 120;
        // This test process stands in for the live PHP, since the dashboard checks it really runs.
        let me = std::process::id();
        let saved = vec![
            SavedService { id: "php".into(), pid: me, exe: php.clone(), started },
            // Ended while NexDB was closed.
            SavedService { id: "apache".into(), pid: 200, exe: apache.clone(), started },
            // Its process id now belongs to another program.
            SavedService { id: "mysql".into(), pid: 300, exe: mysql.clone(), started },
            // A service this install no longer has.
            SavedService { id: "redis".into(), pid: 400, exe: dir.path().join("redis"), started },
        ];
        let php2 = php.clone();
        sup.adopt(saved, |pid| pid != 200, move |pid| Some(if pid == me { php2.clone() } else { PathBuf::from("/other") }));

        let status = sup.status();
        let php_row = status.iter().find(|s| s.id == "php").unwrap();
        assert_eq!(php_row.pid, Some(me));
        assert!(php_row.uptime_secs.unwrap() >= 120, "uptime carries over the restart");
        assert!(status.iter().filter(|s| s.id != "php").all(|s| s.pid.is_none() && s.state == State::Stopped));
        // The file now lists only what is really left running.
        assert_eq!(read_saved(&file), vec![SavedService { id: "php".into(), pid: me, exe: php, started }]);
    }

    #[test]
    fn persistent_supervisor_finds_a_live_process_again() {
        let dir = tempfile::tempdir().unwrap();
        let me = std::env::current_exe().unwrap();
        let file = dir.path().join("services-running.json");
        // A process that has already ended, for the "not alive" case.
        let mut gone = Command::new(&me).arg("--list").stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
        let gone_pid = gone.id();
        gone.wait().unwrap();
        let saved = vec![
            SavedService { id: "php".into(), pid: std::process::id(), exe: me.clone(), started: now_secs() },
            SavedService { id: "apache".into(), pid: gone_pid, exe: me.clone(), started: now_secs() },
        ];
        fs::write(&file, serde_json::to_string(&saved).unwrap()).unwrap();
        let sup = Supervisor::persistent(
            vec![spec_at("php", me.clone(), 1, dir.path()), spec_at("apache", me.clone(), 1, dir.path())],
            file.clone(),
        );
        let status = sup.status();
        assert_eq!(status[0].pid, Some(std::process::id()), "this test process stands in for a service left running");
        assert_eq!(status[1].pid, None);
        assert_eq!(read_saved(&file).len(), 1);
        // Not stopped here: that would end the test itself.
    }

    #[test]
    fn taken_port_is_flagged_for_the_port_suggestion() {
        let dir = tempfile::tempdir().unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        // A program file that exists but isn't what holds the port, so nothing gets stopped.
        let exe = dir.path().join(crate::platform::exe("httpd.exe"));
        fs::write(&exe, "").unwrap();
        let sup = Supervisor::new(vec![spec_at("apache", exe, port, dir.path())]);
        let err = sup.start("apache").unwrap_err();
        assert!(err.contains(&format!("Port {port} is already in use")), "{err}");
        let row = &sup.status()[0];
        assert_eq!(row.state, State::Failed);
        assert!(row.port_taken);
    }

    #[test]
    fn missing_executable_is_a_clear_failure() {
        let dir = tempfile::tempdir().unwrap();
        let spec = ServiceSpec {
            id: "php".into(), name: "PHP".into(), version: None,
            exe: dir.path().join(crate::platform::exe("nope.exe")), args: vec![], cwd: dir.path().into(), port: 1,
            managed: true, stop: StopMethod::Kill, log: dir.path().join("php.log"),
        };
        let sup = Supervisor::new(vec![spec]);
        let err = sup.start("php").unwrap_err();
        assert!(err.contains("isn't installed"), "{err}");
        assert_eq!(sup.status()[0].state, State::Failed);
        assert!(!sup.status()[0].port_taken);
    }

    const LARAGON: &str = r"C:\laragon\bin";

    /// Real Apache + php-cgi from Laragon in a temp folder on spare ports: start both, fetch a PHP
    /// page through Apache, then stop Apache with its shutdown event.
    /// `cargo test real_apache_php -- --ignored --nocapture`
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn real_apache_php_serve_and_stop_gracefully() {
        let dir = tempfile::tempdir().unwrap();
        let (www, etc, logs) = (dir.path().join("www"), dir.path().join("etc"), dir.path().join("logs"));
        // Both include folders, as the installer makes them.
        for d in [&www, &etc.join("apache").join("sites-enabled"), &etc.join("apache").join("extra"), &logs] {
            fs::create_dir_all(d).unwrap();
        }
        fs::write(www.join("index.php"), "<?php echo 'php ', PHP_VERSION;").unwrap();
        let apache_root = Path::new(LARAGON).join(r"apache\Apache24");
        let php_dir = Path::new(LARAGON).join(r"php\php-8.4.5-Win32-vs17-x64");
        let (web_port, fcgi_port) = (8099u16, 9185u16);
        let conf = configure::apache_conf(&configure::ApacheConf {
            server_root: &apache_root, port: web_port, www_dir: &www, etc_dir: &etc, logs_dir: &logs, php: true, fcgi_port,
        });
        configure::write_file(&etc.join("apache").join("httpd.conf"), &conf).unwrap();
        configure::write_file(&etc.join("php").join("php.ini"), &configure::php_ini(&php_dir)).unwrap();

        let sup = Supervisor::new(vec![
            ServiceSpec {
                id: "php".into(), name: "PHP".into(), version: None, exe: php_dir.join(crate::platform::exe("php-cgi.exe")),
                args: vec!["-b".into(), format!("127.0.0.1:{fcgi_port}"), "-c".into(), etc.join("php").join("php.ini").display().to_string()],
                cwd: php_dir.clone(), port: fcgi_port, managed: true, stop: StopMethod::Kill, log: logs.join("php.log"),
            },
            ServiceSpec {
                id: "apache".into(), name: "Apache".into(), version: None, exe: apache_root.join("bin").join(crate::platform::exe("httpd.exe")),
                args: vec!["-f".into(), etc.join("apache").join("httpd.conf").display().to_string()],
                cwd: apache_root.clone(), port: web_port, managed: true, stop: StopMethod::ApacheEvent, log: logs.join("apache_error.log"),
            },
        ]);
        let t = Instant::now();
        sup.start("php").unwrap();
        sup.start("apache").unwrap();
        println!("both started in {:?}", t.elapsed());
        assert!(sup.status().iter().all(|s| s.state == State::Running));

        let mut stream = TcpStream::connect(("127.0.0.1", web_port)).unwrap();
        stream.write_all(b"GET /index.php HTTP/1.0\r\nHost: localhost\r\n\r\n").unwrap();
        let mut body = String::new();
        stream.read_to_string(&mut body).unwrap();
        println!("{}", body.lines().next().unwrap_or_default());
        println!("{}", body.lines().last().unwrap_or_default());
        if !body.contains("200 OK") {
            println!("--- apache log ---\n{}", sup.log_tail("apache").unwrap());
            println!("--- php log ---\n{}", sup.log_tail("php").unwrap());
        }
        assert!(body.contains("200 OK"), "{body}");
        assert!(body.contains("php 8.4.5"), "{body}");

        // Graceful stop: the shutdown event must end Apache well before the kill fallback.
        let apache_pid = sup.status().iter().find(|s| s.id == "apache").unwrap().pid.unwrap();
        assert!(signal_event(&[format!("ap{apache_pid}_shutdown")]), "Apache's shutdown event should exist");
        let t = Instant::now();
        sup.stop("apache").unwrap();
        println!("apache stopped in {:?}", t.elapsed());
        assert!(t.elapsed() < STOP_TIMEOUT, "stopped by signal, not by the timeout");
        sup.stop_all();
        assert!(!port_listening(web_port) && !port_listening(fcgi_port));
    }

    /// Real MySQL from Laragon with a throwaway data folder: start it, then stop it through the
    /// MySQLShutdown event and check the log shows a clean shutdown.
    /// `cargo test real_mysql_graceful -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_mysql_graceful_stop() {
        let base = Path::new(LARAGON).join(r"mysql\mysql-8.0.30-winx64");
        let dir = tempfile::tempdir().unwrap();
        let (data, logs) = (dir.path().join("data"), dir.path().join("logs"));
        fs::create_dir_all(&logs).unwrap();
        let ini = dir.path().join("my.ini");
        let port = 3399;
        configure::write_file(&ini, &configure::mysql_ini(&configure::MysqlConf { base_dir: &base, data_dir: &data, port, logs_dir: &logs })).unwrap();
        configure::setup_mysql(&base, &ini, &data, port, None).unwrap();

        let sup = Supervisor::new(vec![ServiceSpec {
            id: "mysql".into(), name: "MySQL".into(), version: None, exe: base.join("bin").join(crate::platform::exe("mysqld.exe")),
            args: vec![format!("--defaults-file={}", ini.display()), "--console".into()],
            cwd: base.clone(), port, managed: true, stop: StopMethod::MysqlEvent, log: logs.join("mysql_error.log"),
        }]);
        sup.start("mysql").unwrap();
        let t = Instant::now();
        sup.stop("mysql").unwrap();
        println!("mysql stopped in {:?}", t.elapsed());
        let log = sup.log_tail("mysql").unwrap();
        println!("{}", log.lines().rev().take(4).collect::<Vec<_>>().join("\n"));
        assert!(t.elapsed() < STOP_TIMEOUT, "stopped by signal, not by the timeout");
        assert!(log.contains("Shutdown complete"), "clean shutdown expected");
        assert!(!port_listening(port));
    }

    /// Start all runs services side by side: three that each take ~3 s to answer are all up in
    /// about 3 s, not 9. Stand-ins (Python listening after a pause) on spare ports, so services
    /// already running on this PC are never touched.
    #[test]
    #[ignore]
    fn real_start_all_runs_side_by_side() {
        let python = which_python().expect("python on PATH");
        let dir = std::env::temp_dir().join("nexdb-start-many-test");
        let _ = fs::create_dir_all(&dir);
        let spec = |n: u16| ServiceSpec {
            id: format!("slow{n}"),
            name: format!("Slow {n}"),
            version: None,
            exe: python.clone(),
            args: vec![
                "-c".into(),
                format!("import socket,time; time.sleep(3); s=socket.socket(); s.bind(('127.0.0.1',{n})); s.listen(); time.sleep(60)"),
            ],
            cwd: dir.clone(),
            port: n,
            managed: true,
            stop: StopMethod::Kill,
            log: dir.join(format!("slow{n}.log")),
        };
        let sup = Supervisor::new(vec![spec(47811), spec(47812), spec(47813)]);
        let ids = sup.ids();

        // While they start, each row says Starting on its own.
        let started = Instant::now();
        std::thread::scope(|scope| {
            let job = scope.spawn(|| sup.start_many(&ids));
            std::thread::sleep(Duration::from_millis(800));
            assert!(sup.status().iter().all(|s| s.state == State::Starting), "rows say Starting while they start");
            let errors = job.join().unwrap();
            assert!(errors.is_empty(), "{errors:?}");
        });
        let took = started.elapsed();
        println!("3 services that take 3 s each started in {:.1} s", took.as_secs_f32());
        assert!(sup.status().iter().all(|s| s.state == State::Running));
        assert!(took < Duration::from_secs(7), "side by side, not one after another: {took:?}");
        sup.stop_all();
        assert!(sup.status().iter().all(|s| s.state == State::Stopped));
    }

    fn which_python() -> Option<PathBuf> {
        let out = Command::new("where").arg("python").output().ok()?;
        String::from_utf8_lossy(&out.stdout).lines().next().map(|l| PathBuf::from(l.trim()))
    }
}
