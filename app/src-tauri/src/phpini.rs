//! Your PHP settings, per PHP version: extensions on or off, common limits, and your own lines.
//! NexDB writes php.ini itself (it is rewritten whenever the stack is), so the choices live in
//! `etc\php-custom\<version>.json` and `<version>.ini` and are applied each time it is written;
//! the .ini holds lines of your own and comes last, so it wins.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Extensions most projects need, on unless you turn them off.
pub const DEFAULT_EXTENSIONS: &[&str] = &[
    "curl", "fileinfo", "gd", "intl", "mbstring", "exif", "mysqli", "openssl", "pdo_mysql", "pdo_sqlite", "sqlite3",
    "sodium", "zip",
];

/// Settings NexDB sets for local development, and the ones the PHP page offers to change.
pub const DEFAULT_SETTINGS: &[(&str, &str)] = &[
    ("memory_limit", "512M"),
    ("upload_max_filesize", "64M"),
    ("post_max_size", "64M"),
    ("max_execution_time", "120"),
    ("max_input_vars", "1000"),
    ("display_errors", "On"),
    // mail() goes to NexDB's mail catcher instead of a real mail server.
    ("SMTP", "127.0.0.1"),
    ("smtp_port", "1025"),
];

/// Settings the PHP page lets you edit (the mail ones point at the mail catcher and stay).
pub const EDITABLE: &[&str] = &["memory_limit", "upload_max_filesize", "post_max_size", "max_execution_time", "max_input_vars", "display_errors"];

/// What each extension is for, in plain words.
pub fn note(ext: &str) -> &'static str {
    match ext {
        "bz2" => "Reads and writes .bz2 compressed files.",
        "curl" => "Lets PHP call other websites and APIs. Laravel's HTTP client needs it.",
        "dba" => "Simple key-value database files.",
        "enchant" => "Spell checking.",
        "exif" => "Reads photo details (camera, rotation) from images.",
        "ffi" => "Calls C libraries from PHP. Rarely needed.",
        "fileinfo" => "Tells file types apart (uploads). Laravel needs it.",
        "ftp" => "Connects to FTP servers.",
        "gd" => "Resizes and edits images (thumbnails, captchas).",
        "gettext" => "Translations with .po/.mo files.",
        "gmp" => "Math with very large numbers.",
        "intl" => "Dates, numbers and text in many languages. Laravel and Symfony use it.",
        "ldap" => "Signs in against Active Directory or LDAP.",
        "mbstring" => "Text in any language (UTF-8). Laravel and WordPress need it.",
        "mysqli" => "MySQL for WordPress and older PHP apps.",
        "odbc" | "pdo_odbc" => "Databases through ODBC drivers (SQL Server, Access).",
        "openssl" => "HTTPS and encryption. Almost everything needs it.",
        "pdo_firebird" => "Firebird databases.",
        "pdo_mysql" => "MySQL for Laravel and most frameworks.",
        "pdo_pgsql" | "pgsql" => "PostgreSQL databases.",
        "pdo_sqlite" | "sqlite3" => "SQLite database files.",
        "shmop" | "sysvshm" => "Shared memory between PHP processes.",
        "snmp" => "Talks to network devices over SNMP.",
        "soap" => "Old-style SOAP web services.",
        "sockets" => "Low-level network connections.",
        "sodium" => "Modern encryption. Laravel uses it.",
        "tidy" => "Cleans up and repairs HTML.",
        "xsl" => "Transforms XML with XSLT.",
        "zip" => "Reads and writes .zip files. Composer is faster with it.",
        "com_dotnet" => "Windows COM and .NET objects.",
        _ => "",
    }
}

/// Your choices for one PHP version. Extensions not listed keep their default.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Choices {
    #[serde(default)]
    pub extensions: BTreeMap<String, bool>,
    #[serde(default)]
    pub settings: BTreeMap<String, String>,
}

pub fn custom_dir(etc: &Path) -> PathBuf {
    etc.join("php-custom")
}

/// "8.5.12" from a PHP folder named `php-8.5.12`.
pub fn version_of(php_dir: &Path) -> Option<String> {
    php_dir.file_name()?.to_string_lossy().strip_prefix("php-").map(String::from)
}

pub fn load(etc: &Path, version: &str) -> Choices {
    fs::read_to_string(custom_dir(etc).join(format!("{version}.json")))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn save(etc: &Path, version: &str, choices: &Choices) -> Result<(), String> {
    let dir = custom_dir(etc);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(choices).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("{version}.json")), text).map_err(|e| format!("Couldn't save your PHP settings: {e}"))
}

/// The file with your own php.ini lines for a version, applied after everything else.
pub fn own_lines_path(etc: &Path, version: &str) -> PathBuf {
    custom_dir(etc).join(format!("{version}.ini"))
}

/// Creates the own-lines file with a short explanation, if it isn't there yet.
pub fn ensure_own_lines(etc: &Path, version: &str) -> Result<PathBuf, String> {
    let path = own_lines_path(etc, version);
    if !path.is_file() {
        fs::create_dir_all(custom_dir(etc)).map_err(|e| e.to_string())?;
        let text = format!(
            "; Your own php.ini lines for PHP {version}.\r\n\
             ; NexDB adds them at the end of its php.ini, so they win over everything above.\r\n\
             ; Save this file, then press Apply on NexDB's PHP settings to restart PHP with them.\r\n\
             ; Example:\r\n\
             ; date.timezone = Asia/Manila\r\n"
        );
        fs::write(&path, text).map_err(|e| format!("Couldn't create {}: {e}", path.display()))?;
    }
    Ok(path)
}

/// Extensions this PHP ships (`ext\php_<name>.dll`), minus test-only ones.
pub fn available(php_dir: &Path) -> Vec<String> {
    let mut out: Vec<String> = fs::read_dir(php_dir.join("ext"))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_lowercase();
            let ext = name.strip_prefix("php_")?.strip_suffix(".dll")?.to_string();
            (!["dl_test", "zend_test"].contains(&ext.as_str())).then_some(ext)
        })
        .collect();
    out.sort();
    out
}

/// Why an extension can't be turned on here, if it can't.
pub fn blocked(php_dir: &Path, ext: &str) -> Option<&'static str> {
    // PostgreSQL's extensions need libpq.dll beside php.exe; without it PHP warns on every run.
    (matches!(ext, "pdo_pgsql" | "pgsql") && !php_dir.join("libpq.dll").is_file())
        .then_some("Needs libpq.dll beside php.exe, which this PHP build doesn't have.")
}

/// The extensions to load: the defaults this PHP has, with your choices applied.
pub fn enabled(php_dir: &Path, choices: &Choices) -> Vec<String> {
    let have = available(php_dir);
    let mut on: Vec<String> = DEFAULT_EXTENSIONS.iter().map(|s| s.to_string()).filter(|e| have.contains(e)).collect();
    // PostgreSQL support is on by default when this PHP can load it.
    for pg in ["pdo_pgsql"] {
        if have.iter().any(|e| e == pg) && blocked(php_dir, pg).is_none() {
            on.push(pg.into());
        }
    }
    for (ext, want) in &choices.extensions {
        if *want && have.contains(ext) && blocked(php_dir, ext).is_none() && !on.contains(ext) {
            on.push(ext.clone());
        } else if !*want {
            on.retain(|e| e != ext);
        }
    }
    on
}

/// The settings to write: NexDB's defaults with your values over them.
pub fn settings(choices: &Choices) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = DEFAULT_SETTINGS.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
    for (k, v) in &choices.settings {
        if let Some(slot) = out.iter_mut().find(|(key, _)| key == k) {
            slot.1 = v.clone();
        }
    }
    out
}

/// php.ini for a PHP install with your choices for its version, and your own lines last.
pub fn render(php_dir: &Path, etc: &Path) -> String {
    let version = version_of(php_dir).unwrap_or_default();
    let choices = load(etc, &version);
    let template = fs::read_to_string(php_dir.join("php.ini-development")).unwrap_or_default();
    let ext_dir = php_dir.join("ext");
    let on = enabled(php_dir, &choices);
    let on: Vec<&str> = on.iter().map(String::as_str).collect();
    let values = settings(&choices);
    let values: Vec<(&str, &str)> = values.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
    let mut ini = crate::configure::render_php_ini_with(&template, &ext_dir, &on, &values);
    if let Ok(own) = fs::read_to_string(own_lines_path(etc, &version)) {
        if own.lines().any(|l| !l.trim().is_empty() && !l.trim_start().starts_with(';')) {
            ini.push_str(&format!("\r\n; Your own lines, from {}\r\n", own_lines_path(etc, &version).display()));
            ini.push_str(&own.trim_end().replace("\r\n", "\n").replace('\n', "\r\n"));
            ini.push_str("\r\n");
        }
    }
    ini
}

/// A value for an editable setting is sane: sizes like 512M, numbers, or On/Off.
pub fn check_value(key: &str, value: &str) -> Result<(), String> {
    let v = value.trim();
    let ok = match key {
        "display_errors" => matches!(v.to_ascii_lowercase().as_str(), "on" | "off" | "1" | "0"),
        "max_execution_time" | "max_input_vars" => v.parse::<u64>().is_ok(),
        _ => {
            let digits = v.trim_end_matches(['K', 'M', 'G', 'k', 'm', 'g']);
            v == "-1" || (!digits.is_empty() && digits.parse::<u64>().is_ok())
        }
    };
    if ok {
        Ok(())
    } else {
        Err(match key {
            "display_errors" => "display_errors is On or Off.".into(),
            "max_execution_time" | "max_input_vars" => format!("{key} is a whole number, like 120."),
            _ => format!("{key} is a size like 512M or 2G (-1 means no limit)."),
        })
    }
}

/// Starts PHP with an ini and lists its modules, to catch a broken file before it's used:
/// a startup warning or error (an extension that won't load, a typo) comes back in plain words.
pub fn test_ini(php_dir: &Path, ini: &Path) -> Result<(), String> {
    let out = crate::configure::run_quiet(&php_dir.join("php.exe"), &["-c", &ini.display().to_string(), "-m"], std::time::Duration::from_secs(30))
        .map_err(|e| format!("Couldn't run PHP to check the settings: {e}"))?;
    let bad = out
        .text
        .lines()
        .map(str::trim)
        .find(|l| l.contains("Warning") || l.contains("Fatal") || l.contains("Parse error") || l.contains("syntax error"));
    match bad {
        Some(line) if line.contains("Unable to load dynamic library") => {
            Err(format!("PHP couldn't load an extension: {}", line.trim_start_matches("PHP Warning:").trim()))
        }
        Some(line) => Err(format!("PHP doesn't accept these settings: {}", line.trim_start_matches("PHP ").trim())),
        None if !out.success => Err("PHP stopped while reading these settings.".into()),
        None => Ok(()),
    }
}

/// One extension on the PHP page.
#[derive(Debug, Serialize)]
pub struct Extension {
    pub name: String,
    pub enabled: bool,
    /// On by default in NexDB.
    pub default: bool,
    pub note: String,
    pub blocked: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub default: String,
}

#[derive(Debug, Serialize)]
pub struct Info {
    pub version: String,
    pub extensions: Vec<Extension>,
    pub settings: Vec<Setting>,
    /// Your own lines file, and whether it has any lines in use.
    pub own_lines: String,
    pub own_lines_used: bool,
    /// The php.ini NexDB wrote for this version.
    pub ini: String,
}

pub fn info(php_dir: &Path, etc: &Path, ini_dir: &Path) -> Info {
    let version = version_of(php_dir).unwrap_or_default();
    let choices = load(etc, &version);
    let on = enabled(php_dir, &choices);
    let base = Choices::default();
    let default_on = enabled(php_dir, &base);
    let values = settings(&choices);
    let own = own_lines_path(etc, &version);
    Info {
        extensions: available(php_dir)
            .into_iter()
            .map(|name| Extension {
                enabled: on.contains(&name),
                default: default_on.contains(&name),
                note: note(&name).into(),
                blocked: blocked(php_dir, &name).map(String::from),
                name,
            })
            .collect(),
        settings: EDITABLE
            .iter()
            .map(|k| Setting {
                key: k.to_string(),
                value: values.iter().find(|(key, _)| key == k).map(|(_, v)| v.clone()).unwrap_or_default(),
                default: DEFAULT_SETTINGS.iter().find(|(key, _)| key == k).map(|(_, v)| v.to_string()).unwrap_or_default(),
            })
            .collect(),
        own_lines_used: fs::read_to_string(&own)
            .map(|t| t.lines().any(|l| !l.trim().is_empty() && !l.trim_start().starts_with(';')))
            .unwrap_or(false),
        own_lines: own.display().to_string(),
        ini: ini_dir.join("php.ini").display().to_string(),
        version,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_php(dir: &Path, exts: &[&str]) -> PathBuf {
        let php = dir.join("php-8.5.12");
        fs::create_dir_all(php.join("ext")).unwrap();
        for e in exts {
            fs::write(php.join("ext").join(format!("php_{e}.dll")), "").unwrap();
        }
        php
    }

    #[test]
    fn choices_turn_extensions_on_and_off() {
        let dir = tempfile::tempdir().unwrap();
        let php = fake_php(dir.path(), &["curl", "gd", "soap", "pgsql", "zip", "zend_test"]);
        assert_eq!(available(&php), ["curl", "gd", "pgsql", "soap", "zip"], "test-only extensions are hidden");
        let mut c = Choices::default();
        assert_eq!(enabled(&php, &c), ["curl", "gd", "zip"]);
        c.extensions.insert("soap".into(), true);
        c.extensions.insert("gd".into(), false);
        c.extensions.insert("pgsql".into(), true);
        assert_eq!(enabled(&php, &c), ["curl", "zip", "soap"], "pgsql needs libpq.dll");
        fs::write(php.join("libpq.dll"), "").unwrap();
        assert!(enabled(&php, &c).contains(&"pgsql".to_string()));
    }

    #[test]
    fn your_values_and_lines_reach_php_ini() {
        let dir = tempfile::tempdir().unwrap();
        let php = fake_php(dir.path(), &["curl"]);
        let etc = dir.path().join("etc");
        let mut c = Choices::default();
        c.settings.insert("memory_limit".into(), "1G".into());
        save(&etc, "8.5.12", &c).unwrap();
        ensure_own_lines(&etc, "8.5.12").unwrap();
        let ini = render(&php, &etc);
        assert!(ini.contains("memory_limit = 1G") && ini.contains("extension=curl"), "{ini}");
        assert!(!ini.contains("Your own lines"), "an untouched lines file adds nothing");
        fs::write(own_lines_path(&etc, "8.5.12"), "date.timezone = Asia/Manila\n").unwrap();
        assert!(render(&php, &etc).ends_with("date.timezone = Asia/Manila\r\n"));
    }

    #[test]
    fn checks_setting_values() {
        assert!(check_value("memory_limit", "512M").is_ok());
        assert!(check_value("memory_limit", "-1").is_ok());
        assert!(check_value("memory_limit", "lots").is_err());
        assert!(check_value("max_execution_time", "120").is_ok());
        assert!(check_value("display_errors", "Off").is_ok());
        assert!(check_value("display_errors", "maybe").is_err());
    }

    /// The real PHP 8.5 with soap turned on and a bad line: the good one passes, the bad one is
    /// caught. `cargo test real_php_ini_check -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_php_ini_check() {
        let php = Path::new(r"C:\NexDB\bin\php\php-8.5.12");
        let dir = tempfile::tempdir().unwrap();
        let etc = dir.path().join("etc");
        let mut c = Choices::default();
        c.extensions.insert("soap".into(), true);
        save(&etc, "8.5.12", &c).unwrap();
        let ini = dir.path().join("php.ini");
        fs::write(&ini, render(php, &etc)).unwrap();
        test_ini(php, &ini).unwrap();
        let out = crate::configure::run_quiet(&php.join("php.exe"), &["-c", &ini.display().to_string(), "-m"], std::time::Duration::from_secs(30)).unwrap();
        assert!(out.text.contains("soap"), "{}", out.text);
        fs::write(own_lines_path(&etc, "8.5.12"), "extension=does_not_exist\n").unwrap();
        fs::write(&ini, render(php, &etc)).unwrap();
        let err = test_ini(php, &ini).unwrap_err();
        println!("{err}");
        assert!(err.contains("couldn't load an extension"), "{err}");
    }
}
