//! Projects in the Windows Recycle Bin that came from the projects folder, so they can be
//! brought back from NexDB. Reads the bin through Windows' own Shell, so nothing is guessed.

use serde::{Deserialize, Serialize};
use std::path::Path;
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

fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Folders in the bin that were deleted from `www`, newest first.
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
