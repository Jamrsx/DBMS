mod admin;
mod autobackup;
mod backup;
mod catalog;
mod configure;
mod db;
mod dbconnect;
mod uninstall;
mod migrate;
mod envfile;
mod nodever;
mod gate;
mod extradb;
mod schema;
mod dbedit;
mod editors;
mod health;
mod importer;
mod installer;
mod laravel;
mod phpmyadmin;
mod phpfix;
mod phpini;
mod pg;
mod phpver;
mod postgres;
mod projectops;
mod projects;
mod recyclebin;
mod quickstart;
mod scan;
mod settings;
mod share;
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
    /// NexDB folders from before (another drive, a reinstall), which setup can pick up.
    found: Vec<migrate::Found>,
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
        found: if guard.is_none() { migrate::find(app.path().app_config_dir().ok().as_deref()) } else { Vec::new() },
    }
}

/// Uses a NexDB folder from before instead of setting up again; a moved folder's paths follow it.
#[tauri::command]
async fn setup_adopt(app: tauri::AppHandle, root: String) -> Result<usize, String> {
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let changed = blocking(move || migrate::adopt(std::path::Path::new(&root), &config)).await?;
    let stack = app.state::<Stack>();
    if !stack.load(&app) {
        return Err("NexDB couldn't read that folder's settings.".into());
    }
    Ok(changed)
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
    // The uninstaller asks first whether to keep the NexDB folder (projects, databases).
    if std::env::args().any(|a| a == "--uninstall") {
        #[cfg(windows)]
        {
            let config = std::env::var_os("APPDATA").map(|d| std::path::PathBuf::from(d).join("com.jamrsx.nexdb"));
            uninstall::run(config.as_deref());
        }
        return;
    }
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_window(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        // Opens at the size and place it had last time (not hidden or shown: the tray decides that).
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
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
        .manage(Arc::new(share::Tunnels::default()))
        .manage(Arc::new(laravel::Workers::default()))
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
            web_server_use,
            share_info,
            share_start,
            share_stop,
            share_allow_firewall,
            share_public_start,
            share_public_stop,
            share_dev_start,
            share_dev_stop,
            share_app_start,
            share_app_stop,
            db_use_engine,
            php_settings_info,
            php_settings_save,
            php_settings_apply,
            php_settings_open,
            health_check,
            health_fix_configs,
            health_reset_postgres,
            health_report,
            project_clone,
            db_targets,
            db_usage,
            db_use_in_project,
            setup_adopt,
            env_files,
            env_save,
            project_set_node,
            db_schema,
            db_compare,
            diagram_window,
            import_sources,
            import_databases,
            import_run,
            laravel_run,
            laravel_logs,
            laravel_workers,
            laravel_worker_start,
            laravel_worker_stop,
            project_set_site,
            project_setup,
            save_ports,
            set_start_services_on_launch,
            https_status,
            set_https,
            https_trust,
            auto_backup_status,
            set_auto_backup,
            set_auto_backup_copy,
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
            db_save_csv,
            db_export_sql
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

/// Starts one service from the tray menu, or stops it when it runs.
pub(crate) fn tray_service(app: &tauri::AppHandle, id: &str) {
    let (app, id) = (app.clone(), id.to_string());
    std::thread::spawn(move || {
        let Ok((root, settings, sup)) = app.state::<Stack>().get() else { return };
        let up = sup.status().iter().any(|s| s.id == id && matches!(s.state, supervisor::State::Running | supervisor::State::Starting));
        let result = if up { sup.stop(&id) } else { installer::refresh_configs(&root, &settings).and_then(|_| sup.start(&id)) };
        if let Err(e) = result {
            tray::notify(&app, "Couldn't change the service", &e);
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
        let port = settings.web().map_or(80, |w| w.1);
        let mut projects = projects::list_with(std::path::Path::new(&settings.www_dir), port, &settings.preferences.site_root);
        let prefs = &settings.preferences;
        for p in projects.iter_mut() {
            if p.kind == "laravel" || p.kind == "php" {
                p.php_warnings = phpfix::scan(std::path::Path::new(&p.path)).len();
            }
            p.needs_setup = !quickstart::setup_plan(std::path::Path::new(&p.path)).is_empty();
            p.shared = prefs.shared.contains_key(&p.name) || prefs.share_dev.contains_key(&p.name) || prefs.share_app.contains_key(&p.name);
            p.php = prefs.project_php.get(&p.name).cloned();
        }
        if settings.preferences.https {
            projects::use_https(&mut projects, settings.preferences.https_port);
        }
        let wanted: Vec<String> = projects.iter().filter_map(|p| p.host.clone()).collect();
        let hosts = std::fs::read_to_string(projects::hosts_path()).unwrap_or_default();
        Ok(ProjectsInfo {
            www_dir: settings.www_dir.clone(),
            web_server: settings.web().is_some(),
            missing_hosts: projects::missing_hosts(&wanted, &hosts),
            projects,
        })
    })
    .await
}

/// Rewrites the virtual hosts and restarts the web server when it is running so it picks them up.
fn apply_vhosts(root: &std::path::Path, settings: &settings::Settings, sup: &supervisor::Supervisor) -> Result<(), String> {
    let Some((web, _)) = settings.web() else { return Ok(()) };
    projects::write_site_configs(root, settings)?;
    let running = sup.status().iter().any(|s| s.id == web && s.state == supervisor::State::Running);
    if running {
        installer::refresh_configs(root, settings)?;
        sup.stop(web)?;
        sup.start(web)?;
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
        if ids.iter().any(|i| i == "apache" || i == "nginx") {
            for s in sup.status() {
                if s.id.starts_with("php-") && !ids.contains(&s.id) {
                    ids.push(s.id);
                }
            }
        }
        // PHP before the web server, so the first page already works.
        ids.sort_by_key(|i| i == "apache" || i == "nginx");
        let errors: Vec<String> = ids.iter().filter_map(|id| sup.start(id).err()).collect();
        if errors.is_empty() { Ok(()) } else { Err(format!("Saved, but some services didn't start again: {}", errors.join(" "))) }
    })
    .await
}

/// What the Share panel shows for one project.
#[derive(serde::Serialize)]
struct ShareInfo {
    /// The project's own port while it is shared on the local network.
    port: Option<u16>,
    lan_ip: Option<String>,
    lan_url: Option<String>,
    /// QR code of `lan_url`, as SVG.
    lan_qr: Option<String>,
    firewall_ready: bool,
    /// False on a network Windows calls public, where phones are kept out.
    network_private: Option<bool>,
    web_server: bool,
    web_running: bool,
    tunnel_installed: bool,
    /// The cloudflared version and download size the Share panel can install.
    tunnel_version: Option<String>,
    tunnel_size: Option<u64>,
    public_url: Option<String>,
    public_qr: Option<String>,
    /// The password its public link asks for, when it asks for one.
    public_password: Option<String>,
    /// The project's dev server, when it is passed through a share port.
    dev: Option<DevShareInfo>,
    /// Its front end and Laravel backend on one link, when shared that way.
    app: Option<AppShareInfo>,
    /// The front end and backend folders found in the project, for sharing them together.
    app_parts: Option<projects::AppParts>,
}

#[derive(serde::Serialize)]
struct AppShareInfo {
    port: u16,
    front: String,
    backend: String,
    dev: Option<u16>,
    url: Option<String>,
    qr: Option<String>,
    /// Whether the front end can be served: its dev server answers, or its built folder exists.
    front_ready: bool,
    public_url: Option<String>,
    public_qr: Option<String>,
    public_password: Option<String>,
}

#[derive(serde::Serialize)]
struct DevShareInfo {
    port: u16,
    target: u16,
    url: Option<String>,
    qr: Option<String>,
    /// Whether something answers on the dev server's port right now.
    running: bool,
    /// Its public link, when one runs.
    public_url: Option<String>,
    public_qr: Option<String>,
    public_password: Option<String>,
}

fn share_info_for(settings: &settings::Settings, sup: &supervisor::Supervisor, tunnels: &share::Tunnels, name: &str) -> ShareInfo {
    let project = std::path::Path::new(&settings.www_dir).join(name);
    let port = settings.preferences.shared.get(name).copied();
    let lan_ip = share::lan_ip();
    let lan_url = port.zip(lan_ip.as_ref()).map(|(p, ip)| format!("http://{ip}:{p}/"));
    let public_url = tunnels.url(&tunnel_key(name, ""));
    let web = settings.web().map(|w| w.0);
    let tool = catalog::bundled().tools.cloudflared;
    ShareInfo {
        port,
        lan_qr: lan_url.as_deref().and_then(|u| share::qr_svg(u).ok()),
        lan_url,
        lan_ip,
        firewall_ready: share::firewall_ready(),
        network_private: share::network_private(),
        web_server: web.is_some(),
        web_running: sup.status().iter().any(|s| Some(s.id.as_str()) == web && s.state == supervisor::State::Running),
        tunnel_installed: cloudflared_exe(settings).is_some(),
        tunnel_version: tool.as_ref().map(|t| t.version.clone()),
        tunnel_size: tool.as_ref().and_then(|t| t.download.size),
        public_qr: public_url.as_deref().and_then(|u| share::qr_svg(u).ok()),
        public_url,
        public_password: tunnels.password(&tunnel_key(name, "")),
        dev: settings.preferences.share_dev.get(name).map(|d| {
            let url = share::lan_ip().map(|ip| format!("http://{ip}:{}/", d.port));
            let public_url = tunnels.url(&tunnel_key(name, "dev"));
            DevShareInfo {
                public_password: tunnels.password(&tunnel_key(name, "dev")),
                public_qr: public_url.as_deref().and_then(|u| share::qr_svg(u).ok()),
                public_url,
                port: d.port,
                target: d.target,
                qr: url.as_deref().and_then(|u| share::qr_svg(u).ok()),
                url,
                running: share::dev_listening(d.target),
            }
        }),
        app: settings.preferences.share_app.get(name).map(|a| {
            let url = share::lan_ip().map(|ip| format!("http://{ip}:{}/", a.port));
            let public_url = tunnels.url(&tunnel_key(name, "app"));
            AppShareInfo {
                public_password: tunnels.password(&tunnel_key(name, "app")),
                public_qr: public_url.as_deref().and_then(|u| share::qr_svg(u).ok()),
                public_url,
                port: a.port,
                front: a.front.clone(),
                backend: a.backend.clone(),
                dev: a.dev,
                qr: url.as_deref().and_then(|u| share::qr_svg(u).ok()),
                url,
                front_ready: match a.dev {
                    Some(p) => share::dev_listening(p),
                    None => projects::built_folder(&project.join(&a.front)).is_some(),
                },
            }
        }),
        app_parts: projects::app_parts(&project),
    }
}

/// Every share port in use, by any project's site, dev server or whole app.
fn used_share_ports(settings: &settings::Settings) -> std::collections::BTreeMap<String, u16> {
    let p = &settings.preferences;
    let mut used = p.shared.clone();
    for (n, d) in &p.share_dev {
        used.insert(format!("{n} (dev)"), d.port);
    }
    for (n, a) in &p.share_app {
        used.insert(format!("{n} (app)"), a.port);
    }
    used
}

/// NexDB's cloudflared, once installed from the Versions page or the Share panel.
fn cloudflared_exe(settings: &settings::Settings) -> Option<PathBuf> {
    let c = settings.components.iter().find(|c| c.id == "cloudflared")?;
    let exe = PathBuf::from(&c.path).join("cloudflared.exe");
    exe.is_file().then_some(exe)
}

#[tauri::command]
async fn share_info(stack: tauri::State<'_, Stack>, tunnels: tauri::State<'_, Arc<share::Tunnels>>, name: String) -> Result<ShareInfo, String> {
    let (_, settings, sup) = stack.get()?;
    let tunnels = tunnels.inner().clone();
    blocking(move || Ok(share_info_for(&settings, &sup, &tunnels, &name))).await
}

/// Puts a project on its own port for phones on the same network, and rewrites the web
/// server's sites (restarting it when it runs).
#[tauri::command]
async fn share_start(stack: tauri::State<'_, Stack>, tunnels: tauri::State<'_, Arc<share::Tunnels>>, name: String) -> Result<ShareInfo, String> {
    let (root, settings, _) = stack.get()?;
    if settings.web().is_none() {
        return Err("Sharing needs a web server. Install Apache or nginx on the Versions page first.".into());
    }
    let www = std::path::Path::new(&settings.www_dir);
    if !projects::list(www, 80).iter().any(|p| p.name == name) {
        return Err("That project doesn't exist any more.".into());
    }
    if !settings.preferences.shared.contains_key(&name) {
        let port = share::free_port(&used_share_ports(&settings))
            .ok_or("Every share port (8181 to 8199) is in use. Stop sharing another project first.")?;
        let (root2, name2) = (root.clone(), name.clone());
        blocking(move || {
            settings::edit(&root2, |v| {
                v["preferences"]["shared"][name2.as_str()] = port.into();
                Ok(())
            })
        })
        .await?;
        stack.update_settings(|s| {
            s.preferences.shared.insert(name.clone(), port);
        });
    }
    let (root, settings, sup) = stack.get()?;
    let tunnels = tunnels.inner().clone();
    blocking(move || {
        apply_vhosts(&root, &settings, &sup)?;
        Ok(share_info_for(&settings, &sup, &tunnels, &name))
    })
    .await
}

/// Stops sharing a project, on the network and through its public link.
#[tauri::command]
async fn share_stop(stack: tauri::State<'_, Stack>, tunnels: tauri::State<'_, Arc<share::Tunnels>>, name: String) -> Result<ShareInfo, String> {
    tunnels.stop(&tunnel_key(&name, ""));
    let (root, _, _) = stack.get()?;
    let (root2, name2) = (root.clone(), name.clone());
    blocking(move || {
        settings::edit(&root2, |v| {
            if let Some(map) = v["preferences"]["shared"].as_object_mut() {
                map.remove(&name2);
            }
            Ok(())
        })
    })
    .await?;
    stack.update_settings(|s| {
        s.preferences.shared.remove(&name);
    });
    let (root, settings, sup) = stack.get()?;
    let tunnels = tunnels.inner().clone();
    blocking(move || {
        apply_vhosts(&root, &settings, &sup)?;
        Ok(share_info_for(&settings, &sup, &tunnels, &name))
    })
    .await
}

/// Chooses which folder of a project is its website (None: the project folder, or its public
/// folder), then rewrites the sites and restarts the web server if it runs.
#[tauri::command]
async fn project_set_site(stack: tauri::State<'_, Stack>, name: String, folder: Option<String>) -> Result<(), String> {
    let (root, settings, _) = stack.get()?;
    let project = std::path::Path::new(&settings.www_dir).join(&name);
    if !project.is_dir() {
        return Err("That project doesn't exist any more.".into());
    }
    let folder = folder.filter(|f| !f.trim().is_empty()).map(|f| projects::clean_site_folder(&project, &f)).transpose()?;
    let (root2, name2, folder2) = (root.clone(), name.clone(), folder.clone());
    blocking(move || {
        settings::edit(&root2, |v| {
            match &folder2 {
                Some(f) => v["preferences"]["site_root"][name2.as_str()] = f.clone().into(),
                None => {
                    if let Some(map) = v["preferences"]["site_root"].as_object_mut() {
                        map.remove(&name2);
                    }
                }
            }
            Ok(())
        })
    })
    .await?;
    stack.update_settings(|s| match folder {
        Some(f) => {
            s.preferences.site_root.insert(name.clone(), f);
        }
        None => {
            s.preferences.site_root.remove(&name);
        }
    });
    let (root, settings, sup) = stack.get()?;
    blocking(move || apply_vhosts(&root, &settings, &sup)).await
}

/// Passes a project's running dev server (Vite on 5173…) through its own share port, so a
/// phone on the same network can open it with live reload.
#[tauri::command]
async fn share_dev_start(
    stack: tauri::State<'_, Stack>,
    tunnels: tauri::State<'_, Arc<share::Tunnels>>,
    name: String,
    target: u16,
) -> Result<ShareInfo, String> {
    let (root, settings, _) = stack.get()?;
    if settings.web().is_none() {
        return Err("Sharing needs a web server. Install Apache or nginx on the Versions page first.".into());
    }
    if share::PORTS.contains(&target) || target < 1024 {
        return Err(format!("Port {target} can't be a dev server here. Vite usually uses 5173."));
    }
    let port = match settings.preferences.share_dev.get(&name) {
        Some(d) => d.port,
        None => share::free_port(&used_share_ports(&settings)).ok_or("Every share port (8181 to 8199) is in use. Stop sharing another project first.")?,
    };
    let dev = settings::DevShare { port, target };
    let (root2, name2) = (root.clone(), name.clone());
    blocking(move || {
        settings::edit(&root2, |v| {
            v["preferences"]["share_dev"][name2.as_str()] = serde_json::json!({ "port": dev.port, "target": dev.target });
            Ok(())
        })
    })
    .await?;
    stack.update_settings(|s| {
        s.preferences.share_dev.insert(name.clone(), dev);
    });
    let (root, settings, sup) = stack.get()?;
    let tunnels = tunnels.inner().clone();
    blocking(move || {
        apply_vhosts(&root, &settings, &sup)?;
        Ok(share_info_for(&settings, &sup, &tunnels, &name))
    })
    .await
}

#[tauri::command]
async fn share_dev_stop(stack: tauri::State<'_, Stack>, tunnels: tauri::State<'_, Arc<share::Tunnels>>, name: String) -> Result<ShareInfo, String> {
    tunnels.stop(&tunnel_key(&name, "dev"));
    let (root, _, _) = stack.get()?;
    let (root2, name2) = (root.clone(), name.clone());
    blocking(move || {
        settings::edit(&root2, |v| {
            if let Some(map) = v["preferences"]["share_dev"].as_object_mut() {
                map.remove(&name2);
            }
            Ok(())
        })
    })
    .await?;
    stack.update_settings(|s| {
        s.preferences.share_dev.remove(&name);
    });
    let (root, settings, sup) = stack.get()?;
    let tunnels = tunnels.inner().clone();
    blocking(move || {
        apply_vhosts(&root, &settings, &sup)?;
        Ok(share_info_for(&settings, &sup, &tunnels, &name))
    })
    .await
}

/// Lets phones reach the share ports on private networks (one Windows approval).
#[tauri::command]
async fn share_allow_firewall() -> Result<(), String> {
    blocking(share::allow_firewall).await
}

/// The tunnel key for a project's site (`what` empty), its dev server ("dev") or whole app ("app").
fn tunnel_key(name: &str, what: &str) -> String {
    if what.is_empty() { name.to_string() } else { format!("{name}#{what}") }
}

/// Shares a project's front end and Laravel backend on one port: `/api`, `/sanctum` and
/// `/storage` go to the backend, the rest to the front end's dev server (`dev`) or built folder.
#[tauri::command]
async fn share_app_start(
    stack: tauri::State<'_, Stack>,
    tunnels: tauri::State<'_, Arc<share::Tunnels>>,
    name: String,
    front: String,
    backend: String,
    dev: Option<u16>,
) -> Result<ShareInfo, String> {
    let (root, settings, _) = stack.get()?;
    if settings.web().is_none() {
        return Err("Sharing needs a web server. Install Apache or nginx on the Versions page first.".into());
    }
    let project = std::path::Path::new(&settings.www_dir).join(&name);
    if !project.is_dir() {
        return Err("That project doesn't exist any more.".into());
    }
    let pick = |f: &str| if f.trim().is_empty() { Ok(String::new()) } else { projects::clean_site_folder(&project, f) };
    let (front, backend) = (pick(&front)?, pick(&backend)?);
    if !project.join(&backend).join("artisan").is_file() {
        return Err(format!("{} isn't a Laravel app (it has no artisan file).", if backend.is_empty() { &name } else { &backend }));
    }
    if front == backend {
        return Err("Pick different folders for the front end and the backend.".into());
    }
    match dev {
        Some(p) if share::PORTS.contains(&p) || p < 1024 => {
            return Err(format!("Port {p} can't be a dev server here. Vite usually uses 5173."));
        }
        None if projects::built_folder(&project.join(&front)).is_none() => {
            return Err("The front end isn't built yet. Run npm run build in its folder, or use its dev server.".into());
        }
        _ => {}
    }
    let port = match settings.preferences.share_app.get(&name) {
        Some(a) => a.port,
        None => share::free_port(&used_share_ports(&settings))
            .ok_or("Every share port (8181 to 8199) is in use. Stop sharing another project first.")?,
    };
    let app = settings::AppShare { port, front, backend, dev };
    let (root2, name2, app2) = (root.clone(), name.clone(), app.clone());
    blocking(move || {
        settings::edit(&root2, |v| {
            v["preferences"]["share_app"][name2.as_str()] = serde_json::to_value(&app2).map_err(|e| e.to_string())?;
            Ok(())
        })
    })
    .await?;
    stack.update_settings(|s| {
        s.preferences.share_app.insert(name.clone(), app);
    });
    let (root, settings, sup) = stack.get()?;
    let tunnels = tunnels.inner().clone();
    blocking(move || {
        apply_vhosts(&root, &settings, &sup)?;
        Ok(share_info_for(&settings, &sup, &tunnels, &name))
    })
    .await
}

#[tauri::command]
async fn share_app_stop(stack: tauri::State<'_, Stack>, tunnels: tauri::State<'_, Arc<share::Tunnels>>, name: String) -> Result<ShareInfo, String> {
    tunnels.stop(&tunnel_key(&name, "app"));
    let (root, _, _) = stack.get()?;
    let (root2, name2) = (root.clone(), name.clone());
    blocking(move || {
        settings::edit(&root2, |v| {
            if let Some(map) = v["preferences"]["share_app"].as_object_mut() {
                map.remove(&name2);
            }
            Ok(())
        })
    })
    .await?;
    stack.update_settings(|s| {
        s.preferences.share_app.remove(&name);
    });
    let (root, settings, sup) = stack.get()?;
    let tunnels = tunnels.inner().clone();
    blocking(move || {
        apply_vhosts(&root, &settings, &sup)?;
        Ok(share_info_for(&settings, &sup, &tunnels, &name))
    })
    .await
}

/// Opens a temporary public link through Cloudflare, to the project's shared site, or with
/// `what` "dev" to its shared dev server, "app" to its whole app.
#[tauri::command]
async fn share_public_start(
    stack: tauri::State<'_, Stack>,
    tunnels: tauri::State<'_, Arc<share::Tunnels>>,
    name: String,
    what: Option<String>,
    password: Option<String>,
) -> Result<ShareInfo, String> {
    let (_, settings, sup) = stack.get()?;
    let what = what.unwrap_or_default();
    let password = password.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    let p = &settings.preferences;
    let port = match what.as_str() {
        "dev" => p.share_dev.get(&name).map(|d| d.port).ok_or("Share the dev server first.")?,
        "app" => p.share_app.get(&name).map(|a| a.port).ok_or("Share the whole app first.")?,
        _ => *p.shared.get(&name).ok_or("Share the project on your network first.")?,
    };
    let exe = cloudflared_exe(&settings).ok_or("Install public links first.")?;
    let tunnels = tunnels.inner().clone();
    blocking(move || {
        tunnels.start(&exe, &tunnel_key(&name, &what), port, password.as_deref())?;
        Ok(share_info_for(&settings, &sup, &tunnels, &name))
    })
    .await
}

#[tauri::command]
async fn share_public_stop(
    stack: tauri::State<'_, Stack>,
    tunnels: tauri::State<'_, Arc<share::Tunnels>>,
    name: String,
    what: Option<String>,
) -> Result<ShareInfo, String> {
    let (_, settings, sup) = stack.get()?;
    let tunnels = tunnels.inner().clone();
    blocking(move || {
        tunnels.stop(&tunnel_key(&name, &what.unwrap_or_default()));
        Ok(share_info_for(&settings, &sup, &tunnels, &name))
    })
    .await
}

#[tauri::command]
async fn project_details(stack: tauri::State<'_, Stack>, name: String) -> Result<projectops::Details, String> {
    let (root, settings, _) = stack.get()?;
    blocking(move || projectops::details(&root, &settings, &name)).await
}

/// Writes the project's .nvmrc, so its terminal and setup run on that Node version.
#[tauri::command]
async fn project_set_node(stack: tauri::State<'_, Stack>, name: String, version: String) -> Result<(), String> {
    let (_, settings, _) = stack.get()?;
    blocking(move || {
        let dir = projects::project_dir(std::path::Path::new(&settings.www_dir), &name).ok_or("That project doesn't exist any more.")?;
        nodever::set(&dir, &version)
    })
    .await
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
    // Any folder name counts (OCC-Admission has capitals, so no .test name, but it's a project).
    let folder = std::path::Path::new(&settings.www_dir).join(&name);
    if name.contains(['/', '\\']) || name.starts_with('.') || !folder.is_dir() {
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

/// The project's folder and its Laravel app's folder (the project itself, or Backend…).
fn laravel_dirs(settings: &settings::Settings, name: &str) -> Result<(PathBuf, PathBuf), String> {
    let project = std::path::Path::new(&settings.www_dir).join(name);
    if !project.is_dir() {
        return Err("That project doesn't exist any more.".into());
    }
    let folder = projects::laravel_folder(&project).ok_or("This project has no Laravel app.")?;
    Ok((project.clone(), project.join(folder)))
}

/// One of the Laravel buttons: "migrate", "seed", "storage_link" or "clear".
#[tauri::command]
async fn laravel_run(stack: tauri::State<'_, Stack>, name: String, action: String) -> Result<laravel::Outcome, String> {
    let (root, settings, _) = stack.get()?;
    blocking(move || {
        let (_, dir) = laravel_dirs(&settings, &name)?;
        laravel::run(&root, &settings, &name, &dir, &action)
    })
    .await
}

#[tauri::command]
async fn laravel_logs(stack: tauri::State<'_, Stack>, name: String) -> Result<laravel::LogView, String> {
    let (_, settings, _) = stack.get()?;
    blocking(move || {
        let (project, dir) = laravel_dirs(&settings, &name)?;
        Ok(laravel::logs(&project, &dir, 50))
    })
    .await
}

#[tauri::command]
async fn laravel_workers(
    stack: tauri::State<'_, Stack>,
    workers: tauri::State<'_, Arc<laravel::Workers>>,
    name: String,
) -> Result<Vec<laravel::WorkerInfo>, String> {
    let (root, _, _) = stack.get()?;
    let workers = workers.inner().clone();
    blocking(move || Ok(workers.info(&root, &name))).await
}

/// Starts the project's queue worker ("queue") or scheduler ("schedule") in the background.
#[tauri::command]
async fn laravel_worker_start(
    stack: tauri::State<'_, Stack>,
    workers: tauri::State<'_, Arc<laravel::Workers>>,
    name: String,
    kind: String,
) -> Result<Vec<laravel::WorkerInfo>, String> {
    let (root, settings, _) = stack.get()?;
    let workers = workers.inner().clone();
    blocking(move || {
        let (_, dir) = laravel_dirs(&settings, &name)?;
        workers.start(&root, &settings, &name, &dir, &kind)?;
        Ok(workers.info(&root, &name))
    })
    .await
}

#[tauri::command]
async fn laravel_worker_stop(
    stack: tauri::State<'_, Stack>,
    workers: tauri::State<'_, Arc<laravel::Workers>>,
    name: String,
    kind: String,
) -> Result<Vec<laravel::WorkerInfo>, String> {
    let (root, _, _) = stack.get()?;
    let workers = workers.inner().clone();
    blocking(move || {
        workers.stop(&format!("{name}#{kind}"));
        Ok(workers.info(&root, &name))
    })
    .await
}

/// Moves a project's own settings (its PHP version) from one name to another, or drops them.
async fn move_project_settings(app: &tauri::AppHandle, stack: &Stack, old: String, new: Option<String>) -> Result<(), String> {
    // Its queue worker and scheduler run in the old folder; they stop with a rename or delete.
    app.state::<Arc<laravel::Workers>>().stop_project(&old);
    let (root, settings, _) = stack.get()?;
    // Per-project settings follow a rename and go with a delete.
    let move_all = {
        let (old, new) = (old.clone(), new.clone());
        move |v: &mut serde_json::Value| {
            for key in ["project_php", "site_root", "shared", "share_dev", "share_app"] {
                if let Some(map) = v["preferences"][key].as_object_mut() {
                    if let Some(value) = map.remove(&old) {
                        if let Some(new) = &new {
                            map.insert(new.clone(), value);
                        }
                    }
                }
            }
            Ok(())
        }
    };
    if settings.preferences.project_php.contains_key(&old) {
        return apply_service_change(app, stack, move_all).await;
    }
    blocking(move || settings::edit(&root, move_all)).await?;
    // The same move in memory; reloading would end the running services.
    stack.update_settings(|s| {
        let p = &mut s.preferences;
        let site = p.site_root.remove(&old);
        let shared = p.shared.remove(&old);
        let dev = p.share_dev.remove(&old);
        let app = p.share_app.remove(&old);
        if let Some(new) = &new {
            app.map(|v| p.share_app.insert(new.clone(), v));
            site.map(|v| p.site_root.insert(new.clone(), v));
            shared.map(|v| p.shared.insert(new.clone(), v));
            dev.map(|v| p.share_dev.insert(new.clone(), v));
        }
    });
    let (root, settings, sup) = stack.get()?;
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
    let dir = projects::project_dir(std::path::Path::new(&settings.www_dir), &name).ok_or("That project doesn't exist any more.")?;
    editors::open(&editor, &dir)
}

/// Updates code newer PHP warns about (see `phpfix`) in one project. Returns how many uses changed.
#[tauri::command]
async fn project_fix_php(stack: tauri::State<'_, Stack>, name: String) -> Result<usize, String> {
    let (_, settings, _) = stack.get()?;
    blocking(move || {
        let www = std::path::Path::new(&settings.www_dir);
        let dir = projects::project_dir(www, &name).ok_or("That project doesn't exist any more.")?;
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

/// Gets an existing project (often a cloned one) ready: PHP and Node packages, its .env with a
/// database and app key. Progress arrives as `quickstart` events. Returns notes for the user.
#[tauri::command]
async fn project_setup(
    app: tauri::AppHandle,
    stack: tauri::State<'_, Stack>,
    db: tauri::State<'_, db::Db>,
    name: String,
) -> Result<Vec<String>, String> {
    let (root, settings, sup) = stack.get()?;
    let password = db.inner().clone_handle().password();
    blocking(move || {
        let emit = |e: quickstart::Event| {
            let _ = app.emit("quickstart", e);
        };
        quickstart::setup(&emit, &root, &settings, &sup, password, &name)
    })
    .await
}

/// Adds every project address to the Windows hosts file (one administrator approval), then
/// refreshes Apache's virtual hosts.
#[tauri::command]
async fn projects_sync_hosts(stack: tauri::State<'_, Stack>) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        let port = settings.web().map_or(80, |w| w.1);
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
fn project_open(app: tauri::AppHandle, name: String, what: String) -> Result<(), String> {
    open_project(&app, &name, &what)
}

/// Opens a project's site ("url" or "local") or its folder ("folder"); also used by the tray.
fn open_project(app: &tauri::AppHandle, name: &str, what: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let (_, settings, _) = app.state::<Stack>().get()?;
    let port = settings.web().map_or(80, |w| w.1);
    let mut found = projects::list_with(std::path::Path::new(&settings.www_dir), port, &settings.preferences.site_root);
    if settings.preferences.https {
        projects::use_https(&mut found, settings.preferences.https_port);
    }
    let project = found.into_iter().find(|p| p.name == name).ok_or("That project doesn't exist any more.")?;
    match what {
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
    let project = project.filter(|p| projects::project_dir(std::path::Path::new(&settings.www_dir), p).is_some());
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
    // Plain names only, so it can go in the window's address as it is.
    let project = project.filter(|p| !p.starts_with('.') && p.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c)));
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

/// A database's tables, columns, indexes and foreign keys, for the relationship diagram.
#[tauri::command]
async fn db_schema(db: tauri::State<'_, db::Db>, name: String) -> Result<schema::Schema, String> {
    let db = db.inner().clone_handle();
    blocking(move || schema::read(&db, &name)).await
}

/// What differs between two databases on the same server.
#[tauri::command]
async fn db_compare(db: tauri::State<'_, db::Db>, a: String, b: String) -> Result<Vec<schema::Diff>, String> {
    let db = db.inner().clone_handle();
    blocking(move || Ok(schema::compare(&schema::read(&db, &a)?, &schema::read(&db, &b)?))).await
}

/// Opens a database's relationship diagram in a window of its own.
#[tauri::command]
async fn diagram_window(app: tauri::AppHandle, name: String) -> Result<(), String> {
    if !db::valid_name(&name) {
        return Err(format!("\"{name}\" isn't a database name NexDB can show."));
    }
    // One window per database: opening it again brings the open one forward.
    let label = format!("diagram-{}", name.replace('$', "_"));
    if let Some(w) = tauri::Manager::get_webview_window(&app, &label) {
        let _ = w.set_focus();
        return Ok(());
    }
    let url = format!("index.html?view=diagram&db={name}");
    tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App(url.into()))
        .title(format!("{name} · relationships · NexDB"))
        .inner_size(1100.0, 720.0)
        .min_inner_size(600.0, 400.0)
        .resizable(true)
        .center()
        .build()
        .map(|_| ())
        .map_err(|e| format!("Couldn't open the diagram window: {e}"))
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
    Ok(phpmyadmin::status(&root, settings.web().map(|w| w.1)))
}

/// Downloads phpMyAdmin, sets it up for NexDB's MySQL and restarts Apache if it is running.
/// Progress arrives as `tool-progress` events.
#[tauri::command]
async fn phpmyadmin_install(app: tauri::AppHandle, stack: tauri::State<'_, Stack>) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    let Some((web, _)) = settings.web() else {
        return Err("phpMyAdmin needs a web server (Apache or nginx), which isn't part of this install.".into());
    };
    let catalog = catalog::bundled();
    let emit_app = app.clone();
    phpmyadmin::install(&catalog.tools.phpmyadmin.download, &root, settings.mysql.as_ref().map(|m| m.port), &move |p| {
        let _ = emit_app.emit("tool-progress", p);
    })
    .await?;
    blocking(move || {
        installer::refresh_configs(&root, &settings)?;
        let running = sup.status().iter().any(|s| s.id == web && s.state == supervisor::State::Running);
        if running {
            sup.stop(web)?;
            sup.start(web)?;
        }
        Ok(())
    })
    .await
}

#[tauri::command]
fn phpmyadmin_open(app: tauri::AppHandle, stack: tauri::State<Stack>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let (root, settings, _) = stack.get()?;
    let status = phpmyadmin::status(&root, settings.web().map(|w| w.1));
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
    /// "apache" or "nginx": the one serving localhost and the .test sites.
    web_server: Option<&'static str>,
    /// Web servers installed, so Settings can offer a switch.
    web_servers_installed: Vec<&'static str>,
}

#[tauri::command]
fn app_settings(app: tauri::AppHandle, stack: tauri::State<Stack>) -> Result<AppSettings, String> {
    let (root, settings, _) = stack.get()?;
    Ok(AppSettings {
        app_version: app.package_info().version.to_string(),
        install_root: root.display().to_string(),
        www_dir: settings.www_dir.clone(),
        apache_port: settings.web().map(|w| w.1),
        php_port: settings.php_fastcgi_port,
        mysql_port: settings.mysql.as_ref().map(|m| m.port),
        start_services_on_launch: settings.preferences.start_services_on_launch,
        web_server: settings.web().map(|w| w.0),
        web_servers_installed: ["apache", "nginx"]
            .into_iter()
            .filter(|id| settings.components.iter().any(|c| c.id == *id))
            .collect(),
    })
}

/// Makes Apache or nginx the web server for localhost and the .test sites. The other one is
/// switched off (it stays installed) and the chosen one takes over its port. If the web server
/// was running, the new one starts straight away.
#[tauri::command]
async fn web_server_use(app: tauri::AppHandle, stack: tauri::State<'_, Stack>, server: String) -> Result<(), String> {
    let (_, settings, sup) = stack.get()?;
    let (server, other): (&'static str, &'static str) = match server.as_str() {
        "apache" => ("apache", "nginx"),
        "nginx" => ("nginx", "apache"),
        _ => return Err("NexDB only knows Apache and nginx.".into()),
    };
    if !settings.components.iter().any(|c| c.id == server) {
        return Err(format!("{} isn't installed yet. Install it on the Versions page first.", versions::name_of(server)));
    }
    let current = settings.web();
    if current.is_some_and(|w| w.0 == server) {
        return Ok(());
    }
    let port = current.map_or(80, |w| w.1);
    let was_running = sup.status().iter().any(|s| (s.id == "apache" || s.id == "nginx") && s.state == supervisor::State::Running);
    // The old web server stops first, so it isn't restarted under a name that no longer exists.
    blocking(move || {
        for id in ["apache", "nginx"] {
            let _ = sup.stop(id);
        }
        Ok(())
    })
    .await?;
    apply_service_change(&app, &stack, move |v| {
        v[format!("{server}_port")] = port.into();
        v[format!("{other}_port")] = serde_json::Value::Null;
        Ok(())
    })
    .await?;
    if was_running {
        let (_, _, sup) = stack.get()?;
        blocking(move || {
            // PHP first (every version projects use), then the web server.
            for s in sup.status() {
                if s.id.starts_with("php") && s.state != supervisor::State::Running {
                    sup.start(&s.id)?;
                }
            }
            sup.start(server)
        })
        .await?;
    }
    Ok(())
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
    // The port field is for whichever web server serves the sites.
    let web_key = if settings.apache_port.is_some() { "apache_port" } else { "nginx_port" };
    let apache = settings.web().and(apache);
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
                v[web_key] = p.into();
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
            web_server: settings.web().is_some(),
        })
    })
    .await
}

/// Turns HTTPS for localhost and the `.test` sites on or off, restarting Apache when it runs.
/// If Apache can't start with HTTPS, it is turned off again and Apache restarts without it.
#[tauri::command]
async fn set_https(stack: tauri::State<'_, Stack>, on: bool) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    let Some((web, _)) = settings.web() else {
        return Err("HTTPS needs a web server. Install Apache or nginx on the Versions page first.".into());
    };
    let port = settings.preferences.https_port;
    let was_on = settings.preferences.https;
    let apache_running = sup.status().iter().any(|s| s.id == web && s.state == supervisor::State::Running);
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
                sup.stop(web)?;
                sup.start(web)?;
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
                    sup.start(web)?;
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
    /// The second folder backups are copied to, if any.
    copy_to: Option<String>,
    #[serde(flatten)]
    status: autobackup::Status,
}

#[tauri::command]
fn auto_backup_status(stack: tauri::State<Stack>) -> Result<AutoBackupInfo, String> {
    let (root, settings, _) = stack.get()?;
    Ok(AutoBackupInfo {
        schedule: settings.preferences.auto_backup.clone(),
        keep: settings.preferences.auto_backup_keep,
        copy_to: settings.preferences.auto_backup_copy.clone(),
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

/// Picks (or, with no folder, stops using) a second folder for automatic backups, and copies the
/// existing ones there straight away so you can see it works.
#[tauri::command]
async fn set_auto_backup_copy(app: tauri::AppHandle, stack: tauri::State<'_, Stack>, pick: bool) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (root, _, _) = stack.get()?;
    let folder = if pick {
        let Some(f) = app
            .dialog()
            .file()
            .set_title("Choose where to keep a copy of your backups (another drive or a USB stick)")
            .blocking_pick_folder()
        else {
            return Err("CANCELLED".into());
        };
        let path = f.into_path().map_err(|e| e.to_string())?;
        if path.starts_with(&root) {
            return Err("Pick a folder outside NexDB's own folder, ideally on another drive, so the copy survives if that drive fails.".into());
        }
        Some(path.display().to_string())
    } else {
        None
    };
    settings::edit(&root, |v| {
        v["preferences"]["auto_backup_copy"] = folder.clone().map_or(serde_json::Value::Null, Into::into);
        Ok(())
    })?;
    if let Some(loaded) = stack.current.lock().unwrap().as_mut() {
        loaded.settings.preferences.auto_backup_copy = folder.clone();
    }
    if let Some(dest) = folder.clone() {
        let keep = stack.get()?.1.preferences.auto_backup_keep as usize;
        let root2 = root.clone();
        blocking(move || {
            let mut status = autobackup::load_status(&root2);
            match autobackup::copy_backups(&root2, std::path::Path::new(&dest), keep) {
                Ok(_) => {
                    status.last_copied = Some(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0));
                    status.copy_problem = None;
                }
                Err(e) => status.copy_problem = Some(e),
            }
            autobackup::save_status_pub(&root2, &status);
            Ok(())
        })
        .await?;
    }
    Ok(folder)
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
    let tool = catalog.tools.get(&id);
    // Reinstalling a running helper: its files are in use, so stop it first.
    if versions::SERVICE_TOOLS.contains(&id.as_str()) {
        let _ = sup.stop(&id);
    }
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
    if id == "python" {
        // `pip` on PATH, running this Python's own pip.
        std::fs::write(target.join("pip.bat"), "@\"%~dp0python.exe\" -m pip %*\r\n").map_err(|e| format!("Couldn't add pip: {e}"))?;
    }
    if id == "postgres" {
        let data = root.join("data").join("postgres");
        if !data.join("PG_VERSION").is_file() {
            let bin = target.join("bin");
            blocking(move || postgres::init(&bin, &data)).await?;
        }
    }
    if id == "mariadb" {
        let (base, root2) = (target.clone(), root.clone());
        blocking(move || extradb::setup_mariadb(&base, &root2)).await?;
    }
    if id == "mongodb" {
        let root2 = root.clone();
        blocking(move || extradb::setup_mongodb(&root2)).await?;
    }
    // PostgreSQL, MariaDB, MongoDB, the mail catcher and Redis become Dashboard services:
    // rebuild the service list.
    if versions::SERVICE_TOOLS.contains(&id.as_str()) {
        apply_service_change(&app, &stack, |_| Ok(())).await?;
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

/// A PHP version's folder and the folder of the php.ini NexDB writes for it.
fn php_dirs(root: &std::path::Path, settings: &settings::Settings, version: Option<&str>) -> Result<(String, PathBuf, PathBuf), String> {
    let default = phpver::default_version(settings).ok_or("PHP isn't installed.")?;
    let version = version.map(String::from).unwrap_or(default.clone());
    let dir = phpver::installed(root, settings).remove(&version).ok_or(format!("PHP {version} isn't installed."))?;
    let ini_dir = if version == default { root.join("etc").join("php") } else { phpver::ini_dir(root, &version) };
    Ok((version, dir, ini_dir))
}

/// Writes every php.ini again and restarts the PHP services that run, so they use it.
fn restart_php(root: &std::path::Path, settings: &settings::Settings, sup: &supervisor::Supervisor) -> Result<(), String> {
    installer::refresh_configs(root, settings)?;
    for s in sup.status() {
        if s.id.starts_with("php") && s.state == supervisor::State::Running {
            sup.stop(&s.id)?;
            sup.start(&s.id)?;
        }
    }
    Ok(())
}

/// Checks a version's php.ini as it would be written now, before PHP uses it.
fn test_php_settings(root: &std::path::Path, version: &str, dir: &std::path::Path) -> Result<(), String> {
    let tmp = root.join("tmp");
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let trial = tmp.join(format!("php-{version}-check.ini"));
    std::fs::write(&trial, phpini::render(dir, &root.join("etc"))).map_err(|e| e.to_string())?;
    let result = phpini::test_ini(dir, &trial);
    let _ = std::fs::remove_file(&trial);
    result
}

/// Extensions, common settings and your own lines for a PHP version (None: the default).
#[tauri::command]
async fn php_settings_info(stack: tauri::State<'_, Stack>, version: Option<String>) -> Result<phpini::Info, String> {
    let (root, settings, _) = stack.get()?;
    blocking(move || {
        let (_, dir, ini_dir) = php_dirs(&root, &settings, version.as_deref())?;
        Ok(phpini::info(&dir, &root.join("etc"), &ini_dir))
    })
    .await
}

/// Saves extension and setting choices for a PHP version. PHP checks them first; a version PHP
/// won't start with is not kept. Running PHP services restart with the new settings.
#[tauri::command]
async fn php_settings_save(
    stack: tauri::State<'_, Stack>,
    version: Option<String>,
    extensions: std::collections::BTreeMap<String, bool>,
    values: std::collections::BTreeMap<String, String>,
) -> Result<phpini::Info, String> {
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        let (version, dir, ini_dir) = php_dirs(&root, &settings, version.as_deref())?;
        let etc = root.join("etc");
        for (k, v) in &values {
            if !phpini::EDITABLE.contains(&k.as_str()) {
                return Err(format!("{k} can't be changed here. Add it to your own lines instead."));
            }
            phpini::check_value(k, v)?;
        }
        let before = phpini::load(&etc, &version);
        let defaults = phpini::Choices::default();
        let default_on = phpini::enabled(&dir, &defaults);
        // Only what differs from NexDB's defaults is kept, so new defaults reach you later.
        let choices = phpini::Choices {
            extensions: extensions.into_iter().filter(|(e, on)| default_on.contains(e) != *on).collect(),
            settings: values
                .into_iter()
                .filter(|(k, v)| phpini::DEFAULT_SETTINGS.iter().any(|(dk, dv)| dk == k && dv != &v.trim()))
                .map(|(k, v)| (k, v.trim().to_string()))
                .collect(),
        };
        phpini::save(&etc, &version, &choices)?;
        if let Err(e) = test_php_settings(&root, &version, &dir) {
            phpini::save(&etc, &version, &before)?;
            return Err(format!("{e} Nothing was changed."));
        }
        restart_php(&root, &settings, &sup)?;
        Ok(phpini::info(&dir, &etc, &ini_dir))
    })
    .await
}

/// After editing your own lines: checks them, then restarts PHP with them.
#[tauri::command]
async fn php_settings_apply(stack: tauri::State<'_, Stack>, version: Option<String>) -> Result<phpini::Info, String> {
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        let (version, dir, ini_dir) = php_dirs(&root, &settings, version.as_deref())?;
        test_php_settings(&root, &version, &dir).map_err(|e| format!("{e} PHP keeps its previous settings; fix the line in your file and press Apply again."))?;
        restart_php(&root, &settings, &sup)?;
        Ok(phpini::info(&dir, &root.join("etc"), &ini_dir))
    })
    .await
}

/// Opens the version's own-lines file (made on first use) in the PC's editor for .ini files.
#[tauri::command]
async fn php_settings_open(app: tauri::AppHandle, stack: tauri::State<'_, Stack>, version: Option<String>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let (root, settings, _) = stack.get()?;
    let path = blocking(move || {
        let (version, _, _) = php_dirs(&root, &settings, version.as_deref())?;
        phpini::ensure_own_lines(&root.join("etc"), &version)
    })
    .await?;
    app.opener().open_path(path.display().to_string(), None::<&str>).map_err(|e| e.to_string())
}

/// "Check my setup": every finding, with the fix NexDB can do for it.
#[tauri::command]
async fn health_check(stack: tauri::State<'_, Stack>) -> Result<Vec<health::Check>, String> {
    let (root, settings, sup) = stack.get()?;
    blocking(move || Ok(health::run(&root, &settings, &sup))).await
}

/// Writes the web server's and PHP's settings again from NexDB's saved choices, then
/// restarts the web server if it runs.
#[tauri::command]
async fn health_fix_configs(stack: tauri::State<'_, Stack>) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        installer::refresh_configs(&root, &settings)?;
        apply_vhosts(&root, &settings, &sup)
    })
    .await
}

/// Moves a damaged PostgreSQL data folder aside (kept as postgres-damaged-<time>) and makes a
/// fresh one, then starts PostgreSQL again if it was meant to run.
#[tauri::command]
async fn health_reset_postgres(stack: tauri::State<'_, Stack>) -> Result<(), String> {
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        if !health::postgres_damaged(&root) {
            return Err("PostgreSQL's data folder looks fine, so it was left as it is.".into());
        }
        let was = sup.status().iter().any(|s| s.id == "postgres" && s.state != supervisor::State::Stopped);
        let _ = sup.stop("postgres");
        let c = settings.components.iter().find(|c| c.id == "postgres").ok_or("PostgreSQL isn't installed.")?;
        let data = root.join("data").join("postgres");
        let aside = root.join("data").join(format!("postgres-damaged-{}", backup::stamp()));
        std::fs::rename(&data, &aside).map_err(|e| format!("Couldn't move the damaged folder aside: {e}. Stop PostgreSQL on the Dashboard and try again."))?;
        postgres::init(&std::path::PathBuf::from(&c.path).join("bin"), &data)?;
        if was {
            sup.start("postgres")?;
        }
        Ok(())
    })
    .await
}

/// Asks where to save the support report, then writes it. None when cancelled.
#[tauri::command]
async fn health_report(app: tauri::AppHandle, stack: tauri::State<'_, Stack>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (root, settings, sup) = stack.get()?;
    let dialog = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog
            .dialog()
            .file()
            .set_title("Save the support report")
            .set_file_name(format!("nexdb-report-{}.zip", env!("CARGO_PKG_VERSION")))
            .add_filter("Zip files", &["zip"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    blocking(move || {
        let checks = health::run(&root, &settings, &sup);
        health::support_report(&root, &settings, &sup, &checks, &path)?;
        Ok(Some(path.display().to_string()))
    })
    .await
}

/// A project's .env files (its folder and folders one level down), secrets marked.
#[tauri::command]
async fn env_files(stack: tauri::State<'_, Stack>, project: String) -> Result<Vec<envfile::EnvFile>, String> {
    let (_, settings, _) = stack.get()?;
    blocking(move || {
        let dir = projects::project_dir(std::path::Path::new(&settings.www_dir), &project).ok_or("That project doesn't exist any more.")?;
        Ok(envfile::files(&dir))
    })
    .await
}

/// Saves changes to one .env (old file kept as .env.backup); Laravel's cached config is cleared.
#[tauri::command]
async fn env_save(
    stack: tauri::State<'_, Stack>,
    project: String,
    folder: String,
    changes: Vec<envfile::Change>,
) -> Result<String, String> {
    let (root, settings, _) = stack.get()?;
    blocking(move || {
        let dir = projects::project_dir(std::path::Path::new(&settings.www_dir), &project).ok_or("That project doesn't exist any more.")?;
        let dir = if folder.is_empty() { dir } else { dir.join(projects::clean_site_folder(&dir, &folder)?) };
        let path = envfile::save(&dir, &changes)?;
        if dir.join("artisan").is_file() && dir.join("vendor").is_dir() {
            let _ = laravel::run(&root, &settings, &project, &dir, "clear");
        }
        Ok(path.display().to_string())
    })
    .await
}

/// Where a project can take a database: its folder and folders one level down, with the
/// database each one uses now.
#[tauri::command]
async fn db_targets(stack: tauri::State<'_, Stack>, project: String) -> Result<Vec<dbconnect::Target>, String> {
    let (_, settings, _) = stack.get()?;
    blocking(move || {
        let dir = projects::project_dir(std::path::Path::new(&settings.www_dir), &project).ok_or("That project doesn't exist any more.")?;
        Ok(dbconnect::targets(&dir))
    })
    .await
}

/// Which project uses which database, from the projects' own settings.
#[tauri::command]
async fn db_usage(stack: tauri::State<'_, Stack>) -> Result<Vec<dbconnect::Usage>, String> {
    let (_, settings, _) = stack.get()?;
    blocking(move || Ok(dbconnect::usage(std::path::Path::new(&settings.www_dir)))).await
}

#[derive(serde::Serialize)]
struct UseResult {
    /// The file written, when NexDB could write one.
    written: Option<String>,
    /// The connection, to copy into a project NexDB can't change itself.
    values: Vec<(String, String)>,
    user: String,
}

/// Points a project (or one of its folders) at a database on NexDB's MySQL ("mysql") or
/// PostgreSQL ("postgres"). With `own_user`, the database gets a user of its own with a new
/// password; otherwise the project signs in as root (postgres). Laravel's caches are cleared.
#[tauri::command]
async fn db_use_in_project(
    stack: tauri::State<'_, Stack>,
    db: tauri::State<'_, db::Db>,
    project: String,
    folder: String,
    database: String,
    engine: String,
    own_user: bool,
) -> Result<UseResult, String> {
    let (root, settings, _) = stack.get()?;
    let root_password = db.inner().clone_handle().password();
    blocking(move || {
        let dir = projects::project_dir(std::path::Path::new(&settings.www_dir), &project).ok_or("That project doesn't exist any more.")?;
        let dir = if folder.is_empty() { dir } else { dir.join(projects::clean_site_folder(&dir, &folder)?) };
        if !db::valid_name(&database) {
            return Err(format!("\"{database}\" isn't a database name NexDB can use."));
        }
        let conn = if engine == "postgres" {
            let port = supervisor::POSTGRES_PORT;
            if own_user {
                // PostgreSQL user names: letters, digits and _.
                let user: String = database.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' { c.to_ascii_lowercase() } else { '_' }).collect();
                let password = quickstart::random_password()?;
                if pg::users(port)?.iter().any(|u| u.name == user) {
                    pg::set_user_password(port, &user, &password)?;
                    pg::grant(port, &user, &database)?;
                } else {
                    pg::create_user(port, &user, &password, Some(&database))?;
                }
                dbconnect::Conn { engine, port, database, user, password }
            } else {
                dbconnect::Conn { engine, port, database, user: "postgres".into(), password: String::new() }
            }
        } else {
            let port = settings.mysql.as_ref().map(|m| m.port).ok_or("MySQL isn't part of this install.")?;
            if own_user {
                let (made, _) = quickstart::ensure_database(root_password.as_deref(), port, &database)?;
                dbconnect::Conn { engine: "mysql".into(), port, database, user: made.user, password: made.password }
            } else {
                dbconnect::Conn { engine: "mysql".into(), port, database, user: "root".into(), password: root_password.unwrap_or_default() }
            }
        };
        let kind = dbconnect::kind_of(&dir);
        let written = match kind.as_str() {
            "laravel" => {
                let path = dbconnect::write_laravel(&dir, &conn)?;
                // Cached config would keep the old connection.
                if dir.join("vendor").is_dir() {
                    let _ = laravel::run(&root, &settings, &project, &dir, "clear");
                }
                Some(path.display().to_string())
            }
            "wordpress" => Some(dbconnect::write_wordpress(&dir, &conn)?.display().to_string()),
            _ => None,
        };
        Ok(UseResult { written, values: dbconnect::env_lines(&conn), user: conn.user })
    })
    .await
}

/// Clones a Git repository as a new project (progress as `quickstart` events under its name),
/// then adds its site. Returns what it still needs to be set up, which the page runs next.
#[tauri::command]
async fn project_clone(
    app: tauri::AppHandle,
    stack: tauri::State<'_, Stack>,
    url: String,
    name: String,
    branch: Option<String>,
) -> Result<Vec<quickstart::SetupTask>, String> {
    let (root, settings, sup) = stack.get()?;
    blocking(move || {
        let emit = |e: quickstart::Event| {
            let _ = app.emit("quickstart", e);
        };
        quickstart::clone_repo(&emit, &root, &settings, &url, &name, branch.as_deref())?;
        apply_vhosts(&root, &settings, &sup)?;
        Ok(quickstart::setup_plan(&std::path::Path::new(&settings.www_dir).join(&name)))
    })
    .await
}

/// Laragon, XAMPP, WAMP and other database servers on this PC, with what can be imported.
#[tauri::command]
async fn import_sources(stack: tauri::State<'_, Stack>) -> Result<Vec<importer::Source>, String> {
    let (root, settings, _) = stack.get()?;
    blocking(move || Ok(importer::sources(&root, &settings))).await
}

/// The databases on another server, asked with its own client and the password given here
/// (used once, never saved).
#[tauri::command]
async fn import_databases(stack: tauri::State<'_, Stack>, server: importer::Server, password: Option<String>) -> Result<Vec<String>, String> {
    let (root, _, _) = stack.get()?;
    blocking(move || importer::databases(&root, &server, password.as_deref())).await
}

/// Copies the picked projects and databases into NexDB, then adds the new projects' sites.
/// Progress goes out as `quickstart` events named "import".
#[tauri::command]
async fn import_run(
    app: tauri::AppHandle,
    stack: tauri::State<'_, Stack>,
    db: tauri::State<'_, db::Db>,
    plan: importer::Plan,
) -> Result<Vec<String>, String> {
    let (root, settings, sup) = stack.get()?;
    let mysql_port = settings.mysql.as_ref().map(|m| m.port);
    let password = db.inner().clone_handle().password();
    blocking(move || {
        let emit = |e: quickstart::Event| {
            let _ = app.emit("quickstart", e);
        };
        let target = importer::Target {
            root: &root,
            settings: &settings,
            mysql_bin: mysql_bin(&settings).ok(),
            mysql_port,
            root_password: password,
            postgres_dir: settings.components.iter().find(|c| c.id == "postgres").map(|c| std::path::PathBuf::from(&c.path)),
        };
        let notes = importer::run(&emit, &target, &plan)?;
        if !plan.projects.is_empty() {
            apply_vhosts(&root, &settings, &sup)?;
        }
        Ok(notes)
    })
    .await
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
    let db = db.inner().clone_handle();
    let port = if db.pg_port().is_some() { 0 } else { mysql_port(&stack)? };
    blocking(move || {
        let names: Vec<String> = match name.filter(|n| !n.is_empty()) {
            Some(n) => vec![n],
            None => db.databases()?.into_iter().filter(|d| !d.system).map(|d| d.name).collect(),
        };
        if names.is_empty() {
            return Err("There are no databases of your own to back up yet.".into());
        }
        if let Some(pg_port) = db.pg_port() {
            let bin = pg::bin(&settings)?;
            let dir = backup::backups_dir(&root);
            std::fs::create_dir_all(&dir).map_err(|e| format!("Couldn't create the backups folder: {e}"))?;
            let stamp = backup::stamp();
            let made: Vec<std::path::PathBuf> = names
                .iter()
                .map(|n| {
                    let target = dir.join(backup::pg_file_name(n, &stamp));
                    pg::dump_to(&bin, pg_port, n, &target).map(|_| target)
                })
                .collect::<Result<_, _>>()?;
            return Ok(backup::list(&root).into_iter().filter(|b| made.iter().any(|m| std::path::Path::new(&b.path) == m)).collect());
        }
        let bin = mysql_bin(&settings)?;
        let password = db.password();
        names.iter().map(|n| backup::export(&bin, &root, port, password.as_deref(), n, false)).collect()
    })
    .await
}

/// Restores a backup into `database`, creating it first if it doesn't exist.
#[tauri::command]
async fn backup_restore(stack: tauri::State<'_, Stack>, db: tauri::State<'_, db::Db>, file: String, database: String) -> Result<(), String> {
    let (root, settings, _) = stack.get()?;
    let db = db.inner().clone_handle();
    let port = if db.pg_port().is_some() { 0 } else { mysql_port(&stack)? };
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
    if !db.databases()?.iter().any(|d| d.name.eq_ignore_ascii_case(database)) {
        db.create_database(database)?;
    }
    if let Some(pg_port) = db.pg_port() {
        return pg::import(&pg::bin(settings)?, pg_port, database, file);
    }
    let bin = mysql_bin(settings)?;
    backup::import(&bin, root, port, db.password().as_deref(), database, file)
}

/// Imports any `.sql` file the user picked into `database` (created if needed).
#[tauri::command]
async fn backup_import_file(stack: tauri::State<'_, Stack>, db: tauri::State<'_, db::Db>, path: String, database: String) -> Result<(), String> {
    let (root, settings, _) = stack.get()?;
    let db = db.inner().clone_handle();
    let port = if db.pg_port().is_some() { 0 } else { mysql_port(&stack)? };
    blocking(move || restore_into(&settings, &root, port, &db, std::path::Path::new(&path), &database)).await
}

#[tauri::command]
fn backup_delete(stack: tauri::State<Stack>, file: String) -> Result<(), String> {
    let (root, _, _) = stack.get()?;
    backup::delete(&root, &file)
}

/// Saves a database as a .sql file wherever the user picks; None when they cancel.
#[tauri::command]
async fn db_export_sql(
    app: tauri::AppHandle,
    stack: tauri::State<'_, Stack>,
    db: tauri::State<'_, db::Db>,
    name: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (root, settings, _) = stack.get()?;
    let pg_port = db.inner().clone_handle().pg_port();
    let port = if pg_port.is_some() { 0 } else { mysql_port(&stack)? };
    let password = db.inner().clone_handle().password();
    let dialog = app.clone();
    let suggested = format!("{name}.sql");
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog
            .dialog()
            .file()
            .set_title("Export database as .sql")
            .set_file_name(suggested)
            .add_filter("SQL files", &["sql"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    blocking(move || {
        if let Some(pg_port) = pg_port {
            pg::dump_to(&pg::bin(&settings)?, pg_port, &name, &path)?;
        } else {
            backup::dump_to(&mysql_bin(&settings)?, &root, port, password.as_deref(), &name, &path)?;
        }
        Ok(Some(path.display().to_string()))
    })
    .await
}

/// Switches the Database page between MySQL ("mysql") and NexDB's PostgreSQL ("postgres").
/// PostgreSQL needs no password, so it connects right away; MySQL then uses `db_connect`.
#[tauri::command]
async fn db_use_engine(stack: tauri::State<'_, Stack>, db: tauri::State<'_, db::Db>, engine: String) -> Result<Option<db::Connected>, String> {
    let (_, settings, _) = stack.get()?;
    let db = db.inner().clone_handle();
    if engine == "postgres" {
        if !settings.components.iter().any(|c| c.id == "postgres") {
            return Err("PostgreSQL isn't installed. Add it on the Versions page.".into());
        }
        db.use_postgres(Some(supervisor::POSTGRES_PORT));
        return blocking(move || pg::connect(supervisor::POSTGRES_PORT).map(Some)).await;
    }
    db.use_postgres(None);
    Ok(None)
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
