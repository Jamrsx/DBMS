//! Free or Full. A working license, trial, or grace period is Full; anything else is Free.
//! Every command from the window passes through `allow`, and in Free only the commands listed
//! here run, so a command added later is locked until someone decides it belongs in Free.

use tauri::ipc::Invoke;
use tauri::Wry;

/// What a locked feature answers.
pub const LOCKED: &str = "This is part of the full NexDB. Open What you get to try it free for 14 days or upgrade.";

/// The commands NexDB Free can run. Anything not listed needs a working license or trial.
pub const FREE_COMMANDS: &[&str] = &[
    // Window and setup
    "set_window_glass",
    "system_scan",
    "component_choices",
    "port_status",
    "suggest_port",
    "run_install",
    "cancel_install",
    "setup_info",
    "setup_adopt",
    "mac_app_place",
    "mac_move_to_applications",
    "uninstall_info",
    "uninstall_app",
    // License
    "license_status",
    "license_activate",
    "license_sign_in",
    "license_change",
    "license_check_in",
    "license_unlink",
    "license_device",
    "license_plans",
    "license_start_trial",
    // Services
    "services",
    "start_services",
    "stop_services",
    "service_log",
    "clear_service_log",
    "app_settings",
    "save_ports",
    "set_start_services_on_launch",
    "autostart_get",
    "autostart_set",
    // PHP and versions
    "php_settings_info",
    "php_settings_save",
    "php_settings_apply",
    "php_settings_open",
    "version_use",
    // phpMyAdmin
    "phpmyadmin_status",
    "phpmyadmin_install",
    "phpmyadmin_open",
    // Terminal and folder
    "terminal_open",
    "terminal_window",
    "terminal_write",
    "terminal_resize",
    "terminal_close",
    "www_open",
    // Data safety: backups already made can always be restored
    "backups_list",
    "backup_restore",
    "open_backups_folder",
];

/// Whether `command` may run. Full runs everything; Free runs only the list above.
pub fn allowed(full: bool, command: &str) -> bool {
    full || FREE_COMMANDS.contains(&command)
}

/// The check for a command from the window, with the plain message when it is locked.
pub fn allow(command: &str) -> Result<(), String> {
    if allowed(crate::license::is_full(), command) {
        Ok(())
    } else {
        Err(LOCKED.to_string())
    }
}

/// Puts the check in front of every app command. Plugin commands (like updates) don't come here.
pub fn guard<F>(commands: F) -> impl Fn(Invoke<Wry>) -> bool + Send + Sync + 'static
where
    F: Fn(Invoke<Wry>) -> bool + Send + Sync + 'static,
{
    move |invoke| {
        if let Err(message) = allow(invoke.message.command()) {
            invoke.resolver.reject(message);
            return true;
        }
        commands(invoke)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_denies_paid_and_unknown_commands() {
        for c in ["db_query", "project_create", "version_install", "share_public_start", "nexhost_list", "a_command_added_next_year"] {
            assert!(!allowed(false, c), "{c}");
            assert!(allowed(true, c), "{c}");
        }
    }

    #[test]
    fn free_keeps_the_basics() {
        for c in ["license_start_trial", "start_services", "stop_services", "terminal_open", "phpmyadmin_open", "php_settings_save", "www_open", "backup_restore"] {
            assert!(allowed(false, c), "{c}");
        }
    }

    #[test]
    fn every_free_command_is_a_real_command() {
        let src = include_str!("lib.rs");
        let list = src.split("generate_handler![").nth(1).unwrap().split(']').next().unwrap();
        let real: Vec<&str> = list.split(',').map(|s| s.trim().rsplit("::").next().unwrap()).collect();
        for c in FREE_COMMANDS {
            assert!(real.contains(c), "{c}");
        }
    }
}
