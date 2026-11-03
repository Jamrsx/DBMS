import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp } from "./scan";

/** The Laravel buttons. */
export type LaravelAction = "migrate" | "seed" | "storage_link" | "clear";

/** What a button did, in plain words, with artisan's own output for the curious. */
export interface Outcome {
  ok: boolean;
  summary: string;
  output: string;
}

export interface LogEntry {
  time: string;
  level: "error" | "warning" | "info";
  message: string;
  /** Where it happened ("app/Models/User.php line 42"). */
  place: string | null;
  detail: string;
}

export interface LogView {
  /** The log file shown, relative to the project. */
  file: string | null;
  /** Newest first. */
  entries: LogEntry[];
}

export type WorkerKind = "queue" | "schedule";

export interface WorkerInfo {
  kind: WorkerKind;
  running: boolean;
  /** Its last output lines. */
  tail: string[];
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Browser preview: a Laravel app with a few log entries and workers that start and stop.
const previewWorkers: Record<string, Record<WorkerKind, boolean>> = {};
const previewOutcomes: Record<LaravelAction, Outcome> = {
  migrate: {
    ok: true,
    summary: "Created or changed tables: 2 migrations ran.",
    output:
      "INFO  Running migrations.\n\n  2026_10_30_120000_create_members_table ........ 18ms DONE\n  2026_11_01_090000_add_church_to_members ....... 9ms DONE",
  },
  seed: {
    ok: false,
    summary: "Can't reach the database. Start MySQL on the Dashboard, then try again.",
    output: "SQLSTATE[HY000] [2002] No connection could be made because the target machine actively refused it",
  },
  storage_link: {
    ok: true,
    summary: "Uploaded files are now reachable at /storage.",
    output: "INFO  The [public/storage] link has been connected to [storage/app/public].",
  },
  clear: {
    ok: true,
    summary: "Cleared the cached config, routes, views and events.",
    output: "INFO  Clearing cached bootstrap files.",
  },
};

export async function runLaravel(name: string, action: LaravelAction): Promise<Outcome> {
  if (inDesktopApp) return invoke("laravel_run", { name, action });
  await pause(900);
  return previewOutcomes[action];
}

export async function laravelLogs(name: string): Promise<LogView> {
  if (inDesktopApp) return invoke("laravel_logs", { name });
  await pause(200);
  return {
    file: "Backend/storage/logs/laravel.log",
    entries: [
      {
        time: "2026-11-03 09:05:12",
        level: "error",
        message: "Call to undefined method App\\Models\\Member::churches()",
        place: "app/Http/Controllers/MemberController.php line 42",
        detail:
          "[stacktrace]\n#0 vendor/laravel/framework/src/Illuminate/Support/Traits/ForwardsCalls.php(67)\n#1 app/Http/Controllers/MemberController.php(42)",
      },
      {
        time: "2026-11-03 09:01:40",
        level: "warning",
        message: "Slow query on members (1.8 s)",
        place: null,
        detail: "",
      },
      { time: "2026-11-03 09:00:01", level: "info", message: "User signed in", place: null, detail: "" },
    ],
  };
}

const previewInfo = (name: string): WorkerInfo[] =>
  (["queue", "schedule"] as const).map((kind) => {
    const running = previewWorkers[name]?.[kind] ?? false;
    const tail = running
      ? kind === "queue"
        ? ["INFO  Processing jobs from the [default] queue.", "App\\Jobs\\SendReceipt ........ 120ms DONE"]
        : ["INFO  Running scheduled tasks."]
      : [];
    return { kind, running, tail };
  });

export async function laravelWorkers(name: string): Promise<WorkerInfo[]> {
  if (inDesktopApp) return invoke("laravel_workers", { name });
  return previewInfo(name);
}

/** Starts the queue worker or scheduler; it keeps running until stopped or NexDB closes. */
export async function startWorker(name: string, kind: WorkerKind): Promise<WorkerInfo[]> {
  if (inDesktopApp) return invoke("laravel_worker_start", { name, kind });
  await pause(1200);
  (previewWorkers[name] ??= { queue: false, schedule: false })[kind] = true;
  return previewInfo(name);
}

export async function stopWorker(name: string, kind: WorkerKind): Promise<WorkerInfo[]> {
  if (inDesktopApp) return invoke("laravel_worker_stop", { name, kind });
  (previewWorkers[name] ??= { queue: false, schedule: false })[kind] = false;
  return previewInfo(name);
}
