//! A project opened in VS Code (or Cursor, Windsurf) uses the PHP NexDB runs it with: 8.5 by
//! default, or the version the project is set to. NexDB writes that into the project's
//! `.vscode/settings.json`, so the editor's terminals put that PHP (with its php.ini), Composer
//! and Node first, and the editor's PHP checks use it too. Windows' own PATH (where another PHP,
//! like Laragon's, may come first) is left alone.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{Map, Value};

use crate::settings::Settings;

/// The key NexDB writes so it knows the file's PHP settings are its own to update.
const MARK: &str = "nexdb.php";

/// Editors that read `.vscode/settings.json`.
pub const VSCODE_FAMILY: [&str; 3] = ["vscode", "cursor", "windsurf"];

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ProjectPhp {
    pub version: String,
    #[serde(skip)]
    pub php_dir: PathBuf,
    /// Holds this version's php.ini and php-cli.ini.
    #[serde(skip)]
    pub ini_dir: PathBuf,
    /// First on PATH, in order: this PHP, then Node and NexDB's other tools.
    #[serde(skip)]
    pub path_dirs: Vec<PathBuf>,
}

/// The PHP (and tools) a project runs with: the same choice NexDB's own Terminal makes.
pub fn for_project(root: &Path, settings: &Settings, project: &str, dir: &Path) -> Option<ProjectPhp> {
    let (version, php_dir, ini_dir) = match crate::phpver::for_project(root, settings, project) {
        Some(extra) => (extra.version, extra.dir, extra.ini_dir),
        None => {
            let version = crate::phpver::default_version(settings)?;
            let php_dir = crate::phpver::installed(root, settings).remove(&version)?;
            (version, php_dir, root.join("etc").join("php"))
        }
    };
    let mut path_dirs = vec![php_dir.clone()];
    if let Some(node) = crate::nodever::dir_for(root, settings, dir) {
        path_dirs.push(node);
    }
    for d in crate::terminal::tool_dirs(root, settings) {
        if !path_dirs.contains(&d) {
            path_dirs.push(d);
        }
    }
    Some(ProjectPhp { version, php_dir, ini_dir, path_dirs })
}

fn settings_path(dir: &Path) -> PathBuf {
    dir.join(".vscode").join("settings.json")
}

/// Removes `//` and `/* */` comments and trailing commas (outside strings), which VS Code allows
/// in its settings files and JSON doesn't.
fn strip_jsonc(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let (mut i, mut in_str) = (0, false);
    while i < chars.len() {
        let c = chars[i];
        if in_str {
            out.push(c);
            if c == '\\' && i + 1 < chars.len() {
                out.push(chars[i + 1]);
                i += 2;
                continue;
            }
            if c == '"' {
                in_str = false;
            }
            i += 1;
        } else if c == '"' {
            in_str = true;
            out.push(c);
            i += 1;
        } else if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
        } else if c == '/' && chars.get(i + 1) == Some(&'*') {
            i += 2;
            while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            i += 2;
        } else if c == ',' {
            // A comma followed only by whitespace and a closing bracket is a trailing comma.
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if !matches!(chars.get(j), Some('}') | Some(']')) {
                out.push(c);
            }
            i += 1;
        } else {
            out.push(c);
            i += 1;
        }
    }
    out
}

/// The settings with this project's PHP in them; everything else in the file is kept.
pub fn merged(existing: Option<&str>, php: &ProjectPhp) -> Result<Value, String> {
    let mut root = match existing.map(str::trim).filter(|t| !t.is_empty()) {
        None => Map::new(),
        Some(text) => match serde_json::from_str::<Value>(&strip_jsonc(text)) {
            Ok(Value::Object(map)) => map,
            _ => return Err("The project's .vscode/settings.json isn't valid JSON, so NexDB left it as it is.".into()),
        },
    };
    let php_exe = php.php_dir.join("php.exe").display().to_string();
    let path = php.path_dirs.iter().map(|d| d.display().to_string()).chain(["${env:PATH}".to_string()]).collect::<Vec<_>>().join(";");

    let mut env = match root.remove("terminal.integrated.env.windows") {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    };
    env.insert("PATH".into(), Value::String(path));
    env.insert("PHPRC".into(), Value::String(php.ini_dir.display().to_string()));
    root.insert("terminal.integrated.env.windows".into(), Value::Object(env));
    root.insert("php.validate.executablePath".into(), Value::String(php_exe.clone()));
    root.insert("php.executablePath".into(), Value::String(php_exe));
    root.insert("intelephense.environment.phpVersion".into(), Value::String(php.version.clone()));
    root.insert(MARK.into(), Value::String(php.version.clone()));
    Ok(Value::Object(root))
}

/// Writes the project's PHP into `.vscode/settings.json`. Returns false when it was already right.
pub fn write(dir: &Path, php: &ProjectPhp) -> Result<bool, String> {
    let path = settings_path(dir);
    let existing = std::fs::read_to_string(&path).ok();
    let value = merged(existing.as_deref(), php)?;
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())? + "\n";
    if existing.as_deref() == Some(text.as_str()) {
        return Ok(false);
    }
    std::fs::create_dir_all(path.parent().unwrap_or(dir)).map_err(|e| format!("Couldn't make .vscode: {e}"))?;
    std::fs::write(&path, text).map_err(|e| format!("Couldn't write .vscode/settings.json: {e}"))?;
    Ok(true)
}

/// The PHP version written in the project's editor settings by NexDB, if it wrote any.
pub fn written(dir: &Path) -> Option<String> {
    let text = std::fs::read_to_string(settings_path(dir)).ok()?;
    let value: Value = serde_json::from_str(&strip_jsonc(&text)).ok()?;
    value.get(MARK)?.as_str().map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn php(version: &str) -> ProjectPhp {
        ProjectPhp {
            version: version.into(),
            php_dir: PathBuf::from(format!(r"C:\NexDB\bin\php\php-{version}")),
            ini_dir: PathBuf::from(r"C:\NexDB\etc\php"),
            path_dirs: vec![PathBuf::from(format!(r"C:\NexDB\bin\php\php-{version}")), PathBuf::from(r"C:\NexDB\bin\composer")],
        }
    }

    #[test]
    fn puts_the_projects_php_first_in_new_terminals() {
        let v = merged(None, &php("8.5.12")).unwrap();
        let env = &v["terminal.integrated.env.windows"];
        assert_eq!(env["PATH"], r"C:\NexDB\bin\php\php-8.5.12;C:\NexDB\bin\composer;${env:PATH}");
        assert_eq!(env["PHPRC"], r"C:\NexDB\etc\php");
        assert_eq!(v["php.validate.executablePath"], r"C:\NexDB\bin\php\php-8.5.12\php.exe");
        assert_eq!(v["intelephense.environment.phpVersion"], "8.5.12");
        assert_eq!(v[MARK], "8.5.12");
    }

    #[test]
    fn keeps_the_users_own_settings_and_comments_dont_stop_it() {
        let existing = r#"{
            // my settings
            "editor.tabSize": 2, /* keep */
            "terminal.integrated.env.windows": { "FOO": "bar", "PATH": "old" },
            "url": "http://example.test/a//b",
        }"#;
        let v = merged(Some(existing), &php("8.4.27")).unwrap();
        assert_eq!(v["editor.tabSize"], 2);
        assert_eq!(v["url"], "http://example.test/a//b");
        assert_eq!(v["terminal.integrated.env.windows"]["FOO"], "bar");
        assert!(v["terminal.integrated.env.windows"]["PATH"].as_str().unwrap().starts_with(r"C:\NexDB\bin\php\php-8.4.27;"));
    }

    #[test]
    fn leaves_a_broken_file_alone() {
        assert!(merged(Some("{ not json"), &php("8.5.12")).is_err());
    }

    #[test]
    fn writes_once_and_reads_back_the_version() {
        let dir = tempfile::tempdir().unwrap();
        assert!(write(dir.path(), &php("8.5.12")).unwrap());
        assert!(!write(dir.path(), &php("8.5.12")).unwrap(), "unchanged the second time");
        assert_eq!(written(dir.path()).as_deref(), Some("8.5.12"));
        assert!(write(dir.path(), &php("8.4.27")).unwrap());
        assert_eq!(written(dir.path()).as_deref(), Some("8.4.27"));
    }

    /// The real `nexdb` project's PHP, written to a throwaway folder (not the project), then a
    /// terminal started with that PATH and PHPRC: `php -v` must be NexDB's version, not another
    /// PHP that Windows' PATH lists first.
    /// `cargo test real_editor_php -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_editor_php() {
        let root = PathBuf::from(r"C:\NexDB");
        let settings = crate::settings::load(&root).expect("NexDB settings");
        let project = PathBuf::from(&settings.www_dir).join("nexdb");
        let php = for_project(&root, &settings, "nexdb", &project).expect("a PHP for nexdb");
        let out = tempfile::tempdir().unwrap();
        write(out.path(), &php).unwrap();
        let v: Value = serde_json::from_str(&std::fs::read_to_string(settings_path(out.path())).unwrap()).unwrap();
        let env = &v["terminal.integrated.env.windows"];
        let path = env["PATH"].as_str().unwrap().replace("${env:PATH}", &std::env::var("PATH").unwrap_or_default());
        let script = out.path().join("check.php");
        std::fs::write(&script, "<?php echo PHP_VERSION, ' ', extension_loaded('pdo_mysql') ? 'pdo_mysql' : 'no-pdo_mysql';").unwrap();
        let got = std::process::Command::new("cmd")
            .arg("/C")
            .arg("php")
            .arg(&script)
            .env("PATH", path)
            .env("PHPRC", env["PHPRC"].as_str().unwrap())
            .output()
            .unwrap();
        let text = String::from_utf8_lossy(&got.stdout).to_string();
        println!("project PHP {} -> new terminal says: {text}", php.version);
        assert!(text.starts_with(&php.version), "{text}");
        assert!(text.contains(" pdo_mysql"), "NexDB's php.ini is used: {text}");
    }
}
