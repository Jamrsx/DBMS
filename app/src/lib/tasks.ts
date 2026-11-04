import { useSyncExternalStore } from "react";

/*
 * Background tasks: long jobs (project setup, new projects, downloads, imports, backups) live
 * here instead of in the page that started them, so leaving the page doesn't lose them. The work
 * itself already runs to the end in NexDB's backend; this keeps its progress and result, so a
 * page shows them again when it comes back, and the sidebar's Tasks button lists them all.
 */

export type TaskStatus = "running" | "done" | "failed";

export interface Task<D = unknown> {
  /** Stable per job ("setup:parish", "new-project", "version:php"), so a page finds its own. */
  id: string;
  title: string;
  status: TaskStatus;
  /** One line about where it is now ("composer install", "Downloading · 40%"). */
  detail: string | null;
  /** 0–100 when known. */
  percent: number | null;
  /** How it ended, in plain words. */
  message: string | null;
  started: number;
  ended: number | null;
  /** The page's own progress state, kept with the task. */
  data: D;
}

let tasks: Task[] = [];
const listeners = new Set<() => void>();

function emit() {
  tasks = [...tasks];
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getTask<D>(id: string): Task<D> | undefined {
  return tasks.find((t) => t.id === id) as Task<D> | undefined;
}

/** Changes a task's fields; `data` can be updated from its previous value. */
export function updateTask<D>(id: string, patch: Partial<Omit<Task<D>, "data">> & { data?: D | ((d: D) => D) }) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  const { data, ...rest } = patch;
  // A new object each time, so pages reading one task see the change.
  const next = { ...t, ...rest };
  if (data !== undefined) next.data = typeof data === "function" ? (data as (d: D) => D)(t.data as D) : data;
  tasks = tasks.map((x) => (x.id === id ? next : x));
  emit();
}

/**
 * Runs `work` as a task. A task with the same id that is still running is not started twice;
 * its promise is returned instead. `work` resolves to a short note on how it went (or nothing).
 */
const running = new Map<string, Promise<unknown>>();
export function runTask<D, T>(
  id: string,
  title: string,
  data: D,
  work: (update: (patch: Parameters<typeof updateTask<D>>[1]) => void) => Promise<T>,
  done?: (result: T) => string | null,
): Promise<T> {
  const existing = running.get(id);
  if (existing) return existing as Promise<T>;
  tasks = tasks.filter((t) => t.id !== id);
  tasks.unshift({
    id,
    title,
    status: "running",
    detail: null,
    percent: null,
    message: null,
    started: Date.now(),
    ended: null,
    data,
  });
  emit();
  const p = work((patch) => updateTask<D>(id, patch))
    .then((result) => {
      updateTask(id, { status: "done", ended: Date.now(), percent: null, message: done?.(result) ?? null });
      return result;
    })
    .catch((e) => {
      const text = String(e).replace(/^Error: /, "");
      updateTask(id, { status: "failed", ended: Date.now(), percent: null, message: text });
      throw e;
    })
    .finally(() => running.delete(id));
  running.set(id, p);
  return p;
}

/** Removes a finished task from the list. */
export function dismissTask(id: string) {
  tasks = tasks.filter((t) => t.id !== id || t.status === "running");
  emit();
}

/** Removes every finished task. */
export function clearFinished() {
  tasks = tasks.filter((t) => t.status === "running");
  emit();
}

export function useTasks(): Task[] {
  return useSyncExternalStore(subscribe, () => tasks);
}

export function useTask<D>(id: string): Task<D> | undefined {
  return useSyncExternalStore(subscribe, () => tasks.find((t) => t.id === id)) as Task<D> | undefined;
}
