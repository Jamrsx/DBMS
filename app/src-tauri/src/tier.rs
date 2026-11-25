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
    "autostart_get",
    // PHP and versions
    "php_settings_info",
    "php_settings_save",
    "php_settings_apply",
    "php_settings_open",
    "version_use",
    "local_versions",
    "local_version_check",
    "local_version_pick",
    "local_version_open",
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
    "paused_sites",
    "project_use_localhost",
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

/// Database engines Free keeps running when they are already installed, so a former paid user's
/// data stays reachable. Free can't install them.
const FREE_DATABASES: [&str; 4] = ["mysql", "mariadb", "postgres", "mongodb"];

fn is_free_service(id: &str, web: Option<&str>) -> bool {
    id == "php" || web == Some(id) || FREE_DATABASES.contains(&id)
}

/// The services Free runs, out of everything installed.
pub fn free_services(web: Option<&str>, all: &[String]) -> Vec<String> {
    all.iter().filter(|id| is_free_service(id, web)).cloned().collect()
}

/// What Start should start: one named service, or Start All. Free refuses a paid service.
pub fn start_ids(full: bool, requested: Option<String>, web: Option<&str>, all: Vec<String>) -> Result<Vec<String>, String> {
    match (full, requested) {
        (true, Some(id)) => Ok(vec![id]),
        (true, None) => Ok(all),
        (false, Some(id)) if is_free_service(&id, web) => Ok(vec![id]),
        (false, Some(_)) => Err(LOCKED.to_string()),
        (false, None) => Ok(free_services(web, &all)),
    }
}

/// The running services to stop when a license ends. The core stack keeps running.
pub fn to_stop(web: Option<&str>, running: &[String]) -> Vec<String> {
    running.iter().filter(|id| !is_free_service(id, web)).cloned().collect()
}

/// Free can switch PHP and Node. Changing MySQL by hand could damage databases.
pub fn version_switch_allowed(full: bool, id: &str) -> bool {
    full || matches!(id, "php" | "node")
}

/// Free runs the installer only for first setup or to repair a broken install.
pub fn install_allowed(full: bool, installed: bool, repairing: bool) -> bool {
    full || !installed || repairing
}

/// The extra `php-<version>` services that per-project PHP uses. Free doesn't run them.
pub fn extra_php(all: &[String]) -> Vec<String> {
    all.iter().filter(|id| id.starts_with("php-")).cloned().collect()
}

/// Whether NexDB still has to switch mode. The marker is written only after a switch to Free has
/// finished, so a routine license check never restarts the web server.
pub fn needs_rewrite(full: bool, marked_free: bool) -> bool {
    full == marked_free
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

    fn ids(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn free_starts_only_core_services_and_existing_databases() {
        let all = ids(&["php", "php-8.3.14", "apache", "mysql", "postgres", "mailpit", "redis"]);
        assert_eq!(free_services(Some("apache"), &all), ids(&["php", "apache", "mysql", "postgres"]));
    }

    #[test]
    fn free_refuses_a_paid_service_by_name() {
        let all = ids(&["php", "apache", "mailpit"]);
        assert_eq!(start_ids(false, Some("mailpit".into()), Some("apache"), all.clone()).unwrap_err(), LOCKED);
        assert_eq!(start_ids(true, Some("mailpit".into()), Some("apache"), all).unwrap(), ids(&["mailpit"]));
    }

    #[test]
    fn start_all_in_free_skips_paid_services() {
        let all = ids(&["php", "apache", "mysql", "mailpit"]);
        assert_eq!(start_ids(false, None, Some("apache"), all.clone()).unwrap(), ids(&["php", "apache", "mysql"]));
        assert_eq!(start_ids(true, None, Some("apache"), all.clone()).unwrap(), all);
    }

    #[test]
    fn ending_a_license_stops_only_paid_services() {
        let running = ids(&["php", "php-8.3.14", "apache", "mysql", "mailpit"]);
        assert_eq!(to_stop(Some("apache"), &running), ids(&["php-8.3.14", "mailpit"]));
    }

    #[test]
    fn free_switches_only_php_and_node() {
        assert!(version_switch_allowed(false, "php") && version_switch_allowed(false, "node"));
        assert!(!version_switch_allowed(false, "mysql") && version_switch_allowed(true, "mysql"));
    }

    #[test]
    fn free_installs_only_during_setup_or_repair() {
        assert!(install_allowed(false, false, false) && install_allowed(false, true, true));
        assert!(!install_allowed(false, true, false) && install_allowed(true, true, false));
    }

    #[test]
    fn renewal_brings_back_per_project_php() {
        assert_eq!(extra_php(&ids(&["php", "php-8.3.14", "apache", "mailpit"])), ids(&["php-8.3.14"]));
    }

    #[test]
    fn sites_are_rewritten_only_when_the_mode_changed() {
        assert!(needs_rewrite(false, false) && needs_rewrite(true, true));
        assert!(!needs_rewrite(false, true) && !needs_rewrite(true, false));
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
