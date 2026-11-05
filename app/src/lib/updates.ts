import { useSyncExternalStore } from "react";
import { checkForUpdate, installUpdate, restartApp, type UpdateState } from "./appsettings";
import { nexCelebrate, nexOops, nexSay } from "./nex";
import { isPractice, storageKey } from "./practice";
import { inDesktopApp } from "./scan";

/** The newest version Nex already announced, so an hourly check doesn't repeat itself. */
let announced: string | null = null;

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
  /** This install is the update skipped last time, done by itself as NexDB opened. */
  auto: boolean;
}

/** An update found but not installed yet: if NexDB closes first, it installs on the next launch. */
const SKIPPED_KEY = "nexdb.updateSkipped";
/** "off" when the user would rather install updates only by hand. */
const AUTO_KEY = "nexdb.autoUpdate";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Without storage the update is simply offered again next time.
  }
}

/** Installs an update you skipped, the next time NexDB opens (on unless turned off in Settings). */
// In practice the switch has its own copy, so trying it changes nothing for real.
export const autoUpdateOn = () => read(storageKey(AUTO_KEY)) !== "off";

export function setAutoUpdate(on: boolean) {
  write(storageKey(AUTO_KEY), on ? null : "off");
  set({});
}

const FIRST_CHECK_MS = 8_000;
const EVERY_MS = 60 * 60 * 1000;
/** Opening the window checks again when the last check is older than this. */
const ON_SHOW_MS = 15 * 60 * 1000;
let lastCheck = 0;

let current: Updates = { state: { kind: "idle" }, dismissed: null, installing: false, auto: false };
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
  // In practice NexDB runs on sample data, and a check would only find the sample "update".
  if (busy || isPractice()) return;
  if (!quiet) set({ state: { kind: "checking" } });
  lastCheck = Date.now();
  const result = await checkForUpdate();
  if (isPractice()) return;
  if (quiet && result.kind === "error") return;
  set({ state: result });
  // Remember a found update until it's installed; with no newer one, there's nothing to remember.
  if (result.kind === "available") write(SKIPPED_KEY, result.version);
  if (result.kind === "current") write(SKIPPED_KEY, null);
  if (result.kind === "available" && result.version !== announced) {
    announced = result.version;
    nexSay("hello", `NexDB ${result.version} is out! Update from the card on the left whenever you like.`, 6000);
  } else if (!quiet && result.kind === "current") {
    nexCelebrate("You have the latest NexDB.");
  }
}

export async function installUpdates(auto = false) {
  set({ installing: true, auto, state: { kind: "downloading", percent: 0 } });
  const result = await installUpdate((percent) => set({ state: { kind: "downloading", percent } }));
  set({ state: result });
  if (result.kind === "ready") {
    write(SKIPPED_KEY, null);
    if (auto) {
      // Nothing to click: it was the update you skipped, and NexDB only just opened.
      nexCelebrate("Updated! NexDB restarts in a moment.");
      setTimeout(() => void restartApp(), 2500);
    } else nexCelebrate("Update installed! Restart NexDB to use it.");
  }
  if (result.kind === "error") nexOops("The update didn't install. Settings says why.");
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
  // An update was skipped last time (NexDB closed before it was installed): install it now,
  // right as NexDB opens, before you're in the middle of something.
  const skipped = read(SKIPPED_KEY);
  if (skipped && autoUpdateOn() && inDesktopApp) {
    setTimeout(async () => {
      await checkUpdates(true);
      if (current.state.kind === "available" && !isPractice()) {
        nexSay("loading", `Installing NexDB ${current.state.version}, the update you skipped last time…`, 6000);
        void installUpdates(true);
      }
    }, 1500);
  } else setTimeout(() => void checkUpdates(true), FIRST_CHECK_MS);
  // Keep checking while NexDB sits in the tray too, and again whenever its window is opened.
  setInterval(() => void checkUpdates(true), EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastCheck > ON_SHOW_MS) void checkUpdates(true);
  });
}
