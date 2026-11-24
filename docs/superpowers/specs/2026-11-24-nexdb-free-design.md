# NexDB Free: design

Status: waiting for the owner's approval. Nothing here is built.
Based on app `macos-port` at `3ef8c74` (0.6.2) and website `Jamrsx/nexDB-web` at `1721ba2`.

## 1. Intent

NexDB today blocks the whole app after setup until a license is activated. NexDB Free replaces that wall with a very simple local dev stack, close in spirit to Laragon 6: start the servers, open the site, open phpMyAdmin, open a terminal, open the folder.

Free exists so students and new users can start using NexDB at no cost, see what the full app adds, and upgrade when they want more. It must be useful on its own, but the convenience features stay paid.

### Goals

- A person can install NexDB, run PHP sites on `localhost`, and manage MySQL in phpMyAdmin with no account and no payment.
- A person can start a one-click 14-day trial, with no email, once per computer.
- A license, trial, or grace period ending moves the app to Free. It never deletes projects, databases, backups, or settings.
- Upgrading is instant, with no reinstall.
- The Rust backend enforces every lock.
- Windows and Mac (Intel and Apple Silicon, macOS 13+) both work.

### Non-goals

- Legal pages (Terms, Privacy, Refund), BIR registration, and open-source notices for bundled servers. These remain separate open items.
- A separate Free download or build.
- Changes to paid plan prices.
- Ads. Owner's decision: Free launches with no ads. Google AdSense does not allow ads in desktop applications. A direct sponsor banner, with no tracking, can be reconsidered once Free has real user numbers.
- Stopping a determined cracker. The lock should stop ordinary use and accidental leaks, at the same strength as today's license.

### Anti-goals

This work has failed, even if it runs, if any of these happen:

- A current paying customer loses a feature.
- A user loses data, or cannot reach their databases, because a license ended.
- Upgrade prompts block work or keep returning after being closed.
- A new paid feature becomes free because someone forgot to lock it.

## 2. Constraints found in the code

- Only `start_services` and the tray's "Start all" check the license (`lib.rs:218`, `lib.rs:624`). NexHost commands check `require_feature("nexhost")`. All other commands rely on the `LicenseGate` screen.
- The tray's single-service start (`tray_service`, `lib.rs:643`) has no license check today. This design closes it.
- Paid tokens mostly carry `features: []`. Only the 4-year plan has `["nexhost"]`. **Free therefore means "no working license", never "feature missing from the token".**
- NexDB rewrites `php.ini` on every start. Users must change PHP through the PHP settings panel, which stores choices in `etc/php-custom/`.
- `versions::installed_versions` and `check_switch` only accept folders holding the `.devmanager-installed` marker.
- phpMyAdmin is a separate download today, and it is served at `localhost/phpmyadmin` by both Apache and nginx. It does not need `.test`.
- php.net publishes no macOS builds, so the Windows "download a zip" steps cannot apply on Mac.
- The website has no trial. Its only free-key mechanism is the giveaway plan, coded as `Giveaway · 7 days`.
- `GRACE_SECS` gives every license 3 extra days. Without a change, a 14-day trial would run for 17 days.

## 3. Approaches

**Chosen by the owner: one app with a Free mode.** Everyone downloads the same NexDB. No working license means the Free window. A key or trial unlocks the full app immediately. One central Rust check denies every command that is not on the Free list.

Rejected:

- **Two separate apps.** Strongest lock, but upgrades need a reinstall and migration, and every release doubles the builds across Windows, Mac Intel and Apple Silicon.
- **A license check added to each command.** About 195 commands, and one missed check becomes a free paid feature.

## 4. What Free includes

Marked **Owner** where the owner decided, and **Builder call** where Claude proposed it for the owner to check.

| Area | Free | Full | Source |
|---|---|---|---|
| Setup installs Apache, PHP, MySQL, Node, Composer, Git, phpMyAdmin | Yes | Yes | Owner |
| Start All, Stop All | Yes | Yes | Owner |
| Terminal | Yes | Yes | Owner |
| Open phpMyAdmin (including its own export) | Yes | Yes | Owner; export is a Builder call |
| Open site at `localhost`, open projects folder | Yes | Yes | Owner |
| Update the NexDB app itself | Yes | Yes | Owner |
| PHP settings: `php.ini` values, own lines, extensions | Yes | Yes | Owner |
| Add PHP versions | By hand | One click | Owner |
| Add Node versions | By hand | One click | Builder call |
| Change MySQL version | No | One click | Builder call: a hand-swapped MySQL can damage data |
| Automatic project creation and templates | No | Yes | Owner |
| `.test` sites | No, paused | Yes | Owner |
| Database page and relationship view | No | Yes | Owner |
| Project export | No | Yes | Owner |
| Web sharing, public links, Cloudflare setup | No | 4-year plan | Owner |
| NexHost | No | 4-year plan | Owner |
| Mail catcher, import, new backups, auto-backup | No | Yes | Builder call |
| Restore a backup already made | Yes | Yes | Builder call, for data safety |
| Redis, PostgreSQL, MongoDB and other extra services | No | Yes | Builder call |
| Health checks, Performance, Docker, Laravel tools | No | Yes | Builder call |

Free shows no version catalog and offers no download button for PHP, Node or MySQL.

### Versions Free setup installs

Owner's decision: LTS where a product has LTS, and PHP 8.5 because PHP has no LTS.

| Component | Rule | Today (catalog of 2026-11-23) |
|---|---|---|
| PHP | Newest patch of the 8.5 line | 8.5.13 |
| Node | Existing recommended LTS rule | 26.13.1 |
| MySQL | Existing recommended LTS rule | 9.7.4 |
| Apache, Composer, Git, phpMyAdmin | Existing recommended or latest stable | From the catalog |

PHP 8.5 receives bug fixes until December 31, 2027, and security fixes until December 31, 2029.

Pin PHP with a `FREE_PHP_LINE = "8.5"` constant. The existing rule cannot be reused for PHP, because it moves to 8.6 about 90 days after that release. Changing the Free default is a deliberate decision in a later release. If the catalog no longer has a Windows or Mac download for that line, setup falls back to the existing recommended PHP and says which version it installed.

## 5. License states and modes

`Full` means `Status::Active` or `Status::Grace`. Everything else is `Free`.

| State | Mode | What the user sees |
|---|---|---|
| No license | Free | Free window with the normal upgrade notice |
| Trial active | Full | Full app, with days left shown |
| Trial ended | Free | "Your 14-day trial ended. Your projects and databases are safe." |
| Paid active | Full | No change |
| Paid ended, within 3 grace days | Full | Existing grace notice |
| Paid ended, grace over | Free | "Your license ended on `<date>`. Your projects and databases are safe." |
| Needs check-in (30 days offline) | Free | "Connect to the internet to bring your license back." Returns automatically after a check-in |
| Clock turned back | Free | "Your computer's date looks wrong." Full returns once fixed |
| Key revoked, moved, or lapsed | Free | The website's plain message, once |

**Trial has no grace period.** Add `trial: bool` to `Claims` with `#[serde(default)]`, and in `evaluate` use a grace of 0 when it is set. Expose `trial` on `Status::Active` and `Status::Expired` so the UI can use the right words.

### Moving from Full to Free

Run when `watch_end` sees the mode change, and at app start:

1. Stop tunnels, NexHost SSH and public links with the existing `lose_nexhost`.
2. Stop services outside the Free set.
3. Rewrite the web server's site configs in their Free form.
4. Emit `license-changed` so the window switches.

Never delete saved settings: `project_php`, `site_root`, `shared`, HTTPS, and backup schedule stay in the settings file, unused while in Free. NexHost sites keep their files and settings but go offline, as they do today, and the owner presses Go live after renewing so nothing returns to the public internet unexpectedly.

### Moving from Free to Full

Run after activate, sign-in, key change, trial start, or a check-in that restores a license:

1. Rewrite site configs in full form and restart the web server if it is running.
2. Undo any "Use localhost" changes (section 8).
3. Emit `license-changed`. The full app appears with no restart.

## 6. Backend enforcement

Add `app/src-tauri/src/tier.rs`. It owns the Free list and the mode check.

Wrap the generated handler in `lib.rs`. Tauri 2.12.5 exposes `invoke.message.command()` and `invoke.resolver.reject()`:

```rust
let commands = tauri::generate_handler![/* unchanged list */];
builder.invoke_handler(move |invoke| {
    if let Err(message) = tier::allow(invoke.message.command()) {
        invoke.resolver.reject(message);
        return true;
    }
    commands(invoke)
})
```

`tier::allow` passes everything in Full. In Free it passes only `FREE_COMMANDS`, so **a new command is locked by default**. Plugin commands such as the updater do not pass through this handler; the plan must confirm that with a test.

```text
Window and setup: set_window_glass, system_scan, component_choices, port_status, suggest_port,
  run_install, cancel_install, setup_info, setup_adopt, mac_app_place, mac_move_to_applications,
  uninstall_info, uninstall_app
License: license_status, license_activate, license_sign_in, license_change, license_check_in,
  license_unlink, license_device, license_plans, license_start_trial
Services: services, start_services, stop_services, service_log, clear_service_log, app_settings,
  save_ports, set_start_services_on_launch, autostart_get, autostart_set
PHP and versions: php_settings_info, php_settings_save, php_settings_apply, php_settings_open,
  version_use, local_versions, local_version_check, local_version_pick
phpMyAdmin: phpmyadmin_status, phpmyadmin_install, phpmyadmin_open
Terminal and folder: terminal_open, terminal_window, terminal_write, terminal_resize,
  terminal_close, www_open
Data safety: backups_list, backup_restore, open_backups_folder, paused_sites, project_use_localhost
```

Guards inside allowed commands, in Free:

- `start_services` only starts the Free set.
- `version_use` only accepts `php` and `node`.
- `run_install` only runs when NexDB is not installed yet or is being repaired.

Paths that do not go through a command also need a check:

- `tray_services` and `tray_service` use the Free set.
- The tray menu hides project and paid entries.
- `autobackup::check` does nothing in Free.
- `write_site_configs` writes the Free form.
- Free site configs ignore per-project PHP, and extra `php-<version>` services are not started, so every site uses the selected PHP. `phpver::extras` itself stays unchanged, because the service list is built once at load and must still contain those services after an upgrade.

**The Free service set** is `php`, the web server in use, `mysql`, and any database engine already installed (`mariadb`, `postgres`, `mongodb`). Free cannot install those engines, but a former paid user's data stays reachable from the Terminal.

A unit test reads the `generate_handler!` list from `lib.rs` and fails if `FREE_COMMANDS` names a command that does not exist.

## 7. Adding versions by hand

New commands:

- `local_versions` lists PHP and Node on this computer, including valid new folders.
- `local_version_check` tests one folder and writes the marker only if it passes.

**Windows.** The user extracts PHP to `<root>\bin\php\php-<version>` and presses **Check again**. NexDB confirms `php.exe` and `php-cgi.exe` exist, the version printed by PHP matches the folder name, the build is 64-bit, and `phpini::test_ini` passes. Node follows the same pattern in `<root>\bin\node\node-<version>`. Failures use plain words, such as "This PHP needs the Microsoft Visual C++ Redistributable."

**Mac.** The user installs PHP themselves (for example with Homebrew), then presses **Choose PHP** and selects its `php-cgi`. NexDB creates `bin/php/php-<version>/` with links to `php` and `php-cgi`, runs the same checks, and adds the marker. This flow is unproven and must be tested on a real Mac.

Extensions work through the existing panel. On Windows it lists each PHP's `ext\php_*.dll`, so a hand-added `.dll` appears there. On Mac, extensions are built into the PHP and cannot be toggled.

## 8. Paused `.test` sites

Owner's decision: when a license or trial ends, existing `.test` sites pause until renewal.

In Free, `write_site_configs`:

- Keeps `00-localhost.conf`, with HTTPS off and no per-project PHP.
- Writes no per-project site files, sharing files, or NexHost sites.
- Writes one catch-all for `*.test`, on Apache and nginx, serving a static NexDB page from `etc/nexdb-paused/`, reachable only from this computer.
- Leaves the system hosts file untouched, so the paused page can load and `.test` returns immediately after renewal.

The paused page says the site is paused and that nothing was deleted. It links to the project's `localhost` address, built from a small generated map of project name to path, and has a renew link.

The Free window shows "`N` sites are paused" only when this user has some. That panel lists each site with **Open at localhost** and, for Laravel projects whose `APP_URL` is `http://<name>.test`, **Use localhost**.

**Use localhost** (`project_use_localhost`):

1. Saves a copy of `.env` to `<root>/etc/free-url-backups/<project>.env`, outside the project so its secrets cannot be committed to git by accident.
2. Changes only the `APP_URL` line to the project's `localhost` address.
3. Records the change in `etc/free-url-changes.json`.

On return to Full, NexDB restores `APP_URL` only where it still equals the value NexDB wrote, so later hand edits are kept.

## 9. Interface

The approved mockup is the reference: `Everything is stopped` status line, Apache and MySQL status cards, a PHP version dropdown, an upgrade notice, and five buttons. It follows Laragon's simplicity, but uses NexDB's own colors, type, logo and Nex rather than copying Laragon's look.

- **New `FreeShell`** in `app/src/free/`. `App.tsx` renders `Shell` when the license works and `FreeShell` otherwise. `LicenseGate` stops being a wall and opens as a closable screen from **Sign in** or **I have a key**.
- **Sign in:** Free needs no account, but the Free window always shows **Sign in** in its title bar for people who already have one. It uses the existing email and password flow. A working license unlocks the full app immediately. If that license is on another computer, NexDB asks before moving it and shows the moves left. If the account has no working license, the user stays in Free with a plain message.
- **Buttons:** Start All / Stop All, Web, Database, Terminal, Folder. Web and Database are disabled with a plain reason until servers run.
- **Database** opens phpMyAdmin. If phpMyAdmin is missing, it offers **Install phpMyAdmin**.
- **Status:** every action shows progress and a plain result. Raw logs appear only behind "Show details".
- **PHP dropdown:** installed versions plus **Add another version**, which shows the steps for the current platform.
- **Settings in Free:** theme, ports, start with computer, start services on launch, PHP settings, app updates, license, uninstall.
- **Upgrade notice:** one small message in the window, never a popup. Closing it hides it for 7 days. It is hidden while a task is running.
- **What you get screen:** the Free vs Full comparison, prices from `license_plans`, and **Start 14-day free trial**, **See plans**, **I have a key**, **Back**. If this computer already used its trial, the trial button is replaced by **See plans**. The screen states that the trial does not include NexHost or public links.
- **Correction to the mockup:** the comparison row becomes "Add PHP and Node versions", with MySQL excluded, and the notice says "Try `.test` sites, templates and one-click versions free for 14 days."
- **Setup:** with no working license, setup shows the fixed list of what it will install, with no version pickers and no nginx option. phpMyAdmin is installed automatically as part of setup. If only that step fails, setup still finishes, and the Database button offers a retry. A computer that already has a working license keeps the current version pickers.

**Nex tour.** A short practice-mode tour for Free, with dummy data and nothing changed on the computer, covers Start All, Web, Database, Terminal, Folder, PHP versions, and What you get. Add a `0.6.3` chapter to `whatsNew.ts`. Add `?license=free` to the browser preview.

## 10. Trial and website

Add to the website:

- Migration: `plans.is_trial` boolean, and a `trial_claims` table with a unique `machine_hash`, `license_id`, and timestamps.
- A hidden plan: `Free trial · 14 days`, `is_trial = true`, `is_active = false`, no direct price, no features.
- `POST /api/v1/licenses/trial` accepts `machine_id` (64 hex characters) and `app_version` only. It accepts no name, email, or device name.
- `LicenseToken` payload gains `trial`.
- `/api/v1/plans?current=` never lists the trial plan as renewable.
- Home page: a Free card and "14-day free trial" wording.

Endpoint rules:

1. Hash the machine ID with `LicenseDevice::hashMachine`.
2. If this computer has a trial claim and that trial still works, return the same key and a new token. A reinstall does not restart the 14 days.
3. If its trial ended or was revoked, answer `409 trial_used` with a plain message.
4. If this computer ever held any other license, answer `409 trial_used`.
5. Otherwise, in one transaction, create the license (`duration_days = 14`, activated now), a device row with **no name and no IP**, and the claim. A duplicate-claim race falls back to rule 2.
6. Limit to 30 new trials per hour per IP, so a school lab behind one address still works.

The app adds `license::start_trial()` and `license_start_trial`, using the existing `accept` path. A trial user who buys a key goes through the normal activation form, because a trial has no account for `license::change` to use.

The machine ID comes from the client, so a modified app could fake new computers. This is accepted for a 14-day trial with no NexHost.

## 11. Testing

- **Rust unit tests:** mode for every license state; trial has no grace; Free list names real commands; Free denies an unlisted command; `start_services` filter; `version_use` guard; Free and Full site configs; paused-site map; `APP_URL` change and safe restore; version-folder checks.
- **Website feature tests:** first trial, repeat while active, repeat after ending, prior license, rate limit, no personal data stored, trial absent from `/plans`.
- **Windows, real app:** fresh install to Free; site on `localhost`; phpMyAdmin; Terminal; add PHP by hand; trial start; trial end to Free; paid key to Full; expired paid user with `.test` sites to Free and back with all data intact; app update in Free.
- **Mac, real machine:** the same core path, plus **Choose PHP**.

## 12. Delivery

Target version `0.6.3`. Use the `nexdb-release` skill. The website must ship the trial endpoint before the app that calls it. The owner does the public upload and approves each push to `main`.

## 13. Left to the builder

Component file layout inside `app/src/free/`, exact plain-language wording within the rules above, the nginx syntax for the catch-all, and task order, as long as no release exposes Free before the backend lock is in place.

## 14. Open items for the owner

- The giveaway plan is 7 days in code while marketing rules say 14-day. This design leaves giveaways unchanged.
- The trial stores a hashed computer ID. The missing Privacy page should cover it before launch.
