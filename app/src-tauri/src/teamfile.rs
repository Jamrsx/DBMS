//! A project's setup as one file for the team: `nexdb-setup.json` in the project folder says
//! which PHP version and services it needs and carries a `.env` template with the secrets left
//! blank. Commit it with the code; a teammate's NexDB reads it and sets the project up the same.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::envfile::{self, Entry};

pub const FILE: &str = "nexdb-setup.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EnvLine {
    pub key: String,
    /// Empty for passwords, keys and tokens: each person fills in their own.
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TeamSetup {
    /// The file's format, so later NexDB versions can read older files.
    pub nexdb: u32,
    pub project: String,
    pub php: Option<String>,
    /// Service ids like "mysql", "redis", "mailpit".
    pub services: Vec<String>,
    pub database: Option<String>,
    /// Where the `.env` lives in the project ("" for the project folder, or "Backend").
    #[serde(default)]
    pub env_folder: String,
    pub env: Vec<EnvLine>,
}

/// What a project's `.env` says it uses.
pub fn services_from_env(env: &[Entry]) -> Vec<String> {
    let get = |k: &str| env.iter().find(|e| e.key == k).map(|e| e.value.to_ascii_lowercase()).unwrap_or_default();
    let mut out: Vec<String> = Vec::new();
    let mut add = |id: &str| {
        if !out.iter().any(|s| s == id) {
            out.push(id.into());
        }
    };
    match get("DB_CONNECTION").as_str() {
        "mysql" => add("mysql"),
        "mariadb" => add("mariadb"),
        "pgsql" | "postgres" | "postgresql" => add("postgres"),
        "mongodb" => add("mongodb"),
        _ => {}
    }
    let drivers = ["CACHE_STORE", "CACHE_DRIVER", "SESSION_DRIVER", "QUEUE_CONNECTION"].map(get);
    if drivers.iter().any(|d| d == "redis") {
        add("redis");
    }
    if drivers.iter().any(|d| d == "memcached") {
        add("memcached");
    }
    let mail_host = get("MAIL_HOST");
    if get("MAIL_PORT") == "1025" && (mail_host == "127.0.0.1" || mail_host == "localhost") {
        add("mailpit");
    }
    out
}

/// The setup to share, from the project's `.env` (secrets blanked) and its PHP version.
pub fn build(project: &str, php: Option<String>, env_folder: &str, env: &[Entry]) -> TeamSetup {
    let database = env.iter().find(|e| e.key == "DB_DATABASE").map(|e| e.value.clone()).filter(|v| !v.is_empty());
    TeamSetup {
        nexdb: 1,
        project: project.into(),
        php,
        services: services_from_env(env),
        database,
        env_folder: env_folder.into(),
        env: env
            .iter()
            .filter(|e| !e.missing)
            .map(|e| EnvLine {
                key: e.key.clone(),
                value: if e.secret { String::new() } else { e.value.clone() },
            })
            .collect(),
    }
}

pub fn write(dir: &Path, setup: &TeamSetup) -> Result<std::path::PathBuf, String> {
    let path = dir.join(FILE);
    let text = serde_json::to_string_pretty(setup).map_err(|e| e.to_string())?;
    std::fs::write(&path, text + "\n").map_err(|e| format!("Couldn't write {FILE}: {e}"))?;
    Ok(path)
}

pub fn read(dir: &Path) -> Result<Option<TeamSetup>, String> {
    let path = dir.join(FILE);
    let Ok(text) = std::fs::read_to_string(&path) else { return Ok(None) };
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("{FILE} isn't a setup file NexDB can read: {e}"))?;
    // A newer format first: its fields may differ, so say "update" rather than "can't read".
    if value["nexdb"].as_u64().unwrap_or(0) > 1 {
        return Err(format!("{FILE} was made by a newer NexDB. Update NexDB to read it."));
    }
    let setup: TeamSetup =
        serde_json::from_value(value).map_err(|e| format!("{FILE} isn't a setup file NexDB can read: {e}"))?;
    Ok(Some(setup))
}

/// What this PC still lacks for the setup, in plain words.
pub fn missing(setup: &TeamSetup, php_installed: &[String], services_here: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(v) = &setup.php {
        if !php_installed.iter().any(|p| p == v) {
            out.push(format!("PHP {v} isn't installed. Add it on the Versions page."));
        }
    }
    for s in &setup.services {
        if !services_here.iter().any(|h| h == s) {
            out.push(format!("{} isn't installed. Add it on the Versions page.", service_name(s)));
        }
    }
    out
}

pub fn service_name(id: &str) -> &str {
    match id {
        "mysql" => "MySQL",
        "mariadb" => "MariaDB",
        "postgres" => "PostgreSQL",
        "mongodb" => "MongoDB",
        "redis" => "Redis",
        "memcached" => "Memcached",
        "mailpit" => "The mail catcher",
        other => other,
    }
}

/// The `.env` text for a teammate who has none yet, from the template.
pub fn env_text(setup: &TeamSetup) -> String {
    let mut out = String::from("# Made by NexDB from nexdb-setup.json. Fill in the empty passwords and keys.\n");
    for l in &setup.env {
        if envfile::valid_key(&l.key) {
            out.push_str(&format!("{}={}\n", l.key, crate::dbconnect::env_quote(&l.value)));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(text: &str) -> Vec<Entry> {
        envfile::parse(text)
    }

    #[test]
    fn secrets_stay_out_of_the_shared_file() {
        let e = env("APP_NAME=Shop\nAPP_KEY=base64:abc\nDB_CONNECTION=mysql\nDB_DATABASE=shop\nDB_PASSWORD=hunter2\nREDIS_PASSWORD=x\nCACHE_STORE=redis\nMAIL_HOST=127.0.0.1\nMAIL_PORT=1025\n");
        let s = build("shop", Some("8.4.27".into()), "", &e);
        assert_eq!(s.services, vec!["mysql", "redis", "mailpit"]);
        assert_eq!(s.database.as_deref(), Some("shop"));
        let val = |k: &str| s.env.iter().find(|l| l.key == k).unwrap().value.clone();
        assert_eq!(val("APP_NAME"), "Shop");
        assert_eq!(val("APP_KEY"), "");
        assert_eq!(val("DB_PASSWORD"), "");
        assert_eq!(val("REDIS_PASSWORD"), "");
        let json = serde_json::to_string(&s).unwrap();
        assert!(!json.contains("hunter2") && !json.contains("base64:abc"));
    }

    #[test]
    fn says_what_this_pc_lacks() {
        let s = build("shop", Some("8.3.1".into()), "", &env("DB_CONNECTION=pgsql\nSESSION_DRIVER=memcached\n"));
        let m = missing(&s, &["8.4.27".into()], &["mysql".into(), "postgres".into()]);
        assert_eq!(m, vec!["PHP 8.3.1 isn't installed. Add it on the Versions page.", "Memcached isn't installed. Add it on the Versions page."]);
    }

    #[test]
    fn writes_and_reads_the_file() {
        let dir = std::env::temp_dir().join(format!("nexdb-team-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let s = build("shop", None, "Backend", &env("DB_CONNECTION=mysql\nDB_PASSWORD=x\n"));
        write(&dir, &s).unwrap();
        assert_eq!(read(&dir).unwrap(), Some(s.clone()));
        let text = env_text(&s);
        assert!(text.contains("DB_CONNECTION=mysql\n") && text.contains("DB_PASSWORD=\n"));
        std::fs::write(dir.join(FILE), r#"{"nexdb":2}"#).unwrap();
        assert!(read(&dir).unwrap_err().contains("newer NexDB"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
