import { useSyncExternalStore } from "react";
import type { NexState } from "../components/Nex";

/** Something Nex says from the corner: a mood and a short line. */
export interface NexLine {
  id: number;
  state: NexState;
  text: string;
  /** How long Nex stays, in ms. */
  ms: number;
}

let current: NexLine | null = null;
let next = 1;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Nex peeks from the corner and says `text`, then goes away by itself. */
export function nexSay(state: NexState, text: string, ms = 4500) {
  current = { id: next++, state, text, ms };
  clearTimeout(timer);
  timer = setTimeout(nexHide, ms);
  emit();
}

export const nexCelebrate = (text: string) => nexSay("success", text);
export const nexOops = (text: string) => nexSay("error", text, 6500);

export function nexHide() {
  clearTimeout(timer);
  current = null;
  emit();
}

export function useNexLine(): NexLine | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

const GREETED_KEY = "nexdb.nexGreeted";
const GREET_EVERY_MS = 6 * 60 * 60 * 1000;

/** A hello when NexDB opens, at most every few hours so it never nags. */
export function nexGreet() {
  try {
    const last = Number(localStorage.getItem(GREETED_KEY) ?? 0);
    if (Date.now() - last < GREET_EVERY_MS) return;
    localStorage.setItem(GREETED_KEY, String(Date.now()));
  } catch {
    // No storage: greet anyway.
  }
  const h = new Date().getHours();
  const part = h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  setTimeout(() => nexSay("hello", `${part}! I'm Nex. Your stack is one click away on the Dashboard.`, 5500), 1200);
}
