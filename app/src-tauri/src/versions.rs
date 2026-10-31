//! The Versions page: what is installed, which one is in use, what is newer, and switching.
//! Versions come from the catalog bundled with NexDB, so updating NexDB also brings new versions.

use crate::catalog::{ComponentChoices, Label};
use crate::installer::{bin_folder, target_dir};
use crate::settings::Settings;
use serde::Serialize;
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};

/// Components shown on the Versions page, in this order.
pub const COMPONENTS: [&str; 5] = ["php", "apache", "mysql", "node", "nginx"];
pub const MARKER: &str = ".devmanager-installed";

#[derive(Debug, Serialize, PartialEq)]
pub struct Installed {
    pub version: String,
    pub active: bool,
}

#[derive(Debug, Serialize)]
pub struct Available {
    pub version: String,
    pub line: String,
    pub labels: Vec<Label>,
    pub note: Option<String>,
    pub downloadable: bool,
    pub download_size: Option<u64>,
    pub installed: bool,
    /// False when NexDB can't switch to it safely yet (another MySQL line).
    pub allowed: bool,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Hint {
    /// "update" for a newer release of the line in use, "line" for a newer recommended line.
    pub kind: &'static str,
    pub version: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ComponentVersions {
    pub id: String,
    pub name: String,
    /// "runtime" (PHP, Apache, MySQL, Node.js, nginx) or "tool" (Composer, Git).
    pub kind: &'static str,
    /// One plain sentence on what it's for.
    pub about: &'static str,
    /// The version in use was deleted from disk and needs reinstalling.
    pub missing: bool,
    pub active: Option<String>,
    pub installed: Vec<Installed>,
    pub hint: Option<Hint>,
    pub available: Vec<Available>,
    /// Plain-language limit shown under the list, if any.
    pub note: Option<String>,
}

/// Compares dotted version numbers numerically: 8.10.0 is newer than 8.9.9.
pub fn compare(a: &str, b: &str) -> Ordering {
    let parts = |v: &str| v.split('.').map(|p| p.parse::<u64>().unwrap_or(0)).collect::<Vec<_>>();
    parts(a).cmp(&parts(b))
}

/// The catalog line a version belongs to ("8.5" for 8.5.12, "24" for 24.15.0).
pub fn line_of<'a>(version: &str, lines: impl IntoIterator<Item = &'a str>) -> Option<String> {
    lines
        .into_iter()
        .filter(|l| version == *l || version.starts_with(&format!("{l}.")))
        .max_by_key(|l| l.len())
        .map(str::to_string)
}

/// Versions found in `<root>\bin\<folder>\<id>-<version>` folders that finished installing.
pub fn installed_versions(root: &Path, id: &str) -> Vec<String> {
    let dir = root.join("bin").join(bin_folder(id));
    let prefix = format!("{id}-");
    let mut found: Vec<String> = fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().join(MARKER).is_file())
        .filter_map(|e| e.file_name().to_string_lossy().strip_prefix(&prefix).map(str::to_string))
        .collect();
    found.sort_by(|a, b| compare(b, a));
    found
}

/// The version in use, from the saved settings.
pub fn active_version(settings: &Settings, id: &str) -> Option<String> {
    settings.components.iter().find(|c| c.id == id).and_then(|c| c.version.clone())
}

pub fn name_of(id: &str) -> &str {
    match id {
        "php" => "PHP",
        "apache" => "Apache",
        "mysql" => "MySQL",
        "node" => "Node.js",
        "nginx" => "nginx",
        "composer" => "Composer",
        "git" => "Git",
        other => other,
    }
}

fn about(id: &str) -> &'static str {
    match id {
        "php" => "Runs your PHP sites and tools like Laravel and WordPress.",
        "apache" => "The web server that opens your projects at localhost and .test addresses.",
        "mysql" => "The database server your apps and phpMyAdmin connect to.",
        "node" => "Runs JavaScript tools: npm, Vite and front-end builds.",
        "nginx" => "An alternative web server.",
        "composer" => "Installs PHP packages, for example to create a Laravel project.",
        "git" => "Downloads and versions code, for example with git clone in the Terminal.",
        _ => "",
    }
}

/// The program that must exist for a component to work, inside its install folder.
pub fn exe_for(id: &str, dir: &Path) -> PathBuf {
    match id {
        "php" => dir.join("php.exe"),
        "apache" => dir.join("bin").join("httpd.exe"),
        "mysql" => dir.join("bin").join("mysqld.exe"),
        "node" => dir.join("node.exe"),
        "nginx" => dir.join("nginx.exe"),
        "composer" => dir.join("composer.phar"),
        "git" => dir.join("cmd").join("git.exe"),
        _ => dir.to_path_buf(),
    }
}

/// A part of the install whose files are gone, for example after its folder was deleted.
#[derive(Debug, Serialize, PartialEq)]
pub struct Missing {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub path: String,
}

/// Every saved component whose program no longer exists.
pub fn missing(settings: &Settings) -> Vec<Missing> {
    settings
        .components
        .iter()
        .filter_map(|c| {
            let path = PathBuf::from(&c.path);
            // Components from other tools store their .exe; NexDB's own store their folder.
            let exe = if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) { path } else { exe_for(&c.id, &path) };
            (!exe.is_file()).then(|| Missing {
                id: c.id.clone(),
                name: name_of(&c.id).to_string(),
                version: c.version.clone(),
                path: c.path.clone(),
            })
        })
        .collect()
}

/// Composer and Git: one version each, from the catalog.
pub fn tools(root: &Path, settings: &Settings, catalog: &crate::catalog::Catalog) -> Vec<ComponentVersions> {
    let mut list = Vec::new();
    let entries: [(&str, Option<&crate::catalog::Tool>); 2] = [("composer", Some(&catalog.tools.composer)), ("git", catalog.tools.git.as_ref())];
    for (id, tool) in entries {
        let Some(tool) = tool else { continue };
        let active = active_version(settings, id).or_else(|| {
            // An install from before Composer kept its version.
            (id == "composer" && settings.components.iter().any(|c| c.id == "composer")).then(|| tool.version.clone())
        });
        let on_disk = |v: &str| exe_for(id, &target_dir(root, id, v)).is_file();
        let installed: Vec<Installed> = match id {
            "composer" => active.iter().filter(|v| on_disk(v)).map(|v| Installed { version: v.clone(), active: true }).collect(),
            _ => installed_versions(root, id)
                .into_iter()
                .map(|v| Installed { active: active.as_deref() == Some(v.as_str()), version: v })
                .collect(),
        };
        let missing = active.as_deref().is_some_and(|v| !on_disk(v));
        list.push(ComponentVersions {
            id: id.into(),
            name: name_of(id).into(),
            kind: "tool",
            about: about(id),
            missing,
            available: vec![Available {
                version: tool.version.clone(),
                line: tool.version.clone(),
                labels: vec![Label::Latest],
                note: None,
                downloadable: true,
                download_size: tool.download.size,
                installed: installed.iter().any(|i| i.version == tool.version),
                allowed: true,
            }],
            hint: active
                .as_deref()
                .filter(|a| !missing && compare(&tool.version, a) == Ordering::Greater)
                .map(|_| Hint {
                    kind: "update",
                    version: tool.version.clone(),
                    message: format!("{} {} is out. Updating is safe.", name_of(id), tool.version),
                }),
            note: None,
            active,
            installed,
        });
    }
    list
}

pub fn hint_for(id: &str, active: &str, choices: &ComponentChoices) -> Option<Hint> {
    let name = name_of(id);
    let lines: Vec<&str> = choices.versions.iter().map(|v| v.line.as_str()).collect();
    let line = line_of(active, lines.iter().copied())?;
    // A newer release of the line already in use: bug and security fixes, safe to take.
    if let Some(newer) = choices
        .versions
        .iter()
        .find(|v| v.line == line && v.downloadable && compare(&v.version, active) == Ordering::Greater)
    {
        return Some(Hint {
            kind: "update",
            version: newer.version.clone(),
            message: format!(
                "{name} {} is out. It fixes bugs and security issues in the {line} line you use, so it's safe to update.",
                newer.version
            ),
        });
    }
    // A newer recommended line: new features, and sometimes changes your code needs to follow.
    let recommended = choices.recommended.as_deref()?;
    let rec_line = line_of(recommended, lines.iter().copied())?;
    if compare(&rec_line, &line) == Ordering::Greater {
        let message = if id == "mysql" {
            format!("MySQL {rec_line} is now recommended. Moving your databases to it needs a backup first, so NexDB keeps you on {line} for now.")
        } else {
            format!("{name} {rec_line} is now the recommended line. Try it on one project first; older code sometimes needs small changes.")
        };
        return Some(Hint { kind: "line", version: recommended.to_string(), message });
    }
    None
}

pub fn overview(root: &Path, settings: &Settings, choices: &[ComponentChoices]) -> Vec<ComponentVersions> {
    COMPONENTS
        .iter()
        .filter_map(|id| {
            let choices = choices.iter().find(|c| c.id == *id)?;
            let active = active_version(settings, id);
            let installed: Vec<Installed> = installed_versions(root, id)
                .into_iter()
                .map(|v| Installed { active: active.as_deref() == Some(v.as_str()), version: v })
                .collect();
            // nginx is optional: only show it when it's part of this install.
            if *id == "nginx" && installed.is_empty() && active.is_none() {
                return None;
            }
            let lines: Vec<&str> = choices.versions.iter().map(|v| v.line.as_str()).collect();
            let active_line = active.as_deref().and_then(|a| line_of(a, lines.iter().copied()));
            let available = choices
                .versions
                .iter()
                .map(|v| Available {
                    version: v.version.clone(),
                    line: v.line.clone(),
                    labels: v.labels.clone(),
                    note: v.note.clone(),
                    downloadable: v.downloadable,
                    download_size: v.download_size,
                    installed: installed.iter().any(|i| i.version == v.version),
                    allowed: *id != "mysql" || active_line.as_deref().is_none_or(|l| l == v.line),
                })
                .collect();
            let missing = active.is_some()
                && settings
                    .components
                    .iter()
                    .find(|c| c.id == *id)
                    .is_some_and(|c| !exe_for(id, Path::new(&c.path)).is_file() && !Path::new(&c.path).is_file());
            Some(ComponentVersions {
                id: id.to_string(),
                name: name_of(id).to_string(),
                kind: "runtime",
                about: about(id),
                missing,
                hint: active.as_deref().filter(|_| !missing).and_then(|a| hint_for(id, a, choices)),
                note: (*id == "mysql").then(|| {
                    "Your databases stay where they are when you switch within the same MySQL line.".to_string()
                }),
                active,
                installed,
                available,
            })
        })
        .collect()
}

/// Checks a switch is safe before anything changes.
pub fn check_switch(root: &Path, settings: &Settings, id: &str, version: &str, choices: &[ComponentChoices]) -> Result<PathBuf, String> {
    if !COMPONENTS.contains(&id) {
        return Err("That component can't be switched here.".into());
    }
    let dir = target_dir(root, id, version);
    if !dir.join(MARKER).is_file() {
        return Err(format!("{} {version} isn't installed yet. Install it first.", name_of(id)));
    }
    if id == "mysql" {
        let lines: Vec<&str> = choices.iter().find(|c| c.id == "mysql").map(|c| c.versions.iter().map(|v| v.line.as_str()).collect()).unwrap_or_default();
        let current = active_version(settings, "mysql").and_then(|a| line_of(&a, lines.iter().copied()));
        let wanted = line_of(version, lines.iter().copied());
        if current.is_some() && current != wanted {
            return Err("Switching MySQL to another line needs a database backup first. NexDB can't do that safely yet.".into());
        }
    }
    Ok(dir)
}

/// Removes an installed version that isn't in use.
pub fn remove(root: &Path, settings: &Settings, id: &str, version: &str) -> Result<(), String> {
    if active_version(settings, id).as_deref() == Some(version) {
        return Err(format!("{} {version} is in use. Switch to another version before removing it.", name_of(id)));
    }
    let dir = target_dir(root, id, version);
    // Only folders NexDB installed itself, inside its own bin folder.
    if !dir.join(MARKER).is_file() || !dir.starts_with(root.join("bin")) {
        return Err(format!("{} {version} isn't installed by NexDB.", name_of(id)));
    }
    fs::remove_dir_all(&dir).map_err(|e| format!("Couldn't remove {} {version}: {e}. Stop the service and try again.", name_of(id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::VersionChoice;

    fn choice(line: &str, version: &str) -> VersionChoice {
        VersionChoice {
            line: line.into(),
            version: version.into(),
            released: None,
            eol: None,
            labels: vec![],
            note: None,
            downloadable: true,
            download_size: None,
        }
    }

    fn php(recommended: &str) -> ComponentChoices {
        ComponentChoices {
            id: "php".into(),
            name: "PHP".into(),
            versions: vec![choice("8.6", "8.6.1"), choice("8.5", "8.5.13"), choice("8.4", "8.4.20")],
            recommended: Some(recommended.into()),
        }
    }

    #[test]
    fn versions_compare_numerically() {
        assert_eq!(compare("8.10.0", "8.9.9"), Ordering::Greater);
        assert_eq!(compare("9.7.4", "9.7.4"), Ordering::Equal);
        assert_eq!(line_of("8.5.12", ["8.5", "8.4"]).as_deref(), Some("8.5"));
        assert_eq!(line_of("24.15.0", ["24", "2"]).as_deref(), Some("24"));
        assert_eq!(line_of("7.4.1", ["8.5"]), None);
    }

    #[test]
    fn same_line_update_comes_first() {
        let hint = hint_for("php", "8.5.12", &php("8.6.1")).unwrap();
        assert_eq!((hint.kind, hint.version.as_str()), ("update", "8.5.13"));
        assert!(hint.message.contains("safe to update"));
    }

    #[test]
    fn newer_recommended_line_is_suggested_gently() {
        let hint = hint_for("php", "8.5.13", &php("8.6.1")).unwrap();
        assert_eq!((hint.kind, hint.version.as_str()), ("line", "8.6.1"));
        assert!(hint_for("php", "8.6.1", &php("8.6.1")).is_none(), "nothing newer");
        assert!(hint_for("php", "8.5.13", &php("8.5.13")).is_none(), "on the recommended line");
    }

    #[test]
    fn finds_installed_versions_and_guards_switches_and_removals() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        for v in ["8.5.12", "8.4.20"] {
            let d = target_dir(root, "php", &v);
            fs::create_dir_all(&d).unwrap();
            fs::write(d.join(MARKER), "x").unwrap();
        }
        fs::create_dir_all(target_dir(root, "php", "8.6.1")).unwrap(); // half-installed: no marker
        assert_eq!(installed_versions(root, "php"), ["8.5.12", "8.4.20"]);

        let settings: Settings = serde_json::from_str(
            r#"{"www_dir":"w","php_fastcgi_port":9085,"apache_port":80,"nginx_port":null,"mysql":{"port":3306,"existing":false,"data_dir":"d"},
                "components":[{"id":"php","version":"8.5.12","path":"p"},{"id":"mysql","version":"9.7.4","path":"m"}]}"#,
        )
        .unwrap();
        let choices = vec![
            php("8.5.13"),
            ComponentChoices {
                id: "mysql".into(),
                name: "MySQL".into(),
                versions: vec![choice("9.8", "9.8.0"), choice("9.7", "9.7.5")],
                recommended: Some("9.7.5".into()),
            },
        ];
        assert!(check_switch(root, &settings, "php", "8.4.20", &choices).is_ok());
        assert!(check_switch(root, &settings, "php", "8.6.1", &choices).unwrap_err().contains("isn't installed"));
        for v in ["9.8.0", "9.7.5"] {
            let d = target_dir(root, "mysql", v);
            fs::create_dir_all(&d).unwrap();
            fs::write(d.join(MARKER), "x").unwrap();
        }
        assert!(check_switch(root, &settings, "mysql", "9.7.5", &choices).is_ok());
        assert!(check_switch(root, &settings, "mysql", "9.8.0", &choices).unwrap_err().contains("backup"));

        // PHP's folder exists but its program was deleted: it's reported missing, with no update hint.
        let mut settings = settings;
        let php_dir = target_dir(root, "php", "8.5.12");
        settings.components[0].path = php_dir.display().to_string();
        let missing_now = missing(&settings);
        assert_eq!(missing_now.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(), ["php", "mysql"]);
        let php_missing = overview(root, &settings, &choices).into_iter().find(|c| c.id == "php").unwrap();
        assert!(php_missing.missing && php_missing.hint.is_none());
        fs::write(php_dir.join("php.exe"), "x").unwrap();
        assert_eq!(missing(&settings).len(), 1, "only MySQL is still missing");

        let view = overview(root, &settings, &choices);
        let php_view = view.iter().find(|c| c.id == "php").unwrap();
        assert_eq!(php_view.active.as_deref(), Some("8.5.12"));
        assert!(php_view.installed.iter().any(|i| i.version == "8.5.12" && i.active));
        assert_eq!(php_view.hint.as_ref().unwrap().version, "8.5.13");
        let mysql_view = view.iter().find(|c| c.id == "mysql").unwrap();
        assert!(!mysql_view.available.iter().find(|a| a.version == "9.8.0").unwrap().allowed);

        assert!(remove(root, &settings, "php", "8.5.12").unwrap_err().contains("in use"));
        remove(root, &settings, "php", "8.4.20").unwrap();
        assert_eq!(installed_versions(root, "php"), ["8.5.12"]);
    }

    /// What NexDB reports as missing in the real `C:\NexDB`:
    /// `cargo test real_missing_report -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_missing_report() {
        let settings = crate::settings::load(Path::new(r"C:\NexDB")).expect("NexDB must be installed in C:/NexDB");
        for m in missing(&settings) {
            println!("missing: {} {:?} at {}", m.name, m.version, m.path);
        }
    }

    /// Downloads the real MinGit from the catalog into a temp folder and runs `git --version`:
    /// `cargo test real_git_install -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_git_install() {
        let dir = tempfile::tempdir().unwrap();
        let catalog = crate::catalog::bundled();
        let git = catalog.tools.git.expect("the catalog lists Git");
        let target = target_dir(dir.path(), "git", &git.version);
        tauri::async_runtime::block_on(crate::installer::install_archive(&git.download, dir.path(), &target, "get-git", &|_| {})).unwrap();
        let exe = exe_for("git", &target);
        assert!(exe.is_file(), "git.exe at {}", exe.display());
        let out = std::process::Command::new(&exe).arg("--version").output().unwrap();
        let text = String::from_utf8_lossy(&out.stdout);
        println!("{}", text.trim());
        assert!(text.contains("git version 2.56"), "{text}");
    }
}
