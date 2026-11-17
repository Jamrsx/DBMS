//! Projects in the Windows Recycle Bin that came from the projects folder, so they can be
//! brought back from NexDB. Reads the bin through Windows' own Shell, so nothing is guessed.

use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(windows)]
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Deleted {
    /// The project's name (its folder name before it was deleted).
    pub name: String,
    /// Seconds since 1970.
    pub deleted: i64,
    /// Where the bin keeps it now (`C:\$Recycle.Bin\…\$R…`); used to restore it.
    pub path: String,
}

#[cfg(windows)]
fn powershell(script: &str) -> Result<String, String> {
    let mut cmd = Command::new(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().map_err(|e| format!("Couldn't run PowerShell: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).lines().next().unwrap_or("PowerShell failed").trim().to_string())
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// macOS: what NexDB moved to the Trash. Apps can't read the Trash without Full Disk Access, so
/// NexDB keeps its own record of where Finder put each project, and asks Finder (which may) to
/// check and move it back.
#[cfg(not(windows))]
mod mac {
    use super::Deleted;
    use serde::{Deserialize, Serialize};
    use std::path::{Path, PathBuf};
    use std::process::Command;

    #[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
    pub struct Record {
        pub www: String,
        pub name: String,
        pub deleted: i64,
        /// Where Finder put it, like /Users/me/.Trash/blog.
        pub path: String,
    }

    fn file() -> PathBuf {
        crate::platform::local_data_dir().join("NexDB").join("trash.json")
    }

    pub fn load() -> Vec<Record> {
        std::fs::read_to_string(file()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
    }

    pub fn save(records: &[Record]) -> Result<(), String> {
        let f = file();
        if let Some(dir) = f.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&f, serde_json::to_string_pretty(records).unwrap_or_default()).map_err(|e| e.to_string())
    }

    pub fn osascript(lines: &[String]) -> Result<String, String> {
        let mut cmd = Command::new("/usr/bin/osascript");
        for l in lines {
            cmd.args(["-e", l]);
        }
        let out = cmd.output().map_err(|e| format!("Couldn't ask Finder: {e}"))?;
        if out.status.success() {
            Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
        } else {
            let err = String::from_utf8_lossy(&out.stderr).to_string();
            Err(if err.contains("-1743") {
                "macOS didn't let NexDB use Finder. Allow it in System Settings, Privacy & Security, Automation, then try again.".into()
            } else {
                err.lines().next().unwrap_or("Finder didn't answer.").trim().to_string()
            })
        }
    }

    /// Which of `paths` Finder still has, as one "1"/"0" per path.
    pub fn still_there(paths: &[String]) -> Vec<bool> {
        if paths.is_empty() {
            return vec![];
        }
        let checks: Vec<String> = paths
            .iter()
            .map(|p| format!("(exists (POSIX file {}))", crate::platform::applescript_quote(p)))
            .collect();
        let lines = vec![
            "tell application \"Finder\"".to_string(),
            format!("set found to {{{}}}", checks.join(", ")),
            "end tell".to_string(),
            "set AppleScript's text item delimiters to \",\"".to_string(),
            "return found as text".to_string(),
        ];
        match osascript(&lines) {
            Ok(text) => text.split(',').map(|s| s.trim() == "true").collect(),
            // Finder unreachable: show them all; a restore of a gone one says so.
            Err(_) => vec![true; paths.len()],
        }
    }

    pub fn as_deleted(r: &Record) -> Deleted {
        Deleted { name: r.name.clone(), deleted: r.deleted, path: r.path.clone() }
    }

    pub fn same_dir(a: &str, b: &Path) -> bool {
        Path::new(a.trim_end_matches('/')) == Path::new(b.display().to_string().trim_end_matches('/'))
    }
}

/// macOS: remembers where Finder put a project NexDB moved to the Trash.
#[cfg(not(windows))]
pub fn remember(www: &Path, name: &str, trash_path: &str) {
    let mut records = mac::load();
    records.push(mac::Record {
        www: www.display().to_string(),
        name: name.into(),
        deleted: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0),
        path: trash_path.trim_end_matches('/').into(),
    });
    let _ = mac::save(&records);
}

/// macOS: projects NexDB moved to the Trash that are still there, newest first. Ones emptied
/// from the Trash are forgotten.
#[cfg(not(windows))]
pub fn list(www: &Path) -> Result<Vec<Deleted>, String> {
    let records = mac::load();
    let (mine, others): (Vec<_>, Vec<_>) = records.into_iter().partition(|r| mac::same_dir(&r.www, www));
    let there = mac::still_there(&mine.iter().map(|r| r.path.clone()).collect::<Vec<_>>());
    let kept: Vec<mac::Record> = mine.into_iter().zip(there).filter(|(_, ok)| *ok).map(|(r, _)| r).collect();
    let mut all = others;
    all.extend(kept.iter().cloned());
    let _ = mac::save(&all);
    let mut items: Vec<Deleted> = kept.iter().map(mac::as_deleted).collect();
    items.sort_by(|a, b| b.deleted.cmp(&a.deleted));
    Ok(items)
}

/// macOS: Finder moves the project back into the projects folder, under its old name.
#[cfg(not(windows))]
pub fn restore(www: &Path, item: &Deleted) -> Result<(), String> {
    if crate::projects::host_label(&item.name).is_none() && !item.name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("That item can't be restored here.".into());
    }
    let target = www.join(&item.name);
    if target.exists() {
        return Err(format!("A project named \"{}\" already exists. Rename it first, then restore this one.", item.name));
    }
    // Only something NexDB itself put in the Trash.
    let mut records = mac::load();
    let Some(pos) = records.iter().position(|r| r.path == item.path && r.name == item.name && mac::same_dir(&r.www, www)) else {
        return Err("That project isn't in the Trash any more.".into());
    };
    let q = crate::platform::applescript_quote;
    let moved = mac::osascript(&[
        "tell application \"Finder\"".into(),
        format!("set m to move (POSIX file {} as alias) to (POSIX file {} as alias)", q(&item.path), q(&www.display().to_string())),
        "return POSIX path of (m as alias)".into(),
        "end tell".into(),
    ])
    .map_err(|e| format!("Couldn't restore {}: {e}", item.name))?;
    // The Trash may have renamed it ("blog 10-31-22"); give it its old name back.
    let back = std::path::PathBuf::from(moved.trim_end_matches('/'));
    if back != target && back.exists() {
        std::fs::rename(&back, &target).map_err(|e| format!("Restored as {}, but couldn't rename it: {e}", back.display()))?;
    }
    records.remove(pos);
    let _ = mac::save(&records);
    Ok(())
}

/// Folders in the bin that were deleted from `www`, newest first.
#[cfg(windows)]
pub fn list(www: &Path) -> Result<Vec<Deleted>, String> {
    let www = www.display().to_string();
    let script = format!(
        "$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8; \
         $bin = (New-Object -ComObject Shell.Application).Namespace(10); $out = @(); \
         foreach ($i in $bin.Items()) {{ \
           $from = [string]$i.ExtendedProperty('System.Recycle.DeletedFrom'); \
           if ($i.IsFolder -and $from.TrimEnd('\\') -ieq {www}) {{ \
             $d = $i.ExtendedProperty('System.Recycle.DateDeleted'); \
             $out += [pscustomobject]@{{ name = $i.Name; deleted = ([DateTimeOffset]$d).ToUnixTimeSeconds(); path = $i.Path }} }} }}; \
         ConvertTo-Json -InputObject @($out) -Compress",
        www = ps_quote(www.trim_end_matches('\\')),
    );
    let text = powershell(&script)?;
    let text = text.trim();
    if text.is_empty() {
        return Ok(vec![]);
    }
    let mut items: Vec<Deleted> = serde_json::from_str(text).map_err(|e| format!("Couldn't read the Recycle Bin: {e}"))?;
    items.sort_by(|a, b| b.deleted.cmp(&a.deleted));
    Ok(items)
}

/// Puts a deleted project back in `www` under its old name.
#[cfg(windows)]
pub fn restore(www: &Path, item: &Deleted) -> Result<(), String> {
    if crate::projects::host_label(&item.name).is_none() && !item.name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("That item can't be restored here.".into());
    }
    let target = www.join(&item.name);
    if target.exists() {
        return Err(format!("A project named \"{}\" already exists. Rename it first, then restore this one.", item.name));
    }
    let bin_item = Path::new(&item.path);
    let file = bin_item.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
    // Only something the bin itself holds.
    if !item.path.to_ascii_lowercase().contains(r"\$recycle.bin\") || !file.starts_with("$R") || !bin_item.exists() {
        return Err("That project isn't in the Recycle Bin any more.".into());
    }
    std::fs::rename(bin_item, &target).map_err(|e| format!("Couldn't restore {}: {e}", item.name))?;
    // The bin's matching info file ($I…) would otherwise show a broken entry.
    let info = bin_item.with_file_name(format!("$I{}", &file[2..]));
    let _ = std::fs::remove_file(info);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Recycles a temp project, finds it in the real bin, and restores it.
    /// `cargo test real_recycle_and_restore -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_recycle_and_restore() {
        let www = tempfile::tempdir().unwrap();
        let name = "nexdb-restore-test";
        std::fs::create_dir_all(www.path().join(name)).unwrap();
        std::fs::write(www.path().join(name).join("index.php"), "<?php echo 1;").unwrap();
        crate::projectops::recycle(www.path(), name).unwrap();
        let found = list(www.path()).unwrap();
        println!("{found:?}");
        let item = found.iter().find(|d| d.name == name).expect("in the bin");
        restore(www.path(), item).unwrap();
        assert!(www.path().join(name).join("index.php").is_file());
        assert!(list(www.path()).unwrap().iter().all(|d| d.name != name), "gone from the bin");
    }
}
