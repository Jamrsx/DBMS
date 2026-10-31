import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp } from "./scan";

export interface DatabaseInfo {
  name: string;
  tables: number;
  size_bytes: number;
  system: boolean;
}

export interface TableInfo {
  name: string;
  is_view: boolean;
  engine: string | null;
  rows: number | null;
  size_bytes: number;
}

export interface ColumnInfo {
  name: string;
  column_type: string;
  nullable: boolean;
  key: string;
  default: string | null;
  extra: string;
}

export type Cell = string | number | null;

export interface ResultSet {
  columns: string[];
  rows: Cell[][];
  truncated: boolean;
}

export interface QueryOutput {
  sets: ResultSet[];
  affected: number;
  elapsed_ms: number;
}

export interface TablePage {
  columns: string[];
  rows: Cell[][];
  total: number;
}

/** The backend answers with this when MySQL needs the root password. */
export const NEEDS_PASSWORD = "NEEDS_PASSWORD";

export const dbConnect = (password?: string) => call<{ version: string }>("db_connect", { password: password ?? null });
export const dbDatabases = () => call<DatabaseInfo[]>("db_databases");
export const dbTables = (name: string) => call<TableInfo[]>("db_tables", { name });
export const dbColumns = (name: string, table: string) => call<ColumnInfo[]>("db_columns", { name, table });
export const dbBrowse = (name: string, table: string, page: number, pageSize: number) =>
  call<TablePage>("db_browse", { name, table, page, pageSize });
export const dbQuery = (name: string | null, sql: string) => call<QueryOutput>("db_query", { name, sql });
export const dbCreate = (name: string) => call<void>("db_create", { name });
export const dbDrop = (name: string) => call<void>("db_drop", { name });

/** column = value pairs that pick out exactly one row. */
export type RowKey = [string, Cell][];

export const dbPrimaryKey = (name: string, table: string) => call<string[]>("db_primary_key", { name, table });
export const dbUpdateCell = (name: string, table: string, key: RowKey, column: string, value: Cell) =>
  call<void>("db_update_cell", { name, table, key, column, value });
export const dbInsertRow = (name: string, table: string, values: [string, Cell][]) =>
  call<void>("db_insert_row", { name, table, values });
export const dbDeleteRow = (name: string, table: string, key: RowKey) => call<void>("db_delete_row", { name, table, key });

export interface DbUser {
  name: string;
  hosts: string[];
  /** Databases it has all rights on. */
  databases: string[];
  /** Rights on every database, like root. */
  everything: boolean;
  /** root and MySQL's own accounts: shown, never changed. */
  protected: boolean;
}

export const dbUsers = () => call<DbUser[]>("db_users");
export const dbCreateUser = (user: string, password: string, database: string | null) =>
  call<void>("db_create_user", { user, password, database });
export const dbSetUserPassword = (user: string, password: string) => call<void>("db_set_user_password", { user, password });
export const dbGrant = (user: string, database: string) => call<void>("db_grant", { user, database });
export const dbRevoke = (user: string, database: string) => call<void>("db_revoke", { user, database });
export const dbDropUser = (user: string) => call<void>("db_drop_user", { user });

/** Saves a whole table as CSV through the Save dialog; null when cancelled, else the row count. */
export const dbExportTableCsv = (name: string, table: string) => call<number | null>("db_export_table_csv", { name, table });
/** Saves rows already on screen as CSV; null when cancelled. */
export const dbSaveCsv = (fileName: string, columns: string[], rows: Cell[][]) =>
  call<number | null>("db_save_csv", { fileName, columns, rows });

/** Saves a database as a .sql file wherever the user picks; null when cancelled, else the path. */
export const dbExportSql = (name: string) => call<string | null>("db_export_sql", { name });

/** A random password of letters and digits. */
export function makePassword(length = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (inDesktopApp) return invoke<T>(cmd, args);
  return preview(cmd, args ?? {}) as Promise<T>;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Mirrors the backend's rule for database names. */
export function dbNameProblem(name: string, existing: string[]): string | null {
  if (!name) return null;
  if (!/^[A-Za-z0-9_$]+$/.test(name)) return "Use letters, numbers and underscores only.";
  if (name.length > 64) return "The name is too long.";
  if (existing.some((e) => e.toLowerCase() === name.toLowerCase())) return `A database named "${name}" already exists.`;
  return null;
}

// Browser preview: a small simulated server.
const sim = {
  dbs: ["shop", "blog"],
  people: [
    [1, "Ada", "1815-12-10"],
    [2, "Linus", "1969-12-28"],
    [3, "Grace", null],
  ] as Cell[][],
  users: [
    { name: "root", hosts: ["localhost"], databases: [], everything: true, protected: true },
    { name: "shop", hosts: ["127.0.0.1", "localhost"], databases: ["shop"], everything: false, protected: false },
  ] as DbUser[],
};

async function preview(cmd: string, a: Record<string, unknown>): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 150));
  switch (cmd) {
    case "db_connect":
      return { version: "9.7.4" };
    case "db_databases":
      return [
        ...sim.dbs.map((name) => ({ name, tables: name === "shop" ? 2 : 1, size_bytes: 49152, system: false })),
        { name: "information_schema", tables: 90, size_bytes: 0, system: true },
        { name: "mysql", tables: 37, size_bytes: 2_500_000, system: true },
      ];
    case "db_tables":
      return [
        { name: "customers", is_view: false, engine: "InnoDB", rows: 3, size_bytes: 16384 },
        { name: "orders", is_view: false, engine: "InnoDB", rows: 0, size_bytes: 16384 },
      ];
    case "db_columns":
      return [
        { name: "id", column_type: "int", nullable: false, key: "PRI", default: null, extra: "auto_increment" },
        { name: "name", column_type: "varchar(40)", nullable: false, key: "", default: null, extra: "" },
        { name: "born", column_type: "date", nullable: true, key: "", default: null, extra: "" },
      ];
    case "db_browse":
      return { columns: ["id", "name", "born"], rows: sim.people, total: sim.people.length };
    case "db_query": {
      const sql = String(a.sql);
      if (/^\s*select/i.test(sql))
        return { sets: [{ columns: ["id", "name", "born"], rows: sim.people, truncated: false }], affected: 0, elapsed_ms: 2 };
      if (/selekt/i.test(sql)) throw "You have an error in your SQL syntax near 'selekt'";
      return { sets: [], affected: 1, elapsed_ms: 3 };
    }
    case "db_create":
      sim.dbs.push(String(a.name));
      return null;
    case "db_drop":
      sim.dbs = sim.dbs.filter((d) => d !== a.name);
      return null;
    case "db_primary_key":
      return ["id"];
    case "db_update_cell": {
      const key = a.key as RowKey;
      const row = sim.people.find((r) => r[0] === key[0][1]);
      if (!row) throw "Nothing changed: the row may have been changed or deleted elsewhere. Reload the table and try again.";
      row[["id", "name", "born"].indexOf(String(a.column))] = a.value as Cell;
      return null;
    }
    case "db_insert_row": {
      const values = Object.fromEntries(a.values as [string, Cell][]);
      const id = Math.max(0, ...sim.people.map((r) => Number(r[0]))) + 1;
      sim.people.push([id, values.name ?? "", values.born ?? null]);
      return null;
    }
    case "db_delete_row": {
      const key = a.key as RowKey;
      sim.people = sim.people.filter((r) => r[0] !== key[0][1]);
      return null;
    }
    case "db_users":
      return sim.users.map((u) => ({ ...u, databases: [...u.databases] }));
    case "db_create_user":
      if (sim.users.some((u) => u.name === a.user)) throw `A user named ${a.user} already exists.`;
      sim.users.push({ name: String(a.user), hosts: ["127.0.0.1", "localhost"], databases: a.database ? [String(a.database)] : [], everything: false, protected: false });
      return null;
    case "db_set_user_password":
      return null;
    case "db_grant":
      sim.users.find((u) => u.name === a.user)?.databases.push(String(a.database));
      return null;
    case "db_revoke": {
      const u = sim.users.find((x) => x.name === a.user);
      if (u) u.databases = u.databases.filter((d) => d !== a.database);
      return null;
    }
    case "db_drop_user":
      sim.users = sim.users.filter((u) => u.name !== a.user);
      return null;
    case "db_export_table_csv":
      return sim.people.length;
    case "db_export_sql":
      return `C:\\Users\\you\\Desktop\\${a.name}.sql`;
    case "db_save_csv":
      return (a.rows as unknown[]).length;
  }
  throw `Unknown command ${cmd}`;
}
