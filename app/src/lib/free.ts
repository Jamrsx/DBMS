import { invoke, pause } from "./invoke";
import type { LicenseOutcome } from "./license";
import { isPractice } from "./practice";
import { realDesktopApp } from "./scan";

/** NexDB Free's own calls. The browser preview and practice mode use sample data. */
const sample = () => !realDesktopApp || isPractice();

/** A PHP or Node folder on this computer. */
export interface LocalVersion {
  id: "php" | "node";
  version: string;
  folder: string;
  active: boolean;
  /** It passed NexDB's checks and can be selected. */
  ready: boolean;
  problem: string | null;
}

/** A `.test` site that is paused while NexDB is in Free. */
export interface PausedSite {
  name: string;
  host: string;
  local_url: string;
  can_use_localhost: boolean;
}

const sampleVersions: LocalVersion[] = [
  { id: "php", version: "8.3.36", folder: "php-8.3.36", active: true, ready: true, problem: null },
  { id: "php", version: "8.4.27", folder: "php-8.4.27", active: false, ready: true, problem: null },
  { id: "node", version: "26.13.1", folder: "node-26.13.1", active: true, ready: true, problem: null },
];

const samplePaused: PausedSite[] = new URLSearchParams(location.search).has("paused")
  ? [
      { name: "shop", host: "shop.test", local_url: "http://localhost/shop/public/", can_use_localhost: true },
      { name: "blog", host: "blog.test", local_url: "http://localhost/blog/", can_use_localhost: false },
    ]
  : [];

export const localVersions = (): Promise<LocalVersion[]> =>
  sample() ? Promise.resolve(sampleVersions.map((v) => ({ ...v }))) : invoke<LocalVersion[]>("local_versions");

export async function checkLocalVersion(id: string, folder: string): Promise<string> {
  if (!sample()) return invoke<string>("local_version_check", { id, folder });
  await pause(400);
  return folder.slice(folder.indexOf("-") + 1);
}

/** Mac: choose a PHP or Node installed some other way. Null when the person cancels. */
export const pickLocalVersion = (id: string): Promise<string | null> =>
  sample() ? Promise.resolve(null) : invoke<string | null>("local_version_pick", { id });

/** Opens the folder where hand-added versions go. */
export const openVersionFolder = (id: string): Promise<void> =>
  sample() ? Promise.resolve() : invoke<void>("local_version_open", { id });

export const pausedSites = (): Promise<PausedSite[]> =>
  sample() ? Promise.resolve(samplePaused) : invoke<PausedSite[]>("paused_sites");

export async function useLocalhost(name: string): Promise<void> {
  if (!sample()) return invoke<void>("project_use_localhost", { name });
  await pause(300);
}

/** Starts the one-click 14-day free trial. */
export async function startTrial(): Promise<LicenseOutcome> {
  if (!sample()) return invoke<LicenseOutcome>("license_start_trial");
  await pause(500);
  const now = Math.floor(Date.now() / 1000);
  return {
    ok: true,
    code: null,
    message: null,
    device: null,
    moves_left: null,
    status: {
      state: "active",
      plan: "Free trial · 14 days",
      name: null,
      email: null,
      key_hint: "7KQ2",
      lifetime: false,
      expires_at: now + 14 * 86400,
      check_by: now + 14 * 86400,
      days_left: 14,
      features: [],
      trial: true,
    },
  };
}
