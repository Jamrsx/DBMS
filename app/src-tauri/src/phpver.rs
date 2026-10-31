//! PHP per project. NexDB's default PHP serves every site; a project can pick another installed
//! PHP version instead. Each extra version in use runs its own FastCGI process on its own port
//! with its own php.ini, and that project's virtual host sends its PHP files there.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::settings::Settings;

/// One PHP version some project uses besides the default.
#[derive(Debug, Clone, PartialEq)]
pub struct Extra {
    pub version: String,
    /// The PHP install folder (holds php.exe and php-cgi.exe).
    pub dir: PathBuf,
    /// FastCGI port for this version.
    pub port: u16,
    /// Folder holding this version's php.ini and php-cli.ini.
    pub ini_dir: PathBuf,
}

/// The PHP version in use by default.
pub fn default_version(settings: &Settings) -> Option<String> {
    settings.components.iter().find(|c| c.id == "php").and_then(|c| c.version.clone())
}

pub fn ini_dir(root: &Path, version: &str) -> PathBuf {
    root.join("etc").join(format!("php-{version}"))
}

/// Installed PHP version folders, `version -> folder`, for those with php-cgi.exe. They sit next
/// to the default PHP (`bin\php\php-<version>`).
pub fn installed(root: &Path, settings: &Settings) -> BTreeMap<String, PathBuf> {
    let base = settings
        .components
        .iter()
        .find(|c| c.id == "php")
        .map(|c| PathBuf::from(&c.path))
        .map(|p| if p.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) { p.parent().map(Path::to_path_buf).unwrap_or(p) } else { p })
        .and_then(|dir| dir.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| root.join("bin").join("php"));
    std::fs::read_dir(base)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let version = name.strip_prefix("php-")?.to_string();
            let dir = e.path();
            dir.join("php-cgi.exe").is_file().then_some((version, dir))
        })
        .collect()
}

/// Every extra PHP version projects use, with stable ports above the default FastCGI port.
pub fn extras(root: &Path, settings: &Settings) -> Vec<Extra> {
    extras_from(
        &settings.preferences.project_php,
        default_version(settings).as_deref(),
        &installed(root, settings),
        root,
        settings.php_fastcgi_port,
    )
}

fn extras_from(
    chosen: &BTreeMap<String, String>,
    default: Option<&str>,
    installed: &BTreeMap<String, PathBuf>,
    root: &Path,
    base_port: u16,
) -> Vec<Extra> {
    let mut versions: Vec<&String> = chosen.values().filter(|v| Some(v.as_str()) != default && installed.contains_key(*v)).collect();
    versions.sort();
    versions.dedup();
    versions
        .into_iter()
        .enumerate()
        .map(|(i, v)| Extra {
            version: v.clone(),
            dir: installed[v].clone(),
            port: base_port + 1 + i as u16,
            ini_dir: ini_dir(root, v),
        })
        .collect()
}

/// The extra PHP a project uses, when it doesn't use the default.
pub fn for_project(root: &Path, settings: &Settings, project: &str) -> Option<Extra> {
    let version = settings.preferences.project_php.get(project)?;
    extras(root, settings).into_iter().find(|e| &e.version == version)
}

/// FastCGI port per project for those not on the default PHP.
pub fn project_ports(root: &Path, settings: &Settings) -> BTreeMap<String, u16> {
    let extras = extras(root, settings);
    settings
        .preferences
        .project_php
        .iter()
        .filter_map(|(project, v)| extras.iter().find(|e| &e.version == v).map(|e| (project.clone(), e.port)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extra_versions_get_their_own_ports() {
        let installed: BTreeMap<String, PathBuf> = [("8.3.20", "a"), ("8.4.14", "b"), ("8.5.12", "c")]
            .into_iter()
            .map(|(v, d)| (v.to_string(), PathBuf::from(d)))
            .collect();
        let chosen: BTreeMap<String, String> = [
            ("shop", "8.4.14"),
            ("blog", "8.4.14"),
            ("old", "8.3.20"),
            ("same", "8.5.12"),
            ("gone", "7.4.0"),
        ]
        .into_iter()
        .map(|(p, v)| (p.to_string(), v.to_string()))
        .collect();
        let extras = extras_from(&chosen, Some("8.5.12"), &installed, Path::new(r"C:\NexDB"), 9085);
        assert_eq!(extras.iter().map(|e| (e.version.as_str(), e.port)).collect::<Vec<_>>(), [("8.3.20", 9086), ("8.4.14", 9087)]);
        assert_eq!(extras[1].ini_dir, PathBuf::from(r"C:\NexDB\etc\php-8.4.14"));
    }
}
