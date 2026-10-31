import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp } from "./scan";

export interface AppSettings {
  app_version: string;
  install_root: string;
  www_dir: string;
  apache_port: number | null;
  php_port: number;
  mysql_port: number | null;
  start_services_on_launch: boolean;
}

const preview: AppSettings = {
  app_version: "0.1.0",
  install_root: "C:\\NexDB",
  www_dir: "C:\\NexDB\\www",
  apache_port: 80,
  php_port: 9085,
  mysql_port: 3306,
  start_services_on_launch: false,
};

export async function getAppSettings(): Promise<AppSettings> {
  if (inDesktopApp) return invoke<AppSettings>("app_settings");
  return { ...preview };
}

/** Saves new ports; running services are restarted on them. Rejects with a readable reason. */
export async function savePorts(apache: number | null, php: number, mysql: number | null): Promise<void> {
  if (inDesktopApp) return invoke("save_ports", { apache, php, mysql });
  await new Promise((r) => setTimeout(r, 600));
  if (apache !== null && apache === mysql) throw "Web server and MySQL can't share the same port. Give each its own port.";
  Object.assign(preview, { apache_port: apache, php_port: php, mysql_port: mysql });
}

export async function setStartServicesOnLaunch(on: boolean): Promise<void> {
  if (inDesktopApp) return invoke("set_start_services_on_launch", { on });
  preview.start_services_on_launch = on;
}

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "available"; version: string; notes: string | null; date: string | null }
  | { kind: "downloading"; percent: number | null }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type Update = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>;
let pending: Update = null;

/** Asks the update server whether a newer NexDB exists. */
export async function checkForUpdate(): Promise<UpdateState> {
  if (!inDesktopApp) {
    await new Promise((r) => setTimeout(r, 700));
    return { kind: "available", version: "0.2.0", notes: "Versions page, readable logs and Settings.", date: null };
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    pending = await check();
    if (!pending) return { kind: "current" };
    return { kind: "available", version: pending.version, notes: pending.body ?? null, date: pending.date ?? null };
  } catch (err) {
    return { kind: "error", message: friendlyUpdateError(err) };
  }
}

/** Downloads and installs the update found by `checkForUpdate`, reporting progress. */
export async function installUpdate(onProgress: (percent: number | null) => void): Promise<UpdateState> {
  if (!inDesktopApp) {
    for (let p = 10; p <= 100; p += 30) {
      onProgress(p);
      await new Promise((r) => setTimeout(r, 300));
    }
    return { kind: "ready" };
  }
  if (!pending) return { kind: "error", message: "Check for updates first." };
  try {
    let total = 0;
    let done = 0;
    await pending.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      if (event.event === "Progress") {
        done += event.data.chunkLength;
        onProgress(total ? Math.min(100, Math.round((done / total) * 100)) : null);
      }
    });
    return { kind: "ready" };
  } catch (err) {
    return { kind: "error", message: friendlyUpdateError(err) };
  }
}

export async function restartApp(): Promise<void> {
  if (!inDesktopApp) return;
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

function friendlyUpdateError(err: unknown): string {
  const text = String(err);
  if (/signature/i.test(text)) return "The update didn't pass NexDB's safety check, so it wasn't installed.";
  if (/(404|not found|valid release JSON|Could not fetch)/i.test(text))
    return "No update information is published yet. Try again later.";
  if (/(network|dns|connect|timed out|offline|error sending request)/i.test(text))
    return "Couldn't reach the update server. Check your internet connection and try again.";
  return `The update check failed: ${text}`;
}
