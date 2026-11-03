import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp } from "./scan";
import { previewEmit } from "./projects";

/** Another tool on the PC (Laragon, XAMPP, WAMP, a database server) and what it holds. */
export interface ImportSource {
  id: string;
  label: string;
  path: string;
  www: string | null;
  projects: ImportCandidate[];
  servers: ImportServer[];
}

export interface ImportCandidate {
  name: string;
  path: string;
  kind: string;
  /** NexDB already has a project with this name. */
  taken: boolean;
}

export interface ImportServer {
  engine: "mysql" | "mariadb" | "postgres";
  version: string | null;
  bin: string;
  port: number;
  user: string;
  running: boolean;
  mysqld: string | null;
  data: string | null;
  /** Set to the same port as NexDB's own server, so both can't run at once. */
  same_port: boolean;
}

export interface ImportPlan {
  projects: { path: string; name: string }[];
  databases: { server: ImportServer; password: string | null; name: string }[];
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Browser preview: a Laragon install like a typical one, whose MySQL shares NexDB's port.
const previewSources: ImportSource[] = [
  {
    id: "laragon",
    label: "Laragon",
    path: "C:\\laragon",
    www: "C:\\laragon\\www",
    projects: [
      { name: "eduvote", path: "C:\\laragon\\www\\eduvote", kind: "laravel", taken: false },
      { name: "parish", path: "C:\\laragon\\www\\parish", kind: "empty", taken: true },
      { name: "portfolio", path: "C:\\laragon\\www\\portfolio", kind: "html", taken: false },
    ],
    servers: [
      {
        engine: "mysql",
        version: "8.0.30",
        bin: "C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin",
        port: 3306,
        user: "root",
        running: false,
        mysqld: "C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysqld.exe",
        data: "C:/laragon/data/mysql-8",
        same_port: true,
      },
    ],
  },
];

export async function importSources(): Promise<ImportSource[]> {
  if (inDesktopApp) return invoke("import_sources");
  await pause(700);
  return previewSources;
}

/** The databases on another server; the password is used once and never saved. */
export async function importDatabases(server: ImportServer, password: string | null): Promise<string[]> {
  if (inDesktopApp) return invoke("import_databases", { server, password });
  await pause(1500);
  return ["eduvote", "parish", "admission"];
}

/** Copies the picked projects and databases; progress arrives through `onQuickstart` ("import"). */
export async function runImport(plan: ImportPlan): Promise<string[]> {
  if (inDesktopApp) return invoke("import_run", { plan });
  const steps = [
    ...plan.projects.map((p) => `Copy the project ${p.name}`),
    ...plan.databases.map((d) => `Copy the database ${d.name}`),
  ];
  previewEmit({ kind: "plan", name: "import", steps });
  for (let i = 0; i < steps.length; i++) {
    previewEmit({ kind: "step", name: "import", index: i, status: "running" });
    previewEmit({ kind: "line", name: "import", text: `> ${steps[i]} (simulated)` });
    await pause(700);
    previewEmit({ kind: "step", name: "import", index: i, status: "done" });
  }
  return plan.projects.some((p) => p.name === "eduvote") && plan.databases.some((d) => d.name === "eduvote")
    ? ["eduvote now uses NexDB's MySQL for eduvote."]
    : [];
}
