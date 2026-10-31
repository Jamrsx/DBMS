//! Downloads, verifies and unpacks components into `<install root>\bin`.
//! URLs and checksums always come from the bundled catalog, never from the UI.

use crate::catalog::{Catalog, Checksum, Download};
use crate::{admin, configure};
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
    /// Components to download and install.
    pub items: Vec<InstallItem>,
    /// Installs already on this PC that the user chose to use instead.
    #[serde(default)]
    pub existing: Vec<ExistingItem>,
    /// Present when MySQL is being installed.
    #[serde(default)]
    pub mysql: Option<MysqlRequest>,
}

#[derive(Debug, Deserialize)]
pub struct InstallItem {
    pub id: String,
    pub version: String,
}

#[derive(Debug, Deserialize)]
pub struct ExistingItem {
    pub id: String,
    /// The executable the scan found, e.g. `C:\xampp\php\php.exe`.
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct MysqlRequest {
    pub port: u16,
    /// Only sent for a new MySQL; an existing one keeps its own password.
    pub password: Option<Secret>,
    /// Data folder for a new MySQL; `None` when using an existing MySQL.
    pub data_dir: Option<String>,
    pub autostart: bool,
    /// True when the user chose a MySQL already on this PC; only its port is recorded.
    #[serde(default)]
    pub existing: bool,
}

/// A value that must never be logged or saved; `Debug` prints `***`.
#[derive(Deserialize)]
#[serde(transparent)]
pub struct Secret(String);

impl Secret {
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for Secret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("***")
    }
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

pub struct RunOptions {
    /// Allow steps that change Windows itself (Visual C++ runtime, trusted certificates).
    /// Tests run with this off so they never touch the real system.
    pub system_changes: bool,
    pub ca_dir: PathBuf,
    /// The app's config folder, where the install location is remembered for next launch.
    pub config_dir: Option<PathBuf>,
}

impl RunOptions {
    pub fn for_app(config_dir: Option<PathBuf>) -> Self {
        RunOptions { system_changes: true, ca_dir: admin::ca_dir(), config_dir }
    }
}

/// Runs the folder step and one download step per item, reporting progress through `emit`.
/// Stops at the first failure or cancellation and returns its message.
pub async fn run(
    catalog: &Catalog,
    request: &InstallRequest,
    options: &RunOptions,
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
        .user_agent(concat!("NexDB/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| format!("Couldn't start the downloader: {err}"))?;

    // PHP and Apache Windows builds need the Visual C++ runtime, and so does checking their configs.
    if options.system_changes && request.items.iter().any(|i| i.id == "php" || i.id == "apache") {
        let step = "vc-runtime";
        report(step, StepStatus::Running, None);
        match ensure_vc_runtime(&client, &root, step, &emit).await {
            Ok(message) => report(step, StepStatus::Done, Some(message)),
            Err(StepError::Cancelled) => {
                report(step, StepStatus::Cancelled, None);
                return Err("Installation cancelled.".into());
            }
            Err(StepError::Failed(msg)) => {
                report(step, StepStatus::Failed, Some(msg.clone()));
                return Err(msg);
            }
        }
    }

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

    let layout = Layout::new(&root, request);
    let mut configure_steps: Vec<(&str, Box<dyn FnOnce() -> Result<Option<String>, String> + Send>)> = Vec::new();
    if let Some(server_root) = layout.apache.clone() {
        let l = layout.clone();
        configure_steps.push(("config-apache", Box::new(move || configure_apache(&l, &server_root))));
    }
    if let Some(nginx_dir) = layout.nginx.clone() {
        let l = layout.clone();
        configure_steps.push(("config-nginx", Box::new(move || configure_nginx(&l, &nginx_dir))));
    }
    if let (Some(base), Some(mysql), Some(data_dir)) = (
        layout.mysql.clone(),
        request.mysql.as_ref(),
        request.mysql.as_ref().and_then(|m| m.data_dir.as_deref()),
    ) {
        let l = layout.clone();
        let port = mysql.port;
        let data_dir = PathBuf::from(data_dir.trim());
        // Copied only into this closure, which runs and is dropped right away.
        let password = mysql.password.as_ref().map(|p| p.expose().to_string());
        configure_steps.push(("mysql-init", Box::new(move || configure_mysql(&l, &base, &data_dir, port, password.as_deref()))));
    }
    if options.system_changes && (layout.apache.is_some() || layout.nginx.is_some()) {
        let ca_dir = options.ca_dir.clone();
        configure_steps.push((
            "local-ca",
            Box::new(move || {
                let ca = admin::ensure_ca(&ca_dir)?;
                let trust = admin::trust_ca(&ca)?;
                Ok(Some(if ca.created { format!("Created · {trust}") } else { trust }))
            }),
        ));
    }
    let settings = saved_settings(&layout, request);
    let l = layout.clone();
    let config_dir = options.config_dir.clone();
    configure_steps.push((
        "save",
        Box::new(move || {
            let message = save_settings(&l, &settings)?;
            if let Some(dir) = &config_dir {
                crate::settings::write_pointer(dir, &l.root)?;
            }
            Ok(message)
        }),
    ));

    for (step, work) in configure_steps {
        if CANCEL.load(Ordering::SeqCst) {
            report(step, StepStatus::Cancelled, None);
            return Err("Installation cancelled.".into());
        }
        report(step, StepStatus::Running, None);
        let result = tauri::async_runtime::spawn_blocking(work)
            .await
            .map_err(|err| format!("Setup stopped unexpectedly: {err}"))
            .and_then(|r| r);
        match result {
            Ok(message) => report(step, StepStatus::Done, message),
            Err(msg) => {
                report(step, StepStatus::Failed, Some(msg.clone()));
                return Err(msg);
            }
        }
    }
    Ok(())
}

/// Installs the Visual C++ runtime unless a new enough one is already there.
/// The installer must carry Microsoft's signature before it's run behind an admin prompt.
async fn ensure_vc_runtime(
    client: &reqwest::Client,
    root: &Path,
    step: &str,
    emit: &impl Fn(Progress),
) -> Result<String, StepError> {
    let installed = crate::scan::vc_runtime_version();
    if admin::vc_runtime_ok(installed.as_deref()) {
        return Ok(format!("Already installed ({})", installed.unwrap_or_default()));
    }
    let download = Download {
        url: admin::VC_REDIST_URL.into(),
        size: None,
        checksum: Checksum { algo: AUTHENTICODE.into(), value: String::new() },
    };
    let installer = root.join("tmp").join("downloads").join("vc_redist.x64.exe");
    fetch(client, &download, &installer, step, emit).await?;
    emit(Progress {
        step: step.into(),
        status: StepStatus::Running,
        message: Some("Waiting for administrator approval".into()),
        bytes_done: 0,
        bytes_total: None,
    });
    let path = installer.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        admin::verify_microsoft_signature(&path)?;
        admin::install_vc_runtime(&path)
    })
    .await
    .map_err(|err| format!("The Visual C++ step stopped unexpectedly: {err}"))?;
    let _ = fs::remove_file(&installer);
    Ok(result?)
}

/// Where everything lives for this install, resolved from new and existing components.
#[derive(Debug, Clone)]
struct Layout {
    root: PathBuf,
    www: PathBuf,
    etc: PathBuf,
    logs: PathBuf,
    php: Option<PathBuf>,
    apache: Option<PathBuf>,
    nginx: Option<PathBuf>,
    mysql: Option<PathBuf>,
    apache_port: u16,
    nginx_port: u16,
    fcgi_port: u16,
}

impl Layout {
    fn new(root: &Path, request: &InstallRequest) -> Self {
        let dir_for = |id: &str| -> Option<PathBuf> {
            if let Some(item) = request.items.iter().find(|i| i.id == id) {
                return Some(target_dir(root, id, &item.version));
            }
            let existing = request.existing.iter().find(|e| e.id == id)?;
            configure::root_above_bin(Path::new(&existing.path))
        };
        let apache = dir_for("apache");
        Layout {
            root: root.to_path_buf(),
            www: PathBuf::from(request.www_dir.trim()),
            etc: root.join("etc"),
            logs: root.join("logs"),
            php: dir_for("php"),
            apache_port: 80,
            nginx_port: if apache.is_some() { 8080 } else { 80 },
            fcgi_port: configure::PHP_FASTCGI_PORT,
            apache,
            nginx: dir_for("nginx"),
            // Only a newly installed MySQL is set up; an existing one keeps its own data.
            mysql: request
                .items
                .iter()
                .find(|i| i.id == "mysql")
                .map(|i| target_dir(root, "mysql", &i.version)),
        }
    }

    /// Writes php.ini for the selected PHP, if any, plus php-cli.ini for the terminal.
    fn write_php_ini(&self) -> Result<(), String> {
        let Some(php) = &self.php else { return Ok(()) };
        write_php_inis(php, &self.etc.join("php"), &self.logs)
    }
}

/// php.ini for a PHP install, plus php-cli.ini for its command line, in `dir`.
fn write_php_inis(php: &Path, dir: &Path, logs: &Path) -> Result<(), String> {
    {
        let ini = configure::php_ini(php);
        configure::write_file(&dir.join("php.ini"), &ini)?;
        // The command line (which reads php-cli.ini first) shows each warning once on screen and
        // keeps its log in a file; otherwise PHP prints every warning twice, once to stderr.
        let cli = format!(
            "{ini}\r\n; Added by NexDB for the command line\r\nerror_log = \"{}\"\r\n",
            configure::conf_path(&logs.join("php_cli_errors.log"))
        );
        configure::write_file(&dir.join("php-cli.ini"), &cli)
    }
}

/// Rewrites every config file from the saved settings and validates the web servers' configs.
/// Run before starting services so fixes to the templates reach existing installs.
pub fn refresh_configs(root: &Path, settings: &crate::settings::Settings) -> Result<(), String> {
    // New components store their folder; existing ones store their executable.
    let dir_for = |id: &str| {
        settings.components.iter().find(|c| c.id == id).and_then(|c| {
            let path = Path::new(&c.path);
            if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) {
                configure::root_above_bin(path)
            } else {
                Some(path.to_path_buf())
            }
        })
    };
    let mysql_existing = settings.mysql.as_ref().is_some_and(|m| m.existing);
    let layout = Layout {
        root: root.to_path_buf(),
        www: PathBuf::from(&settings.www_dir),
        etc: root.join("etc"),
        logs: root.join("logs"),
        php: dir_for("php"),
        apache: settings.apache_port.and(dir_for("apache")),
        nginx: settings.nginx_port.and(dir_for("nginx")),
        apache_port: settings.apache_port.unwrap_or(80),
        nginx_port: settings.nginx_port.unwrap_or(8080),
        fcgi_port: settings.php_fastcgi_port,
        mysql: if mysql_existing { None } else { dir_for("mysql") },
    };
    layout.write_php_ini()?;
    for extra in crate::phpver::extras(root, settings) {
        write_php_inis(&extra.dir, &extra.ini_dir, &layout.logs)?;
    }
    // Keep `composer` pointed at the PHP in use, which may have just been switched.
    let composer_dir = root.join("bin").join("composer");
    if composer_dir.join("composer.phar").is_file() {
        let php = layout.php.as_ref().map(|dir| dir.join("php.exe"));
        let ini = cli_ini(&layout.etc);
        configure::write_file(&composer_dir.join("composer.bat"), &composer_shim(php.as_deref(), &ini))?;
    }
    if let Some(server_root) = &layout.apache {
        configure_apache(&layout, server_root)?;
        crate::projects::write_site_configs(root, settings)?;
        crate::phpmyadmin::write_config(root, settings.mysql.as_ref().map(|m| m.port))?;
    }
    if let Some(nginx_dir) = &layout.nginx {
        configure_nginx(&layout, nginx_dir)?;
    }
    if let (Some(base), Some(mysql)) = (&layout.mysql, &settings.mysql) {
        if let Some(data_dir) = &mysql.data_dir {
            configure::write_file(
                &layout.etc.join("mysql").join("my.ini"),
                &configure::mysql_ini(&configure::MysqlConf {
                    base_dir: base,
                    data_dir: Path::new(data_dir),
                    port: mysql.port,
                    logs_dir: &layout.logs,
                }),
            )?;
        }
    }
    Ok(())
}

fn configure_apache(l: &Layout, server_root: &Path) -> Result<Option<String>, String> {
    l.write_php_ini()?;
    fs::create_dir_all(l.etc.join("apache").join("sites-enabled")).map_err(|e| e.to_string())?;
    // The config includes this folder; Apache refuses to start when an included folder is missing.
    fs::create_dir_all(l.etc.join("apache").join("extra")).map_err(|e| e.to_string())?;
    fs::create_dir_all(&l.logs).map_err(|e| e.to_string())?;
    let conf = l.etc.join("apache").join("httpd.conf");
    configure::write_file(
        &conf,
        &configure::apache_conf(&configure::ApacheConf {
            server_root,
            port: l.apache_port,
            www_dir: &l.www,
            etc_dir: &l.etc,
            logs_dir: &l.logs,
            php: l.php.is_some(),
            fcgi_port: l.fcgi_port,
        }),
    )?;
    configure::check_apache(server_root, &conf)?;
    Ok(Some(format!("Config checked · port {}", l.apache_port)))
}

fn configure_nginx(l: &Layout, nginx_dir: &Path) -> Result<Option<String>, String> {
    l.write_php_ini()?;
    let temp = l.root.join("tmp").join("nginx");
    for dir in ["client_body", "proxy", "fastcgi", "uwsgi", "scgi"] {
        fs::create_dir_all(temp.join(dir)).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(l.etc.join("nginx").join("sites-enabled")).map_err(|e| e.to_string())?;
    fs::create_dir_all(&l.logs).map_err(|e| e.to_string())?;
    let conf = l.etc.join("nginx").join("nginx.conf");
    configure::write_file(
        &conf,
        &configure::nginx_conf(&configure::NginxConf {
            nginx_dir,
            port: l.nginx_port,
            www_dir: &l.www,
            etc_dir: &l.etc,
            logs_dir: &l.logs,
            temp_dir: &temp,
            php: l.php.is_some(),
            fcgi_port: l.fcgi_port,
        }),
    )?;
    configure::check_nginx(nginx_dir, &conf)?;
    Ok(Some(format!("Config checked · port {}", l.nginx_port)))
}

fn configure_mysql(
    l: &Layout,
    base: &Path,
    data_dir: &Path,
    port: u16,
    password: Option<&str>,
) -> Result<Option<String>, String> {
    fs::create_dir_all(&l.logs).map_err(|e| e.to_string())?;
    let ini = l.etc.join("mysql").join("my.ini");
    configure::write_file(
        &ini,
        &configure::mysql_ini(&configure::MysqlConf { base_dir: base, data_dir, port, logs_dir: &l.logs }),
    )?;
    match configure::setup_mysql(base, &ini, data_dir, port, password)? {
        configure::MysqlSetup::Initialized => Ok(Some(if password.is_some() {
            "Data folder created · root password set".into()
        } else {
            "Data folder created · root has no password".into()
        })),
        configure::MysqlSetup::KeptExisting => {
            Ok(Some("Kept the existing data folder; its root password is unchanged".into()))
        }
    }
}

/// DevManager's own settings. Never contains the MySQL password.
#[derive(Debug, Serialize)]
struct SavedSettings {
    schema: u32,
    install_root: String,
    www_dir: String,
    php_fastcgi_port: u16,
    components: Vec<SavedComponent>,
    apache_port: Option<u16>,
    nginx_port: Option<u16>,
    mysql: Option<SavedMysql>,
}

#[derive(Debug, Serialize)]
struct SavedComponent {
    id: String,
    version: Option<String>,
    path: String,
    existing: bool,
}

#[derive(Debug, Serialize)]
struct SavedMysql {
    port: u16,
    existing: bool,
    data_dir: Option<String>,
    autostart: bool,
    /// Unknown (`None`) for an existing MySQL, whose password DevManager never sees.
    has_password: Option<bool>,
}

fn saved_settings(l: &Layout, request: &InstallRequest) -> SavedSettings {
    let mut components: Vec<SavedComponent> = request
        .items
        .iter()
        .map(|i| SavedComponent {
            id: i.id.clone(),
            version: Some(i.version.clone()),
            path: target_dir(&l.root, &i.id, &i.version).display().to_string(),
            existing: false,
        })
        .collect();
    components.extend(request.existing.iter().map(|e| SavedComponent {
        id: e.id.clone(),
        version: None,
        path: e.path.clone(),
        existing: true,
    }));
    SavedSettings {
        schema: 1,
        install_root: l.root.display().to_string(),
        www_dir: l.www.display().to_string(),
        php_fastcgi_port: configure::PHP_FASTCGI_PORT,
        components,
        apache_port: l.apache.as_ref().map(|_| l.apache_port),
        nginx_port: l.nginx.as_ref().map(|_| l.nginx_port),
        mysql: request.mysql.as_ref().map(|m| SavedMysql {
            port: m.port,
            existing: m.existing,
            data_dir: m.data_dir.as_ref().map(|d| d.trim().to_string()),
            autostart: m.autostart && !m.existing,
            has_password: (!m.existing)
                .then(|| m.password.as_ref().is_some_and(|p| !p.expose().is_empty())),
        }),
    }
}

fn save_settings(l: &Layout, settings: &SavedSettings) -> Result<Option<String>, String> {
    // PHP-only installs still need a php.ini.
    l.write_php_ini()?;
    // Point `composer` at the PHP the user chose, not whichever php.exe is first on PATH.
    let composer_dir = l.root.join("bin").join("composer");
    if composer_dir.join("composer.phar").is_file() {
        let php = l.php.as_ref().map(|dir| dir.join("php.exe"));
        let ini = cli_ini(&l.etc);
        configure::write_file(&composer_dir.join("composer.bat"), &composer_shim(php.as_deref(), &ini))?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    configure::write_file(&l.etc.join("devmanager.json"), &json)?;
    Ok(Some(format!("Saved to {}", l.etc.join("devmanager.json").display())))
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

/// Downloads a file into `root\tmp\downloads`, checking its checksum; reuses a matching copy.
pub async fn download_verified(download: &Download, root: &Path, step: &str, emit: &impl Fn(Progress)) -> Result<PathBuf, String> {
    CANCEL.store(false, Ordering::SeqCst);
    let client = reqwest::Client::builder()
        .user_agent(concat!("NexDB/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| format!("Couldn't start the downloader: {err}"))?;
    let file_name = download.url.rsplit('/').next().unwrap_or("download.bin");
    let file = root.join("tmp").join("downloads").join(file_name);
    fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
    if !(file.is_file() && file_matches(&file, &download.checksum).unwrap_or(false)) {
        fetch(&client, download, &file, step, emit).await.map_err(|e| match e {
            StepError::Cancelled => "Cancelled.".to_string(),
            StepError::Failed(msg) => msg,
        })?;
    }
    Ok(file)
}

/// Downloads a verified zip into `root\tmp\downloads` and unpacks it into `target` (replacing it).
pub async fn install_archive(
    download: &Download,
    root: &Path,
    target: &Path,
    step: &str,
    emit: &impl Fn(Progress),
) -> Result<(), String> {
    let archive = download_verified(download, root, step, emit).await?;
    let file_name = archive.file_name().unwrap_or_default().to_string_lossy().to_string();
    emit(Progress { step: step.into(), status: StepStatus::Running, message: Some("Unpacking".into()), bytes_done: 0, bytes_total: None });
    let (archive_path, target_path) = (archive.clone(), target.to_path_buf());
    tauri::async_runtime::spawn_blocking(move || extract_into(&archive_path, &target_path))
        .await
        .map_err(|err| format!("Unpacking stopped unexpectedly: {err}"))?
        .map_err(|err| format!("Couldn't unpack {file_name}: {err}"))?;
    let _ = fs::remove_file(&archive);
    Ok(())
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
    // Signed installers are checked by their Authenticode signature after download instead.
    if download.checksum.algo != AUTHENTICODE && actual != download.checksum.value {
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

/// Checksum type for vendor installers verified by their code signature, not a hash.
const AUTHENTICODE: &str = "authenticode";

enum Hasher {
    Sha256(Sha256),
    Md5(Md5),
    Signed,
}

impl Hasher {
    fn new(algo: &str) -> Result<Self, String> {
        match algo {
            "sha256" => Ok(Hasher::Sha256(Sha256::new())),
            "md5" => Ok(Hasher::Md5(Md5::new())),
            AUTHENTICODE => Ok(Hasher::Signed),
            other => Err(format!("Unsupported checksum type: {other}")),
        }
    }

    fn update(&mut self, data: &[u8]) {
        match self {
            Hasher::Sha256(h) => h.update(data),
            Hasher::Md5(h) => h.update(data),
            Hasher::Signed => {}
        }
    }

    fn finish(self) -> String {
        let bytes: Vec<u8> = match self {
            Hasher::Sha256(h) => h.finalize().to_vec(),
            Hasher::Md5(h) => h.finalize().to_vec(),
            Hasher::Signed => Vec::new(),
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

/// The ini the command line uses: php-cli.ini when NexDB wrote one, else php.ini.
fn cli_ini(etc: &Path) -> PathBuf {
    let dir = etc.join("php");
    let cli = dir.join("php-cli.ini");
    if cli.is_file() { cli } else { dir.join("php.ini") }
}

/// `composer.bat` running Composer with the chosen PHP and DevManager's php.ini,
/// falling back to `php` on PATH when no PHP is configured.
/// A terminal opened for a project on another PHP version sets NEXDB_PHP_EXE and NEXDB_PHP_INI,
/// so Composer runs with that project's PHP too.
pub fn composer_shim(php: Option<&Path>, ini: &Path) -> String {
    let default = match php {
        Some(php) => format!("\"{}\" -c \"{}\" \"%~dp0composer.phar\" %*", php.display(), ini.display()),
        None => "php \"%~dp0composer.phar\" %*".into(),
    };
    format!(
        "@if defined NEXDB_PHP_EXE (\"%NEXDB_PHP_EXE%\" -c \"%NEXDB_PHP_INI%\" \"%~dp0composer.phar\" %*) else ({default})\r\n"
    )
}

/// Composer is a single `.phar`; add a `composer.bat` so `composer` works in a terminal.
pub fn install_composer(phar: &Path, target: &Path) -> io::Result<()> {
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
            existing: vec![],
            mysql: None,
        };
        let events = std::sync::Mutex::new(Vec::new());
        tauri::async_runtime::block_on(run(&catalog, &request, &test_options(), |p| events.lock().unwrap().push(p))).unwrap();
        let events = events.into_inner().unwrap();
        for e in events.iter().filter(|e| e.status != StepStatus::Running || e.bytes_done == 0) {
            println!("{:?} {:?} {:?}", e.step, e.status, e.message);
        }
        assert!(events.iter().any(|e| e.step == format!("get-{id}") && e.status == StepStatus::Done));
        (dir, events)
    }

    /// Tests never change Windows (no runtime installs, no trusted certificates).
    fn test_options() -> RunOptions {
        RunOptions {
            system_changes: false,
            ca_dir: std::env::temp_dir().join("devmanager-test-ca-unused"),
            config_dir: None,
        }
    }

    #[test]
    fn composer_shim_uses_the_chosen_php() {
        let shim = composer_shim(Some(Path::new(r"C:\P\php.exe")), Path::new(r"C:\D\etc\php\php.ini"));
        assert!(shim.ends_with("else (\"C:\\P\\php.exe\" -c \"C:\\D\\etc\\php\\php.ini\" \"%~dp0composer.phar\" %*)\r\n"), "{shim}");
        assert!(shim.starts_with("@if defined NEXDB_PHP_EXE (\"%NEXDB_PHP_EXE%\""), "{shim}");
        assert!(composer_shim(None, Path::new("x")).contains("else (php "));
    }

    #[test]
    fn existing_mysql_records_port_but_no_password_state() {
        let request: InstallRequest = serde_json::from_str(
            r#"{"install_root":"C:\\D","www_dir":"C:\\D\\www","items":[],
                "mysql":{"port":3306,"password":null,"data_dir":null,"autostart":true,"existing":true}}"#,
        )
        .unwrap();
        let layout = Layout::new(Path::new(r"C:\D"), &request);
        let saved = serde_json::to_value(saved_settings(&layout, &request)).unwrap();
        assert_eq!(saved["mysql"]["port"], 3306);
        assert_eq!(saved["mysql"]["existing"], true);
        assert!(saved["mysql"]["has_password"].is_null());
        assert_eq!(saved["mysql"]["autostart"], false);
    }

    #[test]
    fn secrets_never_show_in_debug_output() {
        let request: InstallRequest = serde_json::from_str(
            r#"{"install_root":"C:\\D","www_dir":"C:\\D\\www","items":[],
                "mysql":{"port":3306,"password":"hunter2","data_dir":"C:\\D\\data","autostart":true}}"#,
        )
        .unwrap();
        let debug = format!("{request:?}");
        assert!(!debug.contains("hunter2"));
        assert!(debug.contains("***"));
        assert_eq!(request.mysql.unwrap().password.unwrap().expose(), "hunter2");
    }

    /// Whole installer with Laragon's Apache and PHP as existing installs plus a real Composer
    /// download, into a temp folder: `cargo test real_end_to_end -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_end_to_end_with_existing_apache_and_php() {
        let dir = tempfile::tempdir().unwrap();
        let catalog = crate::catalog::bundled();
        let request = InstallRequest {
            install_root: dir.path().display().to_string(),
            www_dir: dir.path().join("www").display().to_string(),
            items: vec![InstallItem { id: "composer".into(), version: catalog.tools.composer.version.clone() }],
            existing: vec![
                ExistingItem { id: "apache".into(), path: r"C:\laragon\bin\apache\Apache24\bin\httpd.exe".into() },
                ExistingItem { id: "php".into(), path: r"C:\laragon\bin\php\php-8.4.5-Win32-vs17-x64\php.exe".into() },
            ],
            mysql: None,
        };
        let events = std::sync::Mutex::new(Vec::new());
        let result = tauri::async_runtime::block_on(run(&catalog, &request, &test_options(), |p| events.lock().unwrap().push(p)));
        let events = events.into_inner().unwrap();
        for e in events.iter().filter(|e| e.status != StepStatus::Running) {
            println!("{:<14} {:?} {:?}", e.step, e.status, e.message);
        }
        result.unwrap();
        let etc = dir.path().join("etc");
        assert!(etc.join("apache/httpd.conf").is_file());
        assert!(etc.join("php/php.ini").is_file());
        let saved = fs::read_to_string(etc.join("devmanager.json")).unwrap();
        println!("{saved}");
        assert!(saved.contains("\"apache_port\": 80"));
        let order: Vec<&str> = events.iter().filter(|e| e.status == StepStatus::Done).map(|e| e.step.as_str()).collect();
        assert_eq!(order, ["folders", "get-composer", "config-apache", "save"]);
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

        // The generated config must pass `nginx -t` with the real binary.
        let request = InstallRequest {
            install_root: dir.path().display().to_string(),
            www_dir: dir.path().join("www").display().to_string(),
            items: vec![InstallItem { id: "nginx".into(), version: version.clone() }],
            existing: vec![],
            mysql: None,
        };
        let layout = Layout::new(dir.path(), &request);
        let message = configure_nginx(&layout, &target).unwrap();
        println!("config-nginx: {message:?}");
    }

    /// Nothing from Laragon or any other install: downloads PHP, Apache and MySQL, installs them
    /// into a temp folder, starts all three on spare ports, serves a PHP page through Apache and
    /// logs in to MySQL with the chosen password, then stops everything.
    /// `cargo test real_standalone_stack -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_standalone_stack() {
        use crate::supervisor::{port_listening, State, Supervisor};
        use std::io::Read;
        use std::net::TcpStream;

        let dir = tempfile::tempdir().unwrap();
        let catalog = crate::catalog::bundled();
        let choices = crate::catalog::choices(&catalog, crate::catalog::today());
        let pick = |id: &str| {
            let c = choices.components.iter().find(|c| c.id == id).unwrap();
            InstallItem { id: id.into(), version: c.recommended.clone().unwrap() }
        };
        let items = vec![pick("php"), pick("apache"), pick("mysql")];
        for i in &items {
            println!("installing {} {}", i.id, i.version);
        }
        let request = InstallRequest {
            install_root: dir.path().display().to_string(),
            www_dir: dir.path().join("www").display().to_string(),
            items,
            existing: vec![],
            mysql: Some(MysqlRequest {
                port: 3397,
                password: Some(serde_json::from_str("\"test-pw\"").unwrap()),
                data_dir: Some(dir.path().join("data").display().to_string()),
                autostart: false,
                existing: false,
            }),
        };
        let events = std::sync::Mutex::new(Vec::new());
        let t = Instant::now();
        let result = tauri::async_runtime::block_on(run(&catalog, &request, &test_options(), |p| events.lock().unwrap().push(p)));
        for e in events.lock().unwrap().iter().filter(|e| e.status != StepStatus::Running) {
            println!("{:<14} {:?} {:?}", e.step, e.status, e.message);
        }
        result.unwrap();
        println!("installed in {:?}", t.elapsed());

        // The install must not point anywhere outside its own folder.
        let saved = fs::read_to_string(dir.path().join("etc/devmanager.json")).unwrap();
        assert!(!saved.to_lowercase().contains("laragon"), "{saved}");
        let root = dir.path();

        // Move to spare ports so the real stack on this PC is untouched, then regenerate configs.
        let mut settings = crate::settings::load(root).expect("settings saved");
        settings.apache_port = Some(8097);
        settings.php_fastcgi_port = 9197;
        refresh_configs(root, &settings).unwrap();
        fs::create_dir_all(&settings.www_dir).unwrap();
        fs::write(Path::new(&settings.www_dir).join("index.php"), "<?php echo 'standalone php ', PHP_VERSION;").unwrap();

        let sup = Supervisor::new(crate::supervisor::specs_for(root, &settings));
        assert_eq!(sup.ids().len(), 3, "php, apache and mysql");
        for id in ["php", "apache", "mysql"] {
            if let Err(e) = sup.start(id) {
                println!("--- {id} log ---\n{}", sup.log_tail(id).unwrap_or_default());
                panic!("{id} failed to start: {e}");
            }
        }
        assert!(sup.status().iter().all(|s| s.state == State::Running), "{:?}", sup.status().iter().map(|s| (&s.id, &s.state)).collect::<Vec<_>>());

        let mut stream = TcpStream::connect(("127.0.0.1", 8097)).unwrap();
        std::io::Write::write_all(&mut stream, b"GET /index.php HTTP/1.0\r\nHost: localhost\r\n\r\n").unwrap();
        let mut body = String::new();
        stream.read_to_string(&mut body).unwrap();
        println!("{}", body.lines().last().unwrap_or_default());
        assert!(body.contains("200 OK") && body.contains("standalone php "), "{body}");

        let mysql_dir = target_dir(root, "mysql", &request.items[2].version);
        let out = configure::run_quiet(
            &mysql_dir.join("bin").join("mysql.exe"),
            &["--protocol=TCP", "-h", "127.0.0.1", "-P", "3397", "-u", "root", "-ptest-pw", "-N", "-e", "SELECT VERSION()"],
            Duration::from_secs(30),
        )
        .unwrap();
        println!("mysql says: {}", out.text.trim());
        assert!(out.success && out.text.contains(&request.items[2].version[..3]), "{}", out.text);

        let t = Instant::now();
        sup.stop_all();
        println!("stopped all in {:?}", t.elapsed());
        assert!(!port_listening(8097) && !port_listening(9197) && !port_listening(3397));
    }

    /// The wizard's installer with Git selected, like a real setup:
    /// `cargo test real_wizard_git -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_wizard_git() {
        let catalog = crate::catalog::bundled();
        let version = catalog.tools.git.as_ref().unwrap().version.clone();
        let (dir, _) = real_install("git", &version);
        let git = dir.path().join("bin").join("git").join(format!("git-{version}")).join("cmd").join("git.exe");
        let out = std::process::Command::new(&git).arg("--version").output().unwrap();
        println!("{}", String::from_utf8_lossy(&out.stdout).trim());
        assert!(out.status.success());
        let settings = crate::settings::load(dir.path()).unwrap();
        assert!(settings.components.iter().any(|c| c.id == "git" && c.version.as_deref() == Some(version.as_str())));
        assert!(crate::versions::missing(&settings).is_empty(), "Git counts as installed");
    }
}
