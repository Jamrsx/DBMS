//! A project's `.env`, as a list of settings to edit: read with comments and order kept,
//! secrets marked so the app can hide them, and written back with the old file kept.

use std::fs;
use std::path::{Path, PathBuf};

use crate::dbconnect::{env_quote, subfolders};

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
pub struct Entry {
    pub key: String,
    pub value: String,
    /// Passwords, keys and tokens: the app hides these until asked.
    pub secret: bool,
    /// The comment right above it, as a hint.
    pub note: Option<String>,
    /// Listed in `.env.example` but not set in `.env`.
    pub missing: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct EnvFile {
    /// Relative to the project; empty for the project folder.
    pub folder: String,
    pub path: String,
    /// False when only `.env.example` exists: saving makes `.env` from it.
    pub exists: bool,
    pub entries: Vec<Entry>,
}

/// Words in a setting's name that mean its value is private.
const SECRET_WORDS: [&str; 7] = ["PASSWORD", "PASS", "SECRET", "TOKEN", "KEY", "PRIVATE", "CREDENTIAL"];

pub fn is_secret(key: &str) -> bool {
    let k = key.to_ascii_uppercase();
    k.split('_').any(|part| SECRET_WORDS.contains(&part)) || k.ends_with("_KEY") || k.ends_with("PASSWORD")
}

/// A setting's name: letters, digits and _, not starting with a digit.
pub fn valid_key(key: &str) -> bool {
    let mut chars = key.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// `KEY=value` (optionally `export KEY=value`) to (key, value), unquoted.
fn parse_line(line: &str) -> Option<(String, String)> {
    let t = line.trim();
    if t.is_empty() || t.starts_with('#') {
        return None;
    }
    let t = t.strip_prefix("export ").unwrap_or(t);
    let (k, v) = t.split_once('=')?;
    let k = k.trim();
    if !valid_key(k) {
        return None;
    }
    let v = v.trim();
    let v = if v.len() >= 2 && ((v.starts_with('"') && v.ends_with('"')) || (v.starts_with('\'') && v.ends_with('\''))) {
        v[1..v.len() - 1].replace("\\\"", "\"")
    } else {
        // An unquoted value ends at a ` #` comment.
        v.split(" #").next().unwrap_or("").trim().to_string()
    };
    Some((k.to_string(), v))
}

/// The settings in a `.env` text, in order, each with the comment right above it.
pub fn parse(text: &str) -> Vec<Entry> {
    let mut out: Vec<Entry> = Vec::new();
    let mut note: Option<String> = None;
    for line in text.lines() {
        let t = line.trim();
        if let Some(c) = t.strip_prefix('#') {
            let c = c.trim();
            note = (!c.is_empty()).then(|| c.to_string());
            continue;
        }
        if let Some((key, value)) = parse_line(line) {
            out.retain(|e| e.key != key);
            out.push(Entry { secret: is_secret(&key), key, value, note: note.take(), missing: false });
        } else if t.is_empty() {
            note = None;
        }
    }
    out
}

/// Reads one folder's `.env`, adding what `.env.example` lists but `.env` leaves out.
pub fn read(dir: &Path, folder: &str) -> Option<EnvFile> {
    let env = dir.join(".env");
    let example = fs::read_to_string(dir.join(".env.example")).ok();
    let text = fs::read_to_string(&env).ok();
    if text.is_none() && example.is_none() {
        return None;
    }
    let mut entries = parse(text.as_deref().or(example.as_deref()).unwrap_or(""));
    if let (Some(_), Some(ex)) = (&text, &example) {
        for e in parse(ex) {
            if !entries.iter().any(|x| x.key == e.key) {
                entries.push(Entry { missing: true, ..e });
            }
        }
    }
    Some(EnvFile { folder: folder.to_string(), path: env.display().to_string(), exists: text.is_some(), entries })
}

/// The project's `.env` files: its own folder and folders one level down (Backend, api…).
pub fn files(project: &Path) -> Vec<EnvFile> {
    let mut out: Vec<EnvFile> = read(project, "").into_iter().collect();
    for sub in subfolders(project) {
        out.extend(read(&project.join(&sub), &sub));
    }
    out
}

/// A change to one setting: a new value, or None to remove it.
pub type Change = (String, Option<String>);

/// Applies changes to a `.env` text: values replaced in place (comments and order kept),
/// removed lines dropped, new settings added at the end.
pub fn apply(text: &str, changes: &[Change]) -> String {
    let mut lines: Vec<String> = Vec::new();
    let mut done: Vec<&str> = Vec::new();
    for line in text.lines() {
        match parse_line(line) {
            Some((key, _)) => match changes.iter().find(|(k, _)| *k == key) {
                Some((k, Some(v))) => {
                    if !done.contains(&k.as_str()) {
                        lines.push(format!("{k}={}", env_quote(v)));
                        done.push(k);
                    }
                }
                Some((k, None)) => done.push(k),
                None => lines.push(line.to_string()),
            },
            None => lines.push(line.to_string()),
        }
    }
    let added: Vec<&Change> = changes.iter().filter(|(k, v)| v.is_some() && !done.contains(&k.as_str())).collect();
    if !added.is_empty() {
        if lines.last().is_some_and(|l| !l.trim().is_empty()) {
            lines.push(String::new());
        }
        for (k, v) in added {
            lines.push(format!("{k}={}", env_quote(v.as_deref().unwrap_or(""))));
        }
    }
    let mut out = lines.join(if text.contains("\r\n") { "\r\n" } else { "\n" });
    out.push_str(if text.contains("\r\n") { "\r\n" } else { "\n" });
    out
}

/// Saves the changes to `<dir>\.env`, keeping the old file as `.env.backup`. A project with only
/// `.env.example` gets its `.env` made from it.
pub fn save(dir: &Path, changes: &[Change]) -> Result<PathBuf, String> {
    if let Some((k, _)) = changes.iter().find(|(k, _)| !valid_key(k)) {
        return Err(format!("\"{k}\" can't be a setting name. Use letters, numbers and _, like MAIL_HOST."));
    }
    if let Some((k, _)) = changes.iter().find(|(_, v)| v.as_deref().is_some_and(|v| v.contains(['\n', '\r']))) {
        return Err(format!("{k} can't span more than one line."));
    }
    let env = dir.join(".env");
    let text = match fs::read_to_string(&env) {
        Ok(t) => {
            fs::write(dir.join(".env.backup"), &t).map_err(|e| format!("Couldn't keep a copy of .env: {e}"))?;
            t
        }
        Err(_) => fs::read_to_string(dir.join(".env.example")).unwrap_or_default(),
    };
    fs::write(&env, apply(&text, changes)).map_err(|e| format!("Couldn't save {}: {e}", env.display()))?;
    Ok(env)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "APP_NAME=\"My Shop\"\nAPP_KEY=base64:abc\n\n# Database\nDB_HOST=127.0.0.1\nDB_PASSWORD=\n# mail\nMAIL_PASSWORD=s3cret # old\nexport X_TOKEN='t'\n";

    #[test]
    fn reads_values_notes_and_secrets() {
        let e = parse(SAMPLE);
        let get = |k: &str| e.iter().find(|x| x.key == k).unwrap().clone();
        assert_eq!(get("APP_NAME").value, "My Shop");
        assert!(get("APP_KEY").secret && get("DB_PASSWORD").secret && get("X_TOKEN").secret);
        assert!(!get("DB_HOST").secret && !get("APP_NAME").secret);
        assert_eq!(get("DB_HOST").note.as_deref(), Some("Database"));
        assert_eq!(get("MAIL_PASSWORD").value, "s3cret");
        assert_eq!(get("X_TOKEN").value, "t");
    }

    #[test]
    fn changes_keep_comments_and_order() {
        let out = apply(
            SAMPLE,
            &[
                ("DB_HOST".into(), Some("localhost".into())),
                ("APP_NAME".into(), Some("Shop 2".into())),
                ("MAIL_PASSWORD".into(), None),
                ("NEW_ONE".into(), Some("a b".into())),
            ],
        );
        assert!(out.contains("# Database\nDB_HOST=localhost\n"), "{out}");
        assert!(out.starts_with("APP_NAME=\"Shop 2\"\n"), "{out}");
        assert!(!out.contains("MAIL_PASSWORD"), "{out}");
        assert!(out.trim_end().ends_with("NEW_ONE=\"a b\""), "{out}");
        assert!(out.contains("APP_KEY=base64:abc"));
    }

    #[test]
    fn saves_with_a_backup_and_lists_missing_settings() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(".env"), "A=1\n").unwrap();
        fs::write(dir.path().join(".env.example"), "A=\nB=2\n").unwrap();
        let f = read(dir.path(), "").unwrap();
        assert!(f.exists);
        assert!(f.entries.iter().any(|e| e.key == "B" && e.missing));
        save(dir.path(), &[("A".into(), Some("9".into()))]).unwrap();
        assert_eq!(fs::read_to_string(dir.path().join(".env.backup")).unwrap(), "A=1\n");
        assert_eq!(fs::read_to_string(dir.path().join(".env")).unwrap(), "A=9\n");
        assert!(save(dir.path(), &[("BAD KEY".into(), Some("x".into()))]).is_err());
        assert!(save(dir.path(), &[("A".into(), Some("x\ny".into()))]).is_err());
    }

    #[test]
    fn makes_env_from_the_example() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(".env.example"), "APP_KEY=\nDB_HOST=127.0.0.1\n").unwrap();
        let f = read(dir.path(), "").unwrap();
        assert!(!f.exists);
        save(dir.path(), &[("APP_KEY".into(), Some("k".into()))]).unwrap();
        assert_eq!(fs::read_to_string(dir.path().join(".env")).unwrap(), "APP_KEY=k\nDB_HOST=127.0.0.1\n");
        assert!(!dir.path().join(".env.backup").exists());
    }
}
