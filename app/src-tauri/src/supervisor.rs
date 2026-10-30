//! Starts, stops and watches the stack's services (Apache, nginx, PHP FastCGI, MySQL).
//! Each managed service runs in its own Windows Job Object, so nothing outlives DevManager,
//! and stops gracefully through the shutdown signal its own tools use.

use crate::settings::Settings;
use serde::Serialize;
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

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
}

struct Running {
    child: Child,
    started: Instant,
    #[cfg(windows)]
    _job: job::Job,
}

#[derive(Default)]
struct Inner {
    running: HashMap<String, Running>,
    errors: HashMap<String, String>,
}

pub struct Supervisor {
    specs: Vec<ServiceSpec>,
    inner: Mutex<Inner>,
}

/// Service definitions for a saved install, in start order (PHP and MySQL before web servers).
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
                exe: dir.join("php-cgi.exe"),
                args: vec!["-b".into(), format!("127.0.0.1:{port}"), "-c".into(), etc.join("php").join("php.ini").display().to_string()],
                cwd: dir,
                port,
                managed: true,
                stop: StopMethod::Kill,
                log: logs.join("php.log"),
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
                exe: dir.join("bin").join("mysqld.exe"),
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
                exe: root_dir.join("bin").join("httpd.exe"),
                args: vec!["-f".into(), etc.join("apache").join("httpd.conf").display().to_string()],
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
                exe: dir.join("nginx.exe"),
                args: vec!["-p".into(), format!("{}/", dir.display()), "-c".into(), etc.join("nginx").join("nginx.conf").display().to_string()],
                cwd: dir,
                port,
                managed: true,
                stop: StopMethod::NginxQuit,
                log: logs.join("nginx_error.log"),
            });
        }
    }
    specs
}

impl Supervisor {
    pub fn new(specs: Vec<ServiceSpec>) -> Self {
        Supervisor { specs, inner: Mutex::new(Inner::default()) }
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
                if matches!(r.child.try_wait(), Ok(None)) {
                    return Ok(());
                }
                inner.running.remove(id);
            }
            inner.errors.remove(id);
        }
        let result = self.launch(&spec);
        if let Err(msg) = &result {
            self.inner.lock().unwrap().errors.insert(id.into(), msg.clone());
        }
        result
    }

    fn launch(&self, spec: &ServiceSpec) -> Result<(), String> {
        if !spec.exe.is_file() {
            return Err(format!("{} isn't installed at {}.", spec.name, spec.exe.display()));
        }
        if port_listening(spec.port) {
            let owner = crate::scan::port_status(spec.port, &spec.name);
            return Err(format!(
                "Port {} is already in use by {}{}. Stop that program, then press Start.",
                spec.port,
                owner.process.unwrap_or_else(|| "another program".into()),
                owner.pid.map(|p| format!(" (PID {p})")).unwrap_or_default(),
            ));
        }
        if let Some(dir) = spec.log.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let console = spec.log.with_extension("console.log");
        let mut out = OpenOptions::new().create(true).append(true).open(&console)
            .map_err(|e| format!("Couldn't open {}: {e}", console.display()))?;
        let _ = writeln!(out, "--- {} starting ---", spec.name);
        let err = out.try_clone().map_err(|e| e.to_string())?;

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
        let mut child = command.spawn().map_err(|e| format!("Couldn't start {}: {e}", spec.name))?;

        #[cfg(windows)]
        let job = match job::Job::kill_on_close().and_then(|j| j.assign(&child).map(|_| j)) {
            Ok(job) => job,
            Err(e) => {
                let _ = child.kill();
                return Err(format!("Couldn't contain {}: {e}", spec.name));
            }
        };

        let deadline = Instant::now() + START_TIMEOUT;
        loop {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!(
                    "{} stopped while starting (exit code {}). {}",
                    spec.name,
                    status.code().map(|c| c.to_string()).unwrap_or_else(|| "unknown".into()),
                    last_lines(&[&spec.log, &console], 3)
                ));
            }
            if port_listening(spec.port) {
                break;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                return Err(format!("{} didn't start listening on port {} in time.", spec.name, spec.port));
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        self.inner.lock().unwrap().running.insert(
            spec.id.clone(),
            Running {
                child,
                started: Instant::now(),
                #[cfg(windows)]
                _job: job,
            },
        );
        Ok(())
    }

    /// Asks a service to shut down cleanly, ending it after a timeout. Blocking.
    pub fn stop(&self, id: &str) -> Result<(), String> {
        let spec = self.spec(id)?.clone();
        let Some(mut running) = self.inner.lock().unwrap().running.remove(id) else {
            return Ok(());
        };
        let pid = running.child.id();
        let asked = match spec.stop {
            StopMethod::ApacheEvent => signal_event(&[format!("ap{pid}_shutdown"), format!("Global\\ap{pid}_shutdown")]),
            // The name mysqld.exe creates (`mysqld%d_shutdown`); MariaDB's older name as fallback.
            StopMethod::MysqlEvent => signal_event(&[format!("mysqld{pid}_shutdown"), format!("MySQLShutdown{pid}")]),
            StopMethod::NginxQuit => {
                let mut args: Vec<String> = vec!["-s".into(), "quit".into()];
                args.extend(spec.args.iter().cloned());
                let mut cmd = Command::new(&spec.exe);
                cmd.args(&args).current_dir(&spec.cwd).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
                crate::scan::hide_console(&mut cmd);
                cmd.status().is_ok_and(|s| s.success())
            }
            StopMethod::Kill => false,
        };
        if asked {
            let deadline = Instant::now() + STOP_TIMEOUT;
            while Instant::now() < deadline {
                if let Ok(Some(_)) = running.child.try_wait() {
                    return Ok(());
                }
                std::thread::sleep(Duration::from_millis(200));
            }
        }
        // Not asked, or didn't stop in time: end it. Dropping the job ends any children too.
        let _ = running.child.kill();
        let _ = running.child.wait();
        Ok(())
    }

    pub fn stop_all(&self) {
        for spec in self.specs.iter().rev() {
            let _ = self.stop(&spec.id);
        }
    }

    pub fn status(&self) -> Vec<ServiceStatus> {
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
                    };
                }
                // A process that exited on its own is a failure worth showing.
                let exited = inner.running.get_mut(&spec.id).and_then(|r| r.child.try_wait().ok().flatten());
                if let Some(status) = exited {
                    inner.running.remove(&spec.id);
                    inner.errors.insert(
                        spec.id.clone(),
                        format!("{} stopped unexpectedly (exit code {}).", spec.name, status.code().map(|c| c.to_string()).unwrap_or_else(|| "unknown".into())),
                    );
                }
                let running = inner.running.get(&spec.id);
                let state = match (running, listening) {
                    (Some(_), true) => State::Running,
                    (Some(_), false) => State::Starting,
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
                    pid: running.map(|r| r.child.id()),
                    uptime_secs: running.map(|r| r.started.elapsed().as_secs()),
                    message: inner.errors.get(&spec.id).cloned(),
                }
            })
            .collect()
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

#[cfg(not(windows))]
fn signal_event(_names: &[String]) -> bool {
    false
}

#[cfg(windows)]
mod job {
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
    fn missing_executable_is_a_clear_failure() {
        let dir = tempfile::tempdir().unwrap();
        let spec = ServiceSpec {
            id: "php".into(), name: "PHP".into(), version: None,
            exe: dir.path().join("nope.exe"), args: vec![], cwd: dir.path().into(), port: 1,
            managed: true, stop: StopMethod::Kill, log: dir.path().join("php.log"),
        };
        let sup = Supervisor::new(vec![spec]);
        let err = sup.start("php").unwrap_err();
        assert!(err.contains("isn't installed"), "{err}");
        assert_eq!(sup.status()[0].state, State::Failed);
    }

    const LARAGON: &str = r"C:\laragon\bin";

    /// Real Apache + php-cgi from Laragon in a temp folder on spare ports: start both, fetch a PHP
    /// page through Apache, then stop Apache with its shutdown event.
    /// `cargo test real_apache_php -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_apache_php_serve_and_stop_gracefully() {
        let dir = tempfile::tempdir().unwrap();
        let (www, etc, logs) = (dir.path().join("www"), dir.path().join("etc"), dir.path().join("logs"));
        for d in [&www, &etc.join("apache").join("sites-enabled"), &logs] {
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
                id: "php".into(), name: "PHP".into(), version: None, exe: php_dir.join("php-cgi.exe"),
                args: vec!["-b".into(), format!("127.0.0.1:{fcgi_port}"), "-c".into(), etc.join("php").join("php.ini").display().to_string()],
                cwd: php_dir.clone(), port: fcgi_port, managed: true, stop: StopMethod::Kill, log: logs.join("php.log"),
            },
            ServiceSpec {
                id: "apache".into(), name: "Apache".into(), version: None, exe: apache_root.join("bin").join("httpd.exe"),
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
            id: "mysql".into(), name: "MySQL".into(), version: None, exe: base.join("bin").join("mysqld.exe"),
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
}
