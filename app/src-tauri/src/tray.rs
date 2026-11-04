//! The notification-area icon, hide-to-tray on close, and the "start with Windows" entry.
//! Its menu follows the stack: each service with a tick while it runs (click to start or stop
//! it), each project with Open site, a terminal and its folder. A watcher keeps it current and
//! raises a Windows notification when a service stops by itself.

use std::collections::HashMap;
use std::time::Duration;

use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::supervisor::State;

/// Launch argument used by the Windows startup entry: start hidden in the tray.
pub const TRAY_ARG: &str = "--tray";

/// The most projects listed in the menu; the rest are a click away in the window.
const MENU_PROJECTS: usize = 15;

pub fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// What the menu shows: each service's state and the project names. When it changes, the
/// menu is built again.
fn snapshot(app: &AppHandle) -> (Vec<(String, String, bool, bool)>, Vec<String>) {
    let Ok((_, settings, sup)) = app.state::<crate::Stack>().get() else { return (vec![], vec![]) };
    let services = sup
        .status()
        .into_iter()
        .map(|s| {
            let up = matches!(s.state, State::Running | State::Starting);
            let name = if s.id.starts_with("php") { s.version.clone().map(|v| format!("PHP {v}")).unwrap_or(s.name) } else { s.name };
            (s.id, name, up, s.managed)
        })
        .collect();
    let projects = crate::projects::list(std::path::Path::new(&settings.www_dir), 80).into_iter().map(|p| p.name).take(MENU_PROJECTS).collect();
    (services, projects)
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let (services, projects) = snapshot(app);
    let sep = || PredefinedMenuItem::separator(app);

    let open = MenuItem::with_id(app, "open", "Open NexDB", true, None::<&str>)?;
    let start = MenuItem::with_id(app, "start_all", "Start all", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop_all", "Stop all", true, None::<&str>)?;
    let svc_items: Vec<CheckMenuItem<Wry>> = services
        .iter()
        .map(|(id, name, up, managed)| {
            // External services (an existing MySQL) are only shown, never started or stopped.
            let label = if *managed { name.clone() } else { format!("{name} (outside NexDB)") };
            CheckMenuItem::with_id(app, format!("svc:{id}"), label, *managed, *up, None::<&str>)
        })
        .collect::<tauri::Result<_>>()?;
    let s1 = sep()?;
    let mut svc_refs: Vec<&dyn IsMenuItem<Wry>> = vec![&start, &stop, &s1];
    svc_refs.extend(svc_items.iter().map(|i| i as &dyn IsMenuItem<Wry>));
    let services_menu = Submenu::with_items(app, "Services", true, &svc_refs)?;

    let project_menus: Vec<Submenu<Wry>> = projects
        .iter()
        .map(|p| {
            let site = MenuItem::with_id(app, format!("site:{p}"), "Open site", true, None::<&str>)?;
            let term = MenuItem::with_id(app, format!("term:{p}"), "Open a terminal here", true, None::<&str>)?;
            let dir = MenuItem::with_id(app, format!("dir:{p}"), "Show the folder", true, None::<&str>)?;
            Submenu::with_items(app, p, true, &[&site, &term, &dir])
        })
        .collect::<tauri::Result<_>>()?;
    let none = MenuItem::with_id(app, "noop", "No projects yet", false, None::<&str>)?;
    let project_refs: Vec<&dyn IsMenuItem<Wry>> =
        if project_menus.is_empty() { vec![&none] } else { project_menus.iter().map(|m| m as &dyn IsMenuItem<Wry>).collect() };
    let projects_menu = Submenu::with_items(app, "Projects", true, &project_refs)?;

    let terminal = MenuItem::with_id(app, "term:", "Open a terminal", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit NexDB", true, None::<&str>)?;
    let (s2, s3) = (sep()?, sep()?);
    Menu::with_items(app, &[&open, &s2, &services_menu, &projects_menu, &terminal, &s3, &quit])
}

fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "open" => show_window(app),
        "start_all" => crate::tray_services(app, true),
        "stop_all" => crate::tray_services(app, false),
        "quit" => app.exit(0),
        _ => {
            if let Some(svc) = id.strip_prefix("svc:") {
                crate::tray_service(app, svc);
            } else if let Some(p) = id.strip_prefix("site:") {
                if let Err(e) = crate::open_project(app, p, "url").or_else(|_| crate::open_project(app, p, "local")) {
                    notify(app, "Couldn't open the site", &e);
                }
            } else if let Some(p) = id.strip_prefix("dir:") {
                let _ = crate::open_project(app, p, "folder");
            } else if let Some(p) = id.strip_prefix("term:") {
                let app = app.clone();
                let project = (!p.is_empty()).then(|| p.to_string());
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::terminal_window(app.clone(), project).await {
                        notify(&app, "Couldn't open a terminal", &e);
                    }
                });
            }
        }
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("NexDB")
        .menu(&build_menu(app)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    watch(app.clone());
    Ok(())
}

/// A Windows notification from NexDB.
pub fn notify(app: &AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

/// Every few seconds: rebuilds the tray menu when a service or the project list changed, and
/// tells you when a service that was running stopped by itself.
fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = snapshot(&app);
        let mut was: HashMap<String, State> = HashMap::new();
        loop {
            std::thread::sleep(Duration::from_secs(4));
            if let Ok((_, _, sup)) = app.state::<crate::Stack>().get() {
                for s in sup.status().into_iter().filter(|s| s.managed) {
                    let before = was.insert(s.id.clone(), s.state);
                    if matches!(before, Some(State::Running)) && s.state == State::Failed {
                        let why = s.message.clone().unwrap_or_else(|| format!("{} stopped.", s.name));
                        notify(&app, &format!("{} stopped", s.name), &format!("{why} Open NexDB to start it again or read its log."));
                        let _ = app.emit("services-changed", ());
                    }
                }
            }
            let now = snapshot(&app);
            if now != last {
                if let (Some(tray), Ok(menu)) = (app.tray_by_id("main"), build_menu(&app)) {
                    let _ = tray.set_menu(Some(menu));
                }
                last = now;
            }
        }
    });
}

#[cfg(windows)]
mod startup {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const VALUE: &str = "NexDB";

    pub fn get() -> bool {
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags(RUN_KEY, KEY_READ)
            .and_then(|k| k.get_value::<String, _>(VALUE))
            .is_ok()
    }

    pub fn set(on: bool) -> Result<(), String> {
        let key = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE)
            .map_err(|e| format!("Couldn't open the Windows startup list: {e}"))?;
        if on {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            key.set_value(VALUE, &format!("\"{}\" {}", exe.display(), super::TRAY_ARG))
                .map_err(|e| format!("Couldn't add NexDB to Windows startup: {e}"))
        } else {
            match key.delete_value(VALUE) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(format!("Couldn't remove NexDB from Windows startup: {e}")),
            }
        }
    }
}

#[cfg(not(windows))]
mod startup {
    pub fn get() -> bool { false }
    pub fn set(_: bool) -> Result<(), String> { Err("Start with Windows is only available on Windows".into()) }
}

#[tauri::command]
pub fn autostart_get() -> bool {
    startup::get()
}

#[tauri::command]
pub fn autostart_set(on: bool) -> Result<(), String> {
    startup::set(on)
}
