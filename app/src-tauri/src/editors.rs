//! Code editors installed on this PC, so a project can be opened straight in one.
//! Found by their usual install locations; nothing is installed or changed.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct Editor {
    pub id: &'static str,
    pub name: &'static str,
    #[serde(skip)]
    pub exe: PathBuf,
}

/// (id, name, candidate paths relative to a base folder: LOCALAPPDATA, ProgramFiles, ProgramFiles(x86)).
const KNOWN: &[(&str, &str, &[&str])] = &[
    ("vscode", "VS Code", &[r"Programs\Microsoft VS Code\Code.exe", r"Microsoft VS Code\Code.exe"]),
    ("cursor", "Cursor", &[r"Programs\cursor\Cursor.exe", r"Programs\Cursor\Cursor.exe"]),
    ("windsurf", "Windsurf", &[r"Programs\Windsurf\Windsurf.exe"]),
    ("zed", "Zed", &[r"Programs\Zed\Zed.exe", r"Zed\Zed.exe"]),
    ("phpstorm", "PhpStorm", &[r"Programs\PhpStorm\bin\phpstorm64.exe"]),
    ("webstorm", "WebStorm", &[r"Programs\WebStorm\bin\webstorm64.exe"]),
    ("sublime", "Sublime Text", &[r"Sublime Text\sublime_text.exe", r"Sublime Text 3\sublime_text.exe"]),
    ("notepadpp", "Notepad++", &[r"Notepad++\notepad++.exe"]),
];

fn bases() -> Vec<PathBuf> {
    ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"]
        .iter()
        .filter_map(|v| std::env::var_os(v).map(PathBuf::from))
        .collect()
}

/// JetBrains' own installers put each version in `Program Files\JetBrains\PhpStorm 2026.2\bin`.
fn jetbrains(product: &str, exe: &str) -> Option<PathBuf> {
    let dir = PathBuf::from(std::env::var_os("ProgramFiles")?).join("JetBrains");
    let mut found: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.file_name().is_some_and(|n| n.to_string_lossy().starts_with(product)))
        .map(|p| p.join("bin").join(exe))
        .filter(|p| p.is_file())
        .collect();
    found.sort();
    found.pop()
}

/// Every known editor found on this PC, in the order above.
pub fn installed() -> Vec<Editor> {
    find(&bases())
}

fn find(bases: &[PathBuf]) -> Vec<Editor> {
    KNOWN
        .iter()
        .filter_map(|(id, name, paths)| {
            let exe = bases
                .iter()
                .flat_map(|b| paths.iter().map(move |p| b.join(p)))
                .find(|p| p.is_file())
                .or_else(|| match *id {
                    "phpstorm" => jetbrains("PhpStorm", "phpstorm64.exe"),
                    "webstorm" => jetbrains("WebStorm", "webstorm64.exe"),
                    _ => None,
                })?;
            Some(Editor { id, name, exe })
        })
        .collect()
}

/// Opens `folder` in the editor with this id.
pub fn open(id: &str, folder: &Path) -> Result<(), String> {
    let editor = installed().into_iter().find(|e| e.id == id).ok_or("That editor isn't installed any more.")?;
    let mut cmd = std::process::Command::new(&editor.exe);
    cmd.arg(folder);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Detached, so the editor keeps running on its own.
        cmd.creation_flags(0x0000_0008);
    }
    cmd.spawn().map(|_| ()).map_err(|e| format!("Couldn't open {}: {e}", editor.name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_editors_by_their_usual_folders() {
        let dir = tempfile::tempdir().unwrap();
        let code = dir.path().join(r"Programs\Microsoft VS Code\Code.exe");
        std::fs::create_dir_all(code.parent().unwrap()).unwrap();
        std::fs::write(&code, "").unwrap();
        let found = find(&[dir.path().to_path_buf()]);
        assert_eq!(found.iter().map(|e| e.id).collect::<Vec<_>>(), ["vscode"]);
        assert_eq!(found[0].exe, code);
    }

    /// `cargo test real_editors -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_editors() {
        for e in installed() {
            println!("{} -> {}", e.name, e.exe.display());
        }
    }
}
