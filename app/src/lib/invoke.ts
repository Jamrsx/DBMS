import { invoke as tauriInvoke, type InvokeArgs } from "@tauri-apps/api/core";
import { isPractice } from "./practice";

/*
 * Feedback for every action (HCI: visibility of system status). The button the user just
 * pressed shows a spinner until the work it started is done, on every page, without each page
 * wiring it up: NexDB's calls go through `invoke` below, and a call made right after a click
 * belongs to the button clicked. Background refreshes don't follow a click, so they never spin
 * a button. Styles: `[data-working]` in styles.css.
 */

let pressed: { el: HTMLElement; at: number } | null = null;

if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element | null)?.closest?.("button");
      if (el instanceof HTMLElement) pressed = { el, at: performance.now() };
    },
    true,
  );
}

/** Shows the pressed button as working until `work` settles, when it was started by a click. */
export function track<T>(work: Promise<T>): Promise<T> {
  const el = pressed && performance.now() - pressed.at < 150 ? pressed.el : null;
  if (!el) return work;
  const count = (n: number) => {
    if (n > 0) el.dataset.working = String(n);
    else delete el.dataset.working;
  };
  count(Number(el.dataset.working ?? 0) + 1);
  const done = () => count(Number(el.dataset.working ?? 1) - 1);
  work.then(done, done);
  return work;
}

/** Tauri's invoke, with the pressed button's spinner. */
export function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  // A safety net for practice mode: no call reaches the real backend while Nex is showing a feature.
  if (isPractice()) return Promise.reject("Practice mode: this would change your PC, so NexDB skipped it.");
  return track(tauriInvoke<T>(cmd, args));
}

/** The browser preview's pretend wait, which spins the pressed button like real work. */
export function pause(ms: number): Promise<void> {
  return track(new Promise((r) => setTimeout(r, ms)));
}
