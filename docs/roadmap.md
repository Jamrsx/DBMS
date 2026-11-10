# NexDB roadmap

What NexDB has, what comes next, and in what order. Each release ships one theme through the
in-app updater (see [releasing.md](releasing.md)).

Version numbers go up by one in the last digit, and a 9 rolls over: 0.2.9 → 0.3.0, 0.9.9 → 1.0.0.
The version numbers below are planned and move if a release is split or merged.

Rules every release follows:

- **Standalone.** NexDB uses only its own PHP, Apache, MySQL, Node, Composer and Git, never Laragon,
  XAMPP or anything else on the PC.
- **Plain language.** Messages, logs and errors say what happened and what to do, in words a user
  understands. Technical detail stays one click away.
- **Safe by default.** Nothing that deletes or replaces data happens without a clear warning, and
  data changes offer a backup first.
- **Tested for real.** Each feature gets an ignored `real_*` test that runs against `C:\NexDB`,
  plus a check of the installed `.exe` before release.

## Done

| Version | What shipped |
|---|---|
| 0.1.0 | Setup wizard; standalone PHP, Apache, MySQL, Node, Composer; dashboard with start/stop and logs; tray icon; start with Windows; Projects with `<name>.test` sites; terminal; database manager; phpMyAdmin with the NexDB theme |
| 0.2.0 | Git in setup and the terminal; Versions page (install, switch, remove); Settings with ports and in-app updates; logs in plain language; missing-part warnings with one-click reinstall; branded installer |
| 0.2.1 | Database backups: back up one or all, restore, import a `.sql` file, backups folder |
| 0.2.2 | Terminal tabs: several terminals at once, renamable, with keyboard shortcuts |
| 0.2.3 | New look (one floating work surface, a services list, softer colours); update notice in the sidebar; HTTPS for localhost and `.test` sites; centred window |
| 0.2.4 | Backup before risky changes; automatic backups; terminal window, clickable links, copy and paste |
| 0.2.5 | Quick-start projects (Laravel, WordPress, Vite, Next.js) with their own database and user |
| 0.2.6 | New project wizard and guide; Laravel 13 kits; Laravel Boost; open in editor; PHP 8.5 fix |
| 0.2.7 | Project details page; PHP version per project; rename; delete to the Recycle Bin |
| 0.2.8 | Nex the mascot; Details button; Recycle Bin page with restore; safer deletes |
| 0.2.9 | Nex comes alive: greetings, celebrations and heads-ups from the corner |
| 0.3.0 | Database part 2: edit, add and delete rows; MySQL users; CSV export |
| 0.3.1 | Clearer Database page; SQL templates; WHERE safety check; .sql export and import |
| 0.3.2 | Mail catcher (Mailpit) and Redis; table columns beside the SQL editor; What's new in Settings |
| 0.3.3 | Dashboard grouped into Web, Database and Extras; setup guides for the mail catcher and Redis |
| 0.3.4 | PostgreSQL service; Python with pip; switch between Apache and nginx |
| 0.3.5 | Share a project on the Wi-Fi with a QR code; public links through Cloudflare quick tunnels |
| 0.3.6 | Site folder per project; share a running dev server; public links serve https pages correctly |
| 0.3.7 | Grouped Dashboard; project page tabs; dev servers on IPv6 localhost; public links for dev servers |
| 0.3.8 | Set up cloned projects: composer and npm install, .env with a database user, app key |
| 0.3.9 | Whole app on one link (front end + Laravel API); Laravel tab with artisan buttons, queue worker, scheduler and readable log; import from Laragon, XAMPP, WAMP and other database servers |
| 0.4.0 | Check my setup page with fixes and a support report; clearer Share tab; spinners and progress beside every button; setup and Composer use the project's PHP |
| 0.4.1 | Background tasks with a sidebar Tasks list; PHP extensions, limits and your own php.ini lines per version; PostgreSQL on the Database page; fix for a damaged PostgreSQL data folder |
| 0.4.2 | Redesign: one main action per row and page with the rest behind ⋯, simpler Dashboard rows and log, project rows and page header with two buttons |
| 0.4.3 | Tray menu with each service and project; Ctrl+K command palette; Windows notifications when a service stops by itself or an automatic backup fails |
| 0.4.4 | Clone from Git: paste an address, NexDB clones it with live progress and sets it up (packages, .env, app key) in one go |
| 0.4.5 | Connect a database to a project (.env or wp-config.php, own user or root, used-by both ways); remembers window, page and terminal tabs; Ctrl+1–7, skip link, focus on page titles; first-run tour |
| 0.4.6 | Nex's guided tutorial (spotlight, try-it steps, replay by chapter); Help page with search and Show me; setup picks up a NexDB folder from before, fixing paths when it moved; uninstaller asks to keep or delete the NexDB folder |
| 0.4.7 | .env editor with secrets hidden; Node version per project from .nvmrc; visual table designer; SQL history and saved queries; MariaDB and MongoDB services; password-protected public links; Nex's what's-new walkthrough in practice mode (sample data) |
| 0.4.8 | Walkthrough fixes: scrolls to each step, wheel scrolls during it, bubble never covers the button to click; offers walkthroughs missed when skipping versions |
| 0.4.9 | Relationship diagram in its own window (drag, zoom, list view); compare two databases; automatic backups copied to another drive or USB; restore a backup as a new database |
| 0.5.0 | Nex organizes the diagram (wizard hat, sparkles, undo); build tables and links in the diagram; in-app mail inbox; memory and CPU per service; Memcached; .local names on the Wi-Fi; fixed public links with ngrok or Cloudflare |
| 0.5.1 | Settings in six parts; Mail page in the sidebar with a new-email count; skipped updates install on the next launch; Nex and the practice banner never cover what's explained (with an automated check at three window sizes); no sample update notice in practice |
| 0.5.2 | Welcome screen after setup (blue flash, Nex says hello, the tour starts); Start all side by side; Performance page; clearer service details; Docker containers on the Dashboard; team setup file; services of your own; Link two tables dialog fits its window and Nex stays off its text; walkthrough check runs at ~1100 x 780 and after changing choices |
| 0.5.3 | Editors opened from NexDB use the project's PHP (.vscode/settings.json, kept up to date); Check my setup lets you pick which PHP other terminals use from every PHP on the PC |
| 0.5.4 | License: key screen after setup and on every start until activated (can't be skipped); activate once online, then offline with a server-signed, Windows-encrypted hidden license; quiet check-ins (at least every 30 days); clock-rollback guard; one PC at a time with moves; Settings → License |
| 0.5.5 | NexHost (4-year plan): sites in C:\NexDB\nexhost on 127.0.0.1:8201-8219, file manager with zip unpack, a database and user per site, Go live through the user's own Cloudflare (own domain) or ngrok (no domain) via a host router on 8899; Public link and Fixed link moved to the 4-year plan |

## Next

### 0.2.3: New look, update notices, and HTTPS for `.test` sites

New look for the desktop app: sleek, modern and clean.

- One design pass over every page (Dashboard, Projects, Database, Terminal, Versions, Settings,
  setup wizard), written down in `DESIGN.md` so later pages follow it.
- Calmer surfaces: fewer borders and boxes, more space, one clear accent, soft colours that are
  easy on the eyes in dark and light mode (no bright white, no harsh highlights).
- Clear type hierarchy, consistent spacing and buttons, smooth but quick motion.
- Sidebar and page headers tidied; status (running, stopped, error) readable at a glance.
- Same features and wording; nothing moves without a reason. Checked by screenshots of each page in
  both themes before and after.

Updates you notice:

- NexDB checks for a new version on launch and every few hours, quietly.
- When one is found, a dot on Settings in the sidebar and a small notice: "NexDB 0.x.y is ready.
  Update now or later?", with what's new. "Later" hides it until the next version or launch.
- The NexDB window opens in the centre of the screen.
- The Apache log no longer shows NexDB's own updater request as a red error (it reaches Apache on
  port 80 for a moment while NexDB closes to install the update; it is harmless).

HTTPS for `.test` sites:

- NexDB makes its own local certificate authority once and adds it to the Windows trust store,
  with a plain explanation and the Windows prompt.
- Each project gets a certificate; Apache serves `https://<name>.test` alongside http.
- Projects page: an "Open with HTTPS" link and a per-project "Always use HTTPS" switch.
- Settings: remove the certificate authority from Windows (clean uninstall).
- Real test: `https://<name>.test` answers with a certificate Windows trusts.

### 0.2.4: Back up before risky changes, and a better terminal

- Switching or updating MySQL offers "Back up all databases first" (checked by default).
- Deleting a database in the Database page offers a backup first.
- Scheduled backups in Settings: off, daily or weekly, keeping the last N.
- Terminal: open it in its own resizable window; links (like `php artisan serve`'s address)
  are clickable; Ctrl+C copies a selection (and only stops the command when nothing is
  selected), Ctrl+V pastes.
- PHP warnings in the terminal print once instead of twice.

### 0.2.5: Quick-start projects

- "New project" choices: Empty, PHP, HTML, Laravel, Laravel + React or Vue (Inertia starter
  kits), WordPress, React or Vue (Vite), Next.js.
- NexDB creates the folder, downloads the starter, creates a matching database with its own MySQL
  user (the root password is never written into the project), fills in `.env` or
  `wp-config.php`, and opens `<name>.test` when it is ready.
- Progress in plain steps ("Downloading Laravel…", "Creating the database…"), with the raw output
  one click away.
- Fixes: updates are checked automatically (hourly, also from the tray and when the window opens);
  the terminal window no longer freezes; the open database in the Database page folds away on a
  second click.

### 0.2.6: Better new projects, and project actions

- New project as a three-step wizard: what to make (cards), options, then progress and a
  getting-started guide with the commands for that starter and Copy buttons.
- Latest templates: Laravel 13 and the current React, Vue and Livewire starter kits (from their
  latest code, as `laravel new` does), plus an option to set up Laravel Boost for AI coding
  assistants.
- Choose the database name (defaults to the project name).
- Real progress: Composer package count and download percentage; clean log without colour codes.
- Open a project in the code editors installed on the PC (VS Code, Cursor, Windsurf, Zed,
  PhpStorm, WebStorm, Sublime Text, Notepad++), or in a terminal window at its folder.
- "Deprecated" warnings on PHP 8.5: projects using the old `PDO::MYSQL_ATTR_*` names get a
  plain explanation and a one-click Fix; new Laravel projects are fixed automatically.
- `.test` addresses explained in plain words.

### 0.2.7: Project details and per-project PHP

- A page per project: its URL, folder, database, PHP version, Git branch and status.
- Rename and delete a project (delete moves the folder to the Recycle Bin and asks about the
  database).

Per-project PHP version (same release):

- Several PHP versions installed side by side, each with its own FastCGI process.
- Each project picks its PHP version; the default stays the global one.
- The terminal tab for a project uses that project's PHP.

### 0.2.8: Nex, Recycle Bin, and safer deletes

- Nex, the NexDB mascot, in the setup welcome, empty lists, the log, project progress and errors
  (one 17 KB animated drawing; motion stops when Windows reduces motion).
- Projects get a Details button instead of a clickable name.
- Recycle Bin page: projects deleted from the projects folder, with Restore.
- Deleting a project always finishes once the folder is in the bin and goes back to the list;
  a database that couldn't be deleted is a warning, not an error.

### 0.2.9: Nex comes alive

- Nex peeks from the bottom-right corner with a speech bubble: a hello when NexDB opens (at most
  every 6 hours) and in the Terminal, a celebration for every success (project made, backup,
  restore, fix, everything started, update installed, HTTPS trusted, version installed), and a
  heads-up when something fails.
- Nex in the Terminal header follows the open tab (starting, ready, ended), in the Settings
  updates card (checking, up to date, new version), and big beside new-project progress.

### 0.3.0: Database page, part 2

- Edit, add and delete rows in Browse, with a confirm step for deletes.
- MySQL users: create, change password, grant access to a database, remove.
- Export a table or a query result as CSV.

Mail catcher (with 0.3.2's services):

- A local SMTP server that catches every email PHP sends, so nothing reaches real inboxes.
- A Mail page to read caught emails (HTML and plain text) and clear them.
- `php.ini` points `sendmail_path` at it automatically.

### 0.3.1: A clearer Database page, and SQL templates

- SQL tab: one-click ready-made commands (show, find, search, count, add, change, delete rows; make,
  change, index, empty and delete tables; databases), filled in with the table and its real columns,
  each explained in plain words. Risky ones are marked and keep a WHERE line.
- Running an UPDATE or DELETE without WHERE asks first.
- Export a database as a .sql file anywhere (Save dialog) and Import .sql, right on the database
  view and in the page header.
- Users: MySQL's own accounts tucked behind a toggle; each user shows its databases with a small
  "+ Database", a password key and a delete button.
- Add row: every field the same shape, types in plain words, Now for dates, a list for enum
  columns, a tip for password columns.
- Sidebar: MySQL's built-in databases fold away; table counts are labelled. Browse and Structure
  tabs always open and say what to pick.

### 0.3.2: Mail catcher, Redis, and a smarter SQL tab

- Mail catcher (Mailpit) on the Versions page under Extra services: PHP's `mail()` and new Laravel
  projects send to it, and the Dashboard has an Open inbox button.
- Redis under Extra services, started and stopped from the Dashboard like the others.
- SQL tab: the selected table's columns (or the database's tables) beside the editor; click to insert.
- Settings → What's new: what each update brought, in plain words.

### 0.3.3: A tidier Dashboard, and mail setup help

- Services grouped into Web, Database and Extras in one list; buttons stay on one line.
- Open inbox and "Use it in your project" sit under the service's name.
- Setup guides with copyable settings: mail catcher (Laravel, plain PHP, WordPress, PHPMailer,
  Symfony, Node.js) and Redis (Laravel with Predis, plain PHP, Node.js).

### 0.3.4: PostgreSQL, Python and nginx

- PostgreSQL (EnterpriseDB's binaries) under Extra services: initdb on install (user `postgres`,
  local only), start/stop and logs on the Dashboard, clean stop through pg_ctl, `psql` on the
  Terminal PATH and a setup guide. PHP's pdo_pgsql is turned on when libpq.dll is there.
- Python (python.org's NuGet package, pip included) under Tools, with `pip` on the Terminal PATH.
- Settings → Web server: Apache or nginx. nginx gets the same .test sites (Laravel URLs through
  try_files), phpMyAdmin, HTTPS and PHP per project.
- Later: PostgreSQL in the Database page.

### 0.3.5: Share a site

- Each shared project gets its own port (8181 to 8199) on Apache or nginx, so a phone on the same
  Wi-Fi opens it at the PC's address; the Share panel shows the address and a QR code.
- One Windows Firewall rule for those ports, private networks only, added with one approval.
  A Wi-Fi Windows calls public gets a plain explanation instead.
- Public link through Cloudflare's quick tunnels (no account, link changes each time), with a
  clear warning; it ends when sharing stops or NexDB closes.
- Later: named tunnels for users who sign in to their own Cloudflare or ngrok account.

### 0.3.6: Site folders and dev servers

- Site folder per project, for monorepos that keep the website in a subfolder (`Backend/public`,
  `web/dist`); NexDB suggests the folders that look like a site.
- Share a running dev server (Vite, Next.js, Nuxt, Angular) through a share port, websockets
  included, with the Host header the dev server's host check expects.
- Public links: the share site tells PHP when the visitor used https (X-Forwarded-Proto), so
  Laravel links its assets with https instead of being blocked as mixed content.

### 0.3.7: Clearer Dashboard and project page

- One scrollbar: the window never scrolls, only its panels.
- Dashboard grouped as Web server, PHP (one row per version, the default marked), Databases and
  Extras, each with how many are running.
- Project page tabs: Overview (facts, site folder, PHP), Share, Rename or delete.
- Dev servers are reached through `localhost`, so Vite and other Node servers that only listen on
  IPv6 `[::1]` open; shared dev servers get their own public link.

### 0.3.8: Set up cloned projects

- The project's Overview lists what a cloned project is missing, in the project folder and one
  level down: PHP packages (vendor), a `.env` (from `.env.example`), the app key, Node packages.
- Set up now runs it with progress: composer install, the `.env` with the database the example
  names (kept when it already exists, made when not) and a MySQL user of its own, key:generate,
  npm install. SQLite projects get their database file.
- Laravel folders aren't offered as dev servers (their Vite only builds assets).

### 0.3.9: One-link share and Laravel tools

- One link for a whole project (Share tab, "Whole app on one link"): `/api`, `/sanctum`,
  `/storage` and `/broadcasting` go to the Laravel backend's public folder, every other page to
  the front end's dev server or its built folder (unknown paths get its `index.html`, for
  client-side routes). Works on the Wi-Fi and as a public link; Apache and nginx.
- Laravel tab per project: migrate, seed, `storage:link` and clear caches with plain-language
  results; its `storage/logs` as entries (newest first, errors only on request, where it
  happened); a queue worker and scheduler started and stopped there, ending with NexDB.
- Import (Projects page): finds Laragon, XAMPP, WAMP and other MySQL, MariaDB or PostgreSQL
  installs, lists their projects and databases, and copies the chosen ones into NexDB. Projects
  are copied with robocopy; databases are dumped with the other server's own tools and loaded
  into NexDB's. When the other MySQL isn't running, or uses NexDB's port, NexDB starts it
  briefly on a spare port with its own program and data, then shuts it down cleanly. A copied
  Laravel app whose database came along gets a MySQL user of its own in its `.env`.

### 0.4.0: Health and diagnostics

- A "Check my setup" page: ports, trust store, PATH, firewall, network type (public or private),
  disk space, broken configs, projects that still need setting up. Each problem gets a plain
  fix button.
- Export a support report (configs and logs, passwords removed) as one `.zip`.
- Shipped as "Check my setup" (sidebar): Services (missing parts, busy ports, failed starts), Sites
  (config test, hosts entries, HTTPS trust), Sharing (network type, firewall), Projects (not set
  up, no site folder) and This PC (disk space, another PHP first on PATH), each with its fix.
- Also: the Share tab as one block per way of sharing with a Shared badge; every button that
  starts work shows a spinner, and progress shows beside it (Share, Versions, project page);
  project setup, Composer and artisan run on the project's own PHP version.

### 0.4.1: Background tasks, PHP extensions and PostgreSQL

- Background tasks: project setup, new projects, downloads, imports and backups keep running when
  you open another page, and their progress is still there when you come back. A tasks button in
  the sidebar shows what is running (with progress) and what just finished or failed.
- PHP settings per version (Versions page and a project's PHP section): turn extensions on or off
  (pdo_pgsql, gd, intl, sodium, zip…) with a short note on what each is for, change common
  settings (memory_limit, upload_max_filesize, post_max_size, max_execution_time), and open
  php.ini in an editor for anything else. PHP restarts after a change; a broken php.ini is
  caught before it is saved.
- PostgreSQL on the Database page: browse, edit rows, SQL with templates, users, export and
  import, as for MySQL.

### 0.4.2: Redesign

- Every page rebuilt to a simpler layout that follows Nielsen's 10 usability heuristics: one
  page header pattern (title, one line of status, one main action), plain sections instead of
  boxes inside boxes, consistent buttons and spacing, and feedback where you act. Same colours,
  type and Nex.

### 0.4.3: Tray menu and command palette

- Tray menu: start or stop services, open a project, open its terminal.
- Ctrl+K: jump to any project, database, table or action.
- Notifications when a service stops unexpectedly or a backup fails.

### 0.4.4: Clone from Git

- Clone a Git repository as a new project, then set it up in one go.

### 0.4.5: Connect databases to projects, polish and accessibility

- Use a database in a project: after making a database (or later, from the Database page or a
  project's Overview), pick the project that uses it. NexDB makes a user of its own for it and
  writes the connection into the project: `.env` for Laravel (DB_CONNECTION, DB_HOST, DB_PORT,
  DB_DATABASE, DB_USERNAME, DB_PASSWORD), `wp-config.php` for WordPress, the chosen folder for
  projects split into folders (Backend), MySQL or PostgreSQL. The old file is kept as
  `.env.backup`, Laravel's caches are cleared, and plain PHP apps get the values to copy.
- Each database shows which project uses it, and each project which database, with Change.
- Full keyboard use and screen reader pass on every page.
- Remember window size, last page, terminal tabs and their names between launches.
- First-run tour for new users.

### 0.4.6: Nex shows you around, and 1.0 groundwork

- Guided tutorial, like a game's: Nex walks onto the screen beside each thing it explains,
  dims the rest, and waits for you to try it (start a service, make a project, make a database
  and connect it, open the terminal, Ctrl+K). From start to finish, skippable, and each chapter
  can be replayed.
- Uninstaller that offers to keep or remove `C:\NexDB` (projects and databases).
- Migration from an older install folder.
- A short user guide inside the app.

### 0.4.7: Projects, database and sharing extras

- Node version per project (`.nvmrc`).
- `.env` editor with secrets hidden.
- Visual table designer (columns and indexes without SQL).
- Query history and saved queries.
- MariaDB and MongoDB as extra services.
- Password-protected share links.

### 0.4.9: Database tools

- Relationship diagram from foreign keys, in its own window, so there's no need to open
  phpMyAdmin or another panel for it.
- Compare two databases (tables, columns and indexes that differ).
- Scheduled backups to another folder or a USB drive.
- Restore a backup into a new database, leaving the original as it is.

### 0.5.0: Services and sharing

- Memcached as an extra service.
- Read caught emails (Mailpit) inside NexDB.
- Memory and CPU use per service on the Dashboard.
- Links that stay the same, with your own Cloudflare or ngrok account.
- A fixed `.local` name on the Wi-Fi (mDNS), instead of an IP address.
- Build in the relationship diagram: make a new table right in the diagram, and drag from a
  column to another table's key to create a foreign key (link). NexDB shows the SQL first and
  asks before changing anything; no typing SQL needed.
- "Nex, organize this": a much smarter Tidy up. Nex reads how the tables connect and lays them
  out for you: the most-linked tables in the middle, related tables close together, as few
  crossing lines as possible, no boxes on top of each other, and tables with no links grouped
  apart.
- Nex in a wizard hat: a new animation when he organizes the diagram, and in the 0.5.0 walkthrough.

### 0.5.1: A cleaner Settings page, mail in the sidebar, updates on next launch

- Settings page reorganized: grouped into clear sections, shorter, easier to scan, following
  Nielsen's heuristics; Nex walks through the new layout in practice mode.
- Mail (the caught-emails inbox) gets its own place in the sidebar, with the new-email count.
- If an update is found and the user closes NexDB without installing it, NexDB installs it the
  next time it opens, so nobody stays on an old version.
- Practice mode and walkthroughs never cover what they point at:
  - The practice banner moves out of the way of dialogs and page headers. It was hiding the inbox's
    buttons and page titles.
  - Nex and his speech bubble sit beside the highlighted part, never on its buttons. He was covering
    "Make the link" and "Install Memcached".
  - An automated check runs every walkthrough step at common window sizes. It fails if the banner,
    Nex or his bubble covers the highlighted part or any button or text in it.
- Practice mode shows no update notice. It was showing a sample "NexDB 0.2.0 is ready".

### 0.5.2: Teams and your own services

Fixes first, from the "Link two tables" walkthrough step (in a ~1100 px wide window):

- The Link two tables dialog keeps everything inside it. The type warning and the SQL line ran
  past its right edge, and Cancel and "Make the link" were cut off. Long text now wraps, the SQL
  scrolls inside its box, and the buttons always stay in view.
- Nex never sits on the dialog's text. When there's no room beside a big dialog, he shrinks to a
  small bubble without the avatar, or waits beside it in the dim area, instead of covering the
  warning.
- The walkthrough check also:
  - runs at a ~1100 × 780 window;
  - repeats each step after changing its choices, since the warning only appears then;
  - fails when anything spills outside the highlighted dialog or a button is cut off.

Dashboard:

- Start all is quicker. It took about a minute before anything showed Running, and every row said
  "Starting…" even when that service was already up.
  - Services that don't depend on each other start at the same time.
  - Each row turns Running as soon as its own service is up.
  - Real test: time Start all before and after.
- Each service's details line (port, uptime, memory, CPU) is easier to read. It is split into
  small labelled parts, with a little CPU bar, instead of one faint line of text.
- A Performance page in the sidebar shows the overall usage:
  - the total memory and CPU of NexDB's services, next to the whole PC's;
  - a short history graph for the last minutes;
  - which service uses the most.
  - Nex shows it in the 0.5.2 walkthrough.

New:

- Docker containers as services.
- Share a project's setup (versions, services, `.env` template) with a team as one file.
- Plugins, or custom services you define yourself.

## Toward 1.0.0

Before calling it 1.0.0:

- Code-signing certificate so Windows SmartScreen stops showing "Unknown publisher" (later: no budget for it yet).
- Every feature covered by a real test, and a clean install tested on a fresh Windows PC.

## Ideas, not scheduled

- macOS or Linux version.
