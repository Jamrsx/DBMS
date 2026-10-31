import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inDesktopApp } from "./scan";

export interface PmaStatus {
  installed: boolean;
  version: string | null;
  url: string;
  web_server: boolean;
}

export interface ToolProgress {
  message: string | null;
  bytes_done: number;
  bytes_total: number | null;
}

let previewInstalled = false;

export async function pmaStatus(): Promise<PmaStatus> {
  if (inDesktopApp) return invoke<PmaStatus>("phpmyadmin_status");
  return { installed: previewInstalled, version: previewInstalled ? "5.2.3" : null, url: "http://localhost/phpmyadmin/", web_server: true };
}

/** Downloads and sets up phpMyAdmin; `onProgress` gets download progress. */
export async function pmaInstall(onProgress: (p: ToolProgress) => void): Promise<void> {
  if (!inDesktopApp) {
    for (let i = 1; i <= 5; i++) {
      onProgress({ message: null, bytes_done: i * 3_000_000, bytes_total: 15_000_000 });
      await new Promise((r) => setTimeout(r, 250));
    }
    previewInstalled = true;
    return;
  }
  const unlisten = await listen<ToolProgress>("tool-progress", (e) => onProgress(e.payload));
  try {
    await invoke("phpmyadmin_install");
  } finally {
    unlisten();
  }
}

export async function pmaOpen(): Promise<void> {
  if (inDesktopApp) await invoke("phpmyadmin_open");
}
