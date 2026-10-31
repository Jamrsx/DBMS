//! Finds code that newer PHP versions warn about and offers a safe, automatic fix, so a
//! "Deprecated: …" message on a fresh project doesn't scare anyone.
//!
//! PHP 8.5 renamed the `PDO::MYSQL_ATTR_*` constants to `Pdo\Mysql::ATTR_*`. Older Laravel
//! configs still use the old names. The fix keeps the project working on every PHP version:
//! `(PHP_VERSION_ID >= 80500 ? \Pdo\Mysql::ATTR_X : \PDO::MYSQL_ATTR_X)`.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Folders scanned in a project; vendor and node_modules belong to packages, not the user.
const FOLDERS: &[&str] = &["config", "app", "bootstrap", "database", "routes"];
const OLD: &str = "PDO::MYSQL_ATTR_";
const MAX_FILE: u64 = 512 * 1024;

#[derive(Debug, Serialize, PartialEq)]
pub struct Finding {
    /// Path inside the project, e.g. `config/database.php`.
    pub file: String,
    pub line: usize,
    /// The old constant, e.g. `PDO::MYSQL_ATTR_SSL_CA`.
    pub constant: String,
}

/// Every old `PDO::MYSQL_ATTR_*` use that isn't already wrapped in a version check.
pub fn scan(project: &Path) -> Vec<Finding> {
    let mut found = Vec::new();
    for file in php_files(project) {
        let Ok(text) = fs::read_to_string(&file) else { continue };
        let rel = file.strip_prefix(project).unwrap_or(&file).display().to_string().replace('\\', "/");
        for (i, line) in text.lines().enumerate() {
            if line.contains("Pdo\\Mysql::ATTR_") {
                continue; // already fixed on this line
            }
            for (_, name) in old_constants(line) {
                found.push(Finding { file: rel.clone(), line: i + 1, constant: format!("PDO::MYSQL_ATTR_{name}") });
            }
        }
    }
    found
}

/// Rewrites every finding in place. Returns how many uses were changed.
pub fn fix(project: &Path) -> Result<usize, String> {
    let mut changed = 0;
    for file in php_files(project) {
        let Ok(text) = fs::read_to_string(&file) else { continue };
        let (new, n) = fix_text(&text);
        if n > 0 {
            fs::write(&file, new).map_err(|e| format!("Couldn't update {}: {e}", file.display()))?;
            changed += n;
        }
    }
    Ok(changed)
}

/// The fixed text and how many constants were rewritten.
pub fn fix_text(text: &str) -> (String, usize) {
    let mut count = 0;
    let lines: Vec<String> = text
        .split_inclusive('\n')
        .map(|line| {
            if line.contains("Pdo\\Mysql::ATTR_") {
                return line.to_string();
            }
            let uses = old_constants(line);
            if uses.is_empty() {
                return line.to_string();
            }
            let mut out = String::new();
            let mut last = 0;
            for (start, name) in uses {
                // Include a leading backslash in what gets replaced.
                let from = if start > 0 && line.as_bytes()[start - 1] == b'\\' { start - 1 } else { start };
                let end = start + OLD.len() + name.len();
                out.push_str(&line[last..from]);
                out.push_str(&format!("(PHP_VERSION_ID >= 80500 ? \\Pdo\\Mysql::ATTR_{name} : \\PDO::MYSQL_ATTR_{name})"));
                last = end;
                count += 1;
            }
            out.push_str(&line[last..]);
            out
        })
        .collect();
    (lines.concat(), count)
}

/// (byte offset, NAME) for each `PDO::MYSQL_ATTR_NAME` in the line.
fn old_constants(line: &str) -> Vec<(usize, String)> {
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(pos) = line[from..].find(OLD) {
        let start = from + pos;
        // Not part of a longer name like `MyPDO::`.
        let before = line[..start].chars().last();
        if before.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_') {
            from = start + OLD.len();
            continue;
        }
        let name: String = line[start + OLD.len()..].chars().take_while(|c| c.is_ascii_uppercase() || *c == '_' || c.is_ascii_digit()).collect();
        if !name.is_empty() {
            out.push((start, name.clone()));
        }
        from = start + OLD.len() + name.len();
    }
    out
}

fn php_files(project: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut stack: Vec<PathBuf> = FOLDERS.iter().map(|f| project.join(f)).filter(|p| p.is_dir()).collect();
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(path);
            } else if path.extension().is_some_and(|e| e == "php") && meta.len() <= MAX_FILE {
                files.push(path);
            }
        }
    }
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    const LARAVEL_12: &str = "        'options' => extension_loaded('pdo_mysql') ? array_filter([\n            PDO::MYSQL_ATTR_SSL_CA => env('MYSQL_ATTR_SSL_CA'),\n        ]) : [],\n";

    #[test]
    fn rewrites_old_constants_for_every_php_version() {
        let (fixed, n) = fix_text(LARAVEL_12);
        assert_eq!(n, 1);
        assert!(fixed.contains("(PHP_VERSION_ID >= 80500 ? \\Pdo\\Mysql::ATTR_SSL_CA : \\PDO::MYSQL_ATTR_SSL_CA) => env('MYSQL_ATTR_SSL_CA'),"), "{fixed}");
        let (again, n2) = fix_text(&fixed);
        assert_eq!((again.as_str(), n2), (fixed.as_str(), 0), "running it twice changes nothing");
    }

    #[test]
    fn keeps_a_leading_backslash_and_other_names_alone() {
        let (fixed, n) = fix_text("$a = [\\PDO::MYSQL_ATTR_INIT_COMMAND => 'x', MyPDO::MYSQL_ATTR_X => 1];\n");
        assert_eq!(n, 1);
        assert!(fixed.starts_with("$a = [(PHP_VERSION_ID >= 80500 ? \\Pdo\\Mysql::ATTR_INIT_COMMAND"), "{fixed}");
        assert!(fixed.contains("MyPDO::MYSQL_ATTR_X"));
    }

    #[test]
    fn scans_project_folders_but_not_vendor() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("config")).unwrap();
        fs::create_dir_all(dir.path().join("vendor/x")).unwrap();
        fs::write(dir.path().join("config/database.php"), LARAVEL_12.repeat(2)).unwrap();
        fs::write(dir.path().join("vendor/x/a.php"), LARAVEL_12).unwrap();
        let found = scan(dir.path());
        assert_eq!(found.len(), 2);
        assert_eq!(found[0], Finding { file: "config/database.php".into(), line: 2, constant: "PDO::MYSQL_ATTR_SSL_CA".into() });
        assert_eq!(fix(dir.path()).unwrap(), 2);
        assert!(scan(dir.path()).is_empty());
        assert_eq!(fs::read_to_string(dir.path().join("vendor/x/a.php")).unwrap(), LARAVEL_12);
    }
}
