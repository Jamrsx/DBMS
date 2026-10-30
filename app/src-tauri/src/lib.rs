mod catalog;
mod configure;
mod installer;
mod scan;

use tauri::Emitter;

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
    installer::run(&catalog, &request, |progress| {
        let _ = app.emit("install-progress", progress);
    })
    .await
}

/// Asks a running install to stop at the next safe point.
#[tauri::command]
fn cancel_install() {
    installer::CANCEL.store(true, std::sync::atomic::Ordering::SeqCst);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            system_scan,
            component_choices,
            port_status,
            suggest_port,
            run_install,
            cancel_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
