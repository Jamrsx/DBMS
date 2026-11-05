//! Which PHP Windows' other terminals (cmd, PowerShell, VS Code opened from the Start menu…) use.
//! The user picks one of the PHP installs on the PC (NexDB's own, Laragon's, XAMPP's…) on
//! "Check my setup". NexDB puts a small folder of its own, `bin\shims`, at the front of PATH: its
//! `php.cmd` and `composer.cmd` run the chosen PHP. Switching later only rewrites those two files.
//! Choosing "as Windows has it" takes the folder out of PATH again; nothing else is changed.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use serde::Serialize;

use crate::settings::Settings;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PhpInstall {
    /// The folder that holds php.exe.
    pub dir: String,
    pub version: String,
    /// "NexDB", "Laragon", "XAMPP", "WAMP" or "Other".
    pub source: String,
    /// NexDB's own installs run with NexDB's php.ini (its extensions and settings).
    #[serde(skip)]
    pub ini: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OtherTerminals {
    /// Every PHP found on the PC.
    pub installs: Vec<PhpInstall>,
    /// The PHP folder other terminals use right now (after the choice, if there is one).
    pub current_dir: Option<String>,
    /// The folder chosen here, while NexDB's folder is on PATH.
    pub chosen_dir: Option<String>,
    /// NexDB's folder is first on the system PATH (where Windows looks first).
    pub shims_on_path: bool,
}

pub fn shim_dir(root: &Path) -> PathBuf {
    root.join("bin").join("shims")
}

/// "PHP 8.3.20" from php.exe itself; a stuck php.exe doesn't hold things up.
fn version_of(dir: &Path) -> Option<String> {
    let exe = dir.join("php.exe");
    let mut cmd = Command::new(&exe);
    cmd.args(["-n", "-r", "echo PHP_VERSION;"]).stdin(std::process::Stdio::null());
    crate::scan::hide_console(&mut cmd);
    let mut child = cmd.stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).spawn().ok()?;
    let start = std::time::Instant::now();
    while child.try_wait().ok()?.is_none() {
        if start.elapsed() > Duration::from_secs(4) {
            let _ = child.kill();
            return None;
        }
        std::thread::sleep(Duration::from_millis(30));
    }
    let out = child.wait_with_output().ok()?;
    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!v.is_empty() && v.chars().next().is_some_and(|c| c.is_ascii_digit())).then_some(v)
}

fn source_of(dir: &Path, root: &Path) -> &'static str {
    let d = dir.display().to_string().to_lowercase();
    if dir.starts_with(root) {
        "NexDB"
    } else if d.contains("laragon") {
        "Laragon"
    } else if d.contains("xampp") {
        "XAMPP"
    } else if d.contains("wamp") {
        "WAMP"
    } else {
        "Other"
    }
}

fn subdirs(base: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(base).map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect()).unwrap_or_default()
}

/// Where PHP is usually installed on Windows, besides whatever PATH already lists.
fn usual_places() -> Vec<PathBuf> {
    let mut out = Vec::new();
    for drive in ["C:", "D:"] {
        out.extend(subdirs(&PathBuf::from(format!(r"{drive}\laragon\bin\php"))));
        out.push(PathBuf::from(format!(r"{drive}\xampp\php")));
        for wamp in ["wamp64", "wamp"] {
            out.extend(subdirs(&PathBuf::from(format!(r"{drive}\{wamp}\bin\php"))));
        }
        out.extend(subdirs(&PathBuf::from(format!(r"{drive}\tools"))).into_iter().filter(|p| p.to_string_lossy().to_lowercase().contains("php")));
        out.push(PathBuf::from(format!(r"{drive}\php")));
    }
    if let Some(pf) = std::env::var_os("ProgramFiles") {
        out.push(PathBuf::from(pf).join("PHP"));
    }
    out
}

/// Every PHP on this PC, NexDB's first, then the rest by source and version (newest first).
pub fn installs(root: &Path, settings: &Settings, path_dirs: &[PathBuf]) -> Vec<PhpInstall> {
    let mut out: Vec<PhpInstall> = Vec::new();
    let default = crate::phpver::default_version(settings);
    for (version, dir) in crate::phpver::installed(root, settings) {
        let ini_dir = if Some(&version) == default.as_ref() { root.join("etc").join("php") } else { crate::phpver::ini_dir(root, &version) };
        let ini = ini_dir.join("php-cli.ini");
        out.push(PhpInstall { dir: dir.display().to_string(), version, source: "NexDB".into(), ini: ini.is_file().then_some(ini) });
    }
    let shims = shim_dir(root);
    let mut seen: BTreeSet<String> = out.iter().map(|i| i.dir.to_lowercase()).collect();
    for dir in path_dirs.iter().cloned().chain(usual_places()) {
        let key = dir.display().to_string().trim_end_matches('\\').to_lowercase();
        if dir == shims || seen.contains(&key) || !dir.join("php.exe").is_file() {
            continue;
        }
        seen.insert(key);
        if let Some(version) = version_of(&dir) {
            out.push(PhpInstall { dir: dir.display().to_string(), version, source: source_of(&dir, root).into(), ini: None });
        }
    }
    out.sort_by(|a, b| {
        (a.source != "NexDB").cmp(&(b.source != "NexDB")).then(a.source.cmp(&b.source)).then_with(|| cmp_version(&b.version, &a.version))
    });
    out
}

fn cmp_version(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |v: &str| v.split(['.', '-']).map(|p| p.parse::<u32>().unwrap_or(0)).collect::<Vec<_>>();
    parse(a).cmp(&parse(b))
}

/// The two small scripts in NexDB's folder: `php` runs the chosen PHP (with NexDB's php.ini for
/// NexDB's own), and `composer` runs NexDB's Composer on that same PHP.
pub fn shim_files(php: &PhpInstall, composer_phar: Option<&Path>) -> Vec<(&'static str, String)> {
    let exe = Path::new(&php.dir).join("php.exe");
    let ini = php.ini.as_ref().map(|i| format!(" -c \"{}\"", i.display())).unwrap_or_default();
    let mut files = vec![("php.cmd", format!("@echo off\r\nrem Made by NexDB: the PHP picked on Check my setup.\r\n\"{}\"{ini} %*\r\n", exe.display()))];
    if let Some(phar) = composer_phar {
        files.push(("composer.cmd", format!("@echo off\r\n\"{}\"{ini} \"{}\" %*\r\n", exe.display(), phar.display())));
    }
    files
}

/// The folder the shim's php.cmd points at, if NexDB made one.
pub fn chosen_dir(root: &Path) -> Option<String> {
    let text = std::fs::read_to_string(shim_dir(root).join("php.cmd")).ok()?;
    let line = text.lines().find(|l| l.starts_with('"'))?;
    let exe = line.trim_start_matches('"').split('"').next()?;
    Path::new(exe).parent().map(|p| p.display().to_string())
}

/// PATH with `dir` first (and no second copy of it), or with `dir` taken out.
pub fn with_dir(path: &str, dir: &Path, first: bool) -> String {
    let target = dir.display().to_string().trim_end_matches('\\').to_lowercase();
    let rest: Vec<&str> =
        path.split(';').filter(|p| !p.is_empty() && p.trim_end_matches('\\').to_lowercase() != target).collect();
    let mut parts: Vec<String> = Vec::new();
    if first {
        parts.push(dir.display().to_string());
    }
    parts.extend(rest.into_iter().map(str::to_string));
    parts.join(";")
}

/// The first folder on `path` with php.exe or php.cmd: what a new terminal runs as `php`.
pub fn first_php(path: &str) -> Option<PathBuf> {
    path.split(';').filter(|p| !p.is_empty()).map(PathBuf::from).find(|d| d.join("php.exe").is_file() || d.join("php.cmd").is_file())
}

#[cfg(windows)]
fn read_paths() -> (String, String) {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    let machine = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment")
        .and_then(|k| k.get_value::<String, _>("Path"))
        .unwrap_or_default();
    let user = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Environment").and_then(|k| k.get_value::<String, _>("Path")).unwrap_or_default();
    (machine, user)
}

#[cfg(not(windows))]
fn read_paths() -> (String, String) {
    (std::env::var("PATH").unwrap_or_default(), String::new())
}

/// What new terminals see: the system PATH, then the user's (environment variables expanded).
fn new_terminal_path() -> String {
    let (machine, user) = read_paths();
    expand(&format!("{machine};{user}"))
}

/// `%SystemRoot%\system32` and the like, as Windows expands them.
fn expand(path: &str) -> String {
    let mut out = String::new();
    let mut rest = path;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('%') {
            Some(end) => {
                let name = &after[..end];
                out.push_str(&std::env::var(name).unwrap_or_else(|_| format!("%{name}%")));
                rest = &after[end + 1..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

pub fn state(root: &Path, settings: &Settings) -> OtherTerminals {
    let path = new_terminal_path();
    let dirs: Vec<PathBuf> = path.split(';').filter(|p| !p.is_empty()).map(PathBuf::from).collect();
    let shims = shim_dir(root);
    let shims_on_path = first_php(&path).is_some_and(|d| d == shims);
    let chosen = if shims_on_path { chosen_dir(root) } else { None };
    let current = chosen.clone().or_else(|| first_php(&path).map(|d| d.display().to_string()));
    OtherTerminals { installs: installs(root, settings, &dirs), current_dir: current, chosen_dir: chosen, shims_on_path }
}

/// Makes other terminals use the PHP in `dir`; `None` goes back to however Windows had it.
/// The first time, Windows asks for permission (the system PATH needs it); after that a switch
/// only rewrites NexDB's two small scripts.
pub fn choose(root: &Path, settings: &Settings, dir: Option<&str>) -> Result<(), String> {
    let shims = shim_dir(root);
    let Some(dir) = dir else {
        set_system_path(&with_dir(&read_paths().0, &shims, false))?;
        let _ = std::fs::remove_dir_all(&shims);
        return Ok(());
    };
    let path = new_terminal_path();
    let all = installs(root, settings, &path.split(';').map(PathBuf::from).collect::<Vec<_>>());
    let php = all
        .into_iter()
        .find(|i| i.dir.eq_ignore_ascii_case(dir))
        .ok_or("That PHP isn't on this PC any more. Check again to refresh the list.")?;
    std::fs::create_dir_all(&shims).map_err(|e| format!("Couldn't make {}: {e}", shims.display()))?;
    let phar = root.join("bin").join("composer").join("composer.phar");
    for (name, text) in shim_files(&php, phar.is_file().then_some(phar.as_path())) {
        std::fs::write(shims.join(name), text).map_err(|e| format!("Couldn't write {name}: {e}"))?;
    }
    if first_php(&path).as_deref() != Some(shims.as_path()) {
        set_system_path(&with_dir(&read_paths().0, &shims, true))?;
    }
    Ok(())
}

/// Writes the system PATH through one Windows permission prompt. New terminals pick it up;
/// ones already open keep their old PATH.
#[cfg(windows)]
fn set_system_path(path: &str) -> Result<(), String> {
    let quoted = path.replace('\'', "''");
    let script = format!("[Environment]::SetEnvironmentVariable('Path', '{quoted}', 'Machine')");
    let launcher = format!(
        "$p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','{}'; exit $p.ExitCode",
        crate::share::encode_command(&script)
    );
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &launcher]);
    crate::scan::hide_console(&mut cmd);
    let out = cmd.output().map_err(|e| format!("Couldn't ask Windows for permission: {e}"))?;
    if !out.status.success() || read_paths().0 != path {
        return Err("Windows didn't allow it. Choose Yes on the permission prompt to change which PHP other terminals use.".into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn set_system_path(_path: &str) -> Result<(), String> {
    Err("Only on Windows.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn puts_nexdbs_folder_first_and_takes_it_out_again() {
        let path = r"C:\laragon\bin\php\php-8.3.20;C:\Windows\system32;C:\NexDB\bin\shims\";
        let shims = Path::new(r"C:\NexDB\bin\shims");
        assert_eq!(with_dir(path, shims, true), r"C:\NexDB\bin\shims;C:\laragon\bin\php\php-8.3.20;C:\Windows\system32");
        assert_eq!(with_dir(path, shims, false), r"C:\laragon\bin\php\php-8.3.20;C:\Windows\system32");
    }

    #[test]
    fn the_php_script_runs_the_chosen_php_with_nexdbs_ini_for_its_own() {
        let nexdb = PhpInstall {
            dir: r"C:\NexDB\bin\php\php-8.5.12".into(),
            version: "8.5.12".into(),
            source: "NexDB".into(),
            ini: Some(PathBuf::from(r"C:\NexDB\etc\php\php-cli.ini")),
        };
        let files = shim_files(&nexdb, Some(Path::new(r"C:\NexDB\bin\composer\composer.phar")));
        assert!(files[0].1.contains(r#""C:\NexDB\bin\php\php-8.5.12\php.exe" -c "C:\NexDB\etc\php\php-cli.ini" %*"#));
        assert!(files[1].1.contains(r#"php.exe" -c "C:\NexDB\etc\php\php-cli.ini" "C:\NexDB\bin\composer\composer.phar" %*"#));

        let laragon = PhpInstall { dir: r"C:\laragon\bin\php\php-8.3.20".into(), version: "8.3.20".into(), source: "Laragon".into(), ini: None };
        let files = shim_files(&laragon, None);
        assert_eq!(files.len(), 1);
        assert!(files[0].1.contains(r#""C:\laragon\bin\php\php-8.3.20\php.exe" %*"#), "its own php.ini");
    }

    #[test]
    fn reads_back_the_choice() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(shim_dir(root)).unwrap();
        let php = PhpInstall { dir: r"C:\laragon\bin\php\php-8.4.5".into(), version: "8.4.5".into(), source: "Laragon".into(), ini: None };
        for (name, text) in shim_files(&php, None) {
            std::fs::write(shim_dir(root).join(name), text).unwrap();
        }
        assert_eq!(chosen_dir(root).as_deref(), Some(r"C:\laragon\bin\php\php-8.4.5"));
    }

    #[test]
    fn expands_windows_variables_in_path() {
        unsafe { std::env::set_var("NEXDB_TEST_DIR", r"C:\Tools") };
        assert_eq!(expand(r"%NEXDB_TEST_DIR%\bin;C:\x;%NOPE_NOT_SET%"), r"C:\Tools\bin;C:\x;%NOPE_NOT_SET%");
    }

    #[test]
    fn newest_versions_first_within_a_source() {
        assert_eq!(cmp_version("8.4.5", "8.3.20"), std::cmp::Ordering::Greater);
        assert_eq!(cmp_version("8.10.0", "8.9.9"), std::cmp::Ordering::Greater);
    }

    /// NexDB's php.cmd and composer.cmd, made for each PHP on this PC in a throwaway folder and run
    /// with that folder first on PATH: each reports the PHP it was made for. The system PATH isn't
    /// touched. `cargo test real_shims_run_the_chosen_php -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_shims_run_the_chosen_php() {
        let root = PathBuf::from(r"C:\NexDB");
        let settings = crate::settings::load(&root).expect("NexDB settings");
        let phar = root.join("bin").join("composer").join("composer.phar");
        let path = std::env::var("PATH").unwrap_or_default();
        for php in installs(&root, &settings, &[]) {
            let dir = tempfile::tempdir().unwrap();
            for (name, text) in shim_files(&php, Some(&phar)) {
                std::fs::write(dir.path().join(name), text).unwrap();
            }
            let script = dir.path().join("v.php");
            std::fs::write(&script, "<?php echo PHP_VERSION;").unwrap();
            let run = |args: &[&str]| {
                let out = Command::new("cmd").arg("/C").args(args).env("PATH", format!("{};{path}", dir.path().display())).output().unwrap();
                String::from_utf8_lossy(&out.stdout).trim().to_string()
            };
            let got = run(&["php", &script.display().to_string()]);
            let composer = run(&["composer", "--version", "--no-ansi"]);
            println!("{:8} {:8} -> php says {got}; composer: {}", php.source, php.version, composer.lines().last().unwrap_or(""));
            assert_eq!(got, php.version);
        }
    }

    /// Lists the PHP installs this PC has and what new terminals use, without changing anything.
    /// `cargo test real_php_installs -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_php_installs() {
        let root = PathBuf::from(r"C:\NexDB");
        let settings = crate::settings::load(&root).expect("NexDB settings");
        let st = state(&root, &settings);
        for i in &st.installs {
            println!("{:8} {:8} {}", i.source, i.version, i.dir);
        }
        println!("new terminals use: {:?} (NexDB's choice: {:?})", st.current_dir, st.chosen_dir);
        assert!(st.installs.iter().any(|i| i.source == "NexDB"));
    }
}
