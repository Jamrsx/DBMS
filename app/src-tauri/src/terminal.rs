//! The built-in terminal: a real Windows pseudo-console (ConPTY) running PowerShell, started in
//! the projects folder with NexDB's own PHP, Node, Composer and MySQL tools first on PATH.

use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
#[cfg(test)]
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::settings::Settings;

struct Session {
    /// Label of the window the session belongs to; it closes with that window.
    owner: String,
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct Terminals {
    next: AtomicU32,
    sessions: Mutex<HashMap<u32, Session>>,
}

#[derive(Clone, Serialize)]
struct Output {
    id: u32,
    data: String,
}

#[derive(Clone, Serialize)]
struct Exited {
    id: u32,
}

/// Folders added to the front of PATH so `php`, `composer`, `node`, `npm` and `mysql` work.
pub fn tool_dirs(root: &Path, settings: &Settings) -> Vec<PathBuf> {
    let dir_of = |id: &str| {
        settings.components.iter().find(|c| c.id == id).map(|c| {
            let p = PathBuf::from(&c.path);
            if p.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) { p.parent().map(Path::to_path_buf).unwrap_or(p) } else { p }
        })
    };
    let mut dirs = Vec::new();
    for id in ["php", "node", "composer"] {
        dirs.extend(dir_of(id));
    }
    if let Some(mysql) = dir_of("mysql") {
        dirs.push(mysql.join("bin"));
    }
    // NexDB's own Git, when installed, comes before any Git already on the PC.
    if let Some(git) = dir_of("git") {
        dirs.push(git.join("cmd"));
    }
    if let Some(apache) = dir_of("apache") {
        dirs.push(apache.join("bin"));
    }
    // Python and the commands pip installs; psql; redis-cli.
    if let Some(python) = dir_of("python") {
        // Windows keeps pip's commands in Scripts, macOS in bin.
        dirs.push(python.join(if cfg!(windows) { "Scripts" } else { "bin" }));
        dirs.push(python);
    }
    if let Some(postgres) = dir_of("postgres") {
        dirs.push(postgres.join("bin"));
    }
    // The `mariadb` client; after MySQL's, so `mysql` stays MySQL's own.
    if let Some(mariadb) = dir_of("mariadb") {
        dirs.push(mariadb.join("bin"));
    }
    dirs.extend(dir_of("redis"));
    dirs.push(root.join("bin"));
    dirs.retain(|d| d.is_dir());
    dirs
}

/// `dirs` first, then the existing PATH.
pub fn path_with(dirs: &[PathBuf], existing: &str) -> String {
    let mut parts: Vec<String> = dirs.iter().map(|d| d.display().to_string()).collect();
    parts.push(existing.to_string());
    parts.join(crate::platform::PATH_SEP)
}

/// Splits off any incomplete UTF-8 sequence at the end so it can be joined with the next read.
fn split_complete(bytes: &[u8]) -> usize {
    match std::str::from_utf8(bytes) {
        Ok(_) => bytes.len(),
        Err(e) if e.error_len().is_none() => e.valid_up_to(),
        Err(_) => bytes.len(),
    }
}

/// macOS zsh: a login shell runs Apple's path_helper and the user's own ~/.zprofile, which put
/// /usr/local/bin, Homebrew and the like in front of NexDB's tools. NexDB's startup files (in
/// `etc/zsh`, used through ZDOTDIR) load the user's own files first, then put NexDB's folders
/// back at the front, so `php`, `node` and `mysql` are NexDB's (this project's) here.
#[cfg(not(windows))]
fn zsh_keeps_nexdb_first(root: &Path, cmd: &mut CommandBuilder, dirs: &[PathBuf]) {
    if !crate::platform::unix::user_shell().ends_with("zsh") {
        return;
    }
    let own = root.join("etc").join("zsh");
    if write_zsh_files(&own).is_err() {
        return;
    }
    let user = std::env::var("ZDOTDIR")
        .ok()
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| crate::platform::unix::home().display().to_string());
    cmd.env("NEXDB_USER_ZDOTDIR", user);
    cmd.env("NEXDB_PATH_FIRST", dirs.iter().map(|d| d.display().to_string()).collect::<Vec<_>>().join(":"));
    cmd.env("ZDOTDIR", &own);
}

#[cfg(not(windows))]
fn zsh_file(name: &str) -> String {
    let mut text = format!(
        "# Made by NexDB for its Terminal: runs your own {name}, then keeps NexDB's tools first.\n\
         NEXDB_OWN_ZDOTDIR=\"$ZDOTDIR\"\n\
         ZDOTDIR=\"$NEXDB_USER_ZDOTDIR\"\n\
         [[ -r \"$ZDOTDIR/{name}\" ]] && source \"$ZDOTDIR/{name}\"\n\
         NEXDB_USER_ZDOTDIR=\"$ZDOTDIR\"\n\
         ZDOTDIR=\"$NEXDB_OWN_ZDOTDIR\"\n"
    );
    // .zlogin runs last, for interactive shells and `zsh -l -c` alike.
    if name == ".zlogin" {
        text.push_str(
            "[[ -n \"$NEXDB_PATH_FIRST\" ]] && export PATH=\"$NEXDB_PATH_FIRST:$PATH\"\n\
             [[ \"$HISTFILE\" == \"$NEXDB_OWN_ZDOTDIR/.zsh_history\" ]] && HISTFILE=\"$NEXDB_USER_ZDOTDIR/.zsh_history\"\n\
             ZDOTDIR=\"$NEXDB_USER_ZDOTDIR\"\n",
        );
    }
    text
}

#[cfg(not(windows))]
fn write_zsh_files(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    for name in [".zshenv", ".zprofile", ".zshrc", ".zlogin"] {
        let path = dir.join(name);
        let text = zsh_file(name);
        if std::fs::read_to_string(&path).ok().as_deref() != Some(text.as_str()) {
            std::fs::write(&path, text)?;
        }
    }
    Ok(())
}

/// PowerShell in the projects folder with NexDB's tools on PATH; `extra` are added to its arguments.
/// `php` is the project's own PHP version when it doesn't use the default.
fn shell_command(
    root: &Path,
    settings: &Settings,
    extra: &[&str],
    cwd: Option<&Path>,
    php: Option<&crate::phpver::Extra>,
) -> CommandBuilder {
    #[cfg(windows)]
    let mut cmd = CommandBuilder::new("powershell.exe");
    #[cfg(windows)]
    {
        cmd.args(["-NoLogo", "-NoExit"]);
        cmd.args(extra);
    }
    // macOS: the user's own shell (zsh by default) as a login shell, so their setup loads.
    // `extra` holds PowerShell arguments; on macOS only `-Command <script>` is understood.
    #[cfg(not(windows))]
    let mut cmd = CommandBuilder::new(crate::platform::unix::user_shell());
    #[cfg(not(windows))]
    {
        cmd.arg("-l");
        if let [flag, script] = extra {
            if flag.eq_ignore_ascii_case("-Command") {
                cmd.args(["-c", script]);
            }
        }
        cmd.env("TERM", "xterm-256color");
    }
    let existing = std::env::var("PATH").unwrap_or_default();
    let mut dirs = tool_dirs(root, settings);
    let php_ini = match php {
        Some(p) => {
            // This project's PHP comes first, and Composer follows it (see the composer shim).
            dirs.insert(0, p.dir.clone());
            cmd.env("NEXDB_PHP_EXE", p.dir.join(crate::platform::exe("php.exe")));
            cmd.env("NEXDB_PHP_INI", p.ini_dir.join("php-cli.ini"));
            p.ini_dir.clone()
        }
        None => root.join("etc").join("php"),
    };
    // A project with an .nvmrc gets the Node it names, ahead of the default.
    if let Some(dir) = cwd {
        let www = PathBuf::from(&settings.www_dir);
        if let Some(node) = crate::nodever::project_of(&www, dir).and_then(|p| crate::nodever::dir_for(root, settings, &p)) {
            dirs.insert(0, node);
        }
    }
    cmd.env("PATH", path_with(&dirs, &existing));
    // macOS: `mysql -u root` talks to NexDB's MySQL, not whatever owns /tmp/mysql.sock.
    #[cfg(not(windows))]
    {
        cmd.env("MYSQL_UNIX_PORT", crate::platform::mysql_socket(root));
        zsh_keeps_nexdb_first(root, &mut cmd, &dirs);
    }
    if php_ini.join("php.ini").is_file() {
        cmd.env("PHPRC", php_ini);
    }
    let www = PathBuf::from(&settings.www_dir);
    cmd.cwd(match cwd.filter(|d| d.is_dir()) {
        Some(dir) => dir.to_path_buf(),
        None if www.is_dir() => www,
        None => root.to_path_buf(),
    });
    cmd
}

impl Terminals {
    /// `cwd` is where the shell starts; the projects folder when None.
    #[allow(clippy::too_many_arguments)]
    pub fn open(
        &self,
        app: &AppHandle,
        owner: &str,
        root: &Path,
        settings: &Settings,
        cwd: Option<&Path>,
        php: Option<&crate::phpver::Extra>,
        cols: u16,
        rows: u16,
    ) -> Result<u32, String> {
        let pair = native_pty_system()
            .openpty(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("Couldn't open a terminal: {e}"))?;

        let cmd = shell_command(root, settings, &[], cwd, php);

        let child = pair.slave.spawn_command(cmd).map_err(|e| format!("Couldn't start PowerShell: {e}"))?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

        let id = self.next.fetch_add(1, Ordering::SeqCst) + 1;
        let app = app.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let mut pending: Vec<u8> = Vec::new();
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        pending.extend_from_slice(&buf[..n]);
                        let cut = split_complete(&pending);
                        if cut > 0 {
                            let data = String::from_utf8_lossy(&pending[..cut]).into_owned();
                            pending.drain(..cut);
                            let _ = app.emit("terminal-output", Output { id, data });
                        }
                    }
                }
            }
            let _ = app.emit("terminal-exit", Exited { id });
        });

        self.sessions.lock().unwrap().insert(id, Session { owner: owner.to_string(), writer, master: pair.master, child });
        Ok(id)
    }

    pub fn write(&self, id: u32, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        let s = sessions.get_mut(&id).ok_or("That terminal has closed.")?;
        s.writer.write_all(data.as_bytes()).and_then(|_| s.writer.flush()).map_err(|e| e.to_string())
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let s = sessions.get(&id).ok_or("That terminal has closed.")?;
        s.master
            .resize(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())
    }

    pub fn close(&self, id: u32) {
        if let Some(mut s) = self.sessions.lock().unwrap().remove(&id) {
            let _ = s.child.kill();
        }
    }

    /// Closes every session a window opened, when that window goes away.
    pub fn close_owner(&self, owner: &str) {
        let ids: Vec<u32> =
            self.sessions.lock().unwrap().iter().filter(|(_, s)| s.owner == owner).map(|(id, _)| *id).collect();
        for id in ids {
            self.close(id);
        }
    }

    pub fn close_all(&self) {
        let ids: Vec<u32> = self.sessions.lock().unwrap().keys().copied().collect();
        for id in ids {
            self.close(id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Uses Windows paths (C:\..., .exe); macOS behaviour is covered by the Mac check run.

    #[cfg(windows)]

    #[test]
    fn path_puts_nexdb_tools_first() {
        let dir = tempfile::tempdir().unwrap();
        let p = path_with(&[dir.path().to_path_buf()], r"C:\Windows");
        assert!(p.starts_with(&dir.path().display().to_string()));
        assert!(p.ends_with(r";C:\Windows"));
    }

    #[test]
    fn incomplete_utf8_is_held_back() {
        let bytes = "é".as_bytes(); // two bytes
        assert_eq!(split_complete(&bytes[..1]), 0);
        assert_eq!(split_complete(bytes), 2);
        let mut mixed = b"ab".to_vec();
        mixed.push(bytes[0]);
        assert_eq!(split_complete(&mixed), 2);
    }

    /// A real pseudo-console running PowerShell with NexDB's tools: `php`, `composer`, `node`,
    /// `npm`, `mysql` and `git` must all answer, and the shell must start in the www folder.
    /// `cargo test real_terminal_runs_tools -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_terminal_runs_tools() {
        let root = Path::new(r"C:\NexDB");
        let settings = crate::settings::load(root).expect("NexDB must be installed in C:/NexDB");
        let pair = native_pty_system()
            .openpty(PtySize { rows: 30, cols: 200, pixel_width: 0, pixel_height: 0 })
            .unwrap();
        let script = "Write-Output ('CWD=' + (Get-Location).Path); \
            Write-Output ('PHP=' + (php -r 'echo PHP_VERSION;')); \
            Write-Output ('COMPOSER=' + ((composer --version) -join ' ')); \
            Write-Output ('NODE=' + (node -v)); Write-Output ('NPM=' + (npm -v)); \
            Write-Output ('MYSQL=' + ((mysql --version) -join ' ')); \
            Write-Output ('GIT=' + ((git --version) -join ' ')); exit";
        let cmd = shell_command(root, &settings, &["-Command", script], None, None);
        let mut child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        // Read on a thread: a blocking read would ignore the time limit if the shell goes quiet.
        let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 || tx.send(buf[..n].to_vec()).is_err() {
                    break;
                }
            }
        });
        // ConPTY asks where the cursor is (ESC[6n) and waits for the answer; xterm.js gives it in
        // the app, so the test answers it the same way.
        let mut writer = pair.master.take_writer().unwrap();
        let mut out = Vec::new();
        let deadline = std::time::Instant::now() + Duration::from_secs(90);
        while let Some(left) = deadline.checked_duration_since(std::time::Instant::now()) {
            match rx.recv_timeout(left) {
                Ok(chunk) => {
                    if chunk.windows(4).any(|w| w == b"\x1b[6n") {
                        let _ = writer.write_all(b"\x1b[1;1R");
                    }
                    out.extend_from_slice(&chunk)
                }
                Err(_) => break,
            }
            if String::from_utf8_lossy(&out).contains("GIT=") {
                break;
            }
        }
        let _ = child.kill();
        drop(pair.master);
        let raw = String::from_utf8_lossy(&out).into_owned();
        // Drop the terminal's escape codes (colours, cursor moves, titles), which split words.
        let mut text = String::new();
        let mut chars = raw.chars().peekable();
        while let Some(c) = chars.next() {
            if c != '\x1b' {
                text.push(c);
                continue;
            }
            match chars.next() {
                Some('[') => {
                    while let Some(&n) = chars.peek() {
                        chars.next();
                        if n.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
                // A title: ends with BEL or with ESC \.
                Some(']') => {
                    while let Some(n) = chars.next() {
                        if n == '\x07' {
                            break;
                        }
                        if n == '\x1b' {
                            chars.next();
                            break;
                        }
                    }
                }
                _ => {}
            }
        }
        println!("{text}");
        for needle in [r"CWD=C:\NexDB\www","PHP=8.5.12", "COMPOSER=Composer version 2", "NODE=v26", "MYSQL=", "9.7.4", "GIT=git version"] {
            assert!(text.contains(needle), "missing {needle}");
        }
    }
}
