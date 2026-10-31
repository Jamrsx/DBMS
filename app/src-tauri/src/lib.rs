mod admin;
mod autobackup;
mod backup;
mod catalog;
mod configure;
mod db;
mod dbedit;
mod editors;
mod installer;
mod phpmyadmin;
mod phpfix;
mod phpver;
mod projectops;
mod projects;
mod recyclebin;
mod quickstart;
mod scan;
mod settings;
mod supervisor;
mod terminal;
mod tray;
mod versions;

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

    /// Changes the settings in memory without touching running services.
    fn update_settings(&self, change: impl FnOnce(&mut settings::Settings)) {
        if let Some(loaded) = self.current.lock().unwrap().as_mut() {
            change(&mut loaded.settings);
        }
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
    /// A NexDB folder whose settings file is missing, so setup can say it is repairing it.
    repair_root: Option<String>,
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
        repair_root: guard
            .is_none()
            .then(|| settings::broken_install(app.path().app_config_dir().ok().as_deref()))
            .flatten()
            .map(|p| p.display().to_string()),
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            tray::setup(app.handle())?;
            // "Start services when NexDB opens", from Settings.
            let handle = app.handle().clone();
            let stack = handle.state::<Stack>();
            if stack.load(&handle) && stack.get().is_ok_and(|(_, s, _)| s.preferences.start_services_on_launch) {
                tray_services(&handle, true);
            }
            // The Windows startup entry launches hidden in the tray; a normal launch shows the window.
            if !std::env::args().any(|a| a == tray::TRAY_ARG) {
                tray::show_window(app.handle());
            }
            autobackup::spawn(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // Closing the main window keeps NexDB and its services running in the tray.
                tauri::WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                // A closed terminal window takes its PowerShell sessions with it.
                tauri::WindowEvent::Destroyed => {
                    window.state::<terminal::Terminals>().close_owner(window.label());
                }
                _ => {}
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
            app_settings,
            save_ports,
            set_start_services_on_launch,
            https_status,
            set_https,
            https_trust,
            auto_backup_status,
            set_auto_backup,
            versions_overview,
            missing_components,
            backups_list,
            backup_create,
            backup_restore,
            backup_delete,
            backup_import_file,
            pick_sql_file,
            open_backups_folder,
            version_install,
            version_use,
            version_remove,
            tray::autostart_get,
            tray::autostart_set,
            projects_list,
            project_create,
            project_quickstart,
            project_fix_php,
            project_details,
            project_set_php,
            project_rename,
            project_delete,
            projects_deleted,
            project_restore,
            editors_list,
            project_open_in,
            projects_sync_hosts,
            project_open,
            terminal_open,
            terminal_window,
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
            db_drop,
            db_primary_key,
            db_update_cell,
            db_insert_row,
            db_delete_row,
            db_users,
            db_create_user,
            db_set_user_password,
            db_grant,
            db_revoke,
            db_drop_user,
            db_export_table_csv,
            db_save_csv
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
        let mut projects = projects::list(std::path::Path::new(&settings.www_dir), port);
        for p in projects.iter_mut().filter(|p| p.kind == "laravel" || p.kind == "php") {
            p.php_warnings = phpfix::scan(std::path::Path::new(&p.path)).len();
        }
        if settings.preferences.https {
            projects::use_https(&mut projects, settings.preferences.https_port);
        }
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
    if settings.apache_port.is_none() {
        return Ok(());
    }
    projects::write_site_configs(root, settings)?;
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

/// Saves a settings change that alters which services exist (PHP per project), then rebuilds
/// the services and starts again what was running, plus any new PHP service when Apache runs.
async fn apply_service_change(
    app: &tauri::AppHandle,
    stack: &Stack,
    change: impl FnOnce(&mut serde_json::Value) -> Result<(), String> + Send + 'static,
) -> Result<(), String> {
    let (root, _, sup) = stack.get()?;
    let was_running: Vec<String> = sup
        .status()
        .into_iter()
        .filter(|s| s.state == supervisor::State::Running && s.managed)
        .map(|s| s.id)
        .collect();
    let root2 = root.clone();
    blocking(move || {
        sup.stop_all();
        settings::edit(&root2, change)
    })
    .await?;
    stack.load(app);
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        installer::refresh_configs(&root, &settings)?;
        let mut ids = was_running;
        if ids.iter().any(|i| i == "apache") {
            for s in sup.status() {
                if s.id.starts_with("php-") && !ids.contains(&s.id) {
                    ids.push(s.id);
                }
            }
        }
        // PHP before Apache, so the first page already works.
        ids.sort_by_key(|i| i == "apache");
        let errors: Vec<String> = ids.iter().filter_map(|id| sup.start(id).err()).collect();
        if errors.is_empty() { Ok(()) } else { Err(format!("Saved, but some services didn't start again: {}", errors.join(" "))) }
    })
    .await
}

#[tauri::command]
async fn project_details(stack: tauri::State<'_, Stack>, name: String) -> Result<projectops::Details, String> {
    let (root, settings, _) = stack.get()?;
    blocking(move || projectops::details(&root, &settings, &name)).await
}

/// Picks the PHP version a project runs on; None goes back to NexDB's default.
#[tauri::command]
async fn project_set_php(
    app: tauri::AppHandle,
    stack: tauri::State<'_, Stack>,
    name: String,
    version: Option<String>,
) -> Result<(), String> {
    let (root, settings, _) = stack.get()?;
    if projects::host_label(&name).is_none() {
        return Err("That project doesn't exist any more.".into());
    }
    let version = version.filter(|v| Some(v) != phpver::default_version(&settings).as_ref());
    if let Some(v) = &version {
        if !phpver::installed(&root, &settings).contains_key(v) {
            return Err(format!("PHP {v} isn't installed. Install it on the Versions page first."));
        }
    }
    apply_service_change(&app, &stack, move |v| {
        let map = v["preferences"]["project_php"].as_object_mut().map(std::mem::take).unwrap_or_default();
        let mut map = map;
        match version {
            Some(ver) => {
                map.insert(name, ver.into());
            }
            None => {
                map.remove(&name);
            }
        }
        v["preferences"]["project_php"] = map.into();
        Ok(())
    })
    .await
}

/// Moves a project's own settings (its PHP version) from one name to another, or drops them.
async fn move_project_settings(app: &tauri::AppHandle, stack: &Stack, old: String, new: Option<String>) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    if settings.preferences.project_php.contains_key(&old) {
        return apply_service_change(app, stack, move |v| {
            if let Some(map) = v["preferences"]["project_php"].as_object_mut() {
                if let Some(ver) = map.remove(&old) {
                    if let Some(new) = new {
                        map.insert(new, ver);
                    }
                }
            }
            Ok(())
        })
        .await;
    }
    blocking(move || apply_vhosts(&root, &settings, &sup)).await
}

#[tauri::command]
async fn project_rename(app: tauri::AppHandle, stack: tauri::State<'_, Stack>, name: String, new_name: String) -> Result<(), String> {
    let (_, settings, _) = stack.get()?;
    let (old, new) = (name.clone(), new_name.trim().to_string());
    let new2 = new.clone();
    blocking(move || projectops::rename(std::path::Path::new(&settings.www_dir), &old, &new2)).await?;
    move_project_settings(&app, &stack, name, Some(new)).await
}

/// Moves a project to the Recycle Bin; with `drop_database`, also deletes its database and user.
/// Once the folder is in the bin the project counts as deleted: its settings are always cleaned
/// up, and a database that couldn't be deleted comes back as a warning, not an error.
#[tauri::command]
async fn project_delete(
    app: tauri::AppHandle,
    stack: tauri::State<'_, Stack>,
    db: tauri::State<'_, db::Db>,
    name: String,
    drop_database: bool,
) -> Result<Option<String>, String> {
    let (_, settings, _) = stack.get()?;
    let password = db.inner().clone_handle().password();
    let port = settings.mysql.as_ref().map(|m| m.port);
    let n = name.clone();
    let warning = blocking(move || {
        let www = std::path::Path::new(&settings.www_dir);
        let dir = www.join(&n);
        // Already gone (deleted outside NexDB, or an earlier try got this far): just tidy up.
        if !dir.exists() {
            return Ok(None);
        }
        let database = projectops::database_of(&dir);
        projectops::recycle(www, &n)?;
        Ok(match (drop_database, database, port) {
            (true, Some(database), Some(port)) => projectops::drop_database(port, password.as_deref(), &database)
                .err()
                .map(|e| format!("Its database {database} wasn't deleted: {e}")),
            _ => None,
        })
    })
    .await?;
    move_project_settings(&app, &stack, name, None).await?;
    Ok(warning)
}

/// Projects in the Windows Recycle Bin that came from the projects folder.
#[tauri::command]
async fn projects_deleted(stack: tauri::State<'_, Stack>) -> Result<Vec<recyclebin::Deleted>, String> {
    let (_, settings, _) = stack.get()?;
    blocking(move || recyclebin::list(std::path::Path::new(&settings.www_dir))).await
}

/// Brings a deleted project back from the Recycle Bin (by its place in the bin).
#[tauri::command]
async fn project_restore(stack: tauri::State<'_, Stack>, path: String) -> Result<String, String> {
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        let www = std::path::Path::new(&settings.www_dir);
        // Only items the bin lists as deleted from the projects folder.
        let item = recyclebin::list(www)?
            .into_iter()
            .find(|d| d.path == path)
            .ok_or("That project isn't in the Recycle Bin any more.")?;
        recyclebin::restore(www, &item)?;
        apply_vhosts(&root, &settings, &sup)?;
        Ok(item.name)
    })
    .await
}

/// Code editors found on this PC.
#[tauri::command]
fn editors_list() -> Vec<editors::Editor> {
    editors::installed()
}

/// Opens a project folder in one of the installed editors.
#[tauri::command]
fn project_open_in(stack: tauri::State<Stack>, name: String, editor: String) -> Result<(), String> {
    let (_, settings, _) = stack.get()?;
    let dir = std::path::Path::new(&settings.www_dir).join(&name);
    if projects::host_label(&name).is_none() || !dir.is_dir() {
        return Err("That project doesn't exist any more.".into());
    }
    editors::open(&editor, &dir)
}

/// Updates code newer PHP warns about (see `phpfix`) in one project. Returns how many uses changed.
#[tauri::command]
async fn project_fix_php(stack: tauri::State<'_, Stack>, name: String) -> Result<usize, String> {
    let (_, settings, _) = stack.get()?;
    blocking(move || {
        let www = std::path::Path::new(&settings.www_dir);
        let dir = www.join(&name);
        if projects::host_label(&name).is_none() || !dir.is_dir() {
            return Err("That project doesn't exist any more.".into());
        }
        phpfix::fix(&dir)
    })
    .await
}

/// Makes a ready-to-run project from a starter (Laravel, WordPress, Vite, Next.js). Progress
/// arrives as `quickstart` events; the new site gets its virtual host when it's done.
#[tauri::command]
async fn project_quickstart(
    app: tauri::AppHandle,
    stack: tauri::State<'_, Stack>,
    db: tauri::State<'_, db::Db>,
    name: String,
    kind: String,
    options: Option<quickstart::Options>,
) -> Result<quickstart::Created, String> {
    let options = options.unwrap_or_default();
    let starter = quickstart::Starter::parse(&kind).ok_or("That kind of project isn't available.")?;
    let (root, settings, sup) = stack.get()?;
    let password = db.inner().clone_handle().password();
    blocking(move || {
        let emit = |e: quickstart::Event| {
            let _ = app.emit("quickstart", e);
        };
        let created = quickstart::create(&emit, &root, &settings, &sup, password, &name, starter, &options)?;
        apply_vhosts(&root, &settings, &sup)?;
        Ok(created)
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
    let mut found = projects::list(std::path::Path::new(&settings.www_dir), port);
    if settings.preferences.https {
        projects::use_https(&mut found, settings.preferences.https_port);
    }
    let project = found.into_iter().find(|p| p.name == name).ok_or("That project doesn't exist any more.")?;
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
    window: tauri::Window,
    stack: tauri::State<Stack>,
    terminals: tauri::State<terminal::Terminals>,
    cols: u16,
    rows: u16,
    project: Option<String>,
) -> Result<u32, String> {
    let (root, settings, _) = stack.get()?;
    // Only a project folder inside the projects folder.
    let project = project.filter(|p| projects::host_label(p).is_some());
    let cwd = project.as_ref().map(|p| std::path::Path::new(&settings.www_dir).join(p));
    let php = project.as_deref().and_then(|p| phpver::for_project(&root, &settings, p));
    terminals.open(&app, window.label(), &root, &settings, cwd.as_deref(), php.as_ref(), cols, rows)
}

/// Opens the terminal in a window of its own, which can be moved and resized freely.
/// Async on purpose: building a window inside a synchronous command deadlocks on Windows
/// (WebView2), which left the new window frozen.
#[tauri::command]
async fn terminal_window(app: tauri::AppHandle, project: Option<String>) -> Result<(), String> {
    static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
    let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let project = project.filter(|p| projects::host_label(p).is_some());
    let url = match &project {
        Some(p) => format!("index.html?view=terminal&project={p}"),
        None => "index.html?view=terminal".into(),
    };
    let title = project.map(|p| format!("{p} · NexDB Terminal")).unwrap_or_else(|| "NexDB Terminal".into());
    tauri::WebviewWindowBuilder::new(&app, format!("terminal-{n}"), tauri::WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(960.0, 600.0)
        .min_inner_size(520.0, 320.0)
        .resizable(true)
        .center()
        .build()
        .map(|_| ())
        .map_err(|e| format!("Couldn't open a terminal window: {e}"))
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
async fn db_primary_key(db: tauri::State<'_, db::Db>, name: String, table: String) -> Result<Vec<String>, String> {
    let db = db.inner().clone_handle();
    blocking(move || db.primary_key(&name, &table)).await
}

#[tauri::command]
async fn db_update_cell(
    db: tauri::State<'_, db::Db>,
    name: String,
    table: String,
    key: dbedit::Key,
    column: String,
    value: dbedit::Cell,
) -> Result<(), String> {
    let db = db.inner().clone_handle();
    blocking(move || db.update_cell(&name, &table, &key, &column, &value)).await
}

#[tauri::command]
async fn db_insert_row(db: tauri::State<'_, db::Db>, name: String, table: String, values: Vec<(String, dbedit::Cell)>) -> Result<(), String> {
    let db = db.inner().clone_handle();
    blocking(move || db.insert_row(&name, &table, &values)).await
}

#[tauri::command]
async fn db_delete_row(db: tauri::State<'_, db::Db>, name: String, table: String, key: dbedit::Key) -> Result<(), String> {
    let db = db.inner().clone_handle();
    blocking(move || db.delete_row(&name, &table, &key)).await
}

#[tauri::command]
async fn db_users(db: tauri::State<'_, db::Db>) -> Result<Vec<dbedit::User>, String> {
    let db = db.inner().clone_handle();
    blocking(move || db.users()).await
}

#[tauri::command]
async fn db_create_user(db: tauri::State<'_, db::Db>, user: String, password: String, database: Option<String>) -> Result<(), String> {
    let db = db.inner().clone_handle();
    blocking(move || db.create_user(&user, &password, database.as_deref().filter(|d| !d.is_empty()))).await
}

#[tauri::command]
async fn db_set_user_password(db: tauri::State<'_, db::Db>, user: String, password: String) -> Result<(), String> {
    let db = db.inner().clone_handle();
    blocking(move || db.set_user_password(&user, &password)).await
}

#[tauri::command]
async fn db_grant(db: tauri::State<'_, db::Db>, user: String, database: String) -> Result<(), String> {
    let db = db.inner().clone_handle();
    blocking(move || db.grant(&user, &database)).await
}

#[tauri::command]
async fn db_revoke(db: tauri::State<'_, db::Db>, user: String, database: String) -> Result<(), String> {
    let db = db.inner().clone_handle();
    blocking(move || db.revoke(&user, &database)).await
}

#[tauri::command]
async fn db_drop_user(db: tauri::State<'_, db::Db>, user: String) -> Result<(), String> {
    let db = db.inner().clone_handle();
    blocking(move || db.drop_user(&user)).await
}

/// Asks where to save a .csv file; None when cancelled.
async fn pick_csv_target(app: &tauri::AppHandle, suggested: String) -> Result<Option<std::path::PathBuf>, String> {
    use tauri_plugin_dialog::DialogExt;
    let app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Save as CSV")
            .set_file_name(suggested)
            .add_filter("CSV files", &["csv"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(picked.and_then(|p| p.into_path().ok()))
}

/// Saves a whole table as CSV; resolves to how many rows, or None when cancelled.
#[tauri::command]
async fn db_export_table_csv(app: tauri::AppHandle, db: tauri::State<'_, db::Db>, name: String, table: String) -> Result<Option<usize>, String> {
    let Some(path) = pick_csv_target(&app, format!("{table}.csv")).await? else { return Ok(None) };
    let db = db.inner().clone_handle();
    blocking(move || db.export_table_csv(&name, &table, &path).map(Some)).await
}

/// Saves rows already on screen (a query result) as CSV.
#[tauri::command]
async fn db_save_csv(
    app: tauri::AppHandle,
    file_name: String,
    columns: Vec<String>,
    rows: Vec<Vec<serde_json::Value>>,
) -> Result<Option<usize>, String> {
    let Some(path) = pick_csv_target(&app, file_name).await? else { return Ok(None) };
    blocking(move || dbedit::write_csv(&path, &columns, &rows).map(Some)).await
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

#[derive(serde::Serialize)]
struct AppSettings {
    app_version: String,
    install_root: String,
    www_dir: String,
    apache_port: Option<u16>,
    php_port: u16,
    mysql_port: Option<u16>,
    start_services_on_launch: bool,
}

#[tauri::command]
fn app_settings(app: tauri::AppHandle, stack: tauri::State<Stack>) -> Result<AppSettings, String> {
    let (root, settings, _) = stack.get()?;
    Ok(AppSettings {
        app_version: app.package_info().version.to_string(),
        install_root: root.display().to_string(),
        www_dir: settings.www_dir.clone(),
        apache_port: settings.apache_port,
        php_port: settings.php_fastcgi_port,
        mysql_port: settings.mysql.as_ref().map(|m| m.port),
        start_services_on_launch: settings.preferences.start_services_on_launch,
    })
}

/// Changes the ports: stops the services, checks the new ports are free, saves, rebuilds
/// every config file and starts again whatever was running before.
#[tauri::command]
async fn save_ports(
    app: tauri::AppHandle,
    stack: tauri::State<'_, Stack>,
    apache: Option<u16>,
    php: u16,
    mysql: Option<u16>,
) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    let apache = settings.apache_port.and(apache);
    let mysql = settings.mysql.as_ref().and(mysql);
    settings::check_ports(apache, php, mysql)?;
    let was_running: Vec<String> = sup
        .status()
        .into_iter()
        .filter(|s| s.state == supervisor::State::Running && s.managed)
        .map(|s| s.id)
        .collect();
    let root2 = root.clone();
    blocking(move || {
        sup.stop_all();
        for (name, port) in [("Web server", apache), ("PHP", Some(php)), ("MySQL", mysql)] {
            let Some(port) = port else { continue };
            let status = scan::port_status(port, name);
            if status.in_use {
                let who = status.process.map(|o| format!(" by {o}")).unwrap_or_default();
                return Err(format!("{name} can't use port {port}: it's already in use{who}. Pick another port."));
            }
        }
        settings::edit(&root2, |v| {
            if let Some(p) = apache {
                v["apache_port"] = p.into();
            }
            v["php_fastcgi_port"] = php.into();
            if let Some(p) = mysql {
                v["mysql"]["port"] = p.into();
            }
            Ok(())
        })
    })
    .await?;
    stack.load(&app);
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        installer::refresh_configs(&root, &settings)?;
        let mut errors = Vec::new();
        for id in was_running {
            if let Err(e) = sup.start(&id) {
                errors.push(e);
            }
        }
        if errors.is_empty() { Ok(()) } else { Err(format!("Saved, but some services didn't start again: {}", errors.join(" "))) }
    })
    .await
}

#[tauri::command]
fn set_start_services_on_launch(stack: tauri::State<Stack>, on: bool) -> Result<(), String> {
    let (root, _, _) = stack.get()?;
    settings::edit(&root, |v| {
        v["preferences"]["start_services_on_launch"] = on.into();
        Ok(())
    })?;
    // Keep the running services; only the saved settings change.
    let mut guard = stack.current.lock().unwrap();
    if let Some(loaded) = guard.as_mut() {
        loaded.settings.preferences.start_services_on_launch = on;
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct HttpsInfo {
    enabled: bool,
    port: u16,
    /// Whether Windows trusts NexDB's certificate, so browsers show no warning.
    trusted: bool,
    /// HTTPS needs NexDB's Apache.
    web_server: bool,
}

#[tauri::command]
async fn https_status(stack: tauri::State<'_, Stack>) -> Result<HttpsInfo, String> {
    let (_, settings, _) = stack.get()?;
    blocking(move || {
        let ca = admin::ensure_ca(&admin::ca_dir())?;
        Ok(HttpsInfo {
            enabled: settings.preferences.https,
            port: settings.preferences.https_port,
            trusted: admin::is_trusted(&ca.thumbprint),
            web_server: settings.apache_port.is_some(),
        })
    })
    .await
}

/// Turns HTTPS for localhost and the `.test` sites on or off, restarting Apache when it runs.
/// If Apache can't start with HTTPS, it is turned off again and Apache restarts without it.
#[tauri::command]
async fn set_https(stack: tauri::State<'_, Stack>, on: bool) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    if settings.apache_port.is_none() {
        return Err("HTTPS needs NexDB's Apache web server. Install Apache on the Versions page first.".into());
    }
    let port = settings.preferences.https_port;
    let was_on = settings.preferences.https;
    let apache_running = sup.status().iter().any(|s| s.id == "apache" && s.state == supervisor::State::Running);
    let save = |root: &std::path::Path, on: bool| {
        settings::edit(root, |v| {
            v["preferences"]["https"] = on.into();
            Ok(())
        })
    };
    let remember = |on: bool| {
        if let Some(loaded) = stack.current.lock().unwrap().as_mut() {
            loaded.settings.preferences.https = on;
        }
    };

    let root2 = root.clone();
    blocking(move || {
        if on && !was_on {
            let status = scan::port_status(port, "Web server (HTTPS)");
            if status.in_use {
                let who = status.process.map(|o| format!(" by {o}")).unwrap_or_default();
                return Err(format!(
                    "HTTPS can't use port {port}: it's already in use{who}. Close that program, then try again."
                ));
            }
        }
        save(&root2, on)
    })
    .await?;
    remember(on);

    let (root, settings, sup) = stack.get()?;
    let result = blocking({
        let root = root.clone();
        move || {
            installer::refresh_configs(&root, &settings)?;
            if apache_running {
                sup.stop("apache")?;
                sup.start("apache")?;
            }
            Ok(())
        }
    })
    .await;
    if let Err(err) = result {
        if on {
            save(&root, false)?;
            remember(false);
            let (root, settings, sup) = stack.get()?;
            let _ = blocking(move || {
                installer::refresh_configs(&root, &settings)?;
                if apache_running {
                    sup.start("apache")?;
                }
                Ok(())
            })
            .await;
            return Err(format!("HTTPS couldn't be turned on, so it was left off. {err}"));
        }
        return Err(err);
    }
    Ok(())
}

/// Asks Windows to trust NexDB's certificate (Windows shows its own confirmation).
#[tauri::command]
async fn https_trust() -> Result<bool, String> {
    blocking(|| {
        let ca = admin::ensure_ca(&admin::ca_dir())?;
        admin::trust_ca(&ca)?;
        Ok(admin::is_trusted(&ca.thumbprint))
    })
    .await
}

#[derive(serde::Serialize)]
struct AutoBackupInfo {
    schedule: String,
    keep: u32,
    #[serde(flatten)]
    status: autobackup::Status,
}

#[tauri::command]
fn auto_backup_status(stack: tauri::State<Stack>) -> Result<AutoBackupInfo, String> {
    let (root, settings, _) = stack.get()?;
    Ok(AutoBackupInfo {
        schedule: settings.preferences.auto_backup.clone(),
        keep: settings.preferences.auto_backup_keep,
        status: autobackup::load_status(&root),
    })
}

/// Saves the backup schedule; the background check picks it up within minutes.
#[tauri::command]
fn set_auto_backup(stack: tauri::State<Stack>, schedule: String, keep: u32) -> Result<(), String> {
    if autobackup::interval(&schedule).is_none() && schedule != "off" {
        return Err("Pick off, every day or every week.".into());
    }
    let keep = keep.clamp(1, 90);
    let (root, _, _) = stack.get()?;
    settings::edit(&root, |v| {
        v["preferences"]["auto_backup"] = schedule.clone().into();
        v["preferences"]["auto_backup_keep"] = keep.into();
        Ok(())
    })?;
    if let Some(loaded) = stack.current.lock().unwrap().as_mut() {
        loaded.settings.preferences.auto_backup = schedule;
        loaded.settings.preferences.auto_backup_keep = keep;
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct VersionsInfo {
    /// When the bundled list of versions was made.
    catalog_date: String,
    components: Vec<versions::ComponentVersions>,
}

#[tauri::command]
async fn versions_overview(stack: tauri::State<'_, Stack>) -> Result<VersionsInfo, String> {
    let (root, settings, _) = stack.get()?;
    blocking(move || {
        let choices = catalog::choices(&catalog::bundled(), catalog::today());
        let mut components = versions::overview(&root, &settings, &choices.components);
        components.extend(versions::tools(&root, &settings, &catalog::bundled()));
        Ok(VersionsInfo {
            components,
            catalog_date: choices.catalog_date,
        })
    })
    .await
}

/// Parts of the install whose files are gone, so the app can say what to reinstall.
#[tauri::command]
fn missing_components(stack: tauri::State<Stack>) -> Result<Vec<versions::Missing>, String> {
    let (_, settings, _) = stack.get()?;
    Ok(versions::missing(&settings))
}

/// Downloads a version (or reinstalls a missing one). Composer and Git become the ones in use
/// straight away. Returns a note for the user when something extra happened.
/// Progress arrives as `tool-progress`.
#[tauri::command]
async fn version_install(app: tauri::AppHandle, stack: tauri::State<'_, Stack>, id: String, version: String) -> Result<Option<String>, String> {
    let (root, _, sup) = stack.get()?;
    let catalog = catalog::bundled();
    let tool = match id.as_str() {
        "composer" => Some(&catalog.tools.composer),
        "git" => catalog.tools.git.as_ref(),
        _ => None,
    };
    if tool.is_none() && !versions::COMPONENTS.contains(&id.as_str()) {
        return Err("That can't be installed here.".into());
    }
    let download = match tool {
        Some(t) if t.version == version => t.download.clone(),
        Some(_) => return Err(format!("{} {version} isn't available; only the newest version can be installed.", versions::name_of(&id))),
        None => catalog
            .download_for(&id, &version)
            .ok_or_else(|| format!("There's no Windows download for {} {version} yet.", versions::name_of(&id)))?
            .clone(),
    };
    let target = installer::target_dir(&root, &id, &version);
    let emit_app = app.clone();
    let emit = move |p| {
        let _ = emit_app.emit("tool-progress", p);
    };
    if id == "composer" {
        let phar = installer::download_verified(&download, &root, "get-composer", &emit).await?;
        installer::install_composer(&phar, &target).map_err(|e| format!("Couldn't install Composer: {e}"))?;
        let _ = std::fs::remove_file(&phar);
    } else {
        installer::install_archive(&download, &root, &target, &format!("get-{id}"), &emit).await?;
    }
    std::fs::write(target.join(versions::MARKER), &download.url).map_err(|e| format!("Couldn't record the install: {e}"))?;

    // Tools are used as soon as they're installed; record them in the settings.
    if tool.is_some() {
        let dir = target.display().to_string();
        let (id2, version2) = (id.clone(), version.clone());
        settings::edit(&root, |v| {
            let list = v["components"].as_array_mut().ok_or("The settings file has no component list.")?;
            match list.iter_mut().find(|c| c["id"] == id2.as_str()) {
                Some(c) => {
                    c["path"] = dir.clone().into();
                    c["version"] = version2.clone().into();
                }
                None => list.push(serde_json::json!({ "id": id2, "version": version2, "path": dir, "existing": false })),
            }
            Ok(())
        })?;
        stack.update_settings(|s| {
            s.components.retain(|c| c.id != id);
            s.components.push(settings::Component { id: id.clone(), version: Some(version.clone()), path: target.display().to_string() });
        });
    }

    let (root, settings, _) = stack.get()?;
    blocking(move || {
        installer::refresh_configs(&root, &settings)?;
        // MySQL reinstalled after its data folder was deleted too: start over with an empty one.
        if id == "mysql" && versions::active_version(&settings, "mysql").as_deref() == Some(version.as_str()) {
            if let Some(data) = settings.mysql.as_ref().and_then(|m| m.data_dir.clone()) {
                let data = std::path::PathBuf::from(data);
                let empty = std::fs::read_dir(&data).map(|mut d| d.next().is_none()).unwrap_or(true);
                if empty && !sup.status().iter().any(|s| s.id == "mysql" && s.state == supervisor::State::Running) {
                    let ini = root.join("etc").join("mysql").join("my.ini");
                    let port = settings.mysql.as_ref().map(|m| m.port).unwrap_or(3306);
                    configure::setup_mysql(&target, &ini, &data, port, None)?;
                    return Ok(Some(
                        "MySQL's data folder was missing too, so NexDB created a fresh, empty one. The root user has no password now; you can set one in phpMyAdmin.".into(),
                    ));
                }
            }
        }
        Ok(None)
    })
    .await
}

/// Makes an installed version the one in use, restarting whatever was running.
#[tauri::command]
async fn version_use(app: tauri::AppHandle, stack: tauri::State<'_, Stack>, id: String, version: String) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    let choices = catalog::choices(&catalog::bundled(), catalog::today());
    let dir = versions::check_switch(&root, &settings, &id, &version, &choices.components)?;
    let was_running: Vec<String> = sup
        .status()
        .into_iter()
        .filter(|s| s.state == supervisor::State::Running && s.managed)
        .map(|s| s.id)
        .collect();
    let root2 = root.clone();
    blocking(move || {
        sup.stop_all();
        settings::edit(&root2, |v| {
            let list = v["components"].as_array_mut().ok_or("The settings file has no component list.")?;
            match list.iter_mut().find(|c| c["id"] == id.as_str()) {
                Some(c) => {
                    c["path"] = dir.display().to_string().into();
                    c["version"] = version.clone().into();
                    c["existing"] = false.into();
                }
                None => list.push(serde_json::json!({ "id": id, "version": version, "path": dir.display().to_string(), "existing": false })),
            }
            Ok(())
        })
    })
    .await?;
    stack.load(&app);
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        installer::refresh_configs(&root, &settings)?;
        let errors: Vec<String> = was_running.iter().filter_map(|id| sup.start(id).err()).collect();
        if errors.is_empty() { Ok(()) } else { Err(format!("Switched, but some services didn't start again: {}", errors.join(" "))) }
    })
    .await
}

#[tauri::command]
async fn version_remove(stack: tauri::State<'_, Stack>, id: String, version: String) -> Result<(), String> {
    let (root, settings, _) = stack.get()?;
    blocking(move || versions::remove(&root, &settings, &id, &version)).await
}

/// Folder holding mysql.exe and mysqldump.exe for the MySQL in use.
fn mysql_bin(settings: &settings::Settings) -> Result<std::path::PathBuf, String> {
    let c = settings.components.iter().find(|c| c.id == "mysql").ok_or("MySQL isn't part of this install.")?;
    let path = std::path::PathBuf::from(&c.path);
    let bin = if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) {
        path.parent().map(std::path::Path::to_path_buf).unwrap_or(path)
    } else {
        path.join("bin")
    };
    if !bin.join("mysqldump.exe").is_file() {
        return Err("MySQL's backup tool is missing. Reinstall MySQL on the Versions page.".into());
    }
    Ok(bin)
}

#[tauri::command]
fn backups_list(stack: tauri::State<Stack>) -> Result<Vec<backup::BackupFile>, String> {
    let (root, _, _) = stack.get()?;
    Ok(backup::list(&root))
}

/// Backs up one database, or every database of your own when `name` is empty.
#[tauri::command]
async fn backup_create(stack: tauri::State<'_, Stack>, db: tauri::State<'_, db::Db>, name: Option<String>) -> Result<Vec<backup::BackupFile>, String> {
    let (root, settings, _) = stack.get()?;
    let port = mysql_port(&stack)?;
    let db = db.inner().clone_handle();
    blocking(move || {
        let bin = mysql_bin(&settings)?;
        let password = db.password();
        let names: Vec<String> = match name.filter(|n| !n.is_empty()) {
            Some(n) => vec![n],
            None => db.databases()?.into_iter().filter(|d| !d.system).map(|d| d.name).collect(),
        };
        if names.is_empty() {
            return Err("There are no databases of your own to back up yet.".into());
        }
        names.iter().map(|n| backup::export(&bin, &root, port, password.as_deref(), n, false)).collect()
    })
    .await
}

/// Restores a backup into `database`, creating it first if it doesn't exist.
#[tauri::command]
async fn backup_restore(stack: tauri::State<'_, Stack>, db: tauri::State<'_, db::Db>, file: String, database: String) -> Result<(), String> {
    let (root, settings, _) = stack.get()?;
    let port = mysql_port(&stack)?;
    let db = db.inner().clone_handle();
    blocking(move || {
        let path = backup::backups_dir(&root).join(&file);
        if file.contains(['/', '\\']) || !path.is_file() {
            return Err("That backup file doesn't exist any more.".into());
        }
        restore_into(&settings, &root, port, &db, &path, &database)
    })
    .await
}

fn restore_into(settings: &settings::Settings, root: &std::path::Path, port: u16, db: &db::Db, file: &std::path::Path, database: &str) -> Result<(), String> {
    let bin = mysql_bin(settings)?;
    if !db.databases()?.iter().any(|d| d.name.eq_ignore_ascii_case(database)) {
        db.create_database(database)?;
    }
    backup::import(&bin, root, port, db.password().as_deref(), database, file)
}

/// Imports any `.sql` file the user picked into `database` (created if needed).
#[tauri::command]
async fn backup_import_file(stack: tauri::State<'_, Stack>, db: tauri::State<'_, db::Db>, path: String, database: String) -> Result<(), String> {
    let (root, settings, _) = stack.get()?;
    let port = mysql_port(&stack)?;
    let db = db.inner().clone_handle();
    blocking(move || restore_into(&settings, &root, port, &db, std::path::Path::new(&path), &database)).await
}

#[tauri::command]
fn backup_delete(stack: tauri::State<Stack>, file: String) -> Result<(), String> {
    let (root, _, _) = stack.get()?;
    backup::delete(&root, &file)
}

/// Lets the user choose a .sql file; None when they cancel.
#[tauri::command]
async fn pick_sql_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title("Choose a .sql file to import").add_filter("SQL files", &["sql"]).blocking_pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(picked.and_then(|p| p.into_path().ok()).map(|p| p.display().to_string()))
}

#[tauri::command]
fn open_backups_folder(app: tauri::AppHandle, stack: tauri::State<Stack>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let (root, _, _) = stack.get()?;
    let dir = backup::backups_dir(&root);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.display().to_string(), None::<&str>).map_err(|e| e.to_string())
}
