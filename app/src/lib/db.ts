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
  }
  throw `Unknown command ${cmd}`;
}
