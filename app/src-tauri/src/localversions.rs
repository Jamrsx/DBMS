//! PHP and Node versions people add by hand in NexDB Free. A folder only joins the version list
//! after NexDB has run it and it passed every check.

use crate::configure::run_quiet;
use crate::installer::{bin_folder, target_dir};
use crate::platform::exe;
use crate::versions::{compare, MARKER};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::Duration;

const RUN_LIMIT: Duration = Duration::from_secs(10);
const NEEDS_RUNTIME: &str = "This PHP couldn't start. It may need the Microsoft Visual C++ Redistributable.";

/// A PHP or Node folder on this computer.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LocalVersion {
    pub id: String,
    pub version: String,
    pub folder: String,
    pub active: bool,
    /// It passed the checks and can be selected.
    pub ready: bool,
    pub problem: Option<String>,
}

fn is_version(text: &str) -> bool {
    let parts: Vec<&str> = text.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
}

/// The version in a folder name like `php-8.3.14`. Anything else, including a path, is refused.
fn folder_version(id: &str, folder: &str) -> Option<String> {
    folder.strip_prefix(id)?.strip_prefix('-').filter(|v| is_version(v)).map(str::to_string)
}

fn php_version(output: &str) -> Option<String> {
    output.strip_prefix("PHP ")?.split_whitespace().next().filter(|v| is_version(v)).map(str::to_string)
}

fn node_version(output: &str) -> Option<String> {
    output.trim().strip_prefix('v').filter(|v| is_version(v)).map(str::to_string)
}

fn matches_folder(folder: &str, id: &str, name: &str, found: &str) -> Result<String, String> {
    match folder_version(id, folder) {
        Some(expected) if expected == found => Ok(found.to_string()),
        Some(expected) => Err(format!("The folder says {name} {expected}, but the program inside is {name} {found}. Rename the folder to {id}-{found}.")),
        None => Err(format!("Name the folder like {id}-1.2.3.")),
    }
}

fn verify_php(folder: &str, output: &str, need_x64: bool) -> Result<String, String> {
    let found = php_version(output).ok_or("This folder doesn't contain a working PHP.")?;
    let version = matches_folder(folder, "php", "PHP", &found)?;
    if need_x64 && !output.contains("x64") {
        return Err("This PHP isn't 64-bit. Download the x64 build.".into());
    }
    Ok(version)
}

fn check_php(root: &Path, dir: &Path, folder: &str) -> Result<(), String> {
    let (php, cgi) = (dir.join(exe("php.exe")), dir.join(exe("php-cgi.exe")));
    if !php.is_file() || !cgi.is_file() {
        return Err(format!("{folder} needs {} and {} directly inside it.", exe("php.exe"), exe("php-cgi.exe")));
    }
    let out = run_quiet(&php, &["-n", "-v"], RUN_LIMIT).map_err(|_| NEEDS_RUNTIME.to_string())?;
    if !out.success {
        return Err(NEEDS_RUNTIME.into());
    }
    verify_php(folder, out.text.trim_start(), cfg!(windows))?;
    let trial = std::env::temp_dir().join(format!("nexdb-{folder}-check.ini"));
    fs::write(&trial, crate::phpini::render(dir, &root.join("etc"))).map_err(|e| e.to_string())?;
    let result = crate::phpini::test_ini(dir, &trial);
    let _ = fs::remove_file(&trial);
    result
}

fn check_node(dir: &Path, folder: &str) -> Result<(), String> {
    let node = dir.join(exe("node.exe"));
    if !node.is_file() {
        return Err(format!("{folder} needs {} directly inside it.", exe("node.exe")));
    }
    let out = run_quiet(&node, &["-v"], RUN_LIMIT).map_err(|_| "This Node couldn't start.".to_string())?;
    let found = node_version(&out.text).filter(|_| out.success).ok_or("This folder doesn't contain a working Node.")?;
    matches_folder(folder, "node", "Node", &found).map(|_| ())
}

/// Tests one folder and adds it to the version list only if every check passes.
pub fn check_folder(root: &Path, id: &str, folder: &str) -> Result<String, String> {
    if !matches!(id, "php" | "node") {
        return Err("Only PHP and Node versions can be added by hand.".into());
    }
    let version = folder_version(id, folder).ok_or(format!("Name the folder like {id}-1.2.3."))?;
    let dir = target_dir(root, id, &version);
    if !dir.is_dir() {
        return Err(format!("NexDB can't find the folder {folder}."));
    }
    if id == "php" {
        check_php(root, &dir, folder)?;
    } else {
        check_node(&dir, folder)?;
    }
    fs::write(dir.join(MARKER), "").map_err(|e| format!("Couldn't finish adding it: {e}"))?;
    Ok(version)
}

/// PHP and Node folders on this computer, newest first within each.
pub fn list(root: &Path, active_php: Option<&str>, active_node: Option<&str>) -> Vec<LocalVersion> {
    let mut out = Vec::new();
    for (id, active) in [("php", active_php), ("node", active_node)] {
        let mut found: Vec<LocalVersion> = fs::read_dir(root.join("bin").join(bin_folder(id)))
            .into_iter()
            .flatten()
            .flatten()
            .filter(|e| e.path().is_dir())
            .filter_map(|e| {
                let folder = e.file_name().to_string_lossy().to_string();
                let version = folder_version(id, &folder)?;
                Some(LocalVersion {
                    id: id.to_string(),
                    active: active == Some(version.as_str()),
                    ready: e.path().join(MARKER).is_file(),
                    version,
                    folder,
                    problem: None,
                })
            })
            .collect();
        found.sort_by(|a, b| compare(&b.version, &a.version));
        out.append(&mut found);
    }
    out
}

/// Mac: php.net has no Mac download, so people install PHP or Node themselves and pick its program.
/// NexDB links it into its own folder and runs the same checks. A failed attempt leaves nothing.
#[cfg(not(windows))]
pub fn adopt_binary(root: &Path, id: &str, picked: &Path) -> Result<String, String> {
    use std::os::unix::fs::symlink;
    let (probe, links): (std::path::PathBuf, &[&str]) = match id {
        "php" => (picked.with_file_name("php"), &["php", "php-cgi"]),
        "node" => (picked.to_path_buf(), &["node", "npm", "npx", "corepack"]),
        _ => return Err("Only PHP and Node versions can be added by hand.".into()),
    };
    if !probe.is_file() {
        return Err("Choose php-cgi from a PHP install that also has php beside it.".into());
    }
    let out = run_quiet(&probe, &["-v"], RUN_LIMIT).map_err(|_| "That program couldn't start.".to_string())?;
    let text = out.text.trim_start();
    let version = if id == "php" { php_version(text) } else { node_version(text) }.filter(|_| out.success).ok_or("That isn't a working PHP or Node.")?;
    let dir = target_dir(root, id, &version);
    if dir.exists() {
        return Err(format!("{id} {version} is already in NexDB's folder."));
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for name in links {
        let source = picked.with_file_name(name);
        if source.exists() {
            if let Err(e) = symlink(&source, dir.join(name)) {
                let _ = fs::remove_dir_all(&dir);
                return Err(format!("Couldn't link {name}: {e}"));
            }
        }
    }
    let folder = format!("{id}-{version}");
    check_folder(root, id, &folder).inspect_err(|_| {
        let _ = fs::remove_dir_all(&dir);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_names_cannot_leave_the_bin_folder() {
        for bad in ["..", "../x", r"..\x", "php-8.3.14/..", "C:/x", ""] {
            assert!(check_folder(Path::new("root"), "php", bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn only_php_and_node_can_be_added() {
        assert!(check_folder(Path::new("root"), "mysql", "mysql-9.7.4").is_err());
    }

    #[test]
    fn folder_names_need_a_full_version() {
        assert_eq!(folder_version("php", "php-8.3.14"), Some("8.3.14".to_string()));
        assert_eq!(folder_version("node", "node-24.22.3"), Some("24.22.3".to_string()));
        for bad in ["php-8.3", "php-8.3.x", "php-8.3.14-nts", "node-24.22.3", "php-"] {
            assert_eq!(folder_version("php", bad), None, "{bad}");
        }
    }

    #[test]
    fn reads_versions_from_program_output() {
        assert_eq!(php_version("PHP 8.3.14 (cli) (built: Nov 19 2024) (NTS Visual C++ 2019 x64)"), Some("8.3.14".into()));
        assert_eq!(node_version("v24.22.3\n"), Some("24.22.3".into()));
        assert_eq!(php_version("not php"), None);
    }

    #[test]
    fn a_mismatch_or_32_bit_build_is_explained() {
        assert!(verify_php("php-8.3.14", "PHP 8.2.1 (cli) (NTS x64)", true).unwrap_err().contains("8.2.1"));
        assert!(verify_php("php-8.3.14", "PHP 8.3.14 (cli) (NTS x86)", true).unwrap_err().contains("64-bit"));
        assert!(verify_php("php-8.3.14", "PHP 8.3.14 (cli) (NTS x64)", true).is_ok());
    }

    #[test]
    fn a_failed_check_writes_no_marker() {
        let dir = tempfile::tempdir().unwrap();
        let php = dir.path().join("bin").join("php").join("php-8.3.14");
        fs::create_dir_all(&php).unwrap();
        assert!(check_folder(dir.path(), "php", "php-8.3.14").is_err());
        assert!(!php.join(MARKER).exists());
    }

    #[test]
    fn list_shows_new_folders_as_not_ready() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("bin").join("php");
        fs::create_dir_all(bin.join("php-8.5.13")).unwrap();
        fs::write(bin.join("php-8.5.13").join(MARKER), "").unwrap();
        fs::create_dir_all(bin.join("php-8.3.14")).unwrap();
        fs::create_dir_all(bin.join("not-php")).unwrap();
        let found = list(dir.path(), Some("8.5.13"), None);
        assert_eq!(found.len(), 2);
        assert!(found[0].version == "8.5.13" && found[0].ready && found[0].active);
        assert!(found[1].version == "8.3.14" && !found[1].ready && !found[1].active);
    }

    #[test]
    fn node_folders_live_in_nodejs() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("bin").join("nodejs").join("node-24.22.3")).unwrap();
        let found = list(dir.path(), None, None);
        assert!(found.len() == 1 && found[0].id == "node" && found[0].folder == "node-24.22.3");
    }
}
