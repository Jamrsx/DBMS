import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const openTerminal = (cols: number, rows: number, project?: string) =>
  invoke<number>("terminal_open", { cols, rows, project: project ?? null });
export const writeTerminal = (id: number, data: string) => invoke("terminal_write", { id, data });
export const resizeTerminal = (id: number, cols: number, rows: number) => invoke("terminal_resize", { id, cols, rows });
/** Opens the terminal in a window of its own. */
export const openTerminalWindow = (project?: string) => invoke("terminal_window", { project: project ?? null });
export const closeTerminal = (id: number) => invoke("terminal_close", { id });

export function onTerminalOutput(handler: (id: number, data: string) => void): Promise<UnlistenFn> {
  return listen<{ id: number; data: string }>("terminal-output", (e) => handler(e.payload.id, e.payload.data));
}

export function onTerminalExit(handler: (id: number) => void): Promise<UnlistenFn> {
  return listen<{ id: number }>("terminal-exit", (e) => handler(e.payload.id));
}
