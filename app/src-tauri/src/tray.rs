//! The notification-area icon, hide-to-tray on close, and the "start with Windows" entry.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

/// Launch argument used by the Windows startup entry: start hidden in the tray.
pub const TRAY_ARG: &str = "--tray";

pub fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open NexDB", true, None::<&str>)?;
    let start = MenuItem::with_id(app, "start_all", "Start all", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop_all", "Stop all", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit NexDB", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&open, &PredefinedMenuItem::separator(app)?, &start, &stop, &PredefinedMenuItem::separator(app)?, &quit],
    )?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("NexDB")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_window(app),
            "start_all" => crate::tray_services(app, true),
            "stop_all" => crate::tray_services(app, false),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
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
