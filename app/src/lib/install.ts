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

/** Steps the installer can run so far; the rest arrive in later parts. */
export function isImplemented(stepId: string) {
  return stepId === "folders" || stepId.startsWith("get-");
}

export function installRequest(plan: InstallPlan) {
  return {
    install_root: plan.installRoot,
    www_dir: plan.wwwDir,
    items: plan.components
      .filter((c) => c.action === "install" && c.version)
      .map((c) => ({ id: c.id, version: c.version as string })),
  };
}

/** Runs the install, calling `onProgress` for every update. Rejects with the first error. */
export async function runInstall(plan: InstallPlan, onProgress: (p: Progress) => void) {
  if (!inDesktopApp) return simulateInstall(plan, onProgress);
  const unlisten = await listen<Progress>("install-progress", (e) => onProgress(e.payload));
  try {
    await invoke("run_install", { request: installRequest(plan) });
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

  emit("folders", "running");
  await sleep(200);
  emit("folders", "done");
  for (const item of installRequest(plan).items) {
    const step = `get-${item.id}`;
    const total = 30 * 2 ** 20;
    for (let done = 0; done <= total; done += total / 8) {
      if (previewCancelled) {
        emit(step, "cancelled");
        throw new Error("Installation cancelled.");
      }
      emit(step, "running", { message: "Downloading", bytes_done: done, bytes_total: total });
      await sleep(120);
    }
    emit(step, "running", { message: "Unpacking" });
    await sleep(150);
    emit(step, "done");
  }
}
