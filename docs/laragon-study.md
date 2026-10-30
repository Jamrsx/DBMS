# Laragon study and plan for our local dev environment manager

Studied from a local Laragon Full 6.0 (build 220916) install at `C:\laragon`, read-only.
This document describes observed behaviour and file formats, not Laragon's code.
Our app is an independent implementation with its own name and branding.

## 1. How Laragon works

Laragon is a single portable Windows app (`laragon.exe`, ~2 MB) plus a folder of
unmodified upstream binaries. Almost everything it does is: pick a version folder,
render a config from a template, start or stop a process, and edit the hosts file.

### Folder layout

| Folder | Role |
| --- | --- |
| `bin/<tool>/<version>/` | Unmodified upstream runtimes side by side: `php/php-8.3.20-Win32-vs16-x64`, `nodejs/node-v24.15.0`, `mysql/mysql-8.0.30-winx64`, `apache`, `nginx`, `redis`, `memcached`, `python`, plus bundled apps (HeidiSQL, Cmder, Git, Notepad++, Composer, ngrok, mailcatcher/sendmail, Cronical). |
| `bin/laragon/tpl/` | Built-in templates (`*.manifest.tpl`) for vhosts, nginx servers, SSL, `my.ini`, `mongod.conf`, Procfile. |
| `usr/` | User-owned overrides: `laragon.ini` (settings + selected versions), `tpl/` (user copies of templates), `packages.conf` (Quick add download list), `sites.conf` (Quick app recipes), `Procfile` (custom background processes), `user.cmd` (terminal startup). |
| `etc/` | **Generated** server config: `apache2/sites-enabled/auto.<name>.test.conf`, `apache2/mod_php.conf`, `apache2/alias/*.conf` (phpMyAdmin, Adminer...), `nginx/sites-enabled`, `nginx/php_upstream.conf`, `ssl/`. |
| `data/<engine>/` | Database data dirs, e.g. `data/mysql-8`. Selected via `DataDir`. |
| `www/` | Document root. Every sub-folder becomes a site. |
| `tmp/` | Temp, sessions, logs. |

### Settings and version selection

`usr/laragon.ini` is an INI file with one section per service:

```ini
[php]
Version=php-8.3.20-Win32-vs16-x64      ; folder name under bin/php
QuickSettings=xdebug, max_execution_time, upload_max_filesize, post_max_size, memory_limit
[apache]
Version=Apache24
Use=-1                                 ; -1 = enabled
DocumentRoot=C:\laragon\www
[nginx]
Upstream=2                             ; number of php-cgi workers
[preferences]
AutoVirtualHosts=-1
RunAtStartup=-1
```

Switching a version = changing `Version=` and regenerating the dependent config.
Example: switching PHP rewrites `etc/apache2/mod_php.conf`:

```apache
LoadModule php_module "C:/laragon/bin/php/<version>/php8apache2_4.dll"
PHPIniDir "C:/laragon/bin/php/<version>"
```

Apache's own `httpd.conf` is patched once to pull in the generated files:

```apache
IncludeOptional "C:/laragon/etc/apache2/alias/*.conf"
IncludeOptional "C:/laragon/etc/apache2/sites-enabled/*.conf"
Include "C:/laragon/etc/apache2/httpd-ssl.conf"
Include "C:/laragon/etc/apache2/mod_php.conf"
```

### Auto virtual hosts ("pretty URLs")

For each folder in `www/` Laragon:

1. Renders `VirtualHost.tpl` with `<<PORT>>`, `<<PROJECT_DIR>>`, `<<HOSTNAME>>` into
   `etc/apache2/sites-enabled/auto.<name>.test.conf` (and an nginx equivalent).
2. Detects the framework's web root: Laravel projects get `<project>/public`.
3. Adds `127.0.0.1  <name>.test  #laragon magic!` to `C:\Windows\System32\drivers\etc\hosts`
   (needs admin elevation each time).
4. Reloads the web server.

### PHP extensions and quick settings

Extensions are toggled by commenting/uncommenting `extension=` lines in the active
version's own `php.ini`. Only DLLs already in that version's `ext/` folder can be enabled;
there is no PECL download. "Quick settings" edit a handful of `php.ini` values.

### Quick app, Quick add, Procfile

- **Quick app** (`sites.conf`): a name → recipe list, either an archive URL
  (WordPress tarball) or a command (`composer create-project laravel/laravel %s`).
  `AutoCreateDatabase=true` also creates a matching MySQL database.
- **Quick add** (`packages.conf`): `name=url` lines; downloads and extracts into `bin/`.
  `*` marks items shown by default.
- **Procfile**: `Name: autorun COMMAND env_file=... pwd=... VAR=value` lines that run
  custom background processes when Laragon starts.

### Process control

Services run as child processes (not Windows services). Laragon ships
`SendSignal.exe` / `SendSignalCtrlC.exe` to stop console processes cleanly.
`Start All` launches every service with `Use=-1`.

## 2. Weaknesses we can fix

| Area | Laragon today (observed) | Our improvement |
| --- | --- | --- |
| PHP version | One global PHP for every site (Apache `mod_php`). | **Per-site PHP version** via FastCGI: each PHP version runs its own `php-cgi` pool on its own port; each vhost points at the one it needs. |
| Node version | One global Node. | Per-project Node, read from `.nvmrc` / `package.json#engines`, exposed in our terminal and Procfile processes. |
| PHP extensions | Only toggles DLLs that already ship with PHP. | Catalog + **one-click PECL installs** (xdebug, redis, imagick, mongodb...) matched to PHP version, thread safety (TS/NTS) and compiler (vs16/vs17). |
| Downloads | Hand-edited `packages.conf` with stale URLs (phpMyAdmin 5.2.0, Go 1.19, MySQL 5.7). | Versioned **package catalog** (JSON, hosted in our repo), checksums verified, background update checks. |
| Hosts file | UAC prompt on every site change. | A small elevated helper installed once (or a local `*.test` DNS resolver), so site changes need no prompts. |
| HTTPS | Per-site self-signed certs, enabled globally. | Local CA trusted once; per-site certs issued automatically; HTTPS on by default. |
| Stale config | `fcgid.conf` still references a PHP 5.6 folder that doesn't exist. | Config is always fully regenerated from state; validation before reload (`httpd -t`, `nginx -t`). |
| Ports | Silent failures when 80/3306 are taken. | Port-conflict detection naming the owning process, with a one-click alternative port. |
| Visibility | Little feedback ("nothing" in the log). | Live service status, per-service log viewer, health checks, resource usage. |
| Bundled versions | Apache 2.4.54, MySQL 8.0.30, nginx 1.22 (2022). | Current versions through the catalog; several versions installed side by side. |
| Databases | MySQL only by default; others manual. | MySQL, MariaDB, PostgreSQL, Redis, MongoDB, Memcached as first-class services, plus a built-in DB browser, backups and import/export. |
| Mail | sendmail + mailcatcher binaries. | Built-in SMTP catcher with a web inbox (like Mailpit). |
| Sharing | ngrok binary. | One-click share via ngrok or Cloudflare Tunnel (both already on this PC). |
| Config portability | Absolute `C:/laragon/...` paths in generated files. | Paths resolved at render time, so the whole install can move folders. |

## 3. Feature parity checklist (from Laragon's menu)

- **Laragon**: start at login, preferences, language, data dir, root folder.
- **www**: list sites, open in browser/editor/terminal, switch document root.
- **Quick app**: create Blank / WordPress / Laravel / Symfony / CakePHP, auto-create DB.
- **Tools**: Quick add packages, terminal, HeidiSQL/DB tool, Notepad++, Composer, ngrok, Git, Cronical.
- **PHP**: version switch, extensions, `php.ini` quick settings, open `php.ini`.
- **Apache / nginx**: version, enable/disable, SSL, open config, reload, ports.
- **MySQL**: version, start/stop, root password, open `my.ini`, data dir.
- **Node.js / Python**: version switch.
- **Start All / Stop All / Exit**, tray icon with right-click menu.
- Auto virtual hosts (`<name>.test`), Procfile background processes, `user.cmd` startup.

## 4. Proposed architecture

```
┌────────────── Desktop app ──────────────┐
│ UI (web tech)  ←→  Core (backend)       │
│  dashboard,         state.json/toml      │
│  tray menu,         template renderer    │
│  logs, sites        process supervisor   │
│                     package manager      │
└───────────────┬─────────────────────────┘
                │ named pipe / local IPC
        ┌───────▼────────┐
        │ Elevated helper│  hosts file, trusted CA, ports < 1024 checks
        └────────────────┘
```

- **State**: one settings file (selected versions, sites, ports, per-site overrides).
- **Renderer**: templates → `etc/` configs, always regenerated, validated before reload.
- **Supervisor**: starts/stops/restarts processes, captures logs, health checks, Windows Job
  Objects so children die with the app.
- **Package manager**: catalog → download → verify SHA-256 → extract into `bin/<tool>/<version>`.
- **Same folder model** as Laragon (`bin/ etc/ data/ www/ usr/`) so it stays portable.

### Decisions

- **Stack**: Tauri 2. Rust core (supervisor, renderer, package manager, IPC to the helper);
  HTML/TypeScript UI.
- **Name**: working name for now; the final product name is chosen before release.

## 5. First-run setup wizard

Unlike Laragon, which ships with everything pre-bundled, our app starts small and installs
only what the user picks. It must work on a fresh Windows PC with nothing installed.

1. **Welcome**: what the app does; install folder (default `C:\<app>`), `www` folder.
2. **System scan** (read-only, a few seconds):
   - Existing PHP, Node, Apache, nginx, MySQL/MariaDB: `PATH`, Windows services
     (e.g. `MySQL80`), uninstall registry keys, and common stacks (`C:\xampp`, `C:\wamp64`,
     `C:\laragon`).
   - Ports 80, 443 and 3306 already in use, and by which process.
   - Visual C++ 2015-2022 runtime (PHP and Apache Windows builds need it), WebView2, free disk space.
3. **Choose components**: a checklist with recommended defaults.
   - Defaults on: **Apache, PHP, MySQL, Node.js, Composer**, plus a database browser.
   - Optional: nginx, Redis, PostgreSQL, MariaDB, Python, Git, mail catcher.
   - Each item has a version picker with badges: *Recommended*, *LTS*, *Latest*,
     *Security fix*, *End of life*.
   - When the scan found an existing copy: **Install our own copy (recommended)**, which is
     isolated and never touches the system one, or **Use existing**.
4. **MySQL setup**: kept familiar for MySQL users.
   - Version: MySQL LTS (recommended) or the newer Innovation release.
   - `root` user, password (or empty for local dev, with a warning), port `3306`,
     data folder, start with the app.
   - Standard `mysql` / `mysqldump` command-line tools on the app's terminal `PATH`.
5. **Review**: the full list, download size, disk use, and which steps need one admin
   prompt (VC++ runtime, hosts helper, trusting the local HTTPS certificate).
6. **Install**: create folders → Visual C++ runtime if missing (Microsoft-signed installer,
   one admin prompt) → download → verify checksum → extract to `bin/<tool>/<version>` →
   generate and validate configs → initialise MySQL and set the root password → create the
   local CA (limited to `.test`, `localhost` and loopback) and ask Windows to trust it → save
   settings. Every step shows progress; Try again resumes and skips finished work.
   The hosts-file helper is set up with the first site (Sites milestone), not at install time.
7. **Done**: *Start All* and open the dashboard.

MySQL is the default and first-class database engine; the built-in database browser follows
familiar MySQL tool conventions. The app's own settings live in a plain file, not in MySQL,
so the app still works while MySQL is stopped or broken.

## 6. Version checks and update recommendations

### Where version data comes from

The vendors' Windows download pages (windows.php.net, Apache Lounge, dev.mysql.com) block
automated scraping, so the app never scrapes them from users' PCs. Instead:

- **Our catalog** (`catalog.json`, published from our GitHub repo and signed): every
  installable version with download URL, SHA-256, size, VC++ runtime requirement and
  TS/NTS/compiler variant. A scheduled GitHub Action proposes updates from official sources:
  - PHP: the php.net releases API (`/releases/index.php?json`), which tags security releases.
  - Node.js: `nodejs.org/dist/index.json`, which marks `lts` and `security` releases.
  - MySQL: official `mysql/mysql-server` GitHub tags.
  - Apache: Apache Lounge builds, reviewed by a maintainer before publishing.
- **Support dates**: the `endoflife.date` API for PHP, Node.js, MySQL and Apache.

The app checks the catalog on start-up (at most once a day) and on demand.

### Recommendation rules

| Situation | Label | Behaviour |
| --- | --- | --- |
| Security release in the same minor line (e.g. PHP 8.3.20 → 8.3.36 with a `security` tag) | **Recommended update** | Highlighted on the dashboard. |
| Bug-fix release in the same minor line | **Update available** | Safe, one click. |
| New minor or major version (PHP 8.3 → 8.4, MySQL 8.4 → 9.x) | **Optional** | Shows "may need code changes"; never automatic. |
| Installed line is past or within 6 months of end of life | **Plan to upgrade** | Warning with the end-of-life date. |
| Node.js Current (non-LTS) release | **Not recommended for projects** | LTS is suggested instead. |
| Already on the latest in its line | **Up to date** | No action. |

### Safe updates

- New versions install **side by side**; the old one stays, so rollback is one click.
- MySQL upgrades back up the data folder (and `mysqldump` all databases) first, then run the
  upgrade checks before switching.
- Per-site PHP versions keep old projects working when the default PHP moves on.

## 7. Web database manager

A phpMyAdmin-style manager that opens in any browser, built MySQL-first.

- **Served by the Rust core**, not PHP on Apache, so it keeps working when PHP or Apache is
  misconfigured. Bound to `127.0.0.1` only (default `http://localhost:8800`, alias `db.test`);
  login with MySQL credentials.
- **One UI, two places**: the same screens run in the browser and as the *Database* tab
  in the desktop app.
- **Features**: databases, tables, browse/edit rows, SQL editor with history, users and
  privileges, import/export `.sql`, structure editor, server status.
- MariaDB works through the same MySQL protocol; PostgreSQL comes later.

## 8. Design

The UI (wizard, dashboard, tray menu, logs) is designed with the
[Impeccable](https://impeccable.style) Claude Code plugin.

## 9. Milestones

1. **Core + setup wizard**: settings, folder layout, system scan, catalog download/verify/extract,
   process supervisor, Apache + PHP (FastCGI) + MySQL + Node, Start/Stop All, tray.
2. **Sites**: auto vhosts for `www/`, framework web-root detection, hosts helper, local HTTPS.
3. **Versions and updates**: install/switch PHP, Node, MySQL, Apache, nginx; per-site PHP;
   update checks and recommendations; catalog GitHub Action.
4. **PHP extensions**: toggle + PECL install; quick `php.ini` settings.
5. **Web database manager** (MySQL first).
6. **Quick app + Procfile + terminal.**
7. **Extras**: Redis, PostgreSQL, MariaDB, mail catcher, sharing tunnels, backups.
