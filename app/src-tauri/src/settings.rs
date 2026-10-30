//! Reads what the setup wizard saved (`<install root>\etc\devmanager.json`) and finds it again
//! on the next launch through a small pointer file in the app's config folder.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Where the wizard installs by default; also the fallback when no pointer file exists.
pub const DEFAULT_ROOT: &str = r"C:\DevManager";

#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    pub www_dir: String,
    pub php_fastcgi_port: u16,
    pub components: Vec<Component>,
    pub apache_port: Option<u16>,
    pub nginx_port: Option<u16>,
    pub mysql: Option<MysqlSettings>,
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
