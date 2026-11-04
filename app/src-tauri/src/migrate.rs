//! Picks up a NexDB folder from before: after reinstalling NexDB or Windows, or after the folder
//! was moved or copied to another drive. Setup finds it and offers to use it; when the folder has
//! moved, the paths written into its settings and config files are changed to the new place.

use std::path::{Path, PathBuf};

use crate::settings;

/// A NexDB folder setup can use instead of starting again.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Found {
    pub root: String,
    pub projects: usize,
    /// Where the folder used to be, when it has been moved or copied since.
    pub moved_from: Option<String>,
}

/// Folder names NexDB has used (DevManager was its first name).
const NAMES: [&str; 3] = ["NexDB", "DevManager", "nexdb"];

/// NexDB folders at the top of each drive, plus the one the old pointer names.
pub fn find(config_dir: Option<&Path>) -> Vec<Found> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(p) = config_dir.and_then(|d| std::fs::read_to_string(settings::pointer_path(d)).ok()) {
        if let Some(r) = serde_json::from_str::<serde_json::Value>(&p).ok().and_then(|v| v["install_root"].as_str().map(PathBuf::from)) {
            roots.push(r);
        }
    }
    for letter in b'C'..=b'Z' {
        let drive = PathBuf::from(format!("{}:\\", letter as char));
        if !drive.exists() {
            continue;
        }
        for name in NAMES {
            roots.push(drive.join(name));
        }
    }
    let mut seen: Vec<String> = Vec::new();
    let mut out = Vec::new();
    for root in roots {
        let key = root.display().to_string().to_lowercase();
        if seen.contains(&key) {
            continue;
        }
        seen.push(key);
        if let Some(f) = inspect(&root) {
            out.push(f);
        }
    }
    out
}

/// A folder with NexDB's settings in it, described for setup.
pub fn inspect(root: &Path) -> Option<Found> {
    let s = settings::load(root)?;
    let old = old_root(root);
    let moved_from = old.filter(|o| !same_path(o, root)).map(|o| o.display().to_string());
    let www = moved_www(&s.www_dir, moved_from.as_deref(), root);
    let projects = std::fs::read_dir(www)
        .map(|it| it.flatten().filter(|e| e.path().is_dir()).count())
        .unwrap_or(0);
    Some(Found { root: root.display().to_string(), projects, moved_from })
}

/// Where the folder was when its settings were written: from `install_root` if saved, else
/// from the installed programs' paths (`<root>\bin\...`).
fn old_root(root: &Path) -> Option<PathBuf> {
    let text = std::fs::read_to_string(root.join("etc").join("devmanager.json")).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    if let Some(r) = v["install_root"].as_str() {
        return Some(PathBuf::from(r));
    }
    v["components"].as_array()?.iter().find_map(|c| {
        let p = c["path"].as_str()?;
        let lower = p.to_lowercase();
        let i = lower.find("\\bin\\")?;
        // Only NexDB's own programs, not an existing MySQL it watches.
        (c["existing"].as_bool() != Some(true)).then(|| PathBuf::from(&p[..i]))
    })
}

fn same_path(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| p.display().to_string().trim_end_matches(['\\', '/']).to_lowercase();
    norm(a) == norm(b)
}

fn moved_www(www: &str, old: Option<&str>, root: &Path) -> PathBuf {
    match old {
        Some(old) if www.to_lowercase().starts_with(&old.to_lowercase()) => {
            PathBuf::from(format!("{}{}", root.display(), &www[old.len()..]))
        }
        _ => PathBuf::from(www),
    }
}

/// Replaces every spelling of `old` (C:\Old, C:/Old, C:\\Old) with the same spelling of `new`,
/// ignoring case. Returns None when nothing changed.
fn swap_paths(text: &str, old: &str, new: &str) -> Option<String> {
    let old = old.trim_end_matches(['\\', '/']);
    let new = new.trim_end_matches(['\\', '/']);
    let forms = [
        (old.replace('/', "\\"), new.replace('/', "\\")),
        (old.replace('\\', "/"), new.replace('\\', "/")),
        (old.replace('/', "\\").replace('\\', "\\\\"), new.replace('/', "\\").replace('\\', "\\\\")),
    ];
    let mut out = text.to_string();
    // Longest first, so C:\\Old isn't half-matched as C:\Old.
    for (from, to) in forms.iter().rev() {
        out = replace_ignore_case(&out, from, to);
    }
    (out != text).then_some(out)
}

fn replace_ignore_case(text: &str, from: &str, to: &str) -> String {
    if from.is_empty() {
        return text.to_string();
    }
    let lower = text.to_lowercase();
    let needle = from.to_lowercase();
    // Lowercasing can change byte lengths for some letters; fall back to an exact match then.
    if lower.len() != text.len() {
        return text.replace(from, to);
    }
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for (i, _) in lower.match_indices(&needle) {
        // A longer folder name that only starts the same (C:\NexDB2) isn't this folder.
        let next = text[i + from.len()..].chars().next();
        if matches!(next, Some(c) if c.is_alphanumeric() || c == '-' || c == '_') {
            continue;
        }
        out.push_str(&text[last..i]);
        out.push_str(to);
        last = i + from.len();
    }
    out.push_str(&text[last..]);
    out
}

/// The files that hold the folder's own path.
fn path_files(root: &Path) -> Vec<PathBuf> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(it) = std::fs::read_dir(dir) else { return };
        for e in it.flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(&p, out);
            } else if matches!(
                p.extension().and_then(|x| x.to_str()).map(|x| x.to_ascii_lowercase()).as_deref(),
                Some("conf" | "ini" | "cnf" | "json")
            ) {
                out.push(p);
            }
        }
    }
    let mut out = Vec::new();
    walk(&root.join("etc"), &mut out);
    for extra in [root.join("bin").join("composer").join("composer.bat"), root.join("tools").join("phpmyadmin").join("config.inc.php")] {
        if extra.is_file() {
            out.push(extra);
        }
    }
    out
}

/// Uses `root` as NexDB's folder from now on. A moved folder gets its paths changed first.
/// Returns how many files were updated.
pub fn adopt(root: &Path, config_dir: &Path) -> Result<usize, String> {
    let found = inspect(root).ok_or_else(|| format!("{} isn't a NexDB folder: it has no etc\\devmanager.json.", root.display()))?;
    let mut changed = 0;
    if let Some(old) = &found.moved_from {
        let new = root.display().to_string();
        for file in path_files(root) {
            let Ok(text) = std::fs::read_to_string(&file) else { continue };
            if let Some(updated) = swap_paths(&text, old, &new) {
                std::fs::write(&file, updated).map_err(|e| format!("Couldn't update {}: {e}", file.display()))?;
                changed += 1;
            }
        }
        // Remember the new place, so a later move is found the same way.
        settings::edit(root, |v| {
            v["install_root"] = serde_json::Value::String(new.clone());
            Ok(())
        })?;
    }
    settings::write_pointer(config_dir, root)?;
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn old_install(dir: &Path, old: &str) {
        std::fs::create_dir_all(dir.join("etc").join("apache")).unwrap();
        std::fs::create_dir_all(dir.join("www").join("shop")).unwrap();
        std::fs::write(
            dir.join("etc").join("devmanager.json"),
            serde_json::json!({
                "www_dir": format!("{old}\\www"), "php_fastcgi_port": 9085, "apache_port": 80, "nginx_port": null,
                "components": [{ "id": "php", "path": format!("{old}\\bin\\php\\php-8.5.12"), "version": "8.5.12", "existing": false }],
                "mysql": null
            })
            .to_string(),
        )
        .unwrap();
        let fwd = old.replace('\\', "/");
        std::fs::write(
            dir.join("etc").join("apache").join("httpd.conf"),
            format!("Define SRVROOT \"{fwd}/bin/apache\"\nDocumentRoot \"{fwd}/www\"\nInclude \"{fwd}2/other.conf\"\n"),
        )
        .unwrap();
    }

    #[test]
    fn swaps_every_spelling_ignoring_case() {
        let t = r#"a C:\Old\bin b c:/old/www c "C:\\Old\\etc" d C:\Older\x"#;
        let out = swap_paths(t, r"C:\Old", r"D:\New").unwrap();
        assert_eq!(out, r#"a D:\New\bin b D:/New/www c "D:\\New\\etc" d C:\Older\x"#);
        assert!(swap_paths("nothing here", r"C:\Old", r"D:\New").is_none());
    }

    #[test]
    fn moved_folder_is_found_and_its_paths_follow_it() {
        let dir = tempfile::tempdir().unwrap();
        let config = tempfile::tempdir().unwrap();
        let root = dir.path().join("NexDB");
        old_install(&root, r"Q:\OldPlace");

        let f = inspect(&root).expect("a NexDB folder");
        assert_eq!(f.moved_from.as_deref(), Some(r"Q:\OldPlace"));
        assert_eq!(f.projects, 1);

        let changed = adopt(&root, config.path()).unwrap();
        assert_eq!(changed, 2);
        let conf = std::fs::read_to_string(root.join("etc").join("apache").join("httpd.conf")).unwrap();
        let fwd = root.display().to_string().replace('\\', "/");
        assert!(conf.contains(&format!("{fwd}/bin/apache")), "{conf}");
        assert!(conf.contains("Q:/OldPlace2/other.conf"), "a different folder stays: {conf}");
        let s = settings::load(&root).unwrap();
        assert_eq!(PathBuf::from(&s.www_dir), root.join("www"));
        // Found again, and not moved any more.
        assert!(inspect(&root).unwrap().moved_from.is_none());
        let pointer = std::fs::read_to_string(settings::pointer_path(config.path())).unwrap();
        assert!(pointer.contains("NexDB"));
    }

    #[test]
    fn folder_in_place_is_just_remembered() {
        let dir = tempfile::tempdir().unwrap();
        let config = tempfile::tempdir().unwrap();
        let root = dir.path().join("NexDB");
        old_install(&root, &root.display().to_string());
        assert!(inspect(&root).unwrap().moved_from.is_none());
        assert_eq!(adopt(&root, config.path()).unwrap(), 0);
    }

    /// Read-only: this PC's NexDB folder is found, in place, with its projects.
    #[test]
    #[ignore]
    fn real_finds_this_pcs_install() {
        let found = find(None);
        println!("{found:?}");
        let here = found.iter().find(|f| f.root.eq_ignore_ascii_case(r"C:\NexDB")).expect("C:\\NexDB is found");
        assert!(here.moved_from.is_none());
        assert!(here.projects > 0);
    }
}
