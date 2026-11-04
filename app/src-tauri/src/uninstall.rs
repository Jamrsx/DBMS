//! What happens to the NexDB folder when NexDB is uninstalled. The uninstaller runs
//! `NexDB.exe --uninstall` first; this asks whether to keep the folder (the default) or delete it.

use std::path::{Path, PathBuf};

use crate::settings;

/// What the folder holds, for the question.
pub struct Contents {
    pub root: PathBuf,
    pub www: PathBuf,
    pub projects: usize,
    pub databases: usize,
}

/// The NexDB folder to ask about: only one with NexDB's own settings in it, so a damaged
/// pointer can never point the delete at some other folder.
pub fn find(config_dir: Option<&Path>) -> Option<Contents> {
    let (root, s) = settings::locate(config_dir)?;
    let www = PathBuf::from(&s.www_dir);
    let count_dirs = |dir: &Path| {
        std::fs::read_dir(dir)
            .map(|it| it.flatten().filter(|e| e.path().is_dir()).count())
            .unwrap_or(0)
    };
    let projects = count_dirs(&www);
    // Each MySQL/PostgreSQL data folder holds one folder per database, plus the built-in ones.
    let builtin = ["mysql", "performance_schema", "sys", "#innodb_temp", "#innodb_redo", "base", "global", "pg_wal"];
    let databases = std::fs::read_dir(root.join("data"))
        .map(|servers| {
            servers
                .flatten()
                .filter(|s| s.path().is_dir())
                .map(|s| {
                    std::fs::read_dir(s.path())
                        .map(|it| {
                            it.flatten()
                                .filter(|e| e.path().is_dir())
                                .filter(|e| !builtin.contains(&e.file_name().to_string_lossy().as_ref()))
                                .filter(|e| !e.file_name().to_string_lossy().starts_with("pg_"))
                                .count()
                        })
                        .unwrap_or(0)
                })
                .sum()
        })
        .unwrap_or(0);
    Some(Contents { root, www, projects, databases })
}

/// The question, in plain words. Keeping is the default answer.
pub fn question(c: &Contents) -> String {
    let inside = c.www.starts_with(&c.root);
    let mut text = format!(
        "Also delete the NexDB folder?\n\n{}\n\nIt holds {} and the PHP, MySQL and other versions NexDB installed.",
        c.root.display(),
        if inside {
            format!("your {} and {}", plural(c.projects, "project"), plural(c.databases, "database"))
        } else {
            format!("your {}", plural(c.databases, "database"))
        }
    );
    if !inside {
        text.push_str(&format!("\nYour projects in {} stay either way.", c.www.display()));
    }
    text.push_str(
        "\n\nNo (recommended): keep it. Install NexDB again and everything is still there.\nYes: delete it now. This can't be undone.",
    );
    text
}

fn plural(n: usize, word: &str) -> String {
    if n == 1 { format!("1 {word}") } else { format!("{n} {word}s") }
}

/// Deletes the folder. Files still in use are left; the message says where.
pub fn delete(root: &Path) -> Result<(), String> {
    std::fs::remove_dir_all(root).map_err(|e| {
        format!("Some files in {} couldn't be deleted ({e}). Delete the folder yourself once nothing uses it.", root.display())
    })
}

/// Runs the whole thing with Windows message boxes. Returns when the user has answered.
#[cfg(windows)]
pub fn run(config_dir: Option<&Path>) {
    let Some(c) = find(config_dir) else { return };
    if !ask(&question(&c), "Uninstall NexDB", true) {
        return;
    }
    let sure = format!(
        "Delete {} and everything in it?\n\nThis can't be undone.",
        c.root.display()
    );
    if !ask(&sure, "Delete the NexDB folder", true) {
        return;
    }
    if let Err(e) = delete(&c.root) {
        tell(&e, "Uninstall NexDB");
    }
}

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Yes/No, with No as the default button. True means Yes.
#[cfg(windows)]
fn ask(text: &str, title: &str, warn: bool) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, IDYES, MB_DEFBUTTON2, MB_ICONQUESTION, MB_ICONWARNING, MB_SETFOREGROUND, MB_YESNO,
    };
    let icon = if warn { MB_ICONWARNING } else { MB_ICONQUESTION };
    let (t, c) = (wide(text), wide(title));
    unsafe { MessageBoxW(std::ptr::null_mut(), t.as_ptr(), c.as_ptr(), MB_YESNO | MB_DEFBUTTON2 | icon | MB_SETFOREGROUND) == IDYES }
}

#[cfg(windows)]
fn tell(text: &str, title: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK, MB_SETFOREGROUND};
    let (t, c) = (wide(text), wide(title));
    unsafe {
        MessageBoxW(std::ptr::null_mut(), t.as_ptr(), c.as_ptr(), MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_install(dir: &Path) {
        std::fs::create_dir_all(dir.join("etc")).unwrap();
        let www = dir.join("www");
        std::fs::write(
            dir.join("etc").join("devmanager.json"),
            serde_json::json!({
                "www_dir": www, "php_fastcgi_port": 9085, "apache_port": null, "nginx_port": null,
                "components": [], "mysql": null
            })
            .to_string(),
        )
        .unwrap();
        for p in ["shop", "blog"] {
            std::fs::create_dir_all(www.join(p)).unwrap();
        }
        for d in ["mysql", "sys", "shop", "blog", "crm"] {
            std::fs::create_dir_all(dir.join("data").join("mysql-9.7").join(d)).unwrap();
        }
    }

    #[test]
    fn asks_only_about_a_real_nexdb_folder() {
        let dir = tempfile::tempdir().unwrap();
        let config = tempfile::tempdir().unwrap();
        // No pointer and no settings: nothing to ask, nothing deleted.
        std::fs::create_dir_all(dir.path().join("www")).unwrap();
        settings::write_pointer(config.path(), dir.path()).unwrap();
        let found = find(Some(config.path()));
        assert!(found.is_none() || found.unwrap().root != dir.path());
    }

    #[test]
    fn counts_projects_and_databases_and_keeps_by_default_wording() {
        let dir = tempfile::tempdir().unwrap();
        let config = tempfile::tempdir().unwrap();
        fake_install(dir.path());
        settings::write_pointer(config.path(), dir.path()).unwrap();
        let c = find(Some(config.path())).expect("a NexDB folder");
        assert_eq!(c.root, dir.path());
        assert_eq!(c.projects, 2);
        assert_eq!(c.databases, 3);
        let q = question(&c);
        assert!(q.contains("2 projects and 3 databases"), "{q}");
        assert!(q.contains("No (recommended): keep it"), "{q}");
    }

    #[test]
    fn delete_removes_the_folder() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("NexDB");
        fake_install(&root);
        delete(&root).unwrap();
        assert!(!root.exists());
    }
}
