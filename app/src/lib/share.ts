import { invoke } from "@tauri-apps/api/core";
import { inDesktopApp } from "./scan";

/** Sharing state for one project, from the Share panel's point of view. */
export interface ShareInfo {
  /** The project's own port while it is shared on the local network. */
  port: number | null;
  lan_ip: string | null;
  lan_url: string | null;
  /** QR code of `lan_url`, as SVG markup made by NexDB. */
  lan_qr: string | null;
  firewall_ready: boolean;
  /** False on a network Windows calls public, where phones are kept out. */
  network_private: boolean | null;
  web_server: boolean;
  web_running: boolean;
  tunnel_installed: boolean;
  tunnel_version: string | null;
  tunnel_size: number | null;
  public_url: string | null;
  public_qr: string | null;
  /** The project's dev server, when it is passed through a share port. */
  dev: { port: number; target: number; url: string | null; qr: string | null; running: boolean } | null;
}

// Browser preview: a pretend share on a home network.
const qr =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><rect width="21" height="21" fill="#fff"/><path d="M1 1h7v7H1zM13 1h7v7h-7zM1 13h7v7H1zM10 10h2v2h-2zM14 14h3v3h-3z" fill="#000"/></svg>';
const preview: Record<string, ShareInfo> = {};
const base = (): ShareInfo => ({
  port: null,
  lan_ip: "192.168.1.20",
  lan_url: null,
  lan_qr: null,
  firewall_ready: false,
  network_private: true,
  web_server: true,
  web_running: true,
  tunnel_installed: false,
  tunnel_version: "2026.10.7",
  tunnel_size: 55390512,
  public_url: null,
  public_qr: null,
  dev: null,
});
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function shareInfo(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_info", { name });
  return { ...(preview[name] ??= base()) };
}

/** Shares the project on its own port; the web server restarts if it runs. */
export async function startShare(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_start", { name });
  await pause(600);
  const s = (preview[name] ??= base());
  Object.assign(s, { port: 8181, lan_url: "http://192.168.1.20:8181/", lan_qr: qr });
  return { ...s };
}

export async function stopShare(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_stop", { name });
  await pause(400);
  preview[name] = {
    ...base(),
    firewall_ready: preview[name]?.firewall_ready ?? false,
    tunnel_installed: preview[name]?.tunnel_installed ?? false,
  };
  return { ...preview[name] };
}

/** Asks Windows (one approval) to let phones reach shared projects on private networks. */
export async function allowFirewall(): Promise<void> {
  if (inDesktopApp) return invoke("share_allow_firewall");
  await pause(800);
  for (const s of Object.values(preview)) s.firewall_ready = true;
}

export async function startPublicLink(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_public_start", { name });
  await pause(1500);
  const s = (preview[name] ??= base());
  Object.assign(s, { public_url: "https://brave-otter-sample.trycloudflare.com", public_qr: qr });
  return { ...s };
}

export async function stopPublicLink(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_public_stop", { name });
  const s = (preview[name] ??= base());
  Object.assign(s, { public_url: null, public_qr: null });
  return { ...s };
}

/** Passes the project's running dev server (Vite on 5173…) through its own share port. */
export async function startDevShare(name: string, target: number): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_dev_start", { name, target });
  await pause(600);
  const s = (preview[name] ??= base());
  s.dev = { port: 8182, target, url: "http://192.168.1.20:8182/", qr, running: false };
  return { ...s };
}

export async function stopDevShare(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_dev_stop", { name });
  const s = (preview[name] ??= base());
  s.dev = null;
  return { ...s };
}

/** Marks public links as installed in the browser preview (the real install goes through Versions). */
export function previewTunnelInstalled(name: string) {
  if (!inDesktopApp) (preview[name] ??= base()).tunnel_installed = true;
}
