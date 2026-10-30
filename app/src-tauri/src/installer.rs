//! Downloads, verifies and unpacks components into `<install root>\bin`.
//! URLs and checksums always come from the bundled catalog, never from the UI.

use crate::catalog::{Catalog, Checksum, Download};
use futures_util::StreamExt;
use md5::Md5;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

/// Set by `cancel_install`; checked between chunks and steps.
pub static CANCEL: AtomicBool = AtomicBool::new(false);

const PROGRESS_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Debug, Deserialize)]
pub struct InstallRequest {
    pub install_root: String,
    pub www_dir: String,
    /// Components to install; existing installs aren't sent.
    pub items: Vec<InstallItem>,
}

#[derive(Debug, Deserialize)]
pub struct InstallItem {
    pub id: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Progress {
    pub step: String,
    pub status: StepStatus,
    pub message: Option<String>,
    pub bytes_done: u64,
    pub bytes_total: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StepStatus {
    Running,
    Done,
    Failed,
    Cancelled,
}

/// Folder under `bin\` for each component.
pub fn bin_folder(id: &str) -> &str {
    match id {
        "node" => "nodejs",
        other => other,
    }
}

/// `<root>\bin\php\php-8.5.12`, or `<root>\bin\composer` for Composer.
pub fn target_dir(root: &Path, id: &str, version: &str) -> PathBuf {
    let base = root.join("bin").join(bin_folder(id));
    if id == "composer" { base } else { base.join(format!("{id}-{version}")) }
}

/// Runs the folder step and one download step per item, reporting progress through `emit`.
/// Stops at the first failure or cancellation and returns its message.
pub async fn run(
    catalog: &Catalog,
    request: &InstallRequest,
    emit: impl Fn(Progress),
) -> Result<(), String> {
    CANCEL.store(false, Ordering::SeqCst);
    let root = PathBuf::from(request.install_root.trim());
    let report = |step: &str, status, message: Option<String>| {
        emit(Progress { step: step.into(), status, message, bytes_done: 0, bytes_total: None })
    };

    report("folders", StepStatus::Running, None);
    let folders = ["bin", "data", "etc", "tmp\\downloads"].map(|f| root.join(f));
    for dir in folders.iter().chain([PathBuf::from(request.www_dir.trim())].iter()) {
        if let Err(err) = fs::create_dir_all(dir) {
            let msg = format!("Couldn't create {}: {err}", dir.display());
            report("folders", StepStatus::Failed, Some(msg.clone()));
            return Err(msg);
        }
    }
    report("folders", StepStatus::Done, None);

    let client = reqwest::Client::builder()
        .user_agent(concat!("DevManager/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| format!("Couldn't start the downloader: {err}"))?;

    for item in &request.items {
        let step = format!("get-{}", item.id);
        if CANCEL.load(Ordering::SeqCst) {
            report(&step, StepStatus::Cancelled, None);
            return Err("Installation cancelled.".into());
        }
        let result = install_item(&client, catalog, &root, item, &step, &emit).await;
        match result {
            Ok(message) => report(&step, StepStatus::Done, message),
            Err(StepError::Cancelled) => {
                report(&step, StepStatus::Cancelled, None);
                return Err("Installation cancelled.".into());
            }
            Err(StepError::Failed(msg)) => {
                report(&step, StepStatus::Failed, Some(msg.clone()));
                return Err(msg);
            }
        }
    }
    Ok(())
}

#[derive(Debug)]
enum StepError {
    Cancelled,
    Failed(String),
}

impl From<String> for StepError {
    fn from(msg: String) -> Self {
        StepError::Failed(msg)
    }
}

async fn install_item(
    client: &reqwest::Client,
    catalog: &Catalog,
    root: &Path,
    item: &InstallItem,
    step: &str,
    emit: &impl Fn(Progress),
) -> Result<Option<String>, StepError> {
    let download = catalog
        .download_for(&item.id, &item.version)
        .ok_or_else(|| format!("No Windows download is listed for {} {}.", item.id, item.version))?;
    let target = target_dir(root, &item.id, &item.version);

    let installed_marker = target.join(".devmanager-installed");
    if installed_marker.is_file() {
        return Ok(Some("Already installed".into()));
    }

    let file_name = download.url.rsplit('/').next().unwrap_or("download.bin");
    let archive = root.join("tmp").join("downloads").join(file_name);
    let reused = archive.is_file() && file_matches(&archive, &download.checksum).unwrap_or(false);
    if !reused {
        fetch(client, download, &archive, step, emit).await?;
    }

    emit(Progress {
        step: step.into(),
        status: StepStatus::Running,
        message: Some("Unpacking".into()),
        bytes_done: 0,
        bytes_total: None,
    });
    let id = item.id.clone();
    let (archive_path, target_path) = (archive.clone(), target.clone());
    tauri::async_runtime::spawn_blocking(move || {
        if id == "composer" {
            install_composer(&archive_path, &target_path)
        } else {
            extract_into(&archive_path, &target_path)
        }
    })
    .await
    .map_err(|err| format!("Unpacking stopped unexpectedly: {err}"))?
    .map_err(|err| format!("Couldn't unpack {file_name}: {err}"))?;

    fs::write(&installed_marker, &download.url)
        .map_err(|err| format!("Couldn't record the install: {err}"))?;
    // The verified archive is no longer needed.
    let _ = fs::remove_file(&archive);
    Ok(reused.then(|| "Used an already-downloaded file".into()))
}

/// Streams `download` to `dest`, hashing as it goes; the file only gets its final
/// name once the checksum matches.
async fn fetch(
    client: &reqwest::Client,
    download: &Download,
    dest: &Path,
    step: &str,
    emit: &impl Fn(Progress),
) -> Result<(), StepError> {
    let partial = dest.with_extension("part");
    let response = client
        .get(&download.url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|err| format!("Download failed: {err}"))?;
    let total = response.content_length().or(download.size);

    let mut file = File::create(&partial).map_err(|err| format!("Couldn't save the download: {err}"))?;
    let mut hasher = Hasher::new(&download.checksum.algo)?;
    let mut done = 0u64;
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        if CANCEL.load(Ordering::SeqCst) {
            drop(file);
            let _ = fs::remove_file(&partial);
            return Err(StepError::Cancelled);
        }
        let chunk = chunk.map_err(|err| format!("Download interrupted: {err}"))?;
        file.write_all(&chunk).map_err(|err| format!("Couldn't save the download: {err}"))?;
        hasher.update(&chunk);
        done += chunk.len() as u64;
        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            last_emit = Instant::now();
            emit(Progress {
                step: step.into(),
                status: StepStatus::Running,
                message: Some("Downloading".into()),
                bytes_done: done,
                bytes_total: total,
            });
        }
    }
    file.flush().map_err(|err| format!("Couldn't save the download: {err}"))?;
    drop(file);

    let actual = hasher.finish();
    if actual != download.checksum.value {
        let _ = fs::remove_file(&partial);
        return Err(StepError::Failed(format!(
            "The downloaded file didn't match its {} checksum, so it was deleted. Try again; \
             if it keeps failing, the download may have been tampered with.",
            download.checksum.algo.to_uppercase()
        )));
    }
    fs::rename(&partial, dest).map_err(|err| format!("Couldn't save the download: {err}"))?;
    Ok(())
}

enum Hasher {
    Sha256(Sha256),
    Md5(Md5),
}

impl Hasher {
    fn new(algo: &str) -> Result<Self, String> {
        match algo {
            "sha256" => Ok(Hasher::Sha256(Sha256::new())),
            "md5" => Ok(Hasher::Md5(Md5::new())),
            other => Err(format!("Unsupported checksum type: {other}")),
        }
    }

    fn update(&mut self, data: &[u8]) {
        match self {
            Hasher::Sha256(h) => h.update(data),
            Hasher::Md5(h) => h.update(data),
        }
    }

    fn finish(self) -> String {
        let bytes: Vec<u8> = match self {
            Hasher::Sha256(h) => h.finalize().to_vec(),
            Hasher::Md5(h) => h.finalize().to_vec(),
        };
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }
}

fn file_matches(path: &Path, checksum: &Checksum) -> io::Result<bool> {
    let mut hasher = Hasher::new(&checksum.algo).map_err(io::Error::other)?;
    let mut file = File::open(path)?;
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = io::Read::read(&mut file, &mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finish() == checksum.value)
}

/// Unpacks a zip into `target`. When everything sits in one top-level folder
/// (`node-v26.13.0-win-x64\`, `Apache24\`) its contents go straight into `target`.
/// Unpacks into a staging folder first so a failed unpack never leaves a half-installed version.
pub fn extract_into(archive: &Path, target: &Path) -> io::Result<()> {
    let mut zip = zip::ZipArchive::new(File::open(archive)?).map_err(io::Error::other)?;
    let strip = single_top_folder(&mut zip);

    let staging = target.with_extension("staging");
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    fs::create_dir_all(&staging)?;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(io::Error::other)?;
        // `enclosed_name` rejects absolute paths and `..` (zip-slip).
        let Some(name) = entry.enclosed_name() else { continue };
        let relative = match &strip {
            Some(prefix) => match name.strip_prefix(prefix) {
                Ok(rest) if rest.as_os_str().is_empty() => continue,
                Ok(rest) => rest.to_path_buf(),
                // Loose files beside the single folder, e.g. a ReadMe.
                Err(_) => continue,
            },
            None => name,
        };
        let out = staging.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&out)?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent)?;
            }
            io::copy(&mut entry, &mut File::create(&out)?)?;
        }
    }

    if target.exists() {
        fs::remove_dir_all(target)?;
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(&staging, target)
}

/// The one top-level folder holding every directory in the zip, if there is exactly one.
fn single_top_folder(zip: &mut zip::ZipArchive<File>) -> Option<PathBuf> {
    let mut top_dirs = std::collections::BTreeSet::new();
    for i in 0..zip.len() {
        let entry = zip.by_index(i).ok()?;
        let name = entry.enclosed_name()?;
        let mut parts = name.components();
        let first = parts.next()?;
        let nested = parts.next().is_some();
        if nested || entry.is_dir() {
            if let Component::Normal(first) = first {
                top_dirs.insert(PathBuf::from(first));
            }
        }
    }
    (top_dirs.len() == 1).then(|| top_dirs.into_iter().next().unwrap())
}

/// Composer is a single `.phar`; add a `composer.bat` so `composer` works in a terminal.
fn install_composer(phar: &Path, target: &Path) -> io::Result<()> {
    fs::create_dir_all(target)?;
    fs::copy(phar, target.join("composer.phar"))?;
    fs::write(target.join("composer.bat"), "@php \"%~dp0composer.phar\" %*\r\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::write::SimpleFileOptions;

    fn make_zip(path: &Path, entries: &[(&str, &str)]) {
        let mut writer = zip::ZipWriter::new(File::create(path).unwrap());
        for (name, body) in entries {
            if name.ends_with('/') {
                writer.add_directory(*name, SimpleFileOptions::default()).unwrap();
            } else {
                writer.start_file(*name, SimpleFileOptions::default()).unwrap();
                writer.write_all(body.as_bytes()).unwrap();
            }
        }
        writer.finish().unwrap();
    }

    #[test]
    fn strips_a_single_top_folder_and_drops_loose_files() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("apache.zip");
        make_zip(
            &archive,
            &[
                ("ReadMe.txt", "readme"),
                ("Apache24/", ""),
                ("Apache24/bin/httpd.exe", "exe"),
                ("Apache24/conf/httpd.conf", "conf"),
            ],
        );
        let target = dir.path().join("bin").join("apache").join("apache-2.4.69");
        extract_into(&archive, &target).unwrap();
        assert_eq!(fs::read_to_string(target.join("bin/httpd.exe")).unwrap(), "exe");
        assert!(target.join("conf/httpd.conf").is_file());
        assert!(!target.join("ReadMe.txt").exists());
        assert!(!target.with_extension("staging").exists());
    }

    #[test]
    fn keeps_layout_when_there_are_several_top_folders() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("php.zip");
        make_zip(&archive, &[("php.exe", "php"), ("ext/php_curl.dll", "dll"), ("lib/x.lib", "lib")]);
        let target = dir.path().join("php-8.5.12");
        extract_into(&archive, &target).unwrap();
        assert!(target.join("php.exe").is_file());
        assert!(target.join("ext/php_curl.dll").is_file());
    }

    #[test]
    fn refuses_paths_that_escape_the_target() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("evil.zip");
        make_zip(&archive, &[("../evil.txt", "pwned"), ("ok.txt", "fine")]);
        let target = dir.path().join("out").join("x-1.0");
        extract_into(&archive, &target).unwrap();
        assert!(target.join("ok.txt").is_file());
        assert!(!dir.path().join("out").join("evil.txt").exists());
        assert!(!dir.path().join("evil.txt").exists());
    }

    #[test]
    fn checks_sha256_and_md5() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("hello.txt");
        fs::write(&file, "hello").unwrap();
        let sha = Checksum {
            algo: "sha256".into(),
            value: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824".into(),
        };
        let md5 = Checksum { algo: "md5".into(), value: "5d41402abc4b2a76b9719d911017c592".into() };
        assert!(file_matches(&file, &sha).unwrap());
        assert!(file_matches(&file, &md5).unwrap());
        let wrong = Checksum { algo: "sha256".into(), value: "00".into() };
        assert!(!file_matches(&file, &wrong).unwrap());
    }

    #[test]
    fn composer_gets_a_bat_shim() {
        let dir = tempfile::tempdir().unwrap();
        let phar = dir.path().join("composer.phar");
        fs::write(&phar, "phar").unwrap();
        let target = target_dir(dir.path(), "composer", "2.11.0");
        install_composer(&phar, &target).unwrap();
        assert!(target.join("composer.phar").is_file());
        assert!(fs::read_to_string(target.join("composer.bat")).unwrap().contains("composer.phar"));
    }

    /// Installs one real component from the bundled catalog into a temp folder.
    fn real_install(id: &str, version: &str) -> (tempfile::TempDir, Vec<Progress>) {
        let dir = tempfile::tempdir().unwrap();
        let catalog = crate::catalog::bundled();
        let request = InstallRequest {
            install_root: dir.path().display().to_string(),
            www_dir: dir.path().join("www").display().to_string(),
            items: vec![InstallItem { id: id.into(), version: version.into() }],
        };
        let events = std::sync::Mutex::new(Vec::new());
        tauri::async_runtime::block_on(run(&catalog, &request, |p| events.lock().unwrap().push(p))).unwrap();
        let events = events.into_inner().unwrap();
        for e in events.iter().filter(|e| e.status != StepStatus::Running || e.bytes_done == 0) {
            println!("{:?} {:?} {:?}", e.step, e.status, e.message);
        }
        assert!(events.iter().any(|e| e.step == format!("get-{id}") && e.status == StepStatus::Done));
        (dir, events)
    }

    /// `cargo test real_composer_install -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_composer_install() {
        let version = crate::catalog::bundled().tools.composer.version;
        let (dir, _) = real_install("composer", &version);
        assert!(dir.path().join("bin/composer/composer.phar").is_file());
    }

    /// `cargo test real_nginx_install -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_nginx_install() {
        let catalog = crate::catalog::bundled();
        let nginx = catalog.components.iter().find(|c| c.id == "nginx").unwrap();
        let version = nginx.lines.last().unwrap().latest.clone();
        let (dir, _) = real_install("nginx", &version);
        let target = dir.path().join("bin").join("nginx").join(format!("nginx-{version}"));
        assert!(target.join("nginx.exe").is_file(), "nginx.exe should be at the top of the target");
        assert!(target.join("conf").join("nginx.conf").is_file());
        assert!(target.join(".devmanager-installed").is_file());
        assert!(!dir.path().join("tmp/downloads").read_dir().unwrap().any(|_| true), "archive cleaned up");
    }
}
