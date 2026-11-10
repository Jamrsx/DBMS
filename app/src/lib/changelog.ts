/** What each NexDB version brought, newest first, in plain words. Shown in Settings → What's new. */
export interface Release {
  version: string;
  title: string;
  changes: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: "0.5.4",
    title: "Your NexDB license",
    changes: [
      "NexDB asks for a license key after setup, before the welcome, and on every start until this PC has one. It can't be skipped.",
      "Activate once with the internet: type the key, your full name and email. After that NexDB works offline.",
      "The license is signed by the NexDB server, so it can't be edited, and kept encrypted by Windows in a hidden file, so it can't be copied to another PC. Turning the PC's clock back doesn't stretch it.",
      "NexDB checks the license quietly whenever you're online, and needs to at least once every 30 days.",
      "One PC at a time: activating on another PC offers to move the key there, up to 10 times a month. Settings → License shows your plan and end date, and Move to another PC frees it.",
      "Starting services, from the app or the tray, needs an active license.",
      "Setup and Versions now ask the official release sites which versions exist today, so you're offered what can actually be downloaded. Without internet, the list that came with NexDB is used.",
      "If a site takes a version down while you install (Apache did, for 2.4.69), Nex explains what happened and offers the versions it has today, instead of a checksum error. Apache 2.4.70 replaces 2.4.69.",
      "Switching between light and dark now fades gently instead of flashing.",
      "Your NexDB account: activating asks for a password too. On another PC, choose Sign in and use your email and password; Settings → License → Sign out of this PC frees it first. Can't reach the old PC? Unbind it on the NexDB website.",
      "When a license ends, NexDB keeps working for 3 more days: a notice (and a Windows notification) offers to renew your plan or upgrade to a longer one. After the 3 days, the license screen asks for the new key.",
      "Your name sits at the bottom of the sidebar: click it for your license details or to sign out of this PC.",
      "Ctrl+` opens a new terminal from any page.",
      "The license-ended notice is now a slim strip at the top that moves the page down, so it never covers a title or button.",
    ],
  },
  {
    version: "0.5.3",
    title: "The right PHP, everywhere",
    changes: [
      "Opening a project in VS Code, Cursor or Windsurf from NexDB gives the editor that project's PHP (8.5, or 8.4 if the project is set to it): its terminals and PHP checks use it, even when Windows lists another PHP, like Laragon's, first.",
      "It follows along: change a project's PHP, or NexDB's default, and the editor settings update too.",
      "Check my setup → This PC: pick which PHP other terminals use, from every PHP on the PC (NexDB's, Laragon's, XAMPP's, WAMP's…). Composer follows it. The first time, Windows asks for permission; As Windows has it puts things back.",
    ],
  },
  {
    version: "0.5.2",
    title: "Faster, and for teams",
    changes: [
      'A welcome after setup: a blue flash, "Welcome to NexDB", then Nex says hello and the tour starts by itself (or Skip for now).',
      "Start all is quicker: services start side by side, so the slowest one sets the wait instead of all of them added up. Each row says Running as soon as its own service is up.",
      "A Performance page in the sidebar: the memory and CPU NexDB's services use next to the whole PC's, graphs of the last five minutes, and which service uses the most.",
      "Each service's details on the Dashboard are small labelled chips (port, uptime, memory, CPU with a bar) instead of one faint line.",
      "Docker containers show on the Dashboard when Docker Desktop is installed: start, stop or restart them, see their address and read their log.",
      "Team setup: save a project's setup as nexdb-setup.json (PHP version, services, and a .env with the passwords left blank). A teammate's NexDB sets the project up from it.",
      "Services of your own: add any program (a search engine, a queue worker) on the Versions page, and it starts and stops with the rest.",
      "The Link two tables box keeps everything inside it, with its buttons always in view, and Nex never sits on its warning.",
      "Ctrl+1 to Ctrl+9 and Ctrl+0 open the sidebar's pages.",
    ],
  },
  {
    version: "0.5.1",
    title: "Tidier, and out of the way",
    changes: [
      "Settings comes in six parts listed on the left: General, Web server and ports, Sharing, Backups, Updates and Tutorial. One shows at a time, and NexDB remembers the last one.",
      "Mail has its own page in the sidebar (Ctrl+5), with a count of new emails. If the mail catcher is off, the page says so and starts it with one click.",
      "Closed NexDB without updating? It installs that update the next time it opens, then restarts by itself. You can turn this off in Settings → Updates.",
      "Nex and his bubble never cover what he's showing you: no more hidden buttons or text. The practice banner is now a strip above the app instead of floating over it.",
      "Practice mode no longer shows a sample update notice, and a sample project Nex opened no longer stays open afterwards.",
      "Ctrl+1 to Ctrl+9 open the sidebar's pages, top to bottom.",
    ],
  },
  {
    version: "0.5.0",
    title: "A little magic",
    changes: [
      "Nex, organize: in the relationship diagram, Nex puts on his wizard hat and lays your tables out: the most-linked in the middle, related ones together, fewest crossing lines. Undo if you liked it before.",
      "Build in the diagram: make a new table there, or drag from a column onto another table to link them. The SQL is shown first; click a line to remove a link.",
      "Read caught emails inside NexDB: the mail catcher's inbox opens in the app, with new ones counted on the Dashboard.",
      "The Dashboard shows the memory and CPU each running service uses.",
      "Memcached on the Versions page, as a Dashboard service.",
      "Shared projects get a name on the Wi-Fi, like blog.local, so phones don't need a number address.",
      "Public links that stay the same, with your own free ngrok or Cloudflare account (Settings).",
    ],
  },
  {
    version: "0.4.9",
    title: "Database tools",
    changes: [
      "Relationships: see how your tables connect through their foreign keys, in a window of its own. Drag tables around, zoom, click one to see its links, or read them as a list.",
      "Compare: put two databases side by side and see the tables, columns, indexes and links that differ. It only reads.",
      "Automatic backups can also be copied to another drive or a USB stick. If it's unplugged, NexDB copies them the next time it's there.",
      "Restoring a backup makes a new database by default, so the original stays as it is. Replacing still works, and backs up first.",
      "Nex shows all four in practice mode.",
    ],
  },
  {
    version: "0.4.8",
    title: "Smoother walkthroughs",
    changes: [
      "Nex's walkthrough scrolls to whatever it's showing, so nothing is below the window.",
      "The mouse wheel scrolls the page during a walkthrough.",
      "Nex's bubble no longer covers the button it asks you to click, like Save .env.",
      "Coming from an older version? NexDB still offers the walkthroughs you haven't seen.",
    ],
  },
  {
    version: "0.4.7",
    title: "Projects, database and sharing extras",
    changes: [
      "Settings (.env) on each project: edit its settings as a form, with passwords and keys hidden until you show them. The old file is kept as .env.backup.",
      "Node.js per project: NexDB reads the project's .nvmrc and runs its terminal and npm on that version, and tells you when it isn't installed.",
      "Table designer: make a table or change its columns and indexes without SQL. It shows the SQL first, and offers a backup before anything that deletes data.",
      "The SQL tab keeps a history of what you ran, and you can save queries with a name.",
      "MariaDB and MongoDB on the Versions page, as Dashboard services with a guide for using them in your project.",
      "Public links can ask for a password: visitors see a sign-in page first. It's on by default.",
      "After an update, Nex offers to show what's new, hands on, in practice mode: sample projects and databases, so nothing on your PC changes. Settings → Tutorial replays it.",
    ],
  },
  {
    version: "0.4.6",
    title: "Nex shows you around",
    changes: [
      "A guided tutorial: Nex walks to each part of NexDB, lights it up and lets you try it, from the Dashboard to Ctrl+K. Stop it any time with Esc.",
      "Replay the whole tutorial or one part from Settings → Tutorial, or with Show me on the new Help page.",
      "Help (Ctrl+8): step-by-step answers for projects, databases, sharing, the terminal, versions and fixing problems, with search.",
      "Reinstalled NexDB or Windows, or moved the NexDB folder to another drive? Setup finds it and uses it as it is; a moved folder's settings follow it.",
      "Uninstalling asks whether to keep the NexDB folder with your projects and databases. Keeping it is the default.",
    ],
  },
  {
    version: "0.4.5",
    title: "Connect databases to projects",
    changes: [
      "After you make a database, pick the project that uses it, or skip it. You can also do it later from the database or the project's page.",
      "NexDB writes the connection for you: .env for Laravel, wp-config.php for WordPress, and keeps the old file as a .backup. Other PHP apps get the values to copy.",
      "Choose a user of its own for the database (recommended) or root. Each database shows which project uses it.",
      "NexDB remembers its window size, the page you were on, and your terminal tabs and their names.",
      "Keyboard: Ctrl+1 to Ctrl+7 open the sidebar's pages, a Skip to page content link, and screen readers hear each page's title when you move.",
      "A short tour on first launch. Settings → What's new can show it again.",
    ],
  },
  {
    version: "0.4.4",
    title: "Clone from Git",
    changes: [
      "Clone on the Projects page: paste a GitHub, GitLab or any Git address and NexDB downloads it as a new project, with its progress.",
      "It then sets the project up in one go: PHP and Node packages, its .env with a database user, and the app key.",
      "The name is filled in from the address, and you can pick a branch. It keeps going if you open another page.",
      "Clear messages when the address is wrong, the repository needs a sign-in, or the internet is down; a failed clone leaves nothing behind.",
    ],
  },
  {
    version: "0.4.3",
    title: "Tray menu, Ctrl+K and alerts",
    changes: [
      "Tray menu: start or stop each service (a tick shows which run), open a project's site, a terminal or its folder, without opening the window.",
      "Ctrl+K (or Search at the top of the sidebar): type to jump to any page, project or database, or to start and stop services.",
      "A Windows notification tells you when a service stops by itself, or when an automatic backup fails.",
    ],
  },
  {
    version: "0.4.2",
    title: "A simpler layout",
    changes: [
      "Each project row has one button, Open, and a ⋯ menu for details, your editors, the terminal and the folder.",
      "The project page's header has Open site and your editor; the rest is under ⋯.",
      "Projects page: New project and Import up front; the Recycle Bin and the terminal are under ⋯.",
      "Dashboard: each service shows its port under its name, and the log has a simple picker instead of a tab per service.",
      "Versions: each installed version has one button (Use this, or In use) and a ⋯ menu with PHP's extensions and settings and Remove.",
      "Database: New database is the main button; phpMyAdmin is a quieter one beside Import .sql.",
      "Terminal has the same header as every other page.",
      "Every ⋯ menu works with the keyboard: arrow keys to move, Escape to close.",
    ],
  },
  {
    version: "0.4.1",
    title: "Background tasks, PHP extensions and PostgreSQL",
    changes: [
      "Background tasks: setting up a project, making a new one, downloads, imports and backups keep going when you open another page, and their progress is still there when you come back.",
      "A Tasks button in the sidebar shows what's running, with its progress, and what just finished or stopped.",
      "PHP extensions and settings, per PHP version: turn extensions on or off, change memory, upload and time limits, and keep your own php.ini lines. PHP checks them before they're used.",
      "PostgreSQL on the Database page: switch between MySQL and PostgreSQL to browse, edit rows, run SQL with ready-made commands, manage users and back up or restore.",
      "Check my setup spots a damaged PostgreSQL data folder and makes a fresh one, keeping the old one beside it.",
    ],
  },
  {
    version: "0.4.0",
    title: "Check my setup",
    changes: [
      "New Check my setup page (in the sidebar): busy ports, broken settings, missing addresses, the firewall, your network type, disk space and projects that aren't set up yet, each with a button that fixes it.",
      "Save a support report: one .zip with NexDB's settings, configs and the end of each log, with passwords removed.",
      "Every button that starts something shows a spinner until it's done, and its progress shows right beside it.",
      "The Share tab is clearer: one block per way of sharing, a Shared badge, and the other ways folded away when the whole app can share on one link.",
      "Fits narrow windows: page buttons wrap, project rows show their full address, and the Database page no longer scrolls sideways.",
      "Projects list: a search box once you have many, and tags for Needs setup, Shared and a project's own PHP version. Click a name to open it.",
      "Database: fold away the ready-made SQL commands (remembered) so the editor sits higher. Versions: links at the top jump to each part.",
      "Fixed: setting up a project now uses the PHP version chosen for it, so Composer no longer fails when the default PHP is newer.",
    ],
  },
  {
    version: "0.3.9",
    title: "One link for the whole app, Laravel tools and import",
    changes: [
      "Share a whole app on one link: the React (or other) front end, with /api, /sanctum and /storage going to its Laravel backend. On your Wi-Fi and as a public link.",
      "New Laravel tab on each Laravel project: update tables, add sample data, link uploads and clear caches, with results in plain words.",
      "Run a queue worker and the scheduler from the Laravel tab, and read the app's log as clear entries.",
      "Import projects and databases from Laragon, XAMPP, WAMP and other MySQL, MariaDB or PostgreSQL installs. The originals stay where they are.",
      "Nex now shows on Set up this project: worried while it isn't set up, hopping while it waits, happy when it's ready.",
      "Fixed: projects whose folder name has capitals (like OCC-Admission) can pick their PHP version, open in an editor or terminal, and be deleted.",
    ],
  },
  {
    version: "0.3.8",
    title: "Set up cloned projects",
    changes: [
      "Set up this project: for a project you cloned, one button installs its PHP and Node packages, creates its .env with a database user and generates the app key.",
      "An existing database is kept as it is; a new one is made when the project needs it.",
      "Laravel's own Vite isn't listed as a separate front end any more.",
      "The Share tab says it's checking instead of showing an empty page.",
    ],
  },
  {
    version: "0.3.7",
    title: "A tidier Dashboard and project page, and dev servers that open",
    changes: [
      "Dashboard: services grouped as Web server, PHP (one row per version), Databases and Extras; only one scrollbar.",
      "Projects: each project's page has tabs: Overview, Share, and Rename or delete.",
      "Shared dev servers open now: Vite and other Node dev servers that only listen on localhost are reached.",
      "Public link for a shared dev server, for example a React front end in a web folder.",
    ],
  },
  {
    version: "0.3.6",
    title: "Site folders, dev servers on your phone, and working public links",
    changes: [
      "Site folder: for projects that keep their app in a subfolder (like Backend/public), pick the folder that is the website.",
      "Share a dev server: open a running Vite or Next.js app on your phone, with live reload.",
      "Public links now load Laravel's styles and scripts; before, the page stayed blank.",
    ],
  },
  {
    version: "0.3.5",
    title: "Share a project",
    changes: [
      "Open a project on your phone: Projects → Details → Share on my Wi-Fi gives an address and a QR code to scan.",
      "One Windows Firewall rule lets phones in, on home and office networks only.",
      "Public link: show a project to anyone, anywhere, through Cloudflare's free quick tunnels (no account).",
    ],
  },
  {
    version: "0.3.4",
    title: "PostgreSQL, Python and nginx",
    changes: [
      "PostgreSQL under Versions → Extra services: it sets itself up, runs on the Dashboard, and psql works in the Terminal.",
      "Python with pip for the Terminal, under Versions → Tools.",
      "Settings → Web server: switch between Apache and nginx. Your .test sites, phpMyAdmin, HTTPS and PHP per project keep working.",
      "Redis's redis-cli now works in the Terminal too.",
    ],
  },
  {
    version: "0.3.3",
    title: "A tidier Dashboard and mail setup help",
    changes: [
      "Services are grouped into Web, Database and Extras, and every row keeps its buttons on one line.",
      "Open inbox moved under the mail catcher's name, so it no longer squeezes the other buttons.",
      '"Use it in your project" shows how to point Laravel, plain PHP, WordPress, PHPMailer, Symfony or Node.js at the mail catcher, with settings to copy.',
      "The same guide for Redis, including the Predis package Laravel needs on Windows.",
    ],
  },
  {
    version: "0.3.2",
    title: "Mail catcher, Redis and a smarter SQL tab",
    changes: [
      "Mail catcher: every email your PHP apps send lands in a Mail inbox inside NexDB instead of real mailboxes.",
      "Redis: a fast cache and queue server for Laravel and other apps, on the Dashboard like the others.",
      "SQL tab: the selected table's columns sit beside the editor; click one to insert it, and the editor starts with a SELECT for that table.",
      "Settings → What's new: read what each update brought.",
    ],
  },
  {
    version: "0.3.1",
    title: "A clearer Database page and SQL templates",
    changes: [
      "One-click SQL templates filled in with your table and its columns, each explained in plain words.",
      "NexDB asks before an UPDATE or DELETE without WHERE changes every row.",
      "Export and import .sql files right from the database view.",
      "A simpler users list, an easier Add row form and a tidier sidebar.",
    ],
  },
  {
    version: "0.3.0",
    title: "Edit your data, manage users, export CSV",
    changes: [
      "Double-click a cell to change it, add rows from a form, delete rows.",
      "Users tab: create MySQL users and choose which databases they can use.",
      "Export a table or a query result as CSV for Excel.",
    ],
  },
  {
    version: "0.2.9",
    title: "Nex comes alive",
    changes: ["Nex says hi, celebrates every success from the corner, and lets you know when something goes wrong."],
  },
  {
    version: "0.2.8",
    title: "Meet Nex, plus a Recycle Bin",
    changes: [
      "Nex, the NexDB mascot.",
      "A Details button on every project.",
      "Recycle Bin page to bring deleted projects back.",
    ],
  },
  {
    version: "0.2.7",
    title: "Project details and PHP per project",
    changes: [
      "A page for each project.",
      "Pick a PHP version per project.",
      "Rename projects, or delete them to the Recycle Bin.",
    ],
  },
  {
    version: "0.2.6",
    title: "Project wizard, latest templates and PHP fixes",
    changes: [
      "New project wizard with a getting-started guide.",
      "Laravel 13 with React, Vue or Livewire, and optional AI assistant support.",
      'Open projects in your code editor, and fix PHP 8.5 "Deprecated" warnings in one click.',
    ],
  },
  {
    version: "0.2.5",
    title: "Quick-start projects",
    changes: ["Ready-to-run Laravel, WordPress, Vite and Next.js projects with their own database."],
  },
  {
    version: "0.2.4",
    title: "Safer changes, automatic backups and a better terminal",
    changes: [
      "Backups before risky changes, and automatic backups.",
      "Terminal in its own window, clickable links, copy and paste.",
    ],
  },
  {
    version: "0.2.3",
    title: "New look, update notices and HTTPS",
    changes: ["A cleaner look.", "Update notices in the sidebar.", "HTTPS for your .test sites."],
  },
  { version: "0.2.2", title: "Terminal tabs", changes: ["Several terminals at once, with names you choose."] },
  { version: "0.2.1", title: "Database backups", changes: ["Back up, restore and import databases."] },
  {
    version: "0.2.0",
    title: "Versions, Settings and in-app updates",
    changes: [
      "Install and switch versions of PHP, MySQL and more.",
      "Logs in plain language.",
      "Update NexDB from inside the app.",
    ],
  },
];
