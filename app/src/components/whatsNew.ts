/*
 * What's new, shown by Nex after an update. Each release's chapter runs in practice mode, on the
 * sample "blog" project and databases, so trying things changes nothing on the PC.
 *
 * Every release with new features adds its chapter here (newest first in WHATS_NEW).
 */
import type { GuideStep } from "./Tour";

export const WHATS_NEW = [
  { version: "0.4.9", chapter: "New in 0.4.9" },
  { version: "0.4.7", chapter: "New in 0.4.7" },
] as const;
export type WhatsNewChapter = (typeof WHATS_NEW)[number]["chapter"];

const here = (sel: string) => `.page:not([hidden]) ${sel}`;
const openProject = (name: string) => () =>
  window.dispatchEvent(new CustomEvent("nexdb:open-project", { detail: name }));
const openDatabase = (name: string) => () =>
  window.dispatchEvent(new CustomEvent("nexdb:open-database", { detail: name }));

export const WHATS_NEW_STEPS: GuideStep[] = [
  {
    chapter: "New in 0.4.9",
    title: "Four database tools, hands on",
    body: "Relationships, Compare, a second copy of your backups, and restoring as a copy. Practice mode again: sample databases, nothing on your PC changes.",
    mood: "hello",
  },
  // Relationship diagram
  {
    chapter: "New in 0.4.9",
    title: "How tables connect",
    body: "Here's the sample blog database. Click Relationships.",
    page: "database",
    run: openDatabase("blog"),
    target: here('[data-guide="diagram-open"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.9",
    title: "The relationship diagram",
    body: "Each box is a table; each line is a link, from a column like posts.user_id to the table it points at. Drag tables around, Ctrl+scroll to zoom, click one to see only its links. In the app it opens in its own window, so phpMyAdmin isn't needed.",
    target: ".diagram-canvas",
  },
  {
    chapter: "New in 0.4.9",
    title: "Also as a list",
    body: "List shows the same links as text, easier with a keyboard or a screen reader. Click Close when you're done looking.",
    target: '[data-guide="diagram-close"]',
    wait: "click",
  },
  // Compare
  {
    chapter: "New in 0.4.9",
    title: "Compare two databases",
    body: "Click Compare…",
    target: here('[data-guide="compare-open"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.9",
    title: "Pick the other one",
    body: "Choose a database to compare with, then click Compare. It only reads; nothing is changed.",
    target: here('[data-guide="compare-panel"]'),
    waitOn: here('[data-guide="compare-run"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.9",
    title: "What's different",
    body: "Tables, columns, indexes and links that are only on one side, or different on both. Handy before you copy changes from one database to another.",
    target: here(".compare-result"),
  },
  // Restore as a copy
  {
    chapter: "New in 0.4.9",
    title: "Restore as a copy",
    body: "Click the Backups tab.",
    target: here('[data-guide="db-tab-backups"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.9",
    title: "Pick a backup",
    body: "Click Restore… on one of the backups.",
    target: here('[data-guide="restore"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.9",
    title: "A new database by default",
    body: "Restoring now makes a new database next to the original, so nothing is overwritten by accident. Replace is still there, and it backs up first.",
    target: here(".backups-mode"),
  },
  // Copy backups to another drive
  {
    chapter: "New in 0.4.9",
    title: "A second copy, somewhere safe",
    body: "Automatic backups can also go to another drive or a USB stick. Click Choose a folder or USB drive…",
    page: "settings",
    target: here('[data-guide="backup-copy"]'),
    waitOn: here('[data-guide="backup-copy-pick"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.9",
    title: "Kept up to date",
    body: "After each automatic backup the copy is refreshed. If the USB drive isn't plugged in, NexDB says so and copies it the next time it's there.",
    target: here('[data-guide="backup-copy"]'),
  },
  {
    chapter: "New in 0.4.9",
    title: "That's 0.4.9!",
    body: "Practice is over; your real databases are back. Settings → Tutorial replays this any time.",
    mood: "success",
  },
  {
    chapter: "New in 0.4.7",
    title: "Six new things, hands on",
    body: "I'll show you each one on a sample project called blog. This is practice mode: try anything, nothing on your PC changes. Press Esc to stop.",
    mood: "hello",
  },
  // .env editor
  {
    chapter: "New in 0.4.7",
    title: "Your project's settings",
    body: "Here's the sample blog project. Click Settings (.env).",
    page: "projects",
    run: openProject("blog"),
    target: here('[data-guide="tab-env"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.7",
    title: "The .env, as a form",
    body: "Every setting is a row. No more hunting through a text file. Passwords and keys stay hidden.",
    target: here(".env-table"),
  },
  {
    chapter: "New in 0.4.7",
    title: "Peek at a secret",
    body: "Click the eye next to APP_KEY to see it. Click again to hide it.",
    target: here('button[aria-label="Show APP_KEY"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.7",
    title: "Change something",
    body: "Type a new name in APP_NAME.",
    target: here("#env--APP_NAME"),
    // Goes on once the Save button shows up, which means something changed.
    waitOn: here(".env-foot .btn-primary"),
    wait: "appear",
  },
  {
    chapter: "New in 0.4.7",
    title: "Save it",
    body: "Click Save .env. In practice it only saves the sample project.",
    target: here(".env-foot .btn-primary"),
    wait: "click",
  },
  {
    chapter: "New in 0.4.7",
    title: "Saved, with a backup",
    body: "NexDB keeps the old file as .env.backup, so a mistake is easy to undo. Laravel's cache is cleared for you too.",
    target: here(".env-foot"),
  },
  // Node per project
  {
    chapter: "New in 0.4.7",
    title: "Node.js per project",
    body: "Click Overview.",
    target: here('[data-guide="tab-overview"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.7",
    title: "The Node it asks for",
    body: "This project's .nvmrc asks for Node 20. Its terminal and npm use the matching version, and NexDB says when that version isn't installed yet.",
    target: here('[data-guide="node-section"]'),
  },
  // Password links
  {
    chapter: "New in 0.4.7",
    title: "Share with a password",
    body: "Click Share.",
    target: here('[data-guide="tab-share"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.7",
    title: "On by default",
    body: "Public links ask visitors for a password now. NexDB fills in one that's easy to read out. Click Create public link.",
    target: here('[data-guide="public-create-site"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.7",
    title: "Send both",
    body: "Share the link and the password. Visitors see a sign-in page first, then your site.",
    target: here(".share-password"),
  },
  // SQL history
  {
    chapter: "New in 0.4.7",
    title: "SQL history",
    body: "Now a sample database. Click the SQL tab.",
    page: "database",
    run: openDatabase("blog"),
    target: here('[data-guide="db-tab-sql"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.7",
    title: "Run a query",
    body: "Click Run.",
    target: here(".sql-bar .btn-primary"),
    wait: "click",
  },
  {
    chapter: "New in 0.4.7",
    title: "It's remembered",
    body: "Click History. Every query you run is kept, whether it worked, where and when. Click one to use it again; Save… keeps favourites with a name.",
    target: here('[data-guide="sql-history"]'),
    wait: "click",
  },
  // Table designer
  {
    chapter: "New in 0.4.7",
    title: "Tables without SQL",
    body: "Click Browse, then New table.",
    target: here('[data-guide="db-tab-browse"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.7",
    title: "New table",
    body: "Click New table.",
    target: here('[data-guide="new-table"]'),
    wait: "click",
  },
  {
    chapter: "New in 0.4.7",
    title: "Pick plain types",
    body: "Name columns and pick types like Whole number, Text or Yes / no. Mark the key, add indexes. On an existing table, Edit table on the Structure tab does the same.",
    target: here(".designer-scroll"),
  },
  {
    chapter: "New in 0.4.7",
    title: "See the SQL first",
    body: "NexDB shows the exact SQL before it runs anything, and offers a backup before a change that deletes data.",
    target: here(".designer-sql"),
  },
  // MariaDB and MongoDB
  {
    chapter: "New in 0.4.7",
    title: "MariaDB and MongoDB",
    body: "Two more database servers on the Versions page. Once installed they start from the Dashboard, with a guide to connect your app.",
    page: "versions",
    target: here('[data-guide="ver-mariadb"]'),
  },
  {
    chapter: "New in 0.4.7",
    title: "That's 0.4.7!",
    body: "Practice is over; your real projects and databases are back. Settings → Tutorial replays this any time.",
    mood: "success",
  },
];
