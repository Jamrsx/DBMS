/*
 * What's new, shown by Nex after an update. Each release's chapter runs in practice mode, on the
 * sample "blog" project and databases, so trying things changes nothing on the PC.
 *
 * Every release with new features adds its chapter here (newest first in WHATS_NEW).
 */
import type { GuideStep } from "./Tour";

export const WHATS_NEW = [{ version: "0.4.7", chapter: "New in 0.4.7" }] as const;
export type WhatsNewChapter = (typeof WHATS_NEW)[number]["chapter"];

const here = (sel: string) => `.page:not([hidden]) ${sel}`;
const openProject = (name: string) => () =>
  window.dispatchEvent(new CustomEvent("nexdb:open-project", { detail: name }));
const openDatabase = (name: string) => () =>
  window.dispatchEvent(new CustomEvent("nexdb:open-database", { detail: name }));

export const WHATS_NEW_STEPS: GuideStep[] = [
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
