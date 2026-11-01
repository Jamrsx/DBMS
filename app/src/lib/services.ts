import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp } from "./scan";

export type ServiceState = "stopped" | "starting" | "running" | "failed" | "external";

export interface ServiceStatus {
  id: string;
  name: string;
  version: string | null;
  port: number;
  managed: boolean;
  state: ServiceState;
  /** For external services: whether something answers on the port. */
  listening: boolean;
  pid: number | null;
  uptime_secs: number | null;
  message: string | null;
}

export interface SetupInfo {
  installed: boolean;
  install_root: string | null;
  www_dir: string | null;
  /** A NexDB folder whose settings file is missing; setup repairs it. */
  repair_root?: string | null;
}

export async function setupInfo(): Promise<SetupInfo> {
  if (inDesktopApp) return invoke<SetupInfo>("setup_info");
  // `?view=dashboard` opens the dashboard directly in the browser preview.
  const forced = new URLSearchParams(location.search).get("view") === "dashboard";
  return { installed: preview.installed || forced, install_root: "C:\\NexDB", www_dir: "C:\\NexDB\\www" };
}

export async function listServices(): Promise<ServiceStatus[]> {
  if (inDesktopApp) return invoke<ServiceStatus[]>("services");
  return preview.status();
}

/** Starts one service, or every managed one when `id` is omitted. Rejects with the errors. */
export async function startServices(id?: string): Promise<void> {
  if (inDesktopApp) return invoke("start_services", { id: id ?? null });
  return preview.start(id);
}

export async function stopServices(id?: string): Promise<void> {
  if (inDesktopApp) return invoke("stop_services", { id: id ?? null });
  return preview.stop(id);
}

export async function serviceLog(id: string): Promise<string> {
  if (inDesktopApp) return invoke<string>("service_log", { id });
  return preview.log(id);
}

/** Lets the browser preview open the dashboard after a simulated install. */
export function markPreviewInstalled() {
  preview.installed = true;
}

const previewLogs: Record<string, string[]> = { php: [], apache: [], mysql: [], mailpit: [], redis: [] };

// Browser preview: a simulated stack shaped like a real one (Apache blocked by another
// program on port 80, PHP startable, an existing MySQL that is only watched).
const preview = (() => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const started: Record<string, number | null> = { php: null, apache: null, mailpit: null, redis: null };
  const errors: Record<string, string | null> = { php: null, apache: null, mailpit: null, redis: null };
  const logs = previewLogs;
  // Apache-style timestamps, e.g. "Sat Oct 31 08:39:23.000000 2026", so the readable view can translate them.
  const stamp = () => {
    const d = new Date();
    return `${d.toDateString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}.000000 ${d.getFullYear()}`;
  };
  const base: Omit<ServiceStatus, "state" | "pid" | "uptime_secs" | "message" | "listening">[] = [
    { id: "php", name: "PHP (FastCGI)", version: "8.4.5", port: 9085, managed: true },
    { id: "mysql", name: "MySQL", version: "8.0.30", port: 3306, managed: false },
    { id: "apache", name: "Apache", version: "2.4.63", port: 80, managed: true },
    { id: "mailpit", name: "Mail catcher", version: "1.33.0", port: 8025, managed: true },
    { id: "redis", name: "Redis", version: "8.10.3", port: 6379, managed: true },
  ];
  const PORT_80 = "Port 80 is already in use by httpd.exe (PID 9112). Stop that program, then press Start.";

  return {
    installed: false,
    status(): ServiceStatus[] {
      return base.map((s) => {
        if (!s.managed) {
          return {
            ...s,
            state: "external",
            listening: false,
            pid: null,
            uptime_secs: null,
            message: "Managed outside NexDB",
          };
        }
        const t = started[s.id];
        return {
          ...s,
          state: t ? "running" : errors[s.id] ? "failed" : "stopped",
          listening: !!t,
          pid: t ? (s.id === "php" ? 18044 : 20312) : null,
          uptime_secs: t ? Math.floor((Date.now() - t) / 1000) : null,
          message: errors[s.id],
        };
      });
    },
    async start(id?: string) {
      await sleep(700);
      const ids = id ? [id] : ["php", "apache", "mailpit", "redis"];
      const failures: string[] = [];
      for (const s of ids) {
        if (s === "apache") {
          errors.apache = PORT_80;
          logs.apache.push(
            `[${stamp()}] [core:error] [pid 9112:tid 1] (OS 10048) Only one usage of each socket address is normally permitted.  : AH00072: make_sock: could not bind to address 0.0.0.0:80`,
          );
          logs.apache.push(
            `[${stamp()}] [core:alert] [pid 9112:tid 1] AH00451: no listening sockets available, shutting down`,
          );
          failures.push(PORT_80);
        } else {
          started[s] = Date.now();
          errors[s] = null;
          logs[s].push(`--- ${s} starting ---`);
        }
      }
      if (failures.length) throw new Error(failures.join("\n"));
    },
    async stop(id?: string) {
      await sleep(400);
      for (const s of id ? [id] : ["apache", "php", "mailpit", "redis"]) {
        started[s] = null;
        errors[s] = null;
      }
    },
    log(id: string) {
      const lines = logs[id] ?? [];
      return lines.length ? lines.join("\n") : "No log output yet.";
    },
  };
})();

/** Empties a service's log files. */
export async function clearServiceLog(id: string): Promise<void> {
  if (inDesktopApp) return invoke("clear_service_log", { id });
  previewLogs[id] = [];
}
