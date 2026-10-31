import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp } from "./scan";

export interface Project {
  name: string;
  path: string;
  kind: "laravel" | "wordpress" | "node" | "php" | "html" | "empty";
  doc_root: string;
  host: string | null;
  url: string;
  local_url: string;
}

export interface ProjectsInfo {
  www_dir: string;
  web_server: boolean;
  projects: Project[];
  missing_hosts: string[];
}

export type NewKind = "php" | "html" | "empty";

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
    };
  }
  const projects: Project[] = [mk("blog", "wordpress"), mk("my-shop", "laravel"), mk("notes-api", "node")];
  let synced = false;
  return {
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
