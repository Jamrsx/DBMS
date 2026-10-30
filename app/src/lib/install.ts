import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inDesktopApp } from "./scan";
import type { InstallPlan } from "./plan";

export type StepStatus = "running" | "done" | "failed" | "cancelled";

export interface Progress {
  step: string;
  status: StepStatus;
  message: string | null;
  bytes_done: number;
  bytes_total: number | null;
}

/**
 * What the Rust installer receives. The MySQL password is passed in separately and only
 * here, so it never ends up in the plan, the Review screen or saved settings.
 */
export function installRequest(plan: InstallPlan, mysqlPassword: string) {
  return {
    install_root: plan.installRoot,
    www_dir: plan.wwwDir,
    items: plan.components
      .filter((c) => c.action === "install" && c.version)
      .map((c) => ({ id: c.id, version: c.version as string })),
    existing: plan.components
      .filter((c) => c.action === "use-existing")
      .map((c) => ({ id: c.id, path: c.path })),
    mysql:
      plan.mysql?.mode === "new" && plan.mysql.dataDir
        ? {
            port: plan.mysql.port,
            password: plan.mysql.hasPassword ? mysqlPassword : null,
            data_dir: plan.mysql.dataDir,
            autostart: plan.mysql.autostart,
            existing: false,
          }
        : plan.mysql?.mode === "existing"
          ? // Only the port is recorded; an existing MySQL keeps its own password and data.
            { port: plan.mysql.port, password: null, data_dir: null, autostart: false, existing: true }
          : null,
  };
}

/** Runs the install, calling `onProgress` for every update. Rejects with the first error. */
export async function runInstall(
  plan: InstallPlan,
  mysqlPassword: string,
  onProgress: (p: Progress) => void,
) {
  if (!inDesktopApp) return simulateInstall(plan, onProgress);
  const unlisten = await listen<Progress>("install-progress", (e) => onProgress(e.payload));
  try {
    await invoke("run_install", { request: installRequest(plan, mysqlPassword) });
  } finally {
    unlisten();
  }
}

export async function cancelInstall() {
  if (!inDesktopApp) {
    previewCancelled = true;
    return;
  }
  await invoke("cancel_install");
}

// Browser preview: fake progress so the screen can be tried without downloading anything.
let previewCancelled = false;

async function simulateInstall(plan: InstallPlan, onProgress: (p: Progress) => void) {
  previewCancelled = false;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const emit = (step: string, status: StepStatus, extra: Partial<Progress> = {}) =>
    onProgress({ step, status, message: null, bytes_done: 0, bytes_total: null, ...extra });

  const messages: Record<string, string> = {
    "vc-runtime": "Installed",
    "config-apache": "Config checked · port 80",
    "config-nginx": `Config checked · port ${plan.components.some((c) => c.id === "apache") ? 8080 : 80}`,
    "mysql-init": "Data folder created · root password set",
    "local-ca": "Created · Trusted for .test and localhost sites",
    save: "Saved settings",
  };
  const stop = (step: string) => {
    emit(step, "cancelled");
    throw new Error("Installation cancelled.");
  };

  // Same order as the plan, which is the order the real installer runs in.
  for (const { id: step } of plan.steps) {
    if (previewCancelled) stop(step);
    if (step.startsWith("get-")) {
      const total = 30 * 2 ** 20;
      for (let done = 0; done <= total; done += total / 8) {
        if (previewCancelled) stop(step);
        emit(step, "running", { message: "Downloading", bytes_done: done, bytes_total: total });
        await sleep(120);
      }
      emit(step, "running", { message: "Unpacking" });
      await sleep(150);
      emit(step, "done");
    } else {
      const waiting =
        step === "vc-runtime"
          ? "Waiting for administrator approval"
          : step === "local-ca"
            ? "Waiting for you to confirm in Windows"
            : null;
      emit(step, "running", { message: waiting });
      await sleep(400);
      emit(step, "done", { message: messages[step] ?? null });
    }
  }
}
