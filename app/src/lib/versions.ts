import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inDesktopApp } from "./scan";

export type VersionLabel = "recommended" | "latest" | "lts" | "security-fix" | "ends-soon";

export interface Available {
  version: string;
  line: string;
  labels: VersionLabel[];
  note: string | null;
  downloadable: boolean;
  download_size: number | null;
  installed: boolean;
  allowed: boolean;
}

export interface ComponentVersions {
  id: string;
  name: string;
  kind: "runtime" | "tool";
  about: string;
  /** The version in use was deleted from disk. */
  missing: boolean;
  active: string | null;
  installed: { version: string; active: boolean }[];
  hint: { kind: "update" | "line"; version: string; message: string } | null;
  available: Available[];
  note: string | null;
}

export interface VersionsInfo {
  catalog_date: string;
  components: ComponentVersions[];
}

export async function versionsOverview(): Promise<VersionsInfo> {
  if (inDesktopApp) return invoke<VersionsInfo>("versions_overview");
  return previewInfo();
}

export interface MissingPart {
  id: string;
  name: string;
  version: string | null;
  path: string;
}

/** Parts of NexDB whose files are gone, for example after their folder was deleted. */
export async function missingComponents(): Promise<MissingPart[]> {
  if (inDesktopApp) return invoke<MissingPart[]>("missing_components");
  return previewMissing();
}

/** Downloads a version (or reinstalls a missing one). Resolves with an extra note for the user, if any. */
export async function installVersion(id: string, version: string, onProgress: (percent: number | null) => void): Promise<string | null> {
  if (!inDesktopApp) {
    for (let p = 20; p <= 100; p += 40) {
      onProgress(p);
      await new Promise((r) => setTimeout(r, 300));
    }
    preview.installed[id] = [...(preview.installed[id] ?? []), version];
    if (id === "composer" || id === "git") preview.active[id] = version;
    return null;
  }
  const unlisten = await listen<{ bytes_done: number; bytes_total: number | null }>("tool-progress", (e) =>
    onProgress(e.payload.bytes_total ? Math.round((e.payload.bytes_done / e.payload.bytes_total) * 100) : null),
  );
  try {
    return await invoke<string | null>("version_install", { id, version });
  } finally {
    unlisten();
  }
}

export async function useVersion(id: string, version: string): Promise<void> {
  if (inDesktopApp) return invoke("version_use", { id, version });
  await new Promise((r) => setTimeout(r, 500));
  preview.active[id] = version;
}

export async function removeVersion(id: string, version: string): Promise<void> {
  if (inDesktopApp) return invoke("version_remove", { id, version });
  preview.installed[id] = (preview.installed[id] ?? []).filter((v) => v !== version);
}

export function formatMb(bytes: number | null): string {
  return bytes ? `${Math.round(bytes / 2 ** 20)} MB` : "";
}

// Browser preview: an install where Node.js and Composer were deleted and Git isn't installed yet.
const preview = {
  active: { php: "8.5.12", apache: "2.4.69", mysql: "9.7.4", node: "26.13.0", composer: "2.11.0" } as Record<string, string>,
  installed: { php: ["8.5.12"], apache: ["2.4.69"], mysql: ["9.7.4"], node: [], composer: [], git: [] } as Record<string, string[]>,
};

const NAMES: Record<string, string> = { php: "PHP", apache: "Apache", mysql: "MySQL", node: "Node.js", composer: "Composer", git: "Git" };
const ABOUT: Record<string, string> = {
  php: "Runs your PHP sites and tools like Laravel and WordPress.",
  apache: "The web server that opens your projects at localhost and .test addresses.",
  mysql: "The database server your apps and phpMyAdmin connect to.",
  node: "Runs JavaScript tools: npm, Vite and front-end builds.",
  composer: "Installs PHP packages, for example to create a Laravel project.",
  git: "Downloads and versions code, for example with git clone in the Terminal.",
};

function previewMissing(): MissingPart[] {
  return Object.entries(preview.active)
    .filter(([id, v]) => !(preview.installed[id] ?? []).includes(v))
    .map(([id, v]) => ({ id, name: NAMES[id], version: v, path: `C:\NexDB\bin\${id}` }));
}

function previewInfo(): VersionsInfo {
  const catalog: Record<string, [string, string, VersionLabel[], number][]> = {
    php: [["8.5", "8.5.13", ["recommended", "latest"], 32], ["8.4", "8.4.20", [], 31], ["8.3", "8.3.28", ["ends-soon"], 30]],
    apache: [["2.4", "2.4.69", ["recommended", "latest"], 12]],
    mysql: [["9.7", "9.7.4", ["recommended", "lts", "latest"], 330], ["8.4", "8.4.9", ["lts"], 310]],
    node: [["26", "26.13.0", ["latest"], 34], ["24", "24.15.0", ["recommended", "lts"], 33]],
    composer: [["2.11.0", "2.11.0", ["latest"], 3]],
    git: [["2.56.0.4", "2.56.0.4", ["latest"], 38]],
  };
  return {
    catalog_date: "2026-10-30",
    components: Object.entries(catalog).map(([id, rows]) => {
      const active = preview.active[id] ?? null;
      const installed = (preview.installed[id] ?? []).map((v) => ({ version: v, active: v === active }));
      const missing = active !== null && !installed.some((i) => i.active);
      const activeLine = active ? rows.find(([line]) => active.startsWith(line + "."))?.[0] : undefined;
      const tool = id === "composer" || id === "git";
      return {
        id,
        name: NAMES[id],
        kind: tool ? "tool" : "runtime",
        about: ABOUT[id],
        missing,
        active,
        installed,
        hint:
          id === "php" && active === "8.5.12"
            ? { kind: "update", version: "8.5.13", message: "PHP 8.5.13 is out. It fixes bugs and security issues in the 8.5 line you use, so it's safe to update." }
            : null,
        note: id === "mysql" ? "Your databases stay where they are when you switch within the same MySQL line." : null,
        available: rows.map(([line, version, labels, mb]) => ({
          version,
          line,
          labels,
          note: null,
          downloadable: true,
          download_size: mb * 2 ** 20,
          installed: installed.some((i) => i.version === version),
          allowed: id !== "mysql" || line === activeLine,
        })),
      };
    }),
  };
}
