//! What differs between Windows and macOS, kept in one place.
//!
//! Windows behaviour stays exactly as before: on Windows every helper here returns what the
//! old code used directly. The macOS side is used only in Mac builds. See docs/macos-port.md.

#![cfg_attr(windows, allow(dead_code))]

#[cfg(not(windows))]
use std::path::PathBuf;
#[cfg(not(windows))]
use std::process::Command;

/// A program's file name on this OS: `php.exe` on Windows, `php` on macOS.
/// Call sites keep the Windows name, so the code reads the same as before.
pub fn exe(name: &str) -> String {
    if cfg!(windows) {
        return name.to_string();
    }
    let lower = name.to_ascii_lowercase();
    for ext in [".exe", ".cmd", ".bat"] {
        if lower.ends_with(ext) {
            return name[..name.len() - ext.len()].to_string();
        }
    }
    name.to_string()
}

/// Suggested install folder: `C:\NexDB` on Windows, `~/NexDB` on macOS (no admin needed).
pub fn default_root() -> std::path::PathBuf {
    #[cfg(windows)]
    return std::path::PathBuf::from(r"C:\NexDB");
    #[cfg(not(windows))]
    unix::home().join("NexDB")
}

/// Per-user app data: `%LOCALAPPDATA%` on Windows, `~/Library/Application Support` on macOS.
/// LOCALAPPDATA wins on any OS when set, so tests can point it at a temporary folder.
pub fn local_data_dir() -> std::path::PathBuf {
    if let Some(dir) = std::env::var_os("LOCALAPPDATA") {
        return std::path::PathBuf::from(dir);
    }
    #[cfg(not(windows))]
    return unix::home().join("Library").join("Application Support");
    #[cfg(windows)]
    std::env::temp_dir()
}

/// Separator between PATH entries: `;` on Windows, `:` on macOS.
pub const PATH_SEP: &str = if cfg!(windows) { ";" } else { ":" };

/// "PC" on Windows, "Mac" on macOS, for plain-language messages.
pub const COMPUTER: &str = if cfg!(target_os = "macos") { "Mac" } else { "PC" };

/// A command line run by the OS shell: `cmd /C` on Windows, `/bin/sh -c` on macOS.
pub fn shell(command: &str) -> std::process::Command {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("cmd");
        cmd.arg("/C").arg(command);
        cmd
    }
    #[cfg(not(windows))]
    {
        let mut cmd = std::process::Command::new("/bin/sh");
        cmd.arg("-c").arg(command);
        cmd
    }
}

/// This computer's name on macOS (`scutil`); `None` on Windows, which uses COMPUTERNAME.
pub fn host_name() -> Option<String> {
    #[cfg(not(windows))]
    return unix::device_name();
    #[cfg(windows)]
    None
}

/// Listening TCP ports and the process id holding each, from `lsof -F pn` output.
/// Lines are `p<pid>`, `f<fd>` and `n<address>:<port>`; `*:80`, `127.0.0.1:3306`, `[::1]:5173`.
pub fn parse_lsof_listen(text: &str) -> Vec<(u16, u32)> {
    let mut out = Vec::new();
    let mut pid: Option<u32> = None;
    for line in text.lines() {
        if let Some(p) = line.strip_prefix('p') {
            pid = p.trim().parse().ok();
        } else if let Some(addr) = line.strip_prefix('n') {
            let (Some(pid), Some(port)) = (pid, addr.rsplit(':').next().and_then(|p| p.trim().parse::<u16>().ok()))
            else {
                continue;
            };
            if !out.contains(&(port, pid)) {
                out.push((port, pid));
            }
        }
    }
    out
}

/// Quotes text for a POSIX shell: `it's` becomes `'it'\''s'`.
/// macOS: the socket file NexDB's MySQL uses, inside NexDB's folder. MySQL's default,
/// /tmp/mysql.sock, is shared with every other MySQL on the Mac (Homebrew, MAMP, an older
/// NexDB), so two of them can't run side by side. Socket paths are limited to 104 bytes.
pub fn mysql_socket(root: &std::path::Path) -> std::path::PathBuf {
    let own = root.join("logs").join("mysql.sock");
    if own.as_os_str().len() < 100 { own } else { std::path::PathBuf::from("/tmp/nexdb-mysql.sock") }
}

pub fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// Quotes text for an AppleScript string literal.
pub fn applescript_quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', r"\\").replace('"', "\\\""))
}

#[cfg(not(windows))]
pub mod unix {
    use super::*;

    /// Listening TCP ports on this Mac and the process holding each.
    pub fn listening_ports() -> Vec<(u16, u32)> {
        let out = Command::new("/usr/sbin/lsof").args(["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pn"]).output();
        match out {
            Ok(o) => parse_lsof_listen(&String::from_utf8_lossy(&o.stdout)),
            Err(_) => Vec::new(),
        }
    }

    /// The program name of a running process, such as `httpd`.
    pub fn process_name(pid: u32) -> Option<String> {
        let o = Command::new("/bin/ps").args(["-p", &pid.to_string(), "-o", "comm="]).output().ok()?;
        let full = String::from_utf8_lossy(&o.stdout).trim().to_string();
        let name = full.rsplit('/').next().unwrap_or(&full).to_string();
        (!name.is_empty()).then_some(name)
    }

    /// Runs a shell script as administrator. macOS shows its own password prompt.
    /// Returns a plain-language error when the user cancels.
    pub fn run_as_admin(script: &str) -> Result<(), String> {
        let apple = format!(
            "do shell script {} with administrator privileges",
            applescript_quote(script)
        );
        let out = Command::new("/usr/bin/osascript").args(["-e", &apple]).output().map_err(|e| e.to_string())?;
        if out.status.success() {
            return Ok(());
        }
        let err = String::from_utf8_lossy(&out.stderr);
        if err.contains("-128") {
            return Err("The change needs your Mac password. It was cancelled, so nothing changed.".into());
        }
        Err(format!("macOS refused the change: {}", err.trim()))
    }

    /// Stable id of this Mac (IOPlatformUUID). Callers hash it before sending.
    pub fn machine_id() -> Option<String> {
        let o = Command::new("/usr/sbin/ioreg").args(["-rd1", "-c", "IOPlatformExpertDevice"]).output().ok()?;
        let text = String::from_utf8_lossy(&o.stdout);
        let line = text.lines().find(|l| l.contains("IOPlatformUUID"))?;
        let id = line.rsplit('=').next()?.trim().trim_matches('"').to_string();
        (!id.is_empty()).then_some(id)
    }

    /// The name the user gave this Mac, such as "Ana's MacBook Air".
    pub fn device_name() -> Option<String> {
        let o = Command::new("/usr/sbin/scutil").args(["--get", "ComputerName"]).output().ok()?;
        let name = String::from_utf8_lossy(&o.stdout).trim().to_string();
        (!name.is_empty()).then_some(name)
    }

    /// The user's login shell, normally `/bin/zsh`.
    /// The full path of a running process's program, such as `/Users/me/NexDB/bin/.../httpd`.
    pub fn process_path(pid: u32) -> Option<PathBuf> {
        let o = Command::new("/bin/ps").args(["-p", &pid.to_string(), "-o", "comm="]).output().ok()?;
        let full = String::from_utf8_lossy(&o.stdout).trim().to_string();
        full.starts_with('/').then(|| PathBuf::from(full))
    }

    /// PATH as a new Terminal window has it (the login shell reads ~/.zprofile and the like).
    /// Falls back to NexDB's own PATH if the shell doesn't answer within a few seconds.
    pub fn login_path() -> String {
        let fallback = || std::env::var("PATH").unwrap_or_default();
        let child = Command::new(user_shell())
            .args(["-l", "-c", "printf %s \"$PATH\""])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn();
        let Ok(mut child) = child else { return fallback() };
        let start = std::time::Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if start.elapsed() < std::time::Duration::from_secs(5) => {
                    std::thread::sleep(std::time::Duration::from_millis(30))
                }
                _ => {
                    let _ = child.kill();
                    return fallback();
                }
            }
        }
        let out = child.wait_with_output().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
        if out.is_empty() { fallback() } else { out }
    }

    pub fn user_shell() -> String {
        std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/zsh".into())
    }

    /// The user's home folder.
    pub fn home() -> PathBuf {
        std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/tmp"))
    }

    /// Lets macOS run downloaded programs: removes the "downloaded from the internet" flag,
    /// so Gatekeeper does not block each server program on first start.
    pub fn allow_downloaded(dir: &std::path::Path) {
        let _ = Command::new("/usr/bin/xattr").arg("-dr").arg("com.apple.quarantine").arg(dir).output();
    }

    /// Copies a folder with its contents, keeping file modes (like `robocopy /E`).
    pub fn copy_dir(from: &std::path::Path, to: &std::path::Path) -> Result<(), String> {
        std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
        let out = Command::new("/bin/cp").arg("-R").arg(format!("{}/.", from.display())).arg(to).output()
            .map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exe_names_follow_the_os() {
        if cfg!(windows) {
            assert_eq!(exe("php.exe"), "php.exe");
        } else {
            assert_eq!(exe("php.exe"), "php");
            assert_eq!(exe("npm.cmd"), "npm");
            assert_eq!(exe("httpd"), "httpd");
        }
    }

    #[test]
    fn reads_lsof_listeners() {
        let text = "p101\nf4\nn*:80\nf5\nn[::]:80\np202\nf7\nn127.0.0.1:3306\np303\nf9\nn[::1]:5173\n";
        assert_eq!(parse_lsof_listen(text), vec![(80, 101), (3306, 202), (5173, 303)]);
    }

    #[test]
    fn quotes_for_shell_and_applescript() {
        assert_eq!(sh_quote("it's"), r"'it'\''s'");
        assert_eq!(applescript_quote(r#"say "hi" \"#), r#""say \"hi\" \\""#);
    }
}
