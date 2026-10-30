mod admin;
mod catalog;
mod configure;
mod installer;
mod scan;
mod settings;
mod supervisor;
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
            tray::autostart_get,
            tray::autostart_set
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        // Stop services cleanly when DevManager closes; the job objects cover crashes.
        if let tauri::RunEvent::Exit = event {
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
