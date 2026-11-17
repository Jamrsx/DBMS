//! macOS: where NexDB.app lives, and the things a Windows installer would make.
//! - Opened straight from the downloaded disk image, NexDB offers to copy itself to
//!   Applications and reopen from there (macOS runs apps from a disk image in a read-only,
//!   temporary place, so it would otherwise feel like a new install every time).
//! - Once it runs from Applications: a NexDB shortcut on the Desktop and one in the NexDB folder,
//!   made once (a shortcut the user deletes stays deleted), and `Uninstall NexDB.command` in the
//!   NexDB folder, which runs the same uninstall as Settings → Updates.

use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppPlace {
    /// Always false outside macOS.
    pub mac: bool,
    /// NexDB.app is in /Applications or ~/Applications.
    pub in_applications: bool,
}

/// The NexDB.app this program runs from.
pub fn bundle() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors().find(|p| p.extension().is_some_and(|e| e == "app")).map(Path::to_path_buf)
}

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/tmp"))
}

pub fn in_applications(app: &Path) -> bool {
    app.starts_with("/Applications") || app.starts_with(home().join("Applications"))
}

pub fn place() -> AppPlace {
    if cfg!(not(target_os = "macos")) {
        return AppPlace { mac: false, in_applications: true };
    }
    AppPlace { mac: true, in_applications: bundle().is_some_and(|b| in_applications(&b)) }
}

/// Copies NexDB.app into /Applications (or ~/Applications when /Applications isn't writable),
/// replacing an older copy, and returns where it went. The caller reopens it from there.
#[cfg(target_os = "macos")]
pub fn copy_to_applications() -> Result<PathBuf, String> {
    use std::process::Command;
    let from = bundle().ok_or("NexDB isn't running from an .app.")?;
    let name = from.file_name().map(|n| n.to_owned()).unwrap_or_else(|| "NexDB.app".into());
    let mut last = String::new();
    for dir in [PathBuf::from("/Applications"), home().join("Applications")] {
        let _ = std::fs::create_dir_all(&dir);
        let target = dir.join(&name);
        let staging = dir.join(".NexDB.app.new");
        let _ = std::fs::remove_dir_all(&staging);
        let copied = Command::new("/usr/bin/ditto").arg(&from).arg(&staging).output();
        match copied {
            Ok(o) if o.status.success() => {}
            Ok(o) => {
                last = String::from_utf8_lossy(&o.stderr).lines().next().unwrap_or("").to_string();
                let _ = std::fs::remove_dir_all(&staging);
                continue;
            }
            Err(e) => {
                last = e.to_string();
                continue;
            }
        }
        // The user already chose Open Anyway for this copy; the moved one shouldn't ask again.
        let _ = Command::new("/usr/bin/xattr").args(["-dr", "com.apple.quarantine"]).arg(&staging).output();
        if target.exists() {
            if let Err(e) = std::fs::remove_dir_all(&target) {
                last = format!("Couldn't replace the NexDB in {}: {e}", dir.display());
                let _ = std::fs::remove_dir_all(&staging);
                continue;
            }
        }
        std::fs::rename(&staging, &target).map_err(|e| format!("Couldn't finish copying NexDB: {e}"))?;
        return Ok(target);
    }
    Err(format!("Couldn't copy NexDB to Applications ({last}). Drag NexDB from the disk image onto Applications instead."))
}

/// Reopens NexDB from `app` a moment after this copy has quit (only one NexDB runs at a time).
#[cfg(target_os = "macos")]
pub fn reopen_later(app: &Path) {
    let script = format!("sleep 1; /usr/bin/open -n {}", crate::platform::sh_quote(&app.display().to_string()));
    let _ = std::process::Command::new("/bin/sh").args(["-c", &script]).spawn();
}

/// The Desktop and NexDB-folder shortcuts (once) and the uninstaller file (kept up to date).
/// Only from Applications: a shortcut to the disk image's temporary copy would break.
#[cfg(target_os = "macos")]
pub fn ensure_shortcuts(root: &Path) {
    let Some(app) = bundle().filter(|b| in_applications(b)) else { return };
    let marker = root.join("etc").join(".mac-shortcuts");
    if !marker.exists() {
        for link in [home().join("Desktop").join("NexDB.app"), root.join("NexDB.app")] {
            if std::fs::symlink_metadata(&link).is_err() {
                let _ = std::os::unix::fs::symlink(&app, &link);
            }
        }
        let _ = std::fs::create_dir_all(root.join("etc"));
        let _ = std::fs::write(&marker, "Desktop and folder shortcuts made; a deleted one isn't made again.\n");
    } else if std::fs::read_link(root.join("NexDB.app")).is_ok_and(|t| t != app) {
        // NexDB moved (say, to ~/Applications): the folder shortcut follows it.
        let _ = std::fs::remove_file(root.join("NexDB.app"));
        let _ = std::os::unix::fs::symlink(&app, root.join("NexDB.app"));
    }
    let _ = write_uninstaller(root, &app);
}

/// `Uninstall NexDB.command`: double-click to quit NexDB and run its uninstall.
pub fn uninstaller_text(app: &Path, exe_name: &str) -> String {
    let q = |p: &Path| crate::platform::sh_quote(&p.display().to_string());
    format!(
        "#!/bin/sh\n\
         # Made by NexDB. Double-click to uninstall NexDB from this Mac.\n\
         # It asks whether to keep this folder (your projects and databases); keeping it is the default.\n\
         APP={app}\n\
         [ -d \"$APP\" ] || APP=\"/Applications/NexDB.app\"\n\
         [ -d \"$APP\" ] || APP=\"$HOME/Applications/NexDB.app\"\n\
         if [ ! -x \"$APP/Contents/MacOS/{exe_name}\" ]; then\n\
         \x20 echo \"NexDB.app is already gone. To finish, delete this folder yourself if you don't need it.\"\n\
         \x20 exit 0\n\
         fi\n\
         /usr/bin/osascript -e 'tell application \"NexDB\" to quit' >/dev/null 2>&1\n\
         sleep 2\n\
         \"$APP/Contents/MacOS/{exe_name}\" --uninstall\n",
        app = q(app),
    )
}

#[cfg(target_os = "macos")]
fn write_uninstaller(root: &Path, app: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let exe_name = std::env::current_exe()?.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "NexDB".into());
    let path = root.join("Uninstall NexDB.command");
    let text = uninstaller_text(app, &exe_name);
    if std::fs::read_to_string(&path).ok().as_deref() != Some(text.as_str()) {
        std::fs::write(&path, text)?;
    }
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uninstaller_quits_nexdb_then_runs_its_uninstall() {
        let text = uninstaller_text(Path::new("/Applications/NexDB.app"), "devmanager");
        assert!(text.starts_with("#!/bin/sh\n"));
        assert!(text.contains("APP='/Applications/NexDB.app'\n"), "{text}");
        assert!(text.contains("tell application \"NexDB\" to quit"));
        assert!(text.ends_with("\"$APP/Contents/MacOS/devmanager\" --uninstall\n"), "{text}");
        assert!(text.contains("\n  exit 0\n"), "indented lines keep their spaces: {text}");
    }
}
