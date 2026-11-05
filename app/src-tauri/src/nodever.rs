//! Node.js per project, from the project's `.nvmrc` (or `.node-version`), the way nvm reads it.
//! The project's terminal and setup use the installed Node that matches; without a match they
//! use NexDB's default Node and the app says which version to install.

use std::fs;
use std::path::{Path, PathBuf};

use crate::settings::Settings;

const FILES: [&str; 2] = [".nvmrc", ".node-version"];

/// What a project asks for and what it gets.
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
pub struct NodeChoice {
    /// As written in the file, like "20", "v18.19.0" or "lts/*".
    pub wanted: Option<String>,
    /// Which file says so, relative to the project ("" when none).
    pub file: String,
    /// The installed version the project runs on.
    pub using: Option<String>,
    /// True when `wanted` is set but no installed version matches it.
    pub missing: bool,
    pub default: Option<String>,
    pub installed: Vec<String>,
}

/// The version written in `.nvmrc` / `.node-version` in `dir`.
fn read_in(dir: &Path) -> Option<(String, String)> {
    FILES.iter().find_map(|f| {
        let text = fs::read_to_string(dir.join(f)).ok()?;
        let v = text.lines().map(str::trim).find(|l| !l.is_empty() && !l.starts_with('#'))?.to_string();
        Some((v, f.to_string()))
    })
}

/// The project's wish: its own folder first, then a folder one level down (frontend, web…).
pub fn wanted(project: &Path) -> Option<(String, String)> {
    if let Some(found) = read_in(project) {
        return Some(found);
    }
    crate::dbconnect::subfolders(project)
        .into_iter()
        .find_map(|sub| read_in(&project.join(&sub)).map(|(v, f)| (v, format!("{sub}/{f}"))))
}

/// The newest installed version that matches what's asked: "20" → newest 20.x, "20.11" →
/// newest 20.11.x, "v20.11.1" → exactly that. "lts/*", "node" and "stable" mean the default.
pub fn pick(installed: &[String], wanted: &str) -> Option<String> {
    let w = wanted.trim().trim_start_matches(['v', 'V']);
    if w.is_empty() || w.starts_with("lts") || w == "node" || w == "stable" || w == "latest" {
        return None;
    }
    let mut matches: Vec<&String> = installed.iter().filter(|v| *v == w || v.starts_with(&format!("{w}."))).collect();
    matches.sort_by(|a, b| crate::versions::compare(b, a));
    matches.first().map(|v| v.to_string())
}

/// Whether `wanted` names a version (as opposed to "lts/*" and friends, which mean the default).
fn names_a_version(wanted: &str) -> bool {
    wanted.trim().trim_start_matches(['v', 'V']).starts_with(|c: char| c.is_ascii_digit())
}

pub fn choice(root: &Path, settings: &Settings, project: &Path) -> NodeChoice {
    let installed = crate::versions::installed_versions(root, "node");
    let default = crate::versions::active_version(settings, "node");
    let (wanted, file) = match wanted(project) {
        Some((v, f)) => (Some(v), f),
        None => (None, String::new()),
    };
    let picked = wanted.as_deref().and_then(|w| pick(&installed, w));
    let missing = wanted.as_deref().is_some_and(names_a_version) && picked.is_none();
    NodeChoice { using: picked.or_else(|| default.clone()), wanted, file, missing, default, installed }
}

/// The folder of the Node the project should use, when it isn't the default.
pub fn dir_for(root: &Path, settings: &Settings, project: &Path) -> Option<PathBuf> {
    let c = choice(root, settings, project);
    let using = c.using?;
    if Some(&using) == c.default.as_ref() {
        return None;
    }
    let dir = root.join("bin").join("nodejs").join(format!("node-{using}"));
    dir.join("node.exe").is_file().then_some(dir)
}

/// The project folder `dir` is in (the `www` child it sits under), for terminals opened in a subfolder.
pub fn project_of(www: &Path, dir: &Path) -> Option<PathBuf> {
    let rel = dir.strip_prefix(www).ok()?;
    let first = rel.components().next()?;
    Some(www.join(first))
}

/// Writes `.nvmrc` in the project folder, so nvm, editors and NexDB all agree.
pub fn set(project: &Path, version: &str) -> Result<(), String> {
    let v = version.trim().trim_start_matches(['v', 'V']);
    if !v.split('.').all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())) {
        return Err(format!("\"{version}\" isn't a Node version, like 20 or 22.11.0."));
    }
    fs::write(project.join(".nvmrc"), format!("{v}\n")).map_err(|e| format!("Couldn't write .nvmrc: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn picks_the_newest_match_like_nvm() {
        let installed = list(&["26.13.0", "22.11.0", "22.9.1", "20.18.0"]);
        assert_eq!(pick(&installed, "22").as_deref(), Some("22.11.0"));
        assert_eq!(pick(&installed, "v22.9").as_deref(), Some("22.9.1"));
        assert_eq!(pick(&installed, "20.18.0").as_deref(), Some("20.18.0"));
        assert_eq!(pick(&installed, "18"), None);
        assert_eq!(pick(&installed, "2"), None, "2 isn't 22 or 26");
        assert_eq!(pick(&installed, "lts/*"), None);
    }

    #[test]
    fn reads_nvmrc_in_the_project_or_a_subfolder() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(wanted(dir.path()), None);
        fs::create_dir_all(dir.path().join("frontend")).unwrap();
        fs::write(dir.path().join("frontend").join(".node-version"), "v20\n").unwrap();
        assert_eq!(wanted(dir.path()), Some(("v20".into(), "frontend/.node-version".into())));
        fs::write(dir.path().join(".nvmrc"), "# comment\n22.11\n").unwrap();
        assert_eq!(wanted(dir.path()), Some(("22.11".into(), ".nvmrc".into())));
    }

    #[test]
    fn set_writes_a_clean_nvmrc() {
        let dir = tempfile::tempdir().unwrap();
        set(dir.path(), "v22").unwrap();
        assert_eq!(fs::read_to_string(dir.path().join(".nvmrc")).unwrap(), "22\n");
        assert!(set(dir.path(), "latest please").is_err());
    }

    #[test]
    fn project_of_finds_the_top_folder() {
        let www = Path::new(r"C:\NexDB\www");
        assert_eq!(project_of(www, Path::new(r"C:\NexDB\www\shop\frontend")), Some(PathBuf::from(r"C:\NexDB\www\shop")));
        assert_eq!(project_of(www, Path::new(r"D:\other")), None);
    }
}
