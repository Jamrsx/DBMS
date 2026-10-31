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

### 0.2.6: Project details

- A page per project: its URL, folder, database, PHP version, Git branch and status.
- Buttons: open in VS Code, open folder, open terminal here, open in browser.
- Rename and delete a project (delete moves the folder to the Recycle Bin and asks about the
  database).

### 0.2.7: Per-project PHP version

- Several PHP versions installed side by side, each with its own FastCGI process.
- Each project picks its PHP version; the default stays the global one.
- The terminal tab for a project uses that project's PHP.

### 0.2.8: Database page, part 2

- Edit, add and delete rows in Browse, with a confirm step for deletes.
- MySQL users: create, change password, grant access to a database, remove.
- Export a table or a query result as CSV.

### 0.2.9: Mail catcher

- A local SMTP server that catches every email PHP sends, so nothing reaches real inboxes.
- A Mail page to read caught emails (HTML and plain text) and clear them.
- `php.ini` points `sendmail_path` at it automatically.

### 0.3.0: More services

- Optional components on the Versions page: Redis, PostgreSQL, nginx (as an Apache alternative).
- Each one gets start/stop on the dashboard, logs, ports in Settings and a plain-language log view.
- Python (with pip) for the terminal.

### 0.3.1: Share a site

- Open a project on your phone on the same Wi-Fi (LAN address with a QR code).
- Optional public link through a tunnel service the user chooses and signs in to themselves.

### 0.3.2: Health and diagnostics

- A "Check my setup" page: ports, trust store, PATH, firewall, disk space, broken configs, each
  with a plain fix button.
- Export a support report (configs and logs, passwords removed) as one `.zip`.

### 0.3.3: Polish and accessibility

- Full keyboard use and screen reader pass on every page.
- Remember window size, last page, terminal tabs and their names between launches.
- First-run tour for new users.

## Toward 1.0.0

Before calling it 1.0.0:

- Code-signing certificate so Windows SmartScreen stops showing "Unknown publisher".
- Uninstaller that offers to keep or remove `C:\NexDB` (projects and databases).
- Migration from an older install folder and from Laragon/XAMPP projects (copy, never move).
- A short user guide and a changelog page inside the app.
- Every feature covered by a real test, and a clean install tested on a fresh Windows PC.

## Ideas, not scheduled

- Node version per project (`.nvmrc`).
- Cron-like scheduled tasks per project (for Laravel's scheduler).
- Queue worker manager (Laravel queues).
- Plugins or custom services defined by the user.
- macOS or Linux version.
