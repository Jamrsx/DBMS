//! The SSH server inside NexDB for NexHost sites. It listens on 127.0.0.1 only; the owner's
//! Cloudflare tunnel brings people to it. Who may log in and what they may run is decided in
//! `nexhost_ssh`; this file speaks SSH and SFTP.

use std::collections::{BTreeMap, HashMap};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

use russh::server::{Auth, ChannelOpenHandle, Msg, Server as _, Session};
use russh::{Channel, ChannelId};
use russh_sftp::protocol::{Attrs, Data, File, FileAttributes, Handle, Name, OpenFlags, Status, StatusCode, Version};

use crate::nexhost::NexSite;
use crate::nexhost_ssh::{self as rules, LogEntry, Lockout, SshUser, Who};

pub const PORT: u16 = 2222;

/// What every session shares.
pub struct Shared {
    pub root: PathBuf,
    pub sites: Arc<RwLock<BTreeMap<String, NexSite>>>,
    /// PATH with NexDB's PHP, Composer, Node and Git first.
    pub tool_path: String,
    pub has_nexhost: Arc<dyn Fn() -> bool + Send + Sync>,
    lockout: Lockout,
}

/// A running server. Dropping it (or `stop`) ends it and every open session.
pub struct SshServer {
    pub port: u16,
    shutdown: russh::server::RunningServerHandle,
    task: tokio::task::JoinHandle<()>,
}

/// The server while it runs.
pub static SERVER: Mutex<Option<SshServer>> = Mutex::new(None);

impl SshServer {
    /// Starts on 127.0.0.1:`port` (0 picks a free port, for tests).
    pub async fn start_on(
        port: u16,
        root: PathBuf,
        sites: Arc<RwLock<BTreeMap<String, NexSite>>>,
        tool_path: String,
        has_nexhost: Arc<dyn Fn() -> bool + Send + Sync>,
    ) -> Result<SshServer, String> {
        let key = rules::host_key(&root)?;
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
            .await
            .map_err(|_| format!("Port {port} is in use by another program, so NexHost SSH can't start."))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let shared = Arc::new(Shared { root, sites, tool_path, has_nexhost, lockout: Lockout::new() });
        let config = Arc::new(russh::server::Config {
            keys: vec![key],
            auth_rejection_time: std::time::Duration::from_secs(1),
            auth_rejection_time_initial: Some(std::time::Duration::from_secs(0)),
            inactivity_timeout: Some(std::time::Duration::from_secs(3600)),
            ..Default::default()
        });
        let (tx, rx) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            let mut factory = Factory { shared };
            let running = factory.run_on_socket(config, &listener);
            let _ = tx.send(running.handle());
            let _ = running.await;
        });
        let shutdown = rx.await.map_err(|_| "NexHost SSH didn't start.".to_string())?;
        Ok(SshServer { port, shutdown, task })
    }

    pub fn stop(self) {
        self.shutdown.shutdown("NexHost SSH stopped".into());
        self.task.abort();
    }
}

fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64)
}

impl Shared {
    fn log(&self, login: &str, site: &str, from: Option<&str>, event: &str, detail: Option<String>) {
        rules::log(
            &self.root,
            &LogEntry { at: now(), login: login.into(), site: site.into(), from: from.map(str::to_string), event: event.into(), detail },
        );
    }

    /// Whether this login may still act: the site exists with SSH on, the user is still there
    /// and on, and the license still includes NexHost.
    fn still_allowed(&self, site: &str, login: &str) -> bool {
        if !(self.has_nexhost)() {
            return false;
        }
        let sites = self.sites.read().unwrap();
        sites.get(site).is_some_and(|s| s.ssh.on && s.ssh.users.iter().any(|u| u.login == login && u.enabled))
    }

    fn site_dir(&self, site: &str) -> PathBuf {
        crate::nexhost::dir(&self.root).join(site)
    }
}

struct Factory {
    shared: Arc<Shared>,
}

impl russh::server::Server for Factory {
    type Handler = Sess;
    fn new_client(&mut self, peer: Option<std::net::SocketAddr>) -> Sess {
        Sess {
            shared: self.shared.clone(),
            peer: peer.map(|p| p.to_string()),
            who: None,
            channels: HashMap::new(),
            lines: HashMap::new(),
            ptys: HashMap::new(),
        }
    }
}

/// One connected person.
struct Sess {
    shared: Arc<Shared>,
    peer: Option<String>,
    who: Option<(String, SshUser)>,
    channels: HashMap<ChannelId, Channel<Msg>>,
    /// Line being typed in the small shell of a "files" login.
    lines: HashMap<ChannelId, String>,
    /// Keyboard input for a full shell.
    ptys: HashMap<ChannelId, Mutex<Box<dyn Write + Send>>>,
}

const PROMPT_HELP: &str = "NexHost SSH. You can run: php artisan, composer, git, npm, npx, node, ls, cat, tail, mkdir, rm, pwd, exit.\r\n";

impl Sess {
    fn allowed(&self) -> bool {
        self.who.as_ref().is_some_and(|(site, user)| self.shared.still_allowed(site, &user.login))
    }

    fn prompt(&self) -> String {
        format!("{}$ ", self.who.as_ref().map_or("", |(s, _)| s.as_str()))
    }

    /// Runs one command for this login in the site folder; returns its output and exit code.
    async fn run(&self, line: &str) -> (String, u32) {
        let Some((site, user)) = self.who.clone() else { return ("Not signed in.\n".into(), 1) };
        if !self.shared.still_allowed(&site, &user.login) {
            return ("SSH was turned off for this login.\n".into(), 1);
        }
        let dir = self.shared.site_dir(&site);
        self.shared.log(&user.login, &site, self.peer.as_deref(), "command", Some(line.chars().take(300).collect()));
        if user.role == "shell" {
            return external(&dir, &self.shared.tool_path, "powershell", &["-NoProfile".into(), "-Command".into(), line.into()]).await;
        }
        let args = match rules::split_args(line).and_then(|a| rules::check_command(&a).map(|_| a)) {
            Ok(a) => a,
            Err(e) => return (format!("{e}\n"), 1),
        };
        builtin(&dir, &args).unwrap_or(external_cmd(&dir, &self.shared.tool_path, &args).await)
    }
}

/// ls, cat, tail, mkdir, rm and pwd are done by NexDB itself (Windows has no such programs).
fn builtin(dir: &Path, args: &[String]) -> Option<(String, u32)> {
    let path = |p: &str| crate::nexhost::safe_join(dir, p);
    let fail = |e: String| (format!("{e}\n"), 1);
    let done = |r: Result<String, String>| Some(r.map_or_else(fail, |o| (o, 0)));
    let rest: Vec<&str> = args[1..].iter().map(String::as_str).filter(|a| !a.starts_with('-')).collect();
    match args[0].to_ascii_lowercase().as_str() {
        "pwd" => Some((format!("{}\n", dir.display()), 0)),
        "ls" => done(path(rest.first().copied().unwrap_or("")).and_then(|p| {
            let mut names: Vec<String> = std::fs::read_dir(p)
                .map_err(|e| e.to_string())?
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned() + if e.path().is_dir() { "/" } else { "" })
                .collect();
            names.sort();
            Ok(names.join("\n") + "\n")
        })),
        "cat" => done(rest.iter().try_fold(String::new(), |acc, f| {
            path(f).and_then(|p| std::fs::read_to_string(p).map_err(|e| format!("{f}: {e}"))).map(|t| acc + &t)
        })),
        "tail" => {
            let n = args.windows(2).find(|w| w[0] == "-n").and_then(|w| w[1].parse::<usize>().ok()).unwrap_or(10);
            let file = rest.iter().rev().find(|a| a.parse::<usize>().is_err()).copied().unwrap_or("");
            done(path(file).and_then(|p| std::fs::read_to_string(p).map_err(|e| e.to_string())).map(|t| {
                let lines: Vec<&str> = t.lines().collect();
                lines[lines.len().saturating_sub(n)..].join("\n") + "\n"
            }))
        }
        "mkdir" => done(rest.iter().try_for_each(|d| path(d).and_then(|p| std::fs::create_dir_all(p).map_err(|e| e.to_string()))).map(|_| String::new())),
        "rm" => {
            let recursive = args.iter().any(|a| a.starts_with('-') && a.contains('r'));
            done(rest.iter().try_for_each(|f| {
                let p = path(f)?;
                if p == dir {
                    return Err("The site folder itself can't be removed.".to_string());
                }
                if p.is_dir() {
                    if recursive { std::fs::remove_dir_all(&p) } else { std::fs::remove_dir(&p) }
                } else {
                    std::fs::remove_file(&p)
                }
                .map_err(|e| format!("{f}: {e}"))
            })
            .map(|_| String::new()))
        }
        "exit" => Some((String::new(), 0)),
        _ => None,
    }
}

/// php, git, node run directly; composer, npm and npx are scripts, so they go through cmd.
async fn external_cmd(dir: &Path, path: &str, args: &[String]) -> (String, u32) {
    let cmd = args[0].to_ascii_lowercase();
    if matches!(cmd.as_str(), "composer" | "npm" | "npx") {
        if args.iter().any(|a| a.contains(['%', '^', '!', '"'])) {
            return ("Arguments can't contain % ^ ! or \".\n".into(), 1);
        }
        let mut all = vec!["/C".to_string()];
        all.extend(args.iter().cloned());
        return external(dir, path, "cmd", &all).await;
    }
    external(dir, path, &cmd, &args[1..]).await
}

async fn external(dir: &Path, path: &str, program: &str, args: &[String]) -> (String, u32) {
    let mut c = tokio::process::Command::new(program);
    c.args(args).current_dir(dir).env("PATH", path).stdin(std::process::Stdio::null()).kill_on_drop(true);
    #[cfg(windows)]
    {
        c.creation_flags(0x0800_0000); // no console window
    }
    match tokio::time::timeout(std::time::Duration::from_secs(15 * 60), c.output()).await {
        Ok(Ok(out)) => {
            let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
            text.push_str(&String::from_utf8_lossy(&out.stderr));
            (text, out.status.code().unwrap_or(1) as u32)
        }
        Ok(Err(e)) => (format!("{program} couldn't start: {e}\n"), 127),
        Err(_) => ("Stopped after 15 minutes.\n".into(), 124),
    }
}

/// Text for a terminal: lone \n become \r\n.
fn crlf(s: &str) -> String {
    s.replace("\r\n", "\n").replace('\n', "\r\n")
}

impl russh::server::Handler for Sess {
    type Error = russh::Error;

    async fn auth_password(&mut self, user: &str, password: &str) -> Result<Auth, Self::Error> {
        let at = now();
        if !self.shared.lockout.allowed(user, at) {
            self.shared.log(user, "", self.peer.as_deref(), "locked", None);
            return Ok(Auth::reject());
        }
        let who = {
            let sites = self.shared.sites.read().unwrap();
            rules::authenticate(&sites, (self.shared.has_nexhost)(), user, password)
        };
        match who {
            Who::Ok { site, user: u } => {
                self.shared.lockout.succeeded(user);
                self.shared.log(user, &site, self.peer.as_deref(), "login_ok", None);
                self.who = Some((site, u));
                Ok(Auth::Accept)
            }
            Who::Refused(why) => {
                self.shared.lockout.failed(user, at);
                self.shared.log(user, "", self.peer.as_deref(), "login_failed", Some(why.into()));
                Ok(Auth::reject())
            }
        }
    }

    async fn channel_open_session(&mut self, channel: Channel<Msg>, reply: ChannelOpenHandle, _: &mut Session) -> Result<(), Self::Error> {
        if !self.allowed() {
            return Ok(());
        }
        self.channels.insert(channel.id(), channel);
        reply.accept().await;
        Ok(())
    }

    async fn pty_request(
        &mut self,
        channel: ChannelId,
        _: &str,
        _: u32,
        _: u32,
        _: u32,
        _: u32,
        _: &[(russh::Pty, u32)],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        session.channel_success(channel)
    }

    async fn exec_request(&mut self, channel: ChannelId, data: &[u8], session: &mut Session) -> Result<(), Self::Error> {
        session.channel_success(channel)?;
        let line = String::from_utf8_lossy(data).into_owned();
        let (out, code) = self.run(&line).await;
        session.data(channel, out.into_bytes())?;
        session.exit_status_request(channel, code)?;
        session.eof(channel)?;
        session.close(channel)
    }

    async fn shell_request(&mut self, channel: ChannelId, session: &mut Session) -> Result<(), Self::Error> {
        let Some((site, user)) = self.who.clone() else { return session.channel_failure(channel) };
        session.channel_success(channel)?;
        if user.role != "shell" {
            self.lines.insert(channel, String::new());
            return session.data(channel, format!("{PROMPT_HELP}{}", self.prompt()).into_bytes());
        }
        // Full shell: PowerShell in a terminal, in the site folder.
        use portable_pty::{native_pty_system, CommandBuilder, PtySize};
        let pair = native_pty_system()
            .openpty(PtySize { rows: 30, cols: 120, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| russh::Error::IO(std::io::Error::other(e.to_string())))?;
        let mut cmd = CommandBuilder::new("powershell");
        cmd.arg("-NoLogo");
        cmd.cwd(self.shared.site_dir(&site));
        cmd.env("PATH", &self.shared.tool_path);
        let mut child = pair.slave.spawn_command(cmd).map_err(|e| russh::Error::IO(std::io::Error::other(e.to_string())))?;
        let mut reader = pair.master.try_clone_reader().map_err(|e| russh::Error::IO(std::io::Error::other(e.to_string())))?;
        let writer = pair.master.take_writer().map_err(|e| russh::Error::IO(std::io::Error::other(e.to_string())))?;
        self.ptys.insert(channel, Mutex::new(writer));
        let handle = session.handle();
        let rt = tokio::runtime::Handle::current();
        let master = pair.master;
        std::thread::spawn(move || {
            let _keep = master;
            let mut buf = [0u8; 8192];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 || rt.block_on(handle.data(channel, buf[..n].to_vec())).is_err() {
                    break;
                }
            }
            let code = child.wait().map(|s| s.exit_code()).unwrap_or(1);
            rt.block_on(async {
                let _ = handle.exit_status_request(channel, code).await;
                let _ = handle.eof(channel).await;
                let _ = handle.close(channel).await;
            });
        });
        Ok(())
    }

    async fn data(&mut self, channel: ChannelId, data: &[u8], session: &mut Session) -> Result<(), Self::Error> {
        if let Some(w) = self.ptys.get_mut(&channel) {
            if !self.who.as_ref().is_some_and(|(s, u)| self.shared.still_allowed(s, &u.login)) {
                self.ptys.remove(&channel);
                return session.close(channel);
            }
            let _ = w.get_mut().map(|w| w.write_all(data));
            return Ok(());
        }
        if !self.lines.contains_key(&channel) {
            return Ok(());
        }
        for &b in data {
            match b {
                b'\r' | b'\n' => {
                    let line = self.lines.insert(channel, String::new()).unwrap_or_default();
                    session.data(channel, b"\r\n".to_vec())?;
                    let line = line.trim();
                    if line == "exit" {
                        session.exit_status_request(channel, 0)?;
                        session.eof(channel)?;
                        return session.close(channel);
                    }
                    if !line.is_empty() {
                        let (out, _) = self.run(line).await;
                        if !self.allowed() {
                            session.data(channel, crlf(&out).into_bytes())?;
                            return session.close(channel);
                        }
                        session.data(channel, crlf(&out).into_bytes())?;
                    }
                    session.data(channel, self.prompt().into_bytes())?;
                }
                3 => {
                    self.lines.insert(channel, String::new());
                    session.data(channel, format!("^C\r\n{}", self.prompt()).into_bytes())?;
                }
                4 => return session.close(channel),
                8 | 127 => {
                    if self.lines.get_mut(&channel).and_then(|l| l.pop()).is_some() {
                        session.data(channel, b"\x08 \x08".to_vec())?;
                    }
                }
                b if b >= 32 => {
                    if let Some(l) = self.lines.get_mut(&channel) {
                        if l.len() < 4096 {
                            l.push(b as char);
                            session.data(channel, vec![b])?;
                        }
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }

    async fn subsystem_request(&mut self, channel: ChannelId, name: &str, session: &mut Session) -> Result<(), Self::Error> {
        let (Some((site, user)), true) = (self.who.clone(), name == "sftp" && self.allowed()) else {
            return session.channel_failure(channel);
        };
        let Some(ch) = self.channels.remove(&channel) else { return session.channel_failure(channel) };
        session.channel_success(channel)?;
        let site_dir = self.shared.site_dir(&site);
        let site_real = std::fs::canonicalize(&site_dir).unwrap_or(site_dir.clone());
        let sftp = Sftp { shared: self.shared.clone(), site, login: user.login, site_dir, site_real, open: HashMap::new(), next: 0, started: false };
        tokio::spawn(russh_sftp::server::run(ch.into_stream(), sftp));
        Ok(())
    }

    async fn channel_eof(&mut self, channel: ChannelId, session: &mut Session) -> Result<(), Self::Error> {
        self.ptys.remove(&channel);
        if self.lines.remove(&channel).is_some() {
            return session.close(channel);
        }
        Ok(())
    }
}

// ---------- SFTP, kept inside the site folder ----------

enum Open {
    File(std::fs::File),
    Dir(PathBuf, bool),
}

struct Sftp {
    shared: Arc<Shared>,
    site: String,
    login: String,
    site_dir: PathBuf,
    site_real: PathBuf,
    open: HashMap<String, Open>,
    next: u64,
    started: bool,
}

fn status(id: u32) -> Status {
    Status { id, status_code: StatusCode::Ok, error_message: "Ok".into(), language_tag: "en-US".into() }
}

fn io_code(e: std::io::Error) -> StatusCode {
    match e.kind() {
        std::io::ErrorKind::NotFound => StatusCode::NoSuchFile,
        std::io::ErrorKind::PermissionDenied => StatusCode::PermissionDenied,
        _ => StatusCode::Failure,
    }
}

/// "/a/./b/../c" -> "a/c", never above the site folder.
fn clean(p: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for seg in p.split(['/', '\\']) {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    parts.join("/")
}

impl Sftp {
    /// The real path for an SFTP path. `..` is refused, and so is anything that ends up outside
    /// the site through a link or junction.
    fn resolve(&self, p: &str) -> Result<PathBuf, StatusCode> {
        let rel = p.trim_start_matches(['/', '\\']);
        let path = crate::nexhost::safe_join(&self.site_dir, rel).map_err(|_| StatusCode::PermissionDenied)?;
        let mut probe = Some(path.as_path());
        while let Some(q) = probe {
            if q.exists() {
                let real = std::fs::canonicalize(q).map_err(io_code)?;
                if !real.starts_with(&self.site_real) {
                    return Err(StatusCode::PermissionDenied);
                }
                break;
            }
            probe = q.parent();
        }
        if std::fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(StatusCode::PermissionDenied);
        }
        Ok(path)
    }

    fn may_write(&self) -> Result<(), StatusCode> {
        if self.shared.still_allowed(&self.site, &self.login) { Ok(()) } else { Err(StatusCode::PermissionDenied) }
    }

    fn note(&self, event: &str, what: &str) {
        self.shared.log(&self.login, &self.site, None, event, Some(what.chars().take(300).collect()));
    }

    fn handle(&mut self, o: Open) -> String {
        self.next += 1;
        let h = format!("h{}", self.next);
        self.open.insert(h.clone(), o);
        h
    }
}

fn attrs(meta: &std::fs::Metadata) -> FileAttributes {
    FileAttributes::from(meta)
}

impl russh_sftp::server::Handler for Sftp {
    type Error = StatusCode;

    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }

    async fn init(&mut self, _version: u32, _ext: HashMap<String, String>) -> Result<Version, Self::Error> {
        if std::mem::replace(&mut self.started, true) {
            return Err(StatusCode::ConnectionLost);
        }
        Ok(Version::new())
    }

    async fn realpath(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        Ok(Name { id, files: vec![File::dummy(format!("/{}", clean(&path)))] })
    }

    async fn open(&mut self, id: u32, filename: String, pflags: OpenFlags, _: FileAttributes) -> Result<Handle, Self::Error> {
        let path = self.resolve(&filename)?;
        let write = pflags.intersects(OpenFlags::WRITE | OpenFlags::APPEND | OpenFlags::CREATE | OpenFlags::TRUNCATE);
        if write {
            self.may_write()?;
            self.note("sftp_write", &filename);
        }
        let f = std::fs::OpenOptions::new()
            .read(pflags.contains(OpenFlags::READ) || !write)
            .write(pflags.contains(OpenFlags::WRITE))
            .append(pflags.contains(OpenFlags::APPEND))
            .create(pflags.contains(OpenFlags::CREATE) && !pflags.contains(OpenFlags::EXCLUDE))
            .create_new(pflags.contains(OpenFlags::CREATE) && pflags.contains(OpenFlags::EXCLUDE))
            .truncate(pflags.contains(OpenFlags::TRUNCATE))
            .open(&path)
            .map_err(io_code)?;
        Ok(Handle { id, handle: self.handle(Open::File(f)) })
    }

    async fn close(&mut self, id: u32, handle: String) -> Result<Status, Self::Error> {
        self.open.remove(&handle);
        Ok(status(id))
    }

    async fn read(&mut self, id: u32, handle: String, offset: u64, len: u32) -> Result<Data, Self::Error> {
        let Some(Open::File(f)) = self.open.get_mut(&handle) else { return Err(StatusCode::Failure) };
        f.seek(SeekFrom::Start(offset)).map_err(io_code)?;
        let mut buf = vec![0u8; len.min(256 * 1024) as usize];
        let n = f.read(&mut buf).map_err(io_code)?;
        if n == 0 {
            return Err(StatusCode::Eof);
        }
        buf.truncate(n);
        Ok(Data { id, data: buf })
    }

    async fn write(&mut self, id: u32, handle: String, offset: u64, data: Vec<u8>) -> Result<Status, Self::Error> {
        self.may_write()?;
        let Some(Open::File(f)) = self.open.get_mut(&handle) else { return Err(StatusCode::Failure) };
        f.seek(SeekFrom::Start(offset)).map_err(io_code)?;
        f.write_all(&data).map_err(io_code)?;
        Ok(status(id))
    }

    async fn opendir(&mut self, id: u32, path: String) -> Result<Handle, Self::Error> {
        let dir = self.resolve(&path)?;
        if !dir.is_dir() {
            return Err(StatusCode::NoSuchFile);
        }
        Ok(Handle { id, handle: self.handle(Open::Dir(dir, false)) })
    }

    async fn readdir(&mut self, id: u32, handle: String) -> Result<Name, Self::Error> {
        let Some(Open::Dir(dir, done)) = self.open.get_mut(&handle) else { return Err(StatusCode::Failure) };
        if std::mem::replace(done, true) {
            return Err(StatusCode::Eof);
        }
        let files = std::fs::read_dir(&*dir)
            .map_err(io_code)?
            .flatten()
            .filter_map(|e| {
                let meta = std::fs::symlink_metadata(e.path()).ok()?;
                (!meta.file_type().is_symlink()).then(|| File::new(e.file_name().to_string_lossy().into_owned(), attrs(&meta)))
            })
            .collect();
        Ok(Name { id, files })
    }

    async fn stat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        let meta = std::fs::metadata(self.resolve(&path)?).map_err(io_code)?;
        Ok(Attrs { id, attrs: attrs(&meta) })
    }

    async fn lstat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        let meta = std::fs::symlink_metadata(self.resolve(&path)?).map_err(io_code)?;
        Ok(Attrs { id, attrs: attrs(&meta) })
    }

    async fn fstat(&mut self, id: u32, handle: String) -> Result<Attrs, Self::Error> {
        let meta = match self.open.get(&handle) {
            Some(Open::File(f)) => f.metadata().map_err(io_code)?,
            Some(Open::Dir(d, _)) => std::fs::metadata(d).map_err(io_code)?,
            None => return Err(StatusCode::Failure),
        };
        Ok(Attrs { id, attrs: attrs(&meta) })
    }

    async fn setstat(&mut self, id: u32, path: String, _: FileAttributes) -> Result<Status, Self::Error> {
        self.resolve(&path)?;
        Ok(status(id))
    }

    async fn fsetstat(&mut self, id: u32, _: String, _: FileAttributes) -> Result<Status, Self::Error> {
        Ok(status(id))
    }

    async fn remove(&mut self, id: u32, filename: String) -> Result<Status, Self::Error> {
        self.may_write()?;
        let p = self.resolve(&filename)?;
        std::fs::remove_file(p).map_err(io_code)?;
        self.note("sftp_delete", &filename);
        Ok(status(id))
    }

    async fn mkdir(&mut self, id: u32, path: String, _: FileAttributes) -> Result<Status, Self::Error> {
        self.may_write()?;
        std::fs::create_dir(self.resolve(&path)?).map_err(io_code)?;
        self.note("sftp_write", &path);
        Ok(status(id))
    }

    async fn rmdir(&mut self, id: u32, path: String) -> Result<Status, Self::Error> {
        self.may_write()?;
        let p = self.resolve(&path)?;
        if p == self.site_dir {
            return Err(StatusCode::PermissionDenied);
        }
        std::fs::remove_dir(p).map_err(io_code)?;
        self.note("sftp_delete", &path);
        Ok(status(id))
    }

    async fn rename(&mut self, id: u32, oldpath: String, newpath: String) -> Result<Status, Self::Error> {
        self.may_write()?;
        let (from, to) = (self.resolve(&oldpath)?, self.resolve(&newpath)?);
        std::fs::rename(from, to).map_err(io_code)?;
        self.note("sftp_write", &format!("{oldpath} -> {newpath}"));
        Ok(status(id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use russh::ChannelMsg;

    struct Client;
    impl russh::client::Handler for Client {
        type Error = russh::Error;
        async fn check_server_key(&mut self, _: &russh::keys::PublicKeyOrCertificate) -> Result<bool, Self::Error> {
            Ok(true)
        }
    }

    struct Setup {
        _root: tempfile::TempDir,
        sites: Arc<RwLock<BTreeMap<String, NexSite>>>,
        server: SshServer,
        password: String,
        site_dir: PathBuf,
    }

    async fn setup() -> Setup {
        let root = tempfile::tempdir().unwrap();
        crate::nexhost::create(root.path(), "shop").unwrap();
        crate::nexhost::create(root.path(), "other").unwrap();
        std::fs::write(crate::nexhost::dir(root.path()).join("other").join("secret.txt"), "x").unwrap();
        let (user, password) = rules::new_user("shop", "maria", &[], 1).unwrap();
        let mut site = NexSite { port: 8201, ..Default::default() };
        site.ssh.on = true;
        site.ssh.users.push(user);
        let sites = Arc::new(RwLock::new(BTreeMap::from([("shop".to_string(), site)])));
        let server = SshServer::start_on(0, root.path().to_path_buf(), sites.clone(), std::env::var("PATH").unwrap_or_default(), Arc::new(|| true))
            .await
            .unwrap();
        let site_dir = crate::nexhost::dir(root.path()).join("shop");
        Setup { _root: root, sites, server, password, site_dir }
    }

    async fn login(port: u16, user: &str, pw: &str) -> Option<russh::client::Handle<Client>> {
        let config = Arc::new(russh::client::Config::default());
        let mut h = russh::client::connect(config, ("127.0.0.1", port), Client).await.ok()?;
        h.authenticate_password(user, pw).await.ok()?.success().then_some(h)
    }

    async fn run(h: &russh::client::Handle<Client>, cmd: &str) -> (String, Option<u32>) {
        let mut ch = h.channel_open_session().await.unwrap();
        ch.exec(true, cmd).await.unwrap();
        let (mut out, mut code) = (Vec::new(), None);
        while let Some(msg) = ch.wait().await {
            match msg {
                ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. } => out.extend_from_slice(&data),
                ChannelMsg::ExitStatus { exit_status } => code = Some(exit_status),
                ChannelMsg::Close => break,
                _ => {}
            }
        }
        (String::from_utf8_lossy(&out).into_owned(), code)
    }

    #[tokio::test]
    async fn password_login_and_command() {
        let s = setup().await;
        let h = login(s.server.port, "shop-maria", &s.password).await.expect("login works");
        let (out, code) = run(&h, "pwd").await;
        assert_eq!(code, Some(0), "{out}");
        assert!(out.trim_end().ends_with("shop"), "{out}");
        let (out, code) = run(&h, "cat ../other/secret.txt").await;
        assert_ne!(code, Some(0));
        assert!(!out.contains('x') || out.contains("outside"), "{out}");
    }

    #[tokio::test]
    async fn wrong_password_and_disabled_user_are_refused() {
        let s = setup().await;
        assert!(login(s.server.port, "shop-maria", "wrong").await.is_none());
        s.sites.write().unwrap().get_mut("shop").unwrap().ssh.users[0].enabled = false;
        assert!(login(s.server.port, "shop-maria", &s.password).await.is_none());
    }

    #[tokio::test]
    async fn sftp_stays_in_the_site() {
        let s = setup().await;
        let h = login(s.server.port, "shop-maria", &s.password).await.unwrap();
        let ch = h.channel_open_session().await.unwrap();
        ch.request_subsystem(true, "sftp").await.unwrap();
        let sftp = russh_sftp::client::SftpSession::new(ch.into_stream()).await.unwrap();
        assert!(sftp.read("../other/secret.txt").await.is_err());
        assert!(sftp.read("/../other/secret.txt").await.is_err());
        {
            use tokio::io::AsyncWriteExt;
            let mut f = sftp.create("hello.txt").await.unwrap();
            f.write_all(b"hi").await.unwrap();
            f.shutdown().await.unwrap();
        }
        assert_eq!(std::fs::read_to_string(s.site_dir.join("hello.txt")).unwrap(), "hi");
        let names: Vec<String> = sftp.read_dir("/").await.unwrap().map(|e| e.file_name()).collect();
        assert!(names.contains(&"index.php".to_string()) && names.contains(&"hello.txt".to_string()));
    }

    #[tokio::test]
    async fn forwarding_is_refused() {
        let s = setup().await;
        let h = login(s.server.port, "shop-maria", &s.password).await.unwrap();
        assert!(h.channel_open_direct_tcpip("127.0.0.1", 80, "127.0.0.1", 5000).await.is_err());
        assert!(login(s.server.port, "shop-maria", &s.password).await.is_some(), "server still works");
    }

    #[tokio::test]
    async fn site_turned_off_ends_session() {
        let s = setup().await;
        let h = login(s.server.port, "shop-maria", &s.password).await.unwrap();
        s.sites.write().unwrap().get_mut("shop").unwrap().ssh.on = false;
        // Either the new channel is refused, or the command is.
        if let Ok(mut ch) = h.channel_open_session().await {
            ch.exec(true, "pwd").await.unwrap();
            let mut code = None;
            while let Some(msg) = ch.wait().await {
                if let ChannelMsg::ExitStatus { exit_status } = msg {
                    code = Some(exit_status);
                }
            }
            assert_ne!(code, Some(0));
        }
    }
}
