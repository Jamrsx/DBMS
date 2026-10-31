import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp } from "./scan";

export interface HttpsInfo {
  enabled: boolean;
  port: number;
  /** Windows trusts NexDB's certificate, so browsers show no warning. */
  trusted: boolean;
  /** HTTPS needs NexDB's Apache. */
  web_server: boolean;
}

const preview: HttpsInfo = { enabled: false, port: 443, trusted: false, web_server: true };

export async function getHttps(): Promise<HttpsInfo> {
  if (inDesktopApp) return invoke<HttpsInfo>("https_status");
  return { ...preview };
}

/** Turns HTTPS on or off; Apache restarts if it is running. Rejects with a readable reason. */
export async function setHttps(on: boolean): Promise<void> {
  if (inDesktopApp) return invoke("set_https", { on });
  await new Promise((r) => setTimeout(r, 600));
  preview.enabled = on;
}

/** Asks Windows to trust NexDB's certificate; resolves to whether it is trusted now. */
export async function trustHttps(): Promise<boolean> {
  if (inDesktopApp) return invoke<boolean>("https_trust");
  await new Promise((r) => setTimeout(r, 600));
  preview.trusted = true;
  return true;
}
