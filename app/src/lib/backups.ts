import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp } from "./scan";

export interface BackupFile {
  name: string;
  database: string | null;
  size_bytes: number;
  /** Seconds since 1970. */
  created: number;
  path: string;
}

export async function listBackups(): Promise<BackupFile[]> {
  if (inDesktopApp) return invoke<BackupFile[]>("backups_list");
  return [...preview].sort((a, b) => b.created - a.created);
}

/** Backs up one database, or all of your own when `name` is null. */
export async function createBackup(name: string | null): Promise<BackupFile[]> {
  if (inDesktopApp) return invoke<BackupFile[]>("backup_create", { name });
  await new Promise((r) => setTimeout(r, 700));
  const made = (name ? [name] : ["shop", "blog"]).map((db) => fake(db, Date.now() / 1000));
  preview.push(...made);
  return made;
}

export async function restoreBackup(file: string, database: string): Promise<void> {
  if (inDesktopApp) return invoke("backup_restore", { file, database });
  await new Promise((r) => setTimeout(r, 700));
}

export async function deleteBackup(file: string): Promise<void> {
  if (inDesktopApp) return invoke("backup_delete", { file });
  preview = preview.filter((b) => b.name !== file);
}

/** Opens the Windows file picker for a .sql file; null when cancelled. */
export async function pickSqlFile(): Promise<string | null> {
  if (inDesktopApp) return invoke<string | null>("pick_sql_file");
  return "C:\\Users\\you\\Downloads\\wordpress_export.sql";
}

export async function importSqlFile(path: string, database: string): Promise<void> {
  if (inDesktopApp) return invoke("backup_import_file", { path, database });
  await new Promise((r) => setTimeout(r, 700));
}

export async function openBackupsFolder(): Promise<void> {
  if (inDesktopApp) await invoke("open_backups_folder");
}

/** "31 Oct 2026, 09:52" in the user's own format. */
export function formatWhen(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** A database name from a file name: "WordPress Export (2).sql" → "wordpress_export_2". */
export function nameFromFile(path: string): string {
  const base = path.split(/[\\/]/).pop()?.replace(/\.sql$/i, "").replace(/__\d{4}-\d{2}-\d{2}_.*$/, "") ?? "imported";
  const clean = base.toLowerCase().replace(/[^a-z0-9_$]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
  return clean || "imported";
}

function fake(db: string, created: number): BackupFile {
  const d = new Date(created * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const name = `${db}__${stamp}.sql`;
  return { name, database: db, size_bytes: 48_000 + db.length * 1000, created, path: `C:\\NexDB\\backups\\${name}` };
}

let preview: BackupFile[] = [fake("shop", Date.now() / 1000 - 86_400 * 2), fake("blog", Date.now() / 1000 - 3600)];
