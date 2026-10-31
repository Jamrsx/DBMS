import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { inDesktopApp } from "./scan";

export interface Project {
  name: string;
  path: string;
  kind: "laravel" | "wordpress" | "node" | "php" | "html" | "empty";
  doc_root: string;
  host: string | null;
  url: string;
  local_url: string;
  /** Uses of code newer PHP warns about ("Deprecated: …"), which NexDB can fix. */
  php_warnings: number;
}

export interface ProjectsInfo {
  www_dir: string;
  web_server: boolean;
  projects: Project[];
  missing_hosts: string[];
}

export type NewKind = "php" | "html" | "empty";

/** Ready-to-run starters NexDB downloads and sets up. */
export type Starter =
  | "laravel"
  | "laravel-react"
  | "laravel-vue"
  | "laravel-livewire"
  | "wordpress"
  | "vite-react"
  | "vite-vue"
  | "nextjs";

export const STARTERS: { id: Starter; label: string; needs: string }[] = [
  { id: "laravel", label: "Laravel", needs: "PHP, Composer and MySQL" },
  { id: "laravel-react", label: "Laravel + React (Inertia)", needs: "PHP, Composer, Node.js and MySQL" },
  { id: "laravel-vue", label: "Laravel + Vue (Inertia)", needs: "PHP, Composer, Node.js and MySQL" },
  { id: "laravel-livewire", label: "Laravel + Livewire", needs: "PHP, Composer, Node.js and MySQL" },
  { id: "wordpress", label: "WordPress", needs: "PHP and MySQL" },
  { id: "vite-react", label: "React (Vite)", needs: "Node.js" },
  { id: "vite-vue", label: "Vue (Vite)", needs: "Node.js" },
  { id: "nextjs", label: "Next.js (React)", needs: "Node.js" },
];

export const isStarter = (kind: string): kind is Starter => STARTERS.some((s) => s.id === kind);

export interface Created {
  /** For apps with their own dev server: the command that starts it. */
  run_hint: string | null;
  database: string | null;
}

export type QuickstartEvent =
  | { kind: "plan"; name: string; steps: string[] }
  | { kind: "step"; name: string; index: number; status: "running" | "done" }
  | { kind: "line"; name: string; text: string }
  | { kind: "percent"; name: string; index: number; percent: number };

export interface QuickstartOptions {
  /** Database name; the project name with _ for - when empty. */
  db_name?: string;
  /** Laravel: set up Laravel Boost for AI coding assistants. */
  ai?: boolean;
}

/** A database name from a project name: my-shop → my_shop. */
export const defaultDbName = (project: string) => project.replace(/-/g, "_").slice(0, 32);

export const needsDatabase = (kind: Starter) => kind.startsWith("laravel") || kind === "wordpress";

export interface Editor {
  id: string;
  name: string;
}

export async function listEditors(): Promise<Editor[]> {
  if (inDesktopApp) return invoke<Editor[]>("editors_list");
  return [
    { id: "vscode", name: "VS Code" },
    { id: "phpstorm", name: "PhpStorm" },
  ];
}

export async function openInEditor(name: string, editor: string): Promise<void> {
  if (inDesktopApp) return invoke("project_open_in", { name, editor });
}

/** Updates code newer PHP warns about; resolves to how many lines changed. */
export async function fixPhpWarnings(name: string): Promise<number> {
  if (inDesktopApp) return invoke<number>("project_fix_php", { name });
  await new Promise((r) => setTimeout(r, 400));
  return 2;
}

export function onQuickstart(handler: (e: QuickstartEvent) => void): Promise<UnlistenFn> {
  if (!inDesktopApp) {
    preview.listeners.add(handler);
    return Promise.resolve(() => preview.listeners.delete(handler));
  }
  return listen<QuickstartEvent>("quickstart", (e) => handler(e.payload));
}

/** Downloads and sets up a starter; progress arrives through `onQuickstart`. */
export async function quickstart(name: string, kind: Starter, options: QuickstartOptions = {}): Promise<Created> {
  if (inDesktopApp) return invoke<Created>("project_quickstart", { name, kind, options });
  return preview.quickstart(name, kind);
}

export async function listProjects(): Promise<ProjectsInfo> {
  if (inDesktopApp) return invoke<ProjectsInfo>("projects_list");
  return preview.list();
}

export async function createProject(name: string, kind: NewKind): Promise<void> {
  if (inDesktopApp) return invoke("project_create", { name, kind });
  return preview.create(name, kind);
}

/** Adds the project addresses to the Windows hosts file; Windows asks the user to approve. */
export async function syncHosts(): Promise<void> {
  if (inDesktopApp) return invoke("projects_sync_hosts");
  return preview.sync();
}

export async function openProject(name: string, what: "folder" | "url" | "local"): Promise<void> {
  if (inDesktopApp) return invoke("project_open", { name, what });
}

/** Mirrors the backend's rule for folder names. */
export function nameProblem(name: string, existing: string[]): string | null {
  if (!name) return null;
  if (!/^[a-z0-9-]+$/.test(name)) return "Use lowercase letters, numbers and hyphens only, for example my-shop.";
  if (name.startsWith("-") || name.endsWith("-")) return "The name can't start or end with a hyphen.";
  if (name.length > 63) return "The name is too long.";
  if (existing.includes(name)) return `A project named "${name}" already exists.`;
  return null;
}

// Browser preview: a few simulated projects.
const preview = (() => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  function mk(name: string, kind: Project["kind"]): Project {
    return {
      name,
      kind,
      path: `C:\\NexDB\\www\\${name}`,
      doc_root: `C:\\NexDB\\www\\${name}${kind === "laravel" ? "\\public" : ""}`,
      host: `${name}.test`,
      url: `http://${name}.test/`,
      local_url: `http://localhost/${name}/`,
      php_warnings: name === "my-shop" ? 2 : 0,
    };
  }
  const projects: Project[] = [mk("blog", "wordpress"), mk("my-shop", "laravel"), mk("notes-api", "node")];
  let synced = false;
  const listeners = new Set<(e: QuickstartEvent) => void>();
  const send = (e: QuickstartEvent) => listeners.forEach((l) => l(e));
  return {
    listeners,
    async quickstart(name: string, kind: Starter): Promise<Created> {
      const steps = kind.startsWith("laravel")
        ? ["Creating the database", "Downloading Laravel", "Connecting it to the database", "Setting up the tables"]
        : ["Creating the app", "Installing JavaScript packages"];
      send({ kind: "plan", name, steps });
      for (let i = 0; i < steps.length; i++) {
        send({ kind: "step", name, index: i, status: "running" });
        send({ kind: "line", name, text: `> step ${i + 1} of ${steps.length} (simulated)` });
        for (const pct of [25, 60, 90]) {
          await sleep(250);
          send({ kind: "percent", name, index: i, percent: pct });
        }
        send({ kind: "step", name, index: i, status: "done" });
      }
      projects.push(mk(name, kind.startsWith("laravel") ? "laravel" : kind === "wordpress" ? "wordpress" : "node"));
      projects.sort((a, b) => a.name.localeCompare(b.name));
      synced = false;
      const db = kind.startsWith("laravel") || kind === "wordpress";
      return { run_hint: db ? null : "npm run dev", database: db ? name.replace(/-/g, "_") : null };
    },
    async list(): Promise<ProjectsInfo> {
      return {
        www_dir: "C:\\NexDB\\www",
        web_server: true,
        projects: [...projects],
        missing_hosts: synced ? [] : projects.filter((p) => p.host).map((p) => p.host as string),
      };
    },
    async create(name: string, kind: NewKind) {
      await sleep(400);
      projects.push(mk(name, kind === "html" ? "html" : kind === "empty" ? "empty" : "php"));
      projects.sort((a, b) => a.name.localeCompare(b.name));
      synced = false;
    },
    async sync() {
      await sleep(800);
      synced = true;
    },
  };
})();
