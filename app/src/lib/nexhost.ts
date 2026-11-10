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
