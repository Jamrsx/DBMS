import { useSyncExternalStore } from "react";
import { checkForUpdate, installUpdate, type UpdateState } from "./appsettings";

/**
 * One update state for the whole app, so the notice, the Settings dot and the Settings page
 * always agree. NexDB checks quietly on launch and every few hours.
 */
interface Updates {
  state: UpdateState;
  /** The version the user said "Later" to; hidden until a newer one appears or NexDB restarts. */
  dismissed: string | null;
  /** True once the user started an install, so its progress and errors stay on screen. */
  installing: boolean;
}

const FIRST_CHECK_MS = 8_000;
const EVERY_MS = 60 * 60 * 1000;
/** Opening the window checks again when the last check is older than this. */
const ON_SHOW_MS = 15 * 60 * 1000;
let lastCheck = 0;

let current: Updates = { state: { kind: "idle" }, dismissed: null, installing: false };
const listeners = new Set<() => void>();

function set(change: Partial<Updates>) {
  current = { ...current, ...change };
  listeners.forEach((l) => l());
}

export function useUpdates(): Updates {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** A check the user asked for shows its errors; a background check stays quiet when it fails. */
export async function checkUpdates(quiet = false) {
  const busy = current.state.kind === "downloading" || current.state.kind === "ready";
  if (busy) return;
  if (!quiet) set({ state: { kind: "checking" } });
  lastCheck = Date.now();
  const result = await checkForUpdate();
  if (quiet && result.kind === "error") return;
  set({ state: result });
}

export async function installUpdates() {
  set({ installing: true, state: { kind: "downloading", percent: 0 } });
  const result = await installUpdate((percent) => set({ state: { kind: "downloading", percent } }));
  set({ state: result });
}

export function dismissUpdate() {
  const s = current.state;
  if (s.kind === "available") set({ dismissed: s.version });
  else set({ installing: false });
}

let started = false;

/** Starts the quiet checks once per launch. */
export function startUpdateChecks() {
  if (started) return;
  started = true;
  setTimeout(() => void checkUpdates(true), FIRST_CHECK_MS);
  // Keep checking while NexDB sits in the tray too, and again whenever its window is opened.
  setInterval(() => void checkUpdates(true), EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastCheck > ON_SHOW_MS) void checkUpdates(true);
  });
}
