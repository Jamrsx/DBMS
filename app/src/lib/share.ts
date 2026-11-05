import { invoke, pause } from "./invoke";
import { onPractice } from "./practice";
import { inDesktopApp } from "./scan";

/** Sharing state for one project, from the Share panel's point of view. */
export interface ShareInfo {
  /** The project's own port while it is shared on the local network. */
  port: number | null;
  lan_ip: string | null;
  lan_url: string | null;
  /** Its fixed name on the Wi-Fi (blog.local) while it's shared. */
  lan_name?: string | null;
  /** The user's fixed link (https://my-app.ngrok-free.app), when one is set up in Settings. */
  fixed_address?: string | null;
  /** The share using the fixed link right now ("blog", "blog#dev"), its link and password. */
  fixed?: { key: string; url: string; password: string | null } | null;
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
  /** The password its public link asks for, when it asks for one. */
  public_password?: string | null;
  /** The project's dev server, when it is passed through a share port. */
  dev: {
    port: number;
    target: number;
    url: string | null;
    qr: string | null;
    running: boolean;
    public_url: string | null;
    public_qr: string | null;
    public_password?: string | null;
  } | null;
  /** Its front end and Laravel backend on one link, when shared that way. */
  app: {
    port: number;
    front: string;
    backend: string;
    /** The front end's dev server port; null serves its built folder. */
    dev: number | null;
    url: string | null;
    qr: string | null;
    /** Its dev server answers, or its built folder exists. */
    front_ready: boolean;
    public_url: string | null;
    public_qr: string | null;
    public_password?: string | null;
  } | null;
  /** The front end and backend folders found in the project. */
  app_parts: AppParts | null;
}

export interface AppParts {
  front: string;
  front_label: string;
  backend: string;
  dev_port: number;
  /** Its built folder ("web/dist"), once built. */
  built: string | null;
}

/** Which of a project's shares a public link goes to: its site, dev server or whole app. */
export type ShareKind = "" | "dev" | "app";

// Browser preview: a pretend share on a home network.
const qr =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><rect width="21" height="21" fill="#fff"/><path d="M1 1h7v7H1zM13 1h7v7h-7zM1 13h7v7H1zM10 10h2v2h-2zM14 14h3v3h-3z" fill="#000"/></svg>';
const preview: Record<string, ShareInfo> = {};
// Practice mode: the sample blog is already on the Wi-Fi with public links installed, and starts fresh each time.
onPractice((on) => {
  for (const k of Object.keys(preview)) delete preview[k];
  if (on)
    preview.blog = {
      ...base("blog"),
      port: 8181,
      lan_url: "http://192.168.1.20:8181/",
      lan_name: "blog.local",
      lan_qr: qr,
      firewall_ready: true,
      tunnel_installed: true,
    };
});
const base = (name: string): ShareInfo => ({
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
  app: null,
  // The preview's blog is split like parish: a Vite app in web, its API in Backend.
  app_parts:
    name === "blog"
      ? { front: "web", front_label: "Vite", backend: "Backend", dev_port: 5173, built: "web/dist" }
      : null,
});

export async function shareInfo(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_info", { name });
  return { ...(preview[name] ??= base(name)) };
}

/** Shares the project on its own port; the web server restarts if it runs. */
export async function startShare(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_start", { name });
  await pause(600);
  const s = (preview[name] ??= base(name));
  Object.assign(s, { port: 8181, lan_url: "http://192.168.1.20:8181/", lan_name: `${name}.local`, lan_qr: qr });
  return { ...s };
}

export async function stopShare(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_stop", { name });
  await pause(400);
  preview[name] = {
    ...base(name),
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

/** A public link to the shared site, its shared dev server ("dev") or its whole app ("app"). */
export async function startPublicLink(
  name: string,
  what: ShareKind = "",
  password: string | null = null,
): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_public_start", { name, what, password });
  await pause(1500);
  const s = (preview[name] ??= base(name));
  const link = { public_url: "https://brave-otter-sample.trycloudflare.com", public_qr: qr, public_password: password };
  Object.assign((what && s[what]) || s, link);
  return { ...s };
}

export async function stopPublicLink(name: string, what: ShareKind = ""): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_public_stop", { name, what });
  const s = (preview[name] ??= base(name));
  Object.assign((what && s[what]) || s, { public_url: null, public_qr: null, public_password: null });
  return { ...s };
}

/** Shares the front end and Laravel backend on one link; `dev` is the front end's dev server
 * port, or null for its built folder. The web server restarts if it runs. */
export async function startAppShare(
  name: string,
  front: string,
  backend: string,
  dev: number | null,
): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_app_start", { name, front, backend, dev });
  await pause(600);
  const s = (preview[name] ??= base(name));
  s.app = {
    port: 8183,
    front,
    backend,
    dev,
    url: "http://192.168.1.20:8183/",
    qr,
    front_ready: true,
    public_url: null,
    public_qr: null,
  };
  return { ...s };
}

export async function stopAppShare(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_app_stop", { name });
  const s = (preview[name] ??= base(name));
  s.app = null;
  return { ...s };
}

/** Passes the project's running dev server (Vite on 5173…) through its own share port. */
export async function startDevShare(name: string, target: number): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_dev_start", { name, target });
  await pause(600);
  const s = (preview[name] ??= base(name));
  s.dev = {
    port: 8182,
    target,
    url: "http://192.168.1.20:8182/",
    qr,
    running: true,
    public_url: null,
    public_qr: null,
  };
  return { ...s };
}

export async function stopDevShare(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_dev_stop", { name });
  const s = (preview[name] ??= base(name));
  s.dev = null;
  return { ...s };
}

/** Marks public links as installed in the browser preview (the real install goes through Versions). */
export function previewTunnelInstalled(name: string) {
  if (!inDesktopApp) (preview[name] ??= base(name)).tunnel_installed = true;
}

/** A password that's easy to read out and type, like k7mq-2xpa-9rtd. */
export function sharePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const s = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/** Points the fixed link (ngrok or Cloudflare) at this project's site ("") , dev server or app. */
export async function startFixedLink(
  name: string,
  what: ShareKind = "",
  password: string | null = null,
): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_fixed_start", { name, what, password });
  await pause(1200);
  const s = (preview[name] ??= base(name));
  s.fixed = { key: what ? `${name}#${what}` : name, url: s.fixed_address ?? "https://my-app.ngrok-free.app", password };
  return { ...s };
}

export async function stopFixedLink(name: string): Promise<ShareInfo> {
  if (inDesktopApp) return invoke("share_fixed_stop", { name });
  await pause(300);
  const s = (preview[name] ??= base(name));
  s.fixed = null;
  return { ...s };
}

export interface FixedLinkInfo {
  provider: "ngrok" | "cloudflare" | null;
  address: string | null;
  has_token: boolean;
  /** Where NexDB found ngrok.exe. */
  ngrok: string | null;
  /** The port the provider points at on this PC. */
  port: number;
}

const previewFixed: FixedLinkInfo = { provider: null, address: null, has_token: false, ngrok: null, port: 8899 };

export async function fixedLinkInfo(): Promise<FixedLinkInfo> {
  if (inDesktopApp) return invoke("fixed_link_info");
  return { ...previewFixed };
}

/** Saves the fixed-link account; provider null removes it. An empty token keeps the saved one. */
export async function saveFixedLink(
  provider: "ngrok" | "cloudflare" | null,
  address: string,
  token: string,
): Promise<void> {
  if (inDesktopApp) return invoke("fixed_link_save", { provider, address, token });
  await pause(300);
  Object.assign(previewFixed, {
    provider,
    address: provider ? address.replace(/^https?:\/\//, "").split("/")[0] : null,
    has_token: !!provider && (!!token || previewFixed.has_token),
  });
  for (const s of Object.values(preview)) s.fixed_address = provider ? `https://${previewFixed.address}` : null;
}

export async function pickNgrok(): Promise<string | null> {
  if (inDesktopApp) return invoke("fixed_link_pick_ngrok");
  previewFixed.ngrok = "C:\\Users\\you\\AppData\\Local\\ngrok\\ngrok.exe";
  return previewFixed.ngrok;
}
