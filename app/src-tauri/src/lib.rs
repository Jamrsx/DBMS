mod admin;
mod catalog;
mod configure;
mod db;
mod installer;
mod phpmyadmin;
mod projects;
mod scan;
mod settings;
mod supervisor;
mod terminal;
mod tray;

use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

use std::path::PathBuf;

/// Scans the system for existing runtimes, busy ports, the VC++ runtime and disk space.
/// Runs on a worker thread so the window stays responsive.
#[tauri::command]
async fn system_scan(install_root: String) -> Result<scan::ScanReport, String> {
    tauri::async_runtime::spawn_blocking(move || scan::run(&PathBuf::from(install_root)))
        .await
        .map_err(|err| format!("System scan failed: {err}"))
}

/// Whether a port is in use right now, and by which program.
#[tauri::command]
async fn port_status(port: u16, purpose: String) -> Result<scan::PortStatus, String> {
    tauri::async_runtime::spawn_blocking(move || scan::port_status(port, &purpose))
        .await
        .map_err(|err| format!("Port check failed: {err}"))
}

/// First free port at or after `start`.
#[tauri::command]
async fn suggest_port(start: u16) -> Result<Option<u16>, String> {
    tauri::async_runtime::spawn_blocking(move || scan::suggest_port(start))
        .await
        .map_err(|err| format!("Port check failed: {err}"))
}

/// Installable versions with labels and a recommended pick per component, as of today.
#[tauri::command]
fn component_choices() -> catalog::Choices {
    catalog::choices(&catalog::bundled(), catalog::today())
}

/// Downloads, verifies and unpacks the requested components, emitting
/// `install-progress` events. Returns the first error, if any.
#[tauri::command]
async fn run_install(app: tauri::AppHandle, request: installer::InstallRequest) -> Result<(), String> {
    let catalog = catalog::bundled();
    let config_dir = app.path().app_config_dir().ok();
    installer::run(&catalog, &request, &installer::RunOptions::for_app(config_dir), |progress| {
        let _ = app.emit("install-progress", progress);
    })
    .await
}

/// Asks a running install to stop at the next safe point.
#[tauri::command]
fn cancel_install() {
    installer::CANCEL.store(true, std::sync::atomic::Ordering::SeqCst);
}

/// The saved install and its services, once setup has finished.
#[derive(Default)]
struct Stack {
    current: Mutex<Option<Loaded>>,
}

struct Loaded {
    root: PathBuf,
    settings: settings::Settings,
    supervisor: Arc<supervisor::Supervisor>,
}

impl Stack {
    /// (Re)reads the saved install. Running services keep running under the old supervisor
    /// only until it is dropped, so this is called when nothing is running (startup, after setup).
    fn load(&self, app: &tauri::AppHandle) -> bool {
        let found = settings::locate(app.path().app_config_dir().ok().as_deref());
        let loaded = found.map(|(root, settings)| Loaded {
            supervisor: Arc::new(supervisor::Supervisor::new(supervisor::specs_for(&root, &settings))),
            root,
            settings,
        });
        let ok = loaded.is_some();
        *self.current.lock().unwrap() = loaded;
        ok
    }

    fn get(&self) -> Result<(PathBuf, settings::Settings, Arc<supervisor::Supervisor>), String> {
        let guard = self.current.lock().unwrap();
        let l = guard.as_ref().ok_or("Setup hasn't been completed yet.")?;
        Ok((l.root.clone(), l.settings.clone(), l.supervisor.clone()))
    }
}

#[derive(serde::Serialize)]
struct SetupInfo {
    installed: bool,
    install_root: Option<String>,
    www_dir: Option<String>,
}

/// Whether a finished install exists, so the app opens on the dashboard instead of setup.
#[tauri::command]
fn setup_info(app: tauri::AppHandle, stack: tauri::State<Stack>) -> SetupInfo {
    stack.load(&app);
    let guard = stack.current.lock().unwrap();
    SetupInfo {
        installed: guard.is_some(),
        install_root: guard.as_ref().map(|l| l.root.display().to_string()),
        www_dir: guard.as_ref().map(|l| l.settings.www_dir.clone()),
    }
}

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| format!("Stopped unexpectedly: {err}"))?
}

#[tauri::command]
async fn services(stack: tauri::State<'_, Stack>) -> Result<Vec<supervisor::ServiceStatus>, String> {
    let (_, _, sup) = stack.get()?;
    blocking(move || Ok(sup.status())).await
}

/// Starts one service, or every managed service when `id` is None. Configs are regenerated
/// from the saved settings first, so template fixes reach existing installs.
#[tauri::command]
async fn start_services(stack: tauri::State<'_, Stack>, id: Option<String>) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        installer::refresh_configs(&root, &settings)?;
        let ids = id.map(|i| vec![i]).unwrap_or_else(|| sup.ids());
        let mut errors = Vec::new();
        for id in ids {
            match sup.start(&id) {
                Ok(()) => {}
                // Watched-only services are skipped by Start All.
                Err(e) if e.contains("managed outside") => {}
                Err(e) => errors.push(e),
            }
        }
        if errors.is_empty() { Ok(()) } else { Err(errors.join("\n")) }
    })
    .await
}

/// Stops one service, or all of them when `id` is None.
#[tauri::command]
async fn stop_services(stack: tauri::State<'_, Stack>, id: Option<String>) -> Result<(), String> {
    let (_, _, sup) = stack.get()?;
    blocking(move || {
        match id {
            Some(id) => sup.stop(&id)?,
            None => sup.stop_all(),
        }
        Ok(())
    })
    .await
}

#[tauri::command]
async fn service_log(stack: tauri::State<'_, Stack>, id: String) -> Result<String, String> {
    let (_, _, sup) = stack.get()?;
    blocking(move || sup.log_tail(&id)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_window(app)))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            tray::setup(app.handle())?;
            // The Windows startup entry launches hidden in the tray; a normal launch shows the window.
            if !std::env::args().any(|a| a == tray::TRAY_ARG) {
                tray::show_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps NexDB and its services running in the tray.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .manage(Stack::default())
        .manage(terminal::Terminals::default())
        .manage(db::Db::default())
        .invoke_handler(tauri::generate_handler![
            system_scan,
            component_choices,
            port_status,
            suggest_port,
            run_install,
            cancel_install,
            setup_info,
            services,
            start_services,
            stop_services,
            service_log,
            clear_service_log,
            tray::autostart_get,
            tray::autostart_set,
            projects_list,
            project_create,
            projects_sync_hosts,
            project_open,
            terminal_open,
            terminal_write,
            terminal_resize,
            terminal_close,
            phpmyadmin_status,
            phpmyadmin_install,
            phpmyadmin_open,
            db_connect,
            db_databases,
            db_tables,
            db_columns,
            db_browse,
            db_query,
            db_create,
            db_drop
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        // Stop services cleanly when DevManager closes; the job objects cover crashes.
        if let tauri::RunEvent::Exit = event {
            handle.state::<terminal::Terminals>().close_all();
            if let Ok((_, _, sup)) = handle.state::<Stack>().get() {
                sup.stop_all();
            }
        }
    });
}

/// Tray menu "Start all" / "Stop all": the same work as the dashboard buttons, without a window.
pub(crate) fn tray_services(app: &tauri::AppHandle, start: bool) {
    let app = app.clone();
    std::thread::spawn(move || {
        let Ok((root, settings, sup)) = app.state::<Stack>().get() else { return };
        if start {
            if installer::refresh_configs(&root, &settings).is_ok() {
                for id in sup.ids() {
                    let _ = sup.start(&id);
                }
            }
        } else {
            sup.stop_all();
        }
        let _ = app.emit("services-changed", ());
    });
}

#[derive(serde::Serialize)]
struct ProjectsInfo {
    www_dir: String,
    web_server: bool,
    projects: Vec<projects::Project>,
    /// Project addresses that aren't in the Windows hosts file yet.
    missing_hosts: Vec<String>,
}

#[tauri::command]
async fn projects_list(stack: tauri::State<'_, Stack>) -> Result<ProjectsInfo, String> {
    let (_, settings, _) = stack.get()?;
    blocking(move || {
        let port = settings.apache_port.unwrap_or(80);
        let projects = projects::list(std::path::Path::new(&settings.www_dir), port);
        let wanted: Vec<String> = projects.iter().filter_map(|p| p.host.clone()).collect();
        let hosts = std::fs::read_to_string(projects::hosts_path()).unwrap_or_default();
        Ok(ProjectsInfo {
            www_dir: settings.www_dir.clone(),
            web_server: settings.apache_port.is_some(),
            missing_hosts: projects::missing_hosts(&wanted, &hosts),
            projects,
        })
    })
    .await
}

/// Rewrites the virtual hosts and restarts Apache when it is running so it picks them up.
fn apply_vhosts(root: &std::path::Path, settings: &settings::Settings, sup: &supervisor::Supervisor) -> Result<(), String> {
    let Some(port) = settings.apache_port else { return Ok(()) };
    projects::write_vhosts(&root.join("etc"), std::path::Path::new(&settings.www_dir), port)?;
    let running = sup.status().iter().any(|s| s.id == "apache" && s.state == supervisor::State::Running);
    if running {
        installer::refresh_configs(root, settings)?;
        sup.stop("apache")?;
        sup.start("apache")?;
    }
    Ok(())
}

#[tauri::command]
async fn project_create(stack: tauri::State<'_, Stack>, name: String, kind: String) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        projects::create(std::path::Path::new(&settings.www_dir), &name, &kind)?;
        apply_vhosts(&root, &settings, &sup)
    })
    .await
}

/// Adds every project address to the Windows hosts file (one administrator approval), then
/// refreshes Apache's virtual hosts.
#[tauri::command]
async fn projects_sync_hosts(stack: tauri::State<'_, Stack>) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        let port = settings.apache_port.unwrap_or(80);
        let hosts: Vec<String> = projects::list(std::path::Path::new(&settings.www_dir), port)
            .into_iter()
            .filter_map(|p| p.host)
            .collect();
        projects::sync_hosts_elevated(&hosts)?;
        apply_vhosts(&root, &settings, &sup)
    })
    .await
}

/// Opens a project's folder in Explorer, or one of its addresses in the browser. Only paths
/// inside the www folder and the project's own addresses are accepted.
#[tauri::command]
fn project_open(app: tauri::AppHandle, stack: tauri::State<Stack>, name: String, what: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let (_, settings, _) = stack.get()?;
    let port = settings.apache_port.unwrap_or(80);
    let project = projects::list(std::path::Path::new(&settings.www_dir), port)
        .into_iter()
        .find(|p| p.name == name)
        .ok_or("That project doesn't exist any more.")?;
    match what.as_str() {
        "folder" => app.opener().open_path(project.path, None::<&str>).map_err(|e| e.to_string()),
        "url" if !project.url.is_empty() => app.opener().open_url(project.url, None::<&str>).map_err(|e| e.to_string()),
        "local" => app.opener().open_url(project.local_url, None::<&str>).map_err(|e| e.to_string()),
        _ => Err("This project has no address.".into()),
    }
}

#[tauri::command]
fn terminal_open(
    app: tauri::AppHandle,
    stack: tauri::State<Stack>,
    terminals: tauri::State<terminal::Terminals>,
    cols: u16,
    rows: u16,
) -> Result<u32, String> {
    let (root, settings, _) = stack.get()?;
    terminals.open(&app, &root, &settings, cols, rows)
}

#[tauri::command]
fn terminal_write(terminals: tauri::State<terminal::Terminals>, id: u32, data: String) -> Result<(), String> {
    terminals.write(id, &data)
}

#[tauri::command]
fn terminal_resize(terminals: tauri::State<terminal::Terminals>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    terminals.resize(id, cols, rows)
}

#[tauri::command]
fn terminal_close(terminals: tauri::State<terminal::Terminals>, id: u32) {
    terminals.close(id);
}

fn mysql_port(stack: &Stack) -> Result<u16, String> {
    let (_, settings, _) = stack.get()?;
    settings.mysql.map(|m| m.port).ok_or_else(|| "MySQL isn't part of this install.".to_string())
}

/// Opens (or reopens) the connection as root. The password stays in memory only.
#[tauri::command]
async fn db_connect(stack: tauri::State<'_, Stack>, db: tauri::State<'_, db::Db>, password: Option<String>) -> Result<db::Connected, String> {
    let port = mysql_port(&stack)?;
    let db = db.inner().clone_handle();
    blocking(move || db.connect(port, password.as_deref())).await
}

#[tauri::command]
async fn db_databases(db: tauri::State<'_, db::Db>) -> Result<Vec<db::DatabaseInfo>, String> {
    let db = db.inner().clone_handle();
    blocking(move || db.databases()).await
}

#[tauri::command]
async fn db_tables(db: tauri::State<'_, db::Db>, name: String) -> Result<Vec<db::TableInfo>, String> {
    let db = db.inner().clone_handle();
    blocking(move || db.tables(&name)).await
}

#[tauri::command]
async fn db_columns(db: tauri::State<'_, db::Db>, name: String, table: String) -> Result<Vec<db::ColumnInfo>, String> {
    let db = db.inner().clone_handle();
    blocking(move || db.columns(&name, &table)).await
}

#[tauri::command]
async fn db_browse(db: tauri::State<'_, db::Db>, name: String, table: String, page: u64, page_size: u64) -> Result<db::TablePage, String> {
    let db = db.inner().clone_handle();
    blocking(move || db.browse(&name, &table, page, page_size)).await
}

#[tauri::command]
async fn db_query(db: tauri::State<'_, db::Db>, name: Option<String>, sql: String) -> Result<db::QueryOutput, String> {
    let db = db.inner().clone_handle();
    blocking(move || db.query(name.as_deref(), &sql)).await
}

#[tauri::command]
async fn db_create(db: tauri::State<'_, db::Db>, name: String) -> Result<(), String> {
    let db = db.inner().clone_handle();
    blocking(move || db.create_database(&name)).await
}

#[tauri::command]
async fn db_drop(db: tauri::State<'_, db::Db>, name: String) -> Result<(), String> {
    let db = db.inner().clone_handle();
    blocking(move || db.drop_database(&name)).await
}

#[tauri::command]
fn phpmyadmin_status(stack: tauri::State<Stack>) -> Result<phpmyadmin::Status, String> {
    let (root, settings, _) = stack.get()?;
    Ok(phpmyadmin::status(&root, settings.apache_port))
}

/// Downloads phpMyAdmin, sets it up for NexDB's MySQL and restarts Apache if it is running.
/// Progress arrives as `tool-progress` events.
#[tauri::command]
async fn phpmyadmin_install(app: tauri::AppHandle, stack: tauri::State<'_, Stack>) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    if settings.apache_port.is_none() {
        return Err("phpMyAdmin needs the Apache web server, which isn't part of this install.".into());
    }
    let catalog = catalog::bundled();
    let emit_app = app.clone();
    phpmyadmin::install(&catalog.tools.phpmyadmin.download, &root, settings.mysql.as_ref().map(|m| m.port), &move |p| {
        let _ = emit_app.emit("tool-progress", p);
    })
    .await?;
    blocking(move || {
        installer::refresh_configs(&root, &settings)?;
        let running = sup.status().iter().any(|s| s.id == "apache" && s.state == supervisor::State::Running);
        if running {
            sup.stop("apache")?;
            sup.start("apache")?;
        }
        Ok(())
    })
    .await
}

#[tauri::command]
fn phpmyadmin_open(app: tauri::AppHandle, stack: tauri::State<Stack>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let (root, settings, _) = stack.get()?;
    let status = phpmyadmin::status(&root, settings.apache_port);
    if !status.installed {
        return Err("phpMyAdmin isn't installed yet.".into());
    }
    app.opener().open_url(status.url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
async fn clear_service_log(stack: tauri::State<'_, Stack>, id: String) -> Result<(), String> {
    let (_, _, sup) = stack.get()?;
    blocking(move || sup.clear_log(&id)).await
}
