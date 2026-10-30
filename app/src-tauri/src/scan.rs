//! Read-only system scan for the setup wizard: existing runtimes, busy ports,
//! the Visual C++ runtime and free disk space. Nothing here changes the system.

use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy)]
struct ComponentSpec {
    id: &'static str,
    name: &'static str,
    exe: &'static str,
    version_args: &'static [&'static str],
    /// Text that comes right before the version number, when the output has other numbers.
    version_marker: Option<&'static str>,
    /// Folder patterns where common stacks keep this binary. `*` matches one folder level.
    known_paths: &'static [(&'static str, &'static str)],
}

const COMPONENTS: &[ComponentSpec] = &[
    ComponentSpec {
        id: "php",
        name: "PHP",
        exe: "php.exe",
        version_args: &["-v"],
        version_marker: Some("PHP "),
        known_paths: &[
            ("XAMPP", r"C:\xampp\php"),
            ("WAMP", r"C:\wamp64\bin\php\*"),
            ("Laragon", r"C:\laragon\bin\php\*"),
        ],
    },
    ComponentSpec {
        id: "node",
        name: "Node.js",
        exe: "node.exe",
        version_args: &["-v"],
        version_marker: None,
        known_paths: &[
            ("Program Files", r"C:\Program Files\nodejs"),
            ("Laragon", r"C:\laragon\bin\nodejs\*"),
        ],
    },
    ComponentSpec {
        id: "apache",
        name: "Apache",
        exe: "httpd.exe",
        version_args: &["-v"],
        version_marker: Some("Apache/"),
        known_paths: &[
            ("XAMPP", r"C:\xampp\apache\bin"),
            ("WAMP", r"C:\wamp64\bin\apache\*\bin"),
            ("Laragon", r"C:\laragon\bin\apache\*\bin"),
        ],
    },
    ComponentSpec {
        id: "nginx",
        name: "nginx",
        exe: "nginx.exe",
        version_args: &["-v"],
        version_marker: Some("nginx/"),
        known_paths: &[("Laragon", r"C:\laragon\bin\nginx\*")],
    },
    ComponentSpec {
        id: "mysql",
        name: "MySQL / MariaDB",
        exe: "mysqld.exe",
        version_args: &["--version"],
        version_marker: Some("Ver "),
        known_paths: &[
            ("XAMPP", r"C:\xampp\mysql\bin"),
            ("WAMP", r"C:\wamp64\bin\mysql\*\bin"),
            ("WAMP", r"C:\wamp64\bin\mariadb\*\bin"),
            ("Laragon", r"C:\laragon\bin\mysql\*\bin"),
            ("Program Files", r"C:\Program Files\MySQL\*\bin"),
            ("Program Files", r"C:\Program Files\MariaDB *\bin"),
        ],
    },
    ComponentSpec {
        id: "git",
        name: "Git",
        exe: "git.exe",
        version_args: &["--version"],
        version_marker: Some("version "),
        known_paths: &[("Program Files", r"C:\Program Files\Git\cmd")],
    },
];

/// Ports the default stack wants: web, HTTPS, MySQL and the web database manager.
const WATCHED_PORTS: &[(u16, &str)] = &[
    (80, "Web server (HTTP)"),
    (443, "Web server (HTTPS)"),
    (3306, "MySQL"),
    (8800, "Database manager"),
];

const VERSION_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Serialize)]
pub struct ScanReport {
    pub components: Vec<ComponentFinding>,
    pub ports: Vec<PortStatus>,
    pub vc_runtime: Option<String>,
    pub disk: Option<DiskSpace>,
    pub duration_ms: u128,
}

#[derive(Debug, Serialize)]
pub struct ComponentFinding {
    pub id: String,
    pub name: String,
    pub installs: Vec<Install>,
}

#[derive(Debug, Serialize)]
pub struct Install {
    pub path: String,
    pub version: Option<String>,
    /// True when the program couldn't report its version and it was read from the folder name.
    pub version_from_folder: bool,
    /// Where it was found: "XAMPP", "WAMP", "Laragon", "Program Files", "Windows service" or "PATH".
    pub source: String,
    /// Whether this copy is the one found on PATH.
    pub on_path: bool,
    /// Extra detail, e.g. the Windows service name or "MariaDB".
    pub note: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PortStatus {
    pub port: u16,
    pub purpose: String,
    pub in_use: bool,
    pub pid: Option<u32>,
    pub process: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DiskSpace {
    pub mount: String,
    pub free_bytes: u64,
    pub total_bytes: u64,
}

pub fn run(install_root: &Path) -> ScanReport {
    let started = Instant::now();
    let services = windows_services();

    let components = std::thread::scope(|s| {
        let handles: Vec<_> = COMPONENTS
            .iter()
            .map(|spec| {
                let services = &services;
                s.spawn(move || scan_component(spec, services))
            })
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().expect("component scan thread panicked"))
            .collect()
    });

    ScanReport {
        components,
        ports: scan_ports(),
        vc_runtime: vc_runtime_version(),
        disk: disk_space(install_root),
        duration_ms: started.elapsed().as_millis(),
    }
}

fn scan_component(spec: &ComponentSpec, services: &[(String, PathBuf)]) -> ComponentFinding {
    // Named locations first, so a copy that is also on PATH keeps its stack name.
    let mut candidates: Vec<(PathBuf, String, Option<String>)> = Vec::new();
    for (source, pattern) in spec.known_paths {
        for dir in expand_pattern(pattern) {
            candidates.push((dir.join(spec.exe), (*source).into(), None));
        }
    }
    for (service, exe) in services {
        if file_name_eq(exe, spec.exe) {
            candidates.push((exe.clone(), "Windows service".into(), Some(service.clone())));
        }
    }
    let path_hits: Vec<PathBuf> =
        std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
            .map(|dir| dir.join(spec.exe))
            .filter(|path| path.is_file())
            .collect();
    let on_path: HashSet<String> = path_hits.iter().map(|p| normalize(p)).collect();
    for path in path_hits {
        candidates.push((path, "PATH".into(), None));
    }

    let mut seen = HashSet::new();
    let unique: Vec<_> = candidates
        .into_iter()
        .filter(|(path, _, _)| path.is_file())
        .filter(|(path, _, _)| seen.insert(normalize(path)))
        .collect();

    let installs = std::thread::scope(|s| {
        let handles: Vec<_> = unique
            .into_iter()
            .map(|(path, source, note)| {
                let on_path = on_path.contains(&normalize(&path));
                s.spawn(move || {
                    let output = run_capture(&path, spec.version_args, VERSION_TIMEOUT);
                    let reported = output
                        .as_deref()
                        .and_then(|text| extract_version(text, spec.version_marker));
                    let version_from_folder = reported.is_none();
                    let version = reported.or_else(|| version_from_folders(&path));
                    let mariadb = output
                        .as_deref()
                        .is_some_and(|text| text.to_ascii_lowercase().contains("mariadb"));
                    let note = match (note, mariadb) {
                        (Some(service), true) => Some(format!("MariaDB · service {service}")),
                        (Some(service), false) => Some(format!("service {service}")),
                        (None, true) => Some("MariaDB".into()),
                        (None, false) => None,
                    };
                    Install {
                        path: path.display().to_string(),
                        version_from_folder: version_from_folder && version.is_some(),
                        version,
                        source,
                        on_path,
                        note,
                    }
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().expect("version probe thread panicked"))
            .collect()
    });

    ComponentFinding {
        id: spec.id.into(),
        name: spec.name.into(),
        installs,
    }
}

/// Version from the nearest folder name that contains one, e.g. `...\nginx-1.22.0\nginx.exe`.
fn version_from_folders(exe: &Path) -> Option<String> {
    exe.ancestors()
        .skip(1)
        .take(3)
        .filter_map(|dir| dir.file_name())
        .find_map(|name| extract_version(&name.to_string_lossy(), None))
}

/// Expands a Windows path where a segment may contain `*` (one folder level).
fn expand_pattern(pattern: &str) -> Vec<PathBuf> {
    let mut current = vec![PathBuf::new()];
    for (i, segment) in pattern.split('\\').enumerate() {
        let mut next = Vec::new();
        for base in &current {
            if i == 0 {
                next.push(PathBuf::from(format!("{segment}\\")));
            } else if segment.contains('*') {
                let Ok(entries) = std::fs::read_dir(base) else { continue };
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if entry.path().is_dir() && wildcard_match(segment, &name) {
                        next.push(entry.path());
                    }
                }
            } else {
                next.push(base.join(segment));
            }
        }
        current = next;
    }
    current
}

/// Case-insensitive match with a single `*` wildcard.
fn wildcard_match(pattern: &str, name: &str) -> bool {
    let (pattern, name) = (pattern.to_ascii_lowercase(), name.to_ascii_lowercase());
    match pattern.split_once('*') {
        Some((prefix, suffix)) => {
            name.len() >= prefix.len() + suffix.len()
                && name.starts_with(prefix)
                && name.ends_with(suffix)
        }
        None => pattern == name,
    }
}

fn normalize(path: &Path) -> String {
    std::fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .display()
        .to_string()
        .to_ascii_lowercase()
}

fn file_name_eq(path: &Path, exe: &str) -> bool {
    path.file_name()
        .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case(exe))
}

/// Finds the first `major.minor[.patch]` number, after `marker` when given.
pub fn extract_version(text: &str, marker: Option<&str>) -> Option<String> {
    let haystack = match marker {
        Some(marker) => &text[text.find(marker)? + marker.len()..],
        None => text,
    };
    let bytes = haystack.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        // A version starts at a digit that isn't mid-number or mid-word ("v24.1" is fine).
        let starts_here = bytes[i].is_ascii_digit()
            && (i == 0 || {
                let prev = bytes[i - 1];
                !(prev.is_ascii_digit()
                    || prev == b'.'
                    || (prev.is_ascii_alphabetic() && !prev.eq_ignore_ascii_case(&b'v')))
            });
        if starts_here {
            let start = i;
            let mut dots = 0;
            while i < bytes.len()
                && (bytes[i].is_ascii_digit()
                    || (bytes[i] == b'.'
                        && dots < 2
                        && bytes.get(i + 1).is_some_and(u8::is_ascii_digit)))
            {
                if bytes[i] == b'.' {
                    dots += 1;
                }
                i += 1;
            }
            if dots >= 1 {
                return Some(haystack[start..i].to_string());
            }
        }
        i += 1;
    }
    None
}

/// Runs a program without a console window and returns stdout + stderr,
/// or `None` if it fails to start or exceeds `timeout`.
fn run_capture(program: &Path, args: &[&str], timeout: Duration) -> Option<String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut command);

    let mut child = command.spawn().ok()?;
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let output = child.wait_with_output().ok()?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    Some(text)
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}

fn scan_ports() -> Vec<PortStatus> {
    let listeners = listening_ports();
    WATCHED_PORTS
        .iter()
        .map(|&(port, purpose)| {
            let pid = listeners
                .iter()
                .find(|(p, _)| *p == port)
                .map(|(_, pid)| *pid);
            PortStatus {
                port,
                purpose: purpose.into(),
                in_use: pid.is_some(),
                pid,
                process: pid.and_then(process_name),
            }
        })
        .collect()
}

/// (port, pid) for every listening TCP socket, from `netstat -ano`.
fn listening_ports() -> Vec<(u16, u32)> {
    let Some(text) = run_capture(Path::new("netstat"), &["-ano", "-p", "TCP"], VERSION_TIMEOUT)
    else {
        return Vec::new();
    };
    let v6 = run_capture(Path::new("netstat"), &["-ano", "-p", "TCPv6"], VERSION_TIMEOUT)
        .unwrap_or_default();
    parse_netstat(&format!("{text}\n{v6}"))
}

pub fn parse_netstat(text: &str) -> Vec<(u16, u32)> {
    text.lines()
        .filter_map(|line| {
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() != 5 || !cols[0].starts_with("TCP") || cols[3] != "LISTENING" {
                return None;
            }
            let port = cols[1].rsplit(':').next()?.parse().ok()?;
            let pid = cols[4].parse().ok()?;
            Some((port, pid))
        })
        .collect()
}

fn process_name(pid: u32) -> Option<String> {
    if pid == 4 {
        return Some("System (Windows HTTP service)".into());
    }
    let filter = format!("PID eq {pid}");
    let text = run_capture(
        Path::new("tasklist"),
        &["/FI", &filter, "/FO", "CSV", "/NH"],
        VERSION_TIMEOUT,
    )?;
    let name = text.lines().next()?.split(',').next()?.trim_matches('"').trim();
    (!name.is_empty() && !name.starts_with("INFO:")).then(|| name.to_string())
}

#[cfg(windows)]
fn windows_services() -> Vec<(String, PathBuf)> {
    use winreg::RegKey;
    use winreg::enums::HKEY_LOCAL_MACHINE;

    let Ok(root) = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SYSTEM\CurrentControlSet\Services")
    else {
        return Vec::new();
    };
    root.enum_keys()
        .flatten()
        .filter_map(|name| {
            let image: String = root.open_subkey(&name).ok()?.get_value("ImagePath").ok()?;
            Some((name, service_exe(&image)?))
        })
        .collect()
}

#[cfg(not(windows))]
fn windows_services() -> Vec<(String, PathBuf)> {
    Vec::new()
}

/// Executable path from a service ImagePath such as `"C:\x\mysqld.exe" --defaults-file=...`.
pub fn service_exe(image_path: &str) -> Option<PathBuf> {
    let image_path = image_path.trim();
    let exe = match image_path.strip_prefix('"') {
        Some(rest) => rest.split('"').next()?,
        None => {
            let lower = image_path.to_ascii_lowercase();
            &image_path[..lower.find(".exe")? + 4]
        }
    };
    Some(PathBuf::from(exe))
}

#[cfg(windows)]
fn vc_runtime_version() -> Option<String> {
    use winreg::RegKey;
    use winreg::enums::HKEY_LOCAL_MACHINE;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    [
        r"SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64",
        r"SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\X64",
    ]
    .iter()
    .find_map(|path| {
        let key = hklm.open_subkey(path).ok()?;
        let installed: u32 = key.get_value("Installed").ok()?;
        if installed != 1 {
            return None;
        }
        let version: String = key.get_value("Version").ok()?;
        Some(version.trim_start_matches('v').to_string())
    })
}

#[cfg(not(windows))]
fn vc_runtime_version() -> Option<String> {
    None
}

fn disk_space(path: &Path) -> Option<DiskSpace> {
    let disks = sysinfo::Disks::new_with_refreshed_list().ok()?;
    let path_lower = path.display().to_string().to_ascii_lowercase();
    disks
        .iter()
        .filter(|disk| {
            path_lower.starts_with(&disk.mount_point().display().to_string().to_ascii_lowercase())
        })
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
        .map(|disk| DiskSpace {
            mount: disk.mount_point().display().to_string(),
            free_bytes: disk.available_space(),
            total_bytes: disk.total_space(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_versions_from_real_outputs() {
        assert_eq!(
            extract_version("PHP 8.3.20 (cli) (built: Mar 11 2025)", Some("PHP ")).as_deref(),
            Some("8.3.20")
        );
        assert_eq!(extract_version("v24.15.0\n", None).as_deref(), Some("24.15.0"));
        assert_eq!(
            extract_version(
                "Server version: Apache/2.4.54 (Win64)\nServer built: Jun 8 2022",
                Some("Apache/")
            )
            .as_deref(),
            Some("2.4.54")
        );
        assert_eq!(
            extract_version(
                r"C:\laragon\bin\mysql\mysql-8.0.30-winx64\bin\mysqld.exe  Ver 8.0.30 for Win64",
                Some("Ver ")
            )
            .as_deref(),
            Some("8.0.30")
        );
        assert_eq!(
            extract_version("git version 2.53.0.windows.3", Some("version ")).as_deref(),
            Some("2.53.0")
        );
        assert_eq!(extract_version("no numbers here", None), None);
        assert_eq!(extract_version("PHP is missing", Some("Apache/")), None);
    }

    #[test]
    fn parses_netstat_listeners_only() {
        let text = "\
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:80             0.0.0.0:0              LISTENING       1234
  TCP    127.0.0.1:3306         0.0.0.0:0              LISTENING       555
  TCP    192.168.1.5:50000      1.2.3.4:443            ESTABLISHED     777
  TCP    [::]:443               [::]:0                 LISTENING       4
";
        assert_eq!(parse_netstat(text), vec![(80, 1234), (3306, 555), (443, 4)]);
    }

    #[test]
    fn reads_service_image_paths() {
        assert_eq!(
            service_exe(r#""C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe" --defaults-file="x.ini" MySQL80"#),
            Some(PathBuf::from(r"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe"))
        );
        assert_eq!(
            service_exe(r"C:\xampp\apache\bin\httpd.exe -k runservice"),
            Some(PathBuf::from(r"C:\xampp\apache\bin\httpd.exe"))
        );
        assert_eq!(service_exe(r"\SystemRoot\System32\drivers\x.sys"), None);
    }

    #[test]
    fn reads_version_from_folder_names() {
        assert_eq!(
            version_from_folders(Path::new(r"C:\laragon\bin\nginx\nginx-1.22.0\nginx.exe")).as_deref(),
            Some("1.22.0")
        );
        assert_eq!(
            version_from_folders(Path::new(
                r"C:\laragon\bin\apache\httpd-2.4.54-win64-VS16\bin\httpd.exe"
            ))
            .as_deref(),
            Some("2.4.54")
        );
        assert_eq!(version_from_folders(Path::new(r"C:\xampp\php\php.exe")), None);
    }

    #[test]
    fn wildcard_matches_one_level() {
        assert!(wildcard_match("*", "php-8.3.20"));
        assert!(wildcard_match("MariaDB *", "MariaDB 11.4"));
        assert!(!wildcard_match("MariaDB *", "MySQL 8.0"));
        assert!(wildcard_match("bin", "BIN"));
    }

    /// Prints a real scan of this machine: `cargo test print_real_scan -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn print_real_scan() {
        let report = run(Path::new(r"C:\"));
        println!("{}", serde_json::to_string_pretty(&report).unwrap());
    }
}
