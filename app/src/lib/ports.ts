import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp, type PortStatus } from "./scan";

/** Ports busy in the browser preview's sample scan. */
const PREVIEW_BUSY: Record<number, string> = {
  80: "System (Windows HTTP service)",
  3306: "mysqld.exe",
};

export async function checkPort(port: number, purpose: string): Promise<PortStatus> {
  if (inDesktopApp) {
    return invoke<PortStatus>("port_status", { port, purpose });
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  const process = PREVIEW_BUSY[port] ?? null;
  return { port, purpose, in_use: process !== null, pid: process ? 6120 : null, process };
}

export async function suggestPort(start: number): Promise<number | null> {
  if (inDesktopApp) {
    return invoke<number | null>("suggest_port", { start });
  }
  let port = start;
  while (PREVIEW_BUSY[port]) port += 1;
  return port;
}
