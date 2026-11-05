import { useEffect, useState } from "react";

/*
 * Practice mode: while Nex shows a new feature, NexDB runs on its sample data (the same data
 * the browser preview uses) and refuses every call to the real backend, so nothing on the PC
 * changes: no files, databases, services, settings or links.
 */

let on = false;
const listeners = new Set<(on: boolean) => void>();

export const isPractice = () => on;

export function setPractice(next: boolean) {
  if (next === on) return;
  // Each practice starts fresh: last time's sample history and saved queries are dropped.
  try {
    for (const k of Object.keys(localStorage)) if (k.endsWith(".practice")) localStorage.removeItem(k);
  } catch {
    // Storage blocked: practice still works, it just may show last time's sample work.
  }
  on = next;
  for (const l of listeners) l(on);
}

export function onPractice(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePractice(): boolean {
  const [value, setValue] = useState(on);
  useEffect(() => {
    setValue(on);
    return onPractice(setValue);
  }, []);
  return value;
}

/** Keys the app keeps in local storage get their own copy in practice, so the sample work vanishes after. */
export const storageKey = (key: string) => (on ? `${key}.practice` : key);
