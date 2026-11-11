import { invoke } from "./invoke";
import { isPractice } from "./practice";
import { inDesktopApp } from "./scan";

/** A NexHost site (4-year plan): a folder on this PC that can go online. */
export interface Site {
  name: string;
  path: string;
  /** The folder visitors see (Laravel: public/). */
  web_root: string;
  port: number;
  kind: "laravel" | "php" | "static";
  live: boolean;
  /** Its public address when it went live last (shop.myshop.com). */
  address: string | null;
  /** Its database name, once made. */
  db: string | null;
}

export interface Entry {
  name: string;
  dir: boolean;
  size: number;
  modified: number;
}

export interface DbInfo {
  name: string;
  user: string;
  password: string;
  host: string;
  port: number;
}

/*
 * Practice mode and the browser preview use made-up sites kept in memory: nothing on the PC
 * changes, and the Nex tour can walk through every step.
 */
const demo = () => !inDesktopApp || isPractice();
const now = () => Math.floor(Date.now() / 1000);
const DEMO_FILES: Record<string, Entry[]> = {
  "shop/": [
    { name: "css", dir: true, size: 0, modified: now() - 3600 },
    { name: "index.php", dir: false, size: 1840, modified: now() - 600 },
    { name: "checkout.php", dir: false, size: 3210, modified: now() - 900 },
  ],
  "shop/css": [{ name: "style.css", dir: false, size: 920, modified: now() - 3600 }],
  "portfolio/": [{ name: "index.html", dir: false, size: 2400, modified: now() - 86400 }],
};
const demoSites: Site[] = [
  { name: "shop", path: "C:\\NexDB\\nexhost\\shop", web_root: "C:\\NexDB\\nexhost\\shop", port: 8201, kind: "php", live: true, address: "shop.example.com", db: "nh_shop" },
  { name: "portfolio", path: "C:\\NexDB\\nexhost\\portfolio", web_root: "C:\\NexDB\\nexhost\\portfolio", port: 8202, kind: "static", live: false, address: null, db: null },
];
const demoDb: Record<string, DbInfo> = {
  shop: { name: "nh_shop", user: "nh_shop", password: "Practice7Pass2Word", host: "127.0.0.1", port: 3306 },
};
const copy = () => demoSites.map((s) => ({ ...s }));

export async function listSites(): Promise<Site[]> {
  if (!demo()) return invoke("nexhost_list");
  return copy();
}

export async function createSite(name: string): Promise<Site[]> {
  if (!demo()) return invoke("nexhost_create", { name });
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) throw "Use up to 40 small letters, numbers and dashes for the site name, like my-shop.";
  if (demoSites.some((s) => s.name === name)) throw `There is already a site named ${name}.`;
  const path = `C:\\NexDB\\nexhost\\${name}`;
  demoSites.push({ name, path, web_root: path, port: 8201 + demoSites.length, kind: "php", live: false, address: null, db: null });
  DEMO_FILES[`${name}/`] = [{ name: "index.php", dir: false, size: 320, modified: now() }];
  return copy();
}

export async function deleteSite(name: string): Promise<Site[]> {
  if (!demo()) return invoke("nexhost_delete", { name });
  const i = demoSites.findIndex((s) => s.name === name);
  if (i >= 0) demoSites.splice(i, 1);
  return copy();
}

export async function setWebRoot(name: string, webRoot: string | null): Promise<Site[]> {
  if (!demo()) return invoke("nexhost_set_root", { name, webRoot });
  return copy();
}

export async function listFiles(name: string, rel: string): Promise<Entry[]> {
  if (!demo()) return invoke("nexhost_files", { name, rel });
  return [...(DEMO_FILES[`${name}/${rel}`] ?? [])];
}

export async function addFiles(name: string, rel: string, sources: string[]): Promise<number> {
  if (!demo()) return invoke("nexhost_add", { name, rel, sources });
  const list = (DEMO_FILES[`${name}/${rel}`] ??= []);
  for (const src of sources) list.push({ name: src.split(/[\\/]/).pop() ?? src, dir: false, size: 1000, modified: now() });
  return sources.length;
}

/**
 * Copies a project from NexDB's www folder into the site (node_modules and .git stay behind).
 * Returns the new folder; a site that picks its web root by itself now serves that project.
 */
export async function importProject(name: string, rel: string, project: string): Promise<string> {
  if (!demo()) return invoke("nexhost_import_project", { name, rel, project });
  const list = (DEMO_FILES[`${name}/${rel}`] ??= []);
  let folder = project;
  for (let n = 2; list.some((e) => e.name === folder); n++) folder = `${project} (${n})`;
  list.push({ name: folder, dir: true, size: 0, modified: now() });
  return rel ? `${rel}/${folder}` : folder;
}

export async function unzipFile(name: string, rel: string, zip: string): Promise<number> {
  if (!demo()) return invoke("nexhost_unzip", { name, rel, zip });
  const list = (DEMO_FILES[`${name}/${rel}`] ??= []);
  list.push({ name: "index.php", dir: false, size: 1200, modified: now() }, { name: "assets", dir: true, size: 0, modified: now() });
  return 2;
}

export async function newFolder(name: string, rel: string, folder: string): Promise<void> {
  if (!demo()) return invoke("nexhost_new_folder", { name, rel, folder });
  (DEMO_FILES[`${name}/${rel}`] ??= []).unshift({ name: folder, dir: true, size: 0, modified: now() });
}

export async function renameEntry(name: string, rel: string, newName: string): Promise<void> {
  if (!demo()) return invoke("nexhost_rename", { name, rel, newName });
  const [dir, base] = split(rel);
  const e = DEMO_FILES[`${name}/${dir}`]?.find((x) => x.name === base);
  if (e) e.name = newName;
}

export async function removeEntry(name: string, rel: string): Promise<void> {
  if (!demo()) return invoke("nexhost_remove", { name, rel });
  const [dir, base] = split(rel);
  const list = DEMO_FILES[`${name}/${dir}`];
  if (list) DEMO_FILES[`${name}/${dir}`] = list.filter((x) => x.name !== base);
}

export async function createDatabase(name: string): Promise<DbInfo> {
  if (!demo()) return invoke("nexhost_db_create", { name });
  const db = `nh_${name.replace(/-/g, "_")}`.slice(0, 32);
  demoDb[name] = { name: db, user: db, password: "Practice7Pass2Word", host: "127.0.0.1", port: 3306 };
  const s = demoSites.find((x) => x.name === name);
  if (s) s.db = db;
  return demoDb[name];
}

export async function databaseInfo(name: string): Promise<DbInfo | null> {
  if (!demo()) return invoke("nexhost_db_info", { name });
  return demoDb[name] ?? null;
}

export async function writeEnv(name: string): Promise<void> {
  if (!demo()) return invoke("nexhost_db_write_env", { name });
}

export async function goLive(name: string, address: string | null, password: string | null): Promise<Site[]> {
  if (!demo()) return invoke("nexhost_go_live", { name, address, password });
  const s = demoSites.find((x) => x.name === name);
  if (s) {
    s.live = true;
    s.address = address || `${name}.example.com`;
  }
  return copy();
}

export async function goOffline(name: string): Promise<Site[]> {
  if (!demo()) return invoke("nexhost_go_offline", { name });
  const s = demoSites.find((x) => x.name === name);
  if (s) s.live = false;
  return copy();
}

/** "css/style.css" -> ["css", "style.css"]. */
function split(rel: string): [string, string] {
  const i = rel.lastIndexOf("/");
  return i < 0 ? ["", rel] : [rel.slice(0, i), rel.slice(i + 1)];
}

/** "1.2 KB" */
export function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Opens the hosting panel in a big window of its own (the preview opens it in a tab). */
export async function openPanel(): Promise<void> {
  if (inDesktopApp && !isPractice()) return invoke("nexhost_window");
  window.open(`${location.pathname}?view=nexhost&license=nexhost`, "_blank");
}

// ---------- SSH ----------

export interface SshUser {
  name: string;
  login: string;
  /** "files" (files and site commands) or "shell" (full shell). */
  role: "files" | "shell";
  enabled: boolean;
  created_at: number;
}

export interface SshInfo {
  on: boolean;
  users: SshUser[];
  port: number;
  fingerprint: string;
  running: boolean;
}

export interface SshLog {
  at: number;
  login: string;
  site: string;
  from: string | null;
  event: "login_ok" | "login_failed" | "locked" | "command" | "sftp_write" | "sftp_delete";
  detail: string | null;
}

const demoSsh: Record<string, SshInfo> = {};
const demoSshInfo = (name: string): SshInfo =>
  (demoSsh[name] ??= {
    on: name === "shop",
    users: name === "shop" ? [{ name: "maria", login: "shop-maria", role: "files", enabled: true, created_at: now() - 86400 }] : [],
    port: 2222,
    fingerprint: "SHA256:pR4c71ceF1ngerPr1ntN0tRea1xQ2v8sJk3m9TzYw",
    running: name === "shop",
  });
const demoPassword = () => "Pr4ctice" + Math.random().toString(36).slice(2, 10) + "Pass7x9Q";

export async function sshInfo(name: string): Promise<SshInfo> {
  if (!demo()) return invoke("nexhost_ssh_info", { name });
  return structuredClone(demoSshInfo(name));
}

export async function sshSet(name: string, on: boolean): Promise<SshInfo> {
  if (!demo()) return invoke("nexhost_ssh_set", { name, on });
  const i = demoSshInfo(name);
  i.on = on;
  i.running = Object.values(demoSsh).some((x) => x.on);
  return structuredClone(i);
}

export async function sshAddUser(name: string, user: string): Promise<{ info: SshInfo; password: string }> {
  if (!demo()) return invoke("nexhost_ssh_add_user", { name, user });
  if (!/^[a-z0-9]{1,20}$/.test(user)) throw "Use up to 20 small letters or numbers for the user name, like maria.";
  const i = demoSshInfo(name);
  if (i.users.some((u) => u.name === user)) throw `This site already has a user named ${user}.`;
  i.users.push({ name: user, login: `${name}-${user}`, role: "files", enabled: true, created_at: now() });
  return { info: structuredClone(i), password: demoPassword() };
}

export async function sshReset(name: string, user: string): Promise<{ info: SshInfo; password: string }> {
  if (!demo()) return invoke("nexhost_ssh_reset", { name, user });
  return { info: structuredClone(demoSshInfo(name)), password: demoPassword() };
}

export async function sshUserSet(name: string, user: string, change: { enabled?: boolean; role?: "files" | "shell" }): Promise<SshInfo> {
  if (!demo()) return invoke("nexhost_ssh_user_set", { name, user, enabled: change.enabled ?? null, role: change.role ?? null });
  const u = demoSshInfo(name).users.find((x) => x.name === user);
  if (u) Object.assign(u, change);
  return structuredClone(demoSshInfo(name));
}

export async function sshDeleteUser(name: string, user: string): Promise<SshInfo> {
  if (!demo()) return invoke("nexhost_ssh_delete_user", { name, user });
  const i = demoSshInfo(name);
  i.users = i.users.filter((u) => u.name !== user);
  return structuredClone(i);
}

export async function sshLog(name: string): Promise<SshLog[]> {
  if (!demo()) return invoke("nexhost_ssh_log", { name });
  return name === "shop"
    ? [
        { at: now() - 300, login: "shop-maria", site: "shop", from: "203.0.113.7", event: "command", detail: "php artisan migrate" },
        { at: now() - 320, login: "shop-maria", site: "shop", from: "203.0.113.7", event: "login_ok", detail: null },
        { at: now() - 4000, login: "shop-maria", site: "shop", from: "198.51.100.4", event: "login_failed", detail: "Wrong login or password." },
      ]
    : [];
}

export type ConnectOs = "windows" | "mac" | "linux";

/** The one command to run on the other computer, with the login and address filled in. */
export function connectCommand(os: ConnectOs, login: string, host: string): string {
  const ssh = `ssh -o ProxyCommand="cloudflared access ssh --hostname %h" ${login}@${host}`;
  if (os === "windows") return `winget install --id Cloudflare.cloudflared -e; ${ssh}`;
  if (os === "mac") return `brew install cloudflared && ${ssh}`;
  return ssh;
}

/** Step-by-step instructions to send to the person (never includes the password). */
export function connectInstructions(login: string, host: string, fingerprint: string): string {
  return [
    `How to connect to ${login.split("-")[0]} with SSH`,
    "",
    "1. Install Cloudflare's connector once:",
    "   Windows:  winget install --id Cloudflare.cloudflared",
    "   macOS:    brew install cloudflared",
    "   Linux:    the package from Cloudflare's downloads page",
    "2. Check you have SSH: type  ssh -V  in a terminal (Windows 10/11, macOS and Linux include it).",
    "3. Log in:",
    `   ssh -o ProxyCommand="cloudflared access ssh --hostname %h" ${login}@${host}`,
    "   Type the password you were given. The first time, check the fingerprint matches:",
    `   ${fingerprint}`,
    "4. Easier next time: add this to ~/.ssh/config (Windows: C:\Users\<you>\.ssh\config), then type  ssh " + login.split("-")[0],
    `   Host ${login.split("-")[0]}`,
    `     HostName ${host}`,
    `     User ${login}`,
    "     ProxyCommand cloudflared access ssh --hostname %h",
    "5. Files with an app (WinSCP, FileZilla, VS Code): run",
    `   cloudflared access tcp --hostname ${host} --url localhost:2222`,
    "   keep it open, then connect with SFTP to localhost, port 2222, with your login and password.",
    "6. If it doesn't connect: the site owner's PC must be on with NexDB open and SSH turned on.",
    "   \"Locked\" means too many wrong passwords: wait 15 minutes, or ask the owner to reset it.",
  ].join("\n");
}
