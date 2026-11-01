/** What each NexDB version brought, newest first, in plain words. Shown in Settings → What's new. */
export interface Release {
  version: string;
  title: string;
  changes: string[];
}

export const CHANGELOG: Release[] = [
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
      "\"Use it in your project\" shows how to point Laravel, plain PHP, WordPress, PHPMailer, Symfony or Node.js at the mail catcher, with settings to copy.",
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
    changes: ["Nex, the NexDB mascot.", "A Details button on every project.", "Recycle Bin page to bring deleted projects back."],
  },
  {
    version: "0.2.7",
    title: "Project details and PHP per project",
    changes: ["A page for each project.", "Pick a PHP version per project.", "Rename projects, or delete them to the Recycle Bin."],
  },
  {
    version: "0.2.6",
    title: "Project wizard, latest templates and PHP fixes",
    changes: [
      "New project wizard with a getting-started guide.",
      "Laravel 13 with React, Vue or Livewire, and optional AI assistant support.",
      "Open projects in your code editor, and fix PHP 8.5 \"Deprecated\" warnings in one click.",
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
    changes: ["Backups before risky changes, and automatic backups.", "Terminal in its own window, clickable links, copy and paste."],
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
    changes: ["Install and switch versions of PHP, MySQL and more.", "Logs in plain language.", "Update NexDB from inside the app."],
  },
];
