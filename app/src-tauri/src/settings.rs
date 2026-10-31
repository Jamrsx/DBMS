//! Reads what the setup wizard saved (`<install root>\etc\devmanager.json`) and finds it again
//! on the next launch through a small pointer file in the app's config folder.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Where the wizard installs by default; also the fallback when no pointer file exists.
pub const DEFAULT_ROOT: &str = r"C:\NexDB";

#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    pub www_dir: String,
    pub php_fastcgi_port: u16,
    pub components: Vec<Component>,
    pub apache_port: Option<u16>,
    pub nginx_port: Option<u16>,
    pub mysql: Option<MysqlSettings>,
    #[serde(default)]
    pub preferences: Preferences,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Component {
    pub id: String,
    pub version: Option<String>,
    /// Install folder for new components; the executable for existing ones.
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MysqlSettings {
    pub port: u16,
    #[serde(default)]
    pub existing: bool,
    pub data_dir: Option<String>,
}

/// Choices made in the Settings page.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preferences {
    /// Start every service when NexDB opens.
    #[serde(default)]
    pub start_services_on_launch: bool,
    /// Also serve localhost and the `.test` sites over HTTPS.
    #[serde(default)]
    pub https: bool,
    #[serde(default = "default_https_port")]
    pub https_port: u16,
    /// Automatic database backups: "off", "daily" or "weekly".
    #[serde(default = "default_auto_backup")]
    pub auto_backup: String,
    /// How many automatic backups to keep per database.
    #[serde(default = "default_auto_backup_keep")]
    pub auto_backup_keep: u32,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            start_services_on_launch: false,
            https: false,
            https_port: default_https_port(),
            auto_backup: default_auto_backup(),
            auto_backup_keep: default_auto_backup_keep(),
        }
    }
}

fn default_auto_backup() -> String {
    "off".into()
}

fn default_auto_backup_keep() -> u32 {
    7
}

fn default_https_port() -> u16 {
    443
}

/// Ports for the web server, PHP and MySQL: each between 1 and 65535 and all different.
pub fn check_ports(apache: Option<u16>, php: u16, mysql: Option<u16>) -> Result<(), String> {
    let named: Vec<(&str, u16)> = [("Web server", apache), ("PHP", Some(php)), ("MySQL", mysql)]
        .into_iter()
        .filter_map(|(n, p)| p.map(|p| (n, p)))
        .collect();
    for (name, port) in &named {
        if *port == 0 {
            return Err(format!("{name} needs a port between 1 and 65535."));
        }
    }
    for (i, (a, pa)) in named.iter().enumerate() {
        if let Some((b, _)) = named[i + 1..].iter().find(|(_, pb)| pb == pa) {
            return Err(format!("{a} and {b} can't share port {pa}. Give each its own port."));
        }
    }
    Ok(())
}

/// Changes `devmanager.json` in place, keeping every field this code doesn't know about.
pub fn edit(root: &Path, change: impl FnOnce(&mut serde_json::Value) -> Result<(), String>) -> Result<(), String> {
    let path = root.join("etc").join("devmanager.json");
    let text = fs::read_to_string(&path).map_err(|e| format!("Couldn't read the settings: {e}"))?;
    let mut value: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("The settings file is damaged: {e}"))?;
    change(&mut value)?;
    let out = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    // Write next to it first, so a crash can't leave a half-written settings file.
    let temp = path.with_extension("json.new");
    fs::write(&temp, out).map_err(|e| format!("Couldn't save the settings: {e}"))?;
    fs::rename(&temp, &path).map_err(|e| format!("Couldn't save the settings: {e}"))
}

#[derive(Serialize, Deserialize)]
struct Pointer {
    install_root: String,
}

pub fn pointer_path(config_dir: &Path) -> PathBuf {
    config_dir.join("location.json")
}

/// Remembers the install root so the dashboard opens on the next launch.
pub fn write_pointer(config_dir: &Path, install_root: &Path) -> Result<(), String> {
    fs::create_dir_all(config_dir).map_err(|e| format!("Couldn't create {}: {e}", config_dir.display()))?;
    let json = serde_json::to_string_pretty(&Pointer { install_root: install_root.display().to_string() })
        .map_err(|e| e.to_string())?;
    fs::write(pointer_path(config_dir), json).map_err(|e| format!("Couldn't save the install location: {e}"))
}

/// An earlier NexDB folder whose settings file is gone (for example deleted by hand): its `bin`
/// folder is still there, so setup can repair it instead of starting from nothing.
pub fn broken_install(config_dir: Option<&Path>) -> Option<PathBuf> {
    let from_pointer = config_dir
        .and_then(|dir| fs::read_to_string(pointer_path(dir)).ok())
        .and_then(|text| serde_json::from_str::<Pointer>(&text).ok())
        .map(|p| PathBuf::from(p.install_root));
    from_pointer
        .into_iter()
        .chain([PathBuf::from(DEFAULT_ROOT)])
        .find(|root| root.join("bin").is_dir() && load(root).is_none())
}

/// The saved install, if there is one: the pointer's root first, then the default folder.
pub fn locate(config_dir: Option<&Path>) -> Option<(PathBuf, Settings)> {
    let from_pointer = config_dir
        .and_then(|dir| fs::read_to_string(pointer_path(dir)).ok())
        .and_then(|text| serde_json::from_str::<Pointer>(&text).ok())
        .map(|p| PathBuf::from(p.install_root));
    from_pointer
        .into_iter()
        .chain([PathBuf::from(DEFAULT_ROOT)])
        .find_map(|root| load(&root).map(|s| (root, s)))
}

pub fn load(root: &Path) -> Option<Settings> {
    let text = fs::read_to_string(root.join("etc").join("devmanager.json")).ok()?;
    serde_json::from_str(&text).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ports_must_be_set_and_different() {
        assert!(check_ports(Some(80), 9085, Some(3306)).is_ok());
        assert!(check_ports(None, 9085, None).is_ok());
        assert!(check_ports(Some(0), 9085, Some(3306)).unwrap_err().contains("between 1 and 65535"));
        let err = check_ports(Some(3306), 9085, Some(3306)).unwrap_err();
        assert!(err.contains("Web server and MySQL") && err.contains("3306"), "{err}");
    }

    #[test]
    fn edits_keep_unknown_fields() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("etc")).unwrap();
        let file = dir.path().join("etc").join("devmanager.json");
        fs::write(&file, r#"{"schema":1,"install_root":"x","www_dir":"y","php_fastcgi_port":9085,"components":[],
            "apache_port":80,"nginx_port":null,"mysql":{"port":3306,"existing":false,"data_dir":"d","autostart":true}}"#).unwrap();
        assert!(!load(dir.path()).unwrap().preferences.start_services_on_launch, "older files default to off");
        edit(dir.path(), |v| {
            v["apache_port"] = 8080.into();
            v["mysql"]["port"] = 3307.into();
            v["preferences"] = serde_json::json!({ "start_services_on_launch": true });
            Ok(())
        })
        .unwrap();
        let text = fs::read_to_string(&file).unwrap();
        assert!(text.contains("\"schema\": 1") && text.contains("\"autostart\": true"), "{text}");
        let s = load(dir.path()).unwrap();
        assert_eq!((s.apache_port, s.mysql.unwrap().port), (Some(8080), 3307));
        assert!(s.preferences.start_services_on_launch);
        assert!(!dir.path().join("etc").join("devmanager.json.new").exists());
    }

    #[test]
    fn reads_settings_from_both_install_kinds() {
        // The shape the installer wrote before and after the existing-MySQL fix.
        let old: Settings = serde_json::from_str(
            r#"{"schema":1,"install_root":"C:\\D","www_dir":"C:\\D\\www","php_fastcgi_port":9085,
                "components":[{"id":"php","version":"8.5.12","path":"C:\\D\\bin\\php\\php-8.5.12","existing":false}],
                "apache_port":80,"nginx_port":null,
                "mysql":{"port":3307,"data_dir":"C:\\D\\data\\mysql-9.7","autostart":true,"has_password":true}}"#,
        )
        .unwrap();
        assert!(!old.mysql.as_ref().unwrap().existing);
        let new: Settings = serde_json::from_str(
            r#"{"schema":1,"install_root":"C:\\D","www_dir":"C:\\D\\www","php_fastcgi_port":9085,"components":[],
                "apache_port":null,"nginx_port":null,
                "mysql":{"port":3306,"existing":true,"data_dir":null,"autostart":false,"has_password":null}}"#,
        )
        .unwrap();
        assert!(new.mysql.unwrap().existing);
    }

    #[test]
    fn pointer_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Stack");
        fs::create_dir_all(root.join("etc")).unwrap();
        fs::write(
            root.join("etc").join("devmanager.json"),
            r#"{"install_root":"x","www_dir":"y","php_fastcgi_port":9085,"components":[],"apache_port":null,"nginx_port":null,"mysql":null}"#,
        )
        .unwrap();
        let config = dir.path().join("config");
        write_pointer(&config, &root).unwrap();
        let (found, _) = locate(Some(&config)).unwrap();
        assert_eq!(found, root);
    }
}
