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
    dirs.push(root.join("bin"));
    dirs.retain(|d| d.is_dir());
    dirs
}

/// `dirs` first, then the existing PATH.
pub fn path_with(dirs: &[PathBuf], existing: &str) -> String {
    let mut parts: Vec<String> = dirs.iter().map(|d| d.display().to_string()).collect();
    parts.push(existing.to_string());
    parts.join(";")
}

/// Splits off any incomplete UTF-8 sequence at the end so it can be joined with the next read.
fn split_complete(bytes: &[u8]) -> usize {
    match std::str::from_utf8(bytes) {
        Ok(_) => bytes.len(),
        Err(e) if e.error_len().is_none() => e.valid_up_to(),
        Err(_) => bytes.len(),
    }
}

/// PowerShell in the projects folder with NexDB's tools on PATH; `extra` are added to its arguments.
fn shell_command(root: &Path, settings: &Settings, extra: &[&str]) -> CommandBuilder {
    let mut cmd = CommandBuilder::new("powershell.exe");
    cmd.args(["-NoLogo", "-NoExit"]);
    cmd.args(extra);
    let existing = std::env::var("PATH").unwrap_or_default();
    cmd.env("PATH", path_with(&tool_dirs(root, settings), &existing));
    let php_ini = root.join("etc").join("php");
    if php_ini.join("php.ini").is_file() {
        cmd.env("PHPRC", php_ini);
    }
    let www = PathBuf::from(&settings.www_dir);
    cmd.cwd(if www.is_dir() { www } else { root.to_path_buf() });
    cmd
}

impl Terminals {
    pub fn open(&self, app: &AppHandle, owner: &str, root: &Path, settings: &Settings, cols: u16, rows: u16) -> Result<u32, String> {
        let pair = native_pty_system()
            .openpty(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("Couldn't open a terminal: {e}"))?;

        let cmd = shell_command(root, settings, &[]);

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
        let cmd = shell_command(root, &settings, &["-Command", script]);
        let mut child = pair.slave.spawn_command(cmd).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut out = Vec::new();
        let mut buf = [0u8; 4096];
        let t = std::time::Instant::now();
        while t.elapsed() < Duration::from_secs(90) {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => out.extend_from_slice(&buf[..n]),
            }
            if String::from_utf8_lossy(&out).contains("GIT=") {
                break;
            }
        }
        let _ = child.kill();
        let text = String::from_utf8_lossy(&out).into_owned();
        println!("{text}");
        for needle in [r"CWD=C:\NexDB\www","PHP=8.5.12", "COMPOSER=Composer version 2", "NODE=v26", "MYSQL=", "9.7.4", "GIT=git version"] {
            assert!(text.contains(needle), "missing {needle}");
        }
    }
}
