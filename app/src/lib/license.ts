import { invoke } from "./invoke";
import { isPractice } from "./practice";
import { realDesktopApp } from "./scan";
import licenseServer from "../../license-server.json";

/** The license on this PC, as the Rust side reports it. */
export type LicenseStatus =
  | { state: "none"; notice: string | null }
  | {
      state: "active";
      plan: string | null;
      name: string | null;
      email: string | null;
      key_hint: string;
      lifetime: boolean;
      expires_at: number | null;
      check_by: number;
      days_left: number | null;
      /** Extra app features the plan includes ("nexhost"). */
      features: string[];
    }
  | { state: "needs_checkin"; key_hint: string; check_by: number }
  | {
      state: "grace";
      plan: string | null;
      seller: string | null;
      name?: string | null;
      email?: string | null;
      key_hint: string;
      expires_at: number;
      grace_until: number;
      features: string[];
    }
  | { state: "expired"; key_hint: string; expires_at: number; plan: string | null; seller: string | null }
  | { state: "clock_back"; key_hint: string };

/** What the website said to an activate, check-in or unlink. */
export interface LicenseOutcome {
  ok: boolean;
  status: LicenseStatus | null;
  /** not_found, revoked, expired, lapsed, other_device, move_limit, moved, offline... */
  code: string | null;
  message: string | null;
  device: string | null;
  moves_left: number | null;
}

/** The license website, from app/license-server.json (the one file to change when the site goes live). */
export const LICENSE_SITE = licenseServer.site.replace(/\/+$/, "");

/** Where people get a key. */
export const BUY_URL = `${LICENSE_SITE}/#price`;

/** Sample license for practice mode and the browser preview: nothing real is read or changed. */
const SAMPLE: LicenseStatus = {
  state: "active",
  plan: "6 months",
  name: "Sample Student",
  email: "student@example.com",
  key_hint: "7KQ2",
  lifetime: false,
  expires_at: Math.floor(Date.now() / 1000) + 140 * 86400,
  check_by: Math.floor(Date.now() / 1000) + 25 * 86400,
  features: [],
  days_left: 140,
};

/** Browser preview only: `?license=none` shows the license screen. */
const previewNone = !realDesktopApp && new URLSearchParams(location.search).get("license") === "none";

export const licenseStatus = (): Promise<LicenseStatus> =>
  previewNone
    ? Promise.resolve({ state: "none", notice: null })
    : previewLicense()
      ? Promise.resolve(previewLicense()!)
    : !realDesktopApp || isPractice()
      ? Promise.resolve(SAMPLE)
      : invoke<LicenseStatus>("license_status");

export const activateLicense = (key: string, name: string, email: string, password: string, moveHere = false) =>
  invoke<LicenseOutcome>("license_activate", { key, name, email, password, moveHere });

/** Sign in with the NexDB account (made on the first activation) on another PC. */
export const signInLicense = (email: string, password: string, moveHere = false) =>
  invoke<LicenseOutcome>("license_sign_in", { email, password, moveHere });

/** Where people reset a forgotten NexDB account password. */
export const FORGOT_URL = `${licenseServer.site.replace(/\/+$/, "")}/forgot-password`;

/** "3 days", "5 hours", "12 minutes" from now until `until` (seconds). */
export function timeLeft(until: number): string {
  const secs = Math.max(0, until - Math.floor(Date.now() / 1000));
  const [n, unit] =
    secs >= 86400 ? [Math.ceil(secs / 86400), "day"] : secs >= 3600 ? [Math.ceil(secs / 3600), "hour"] : [Math.max(1, Math.ceil(secs / 60)), "minute"];
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export const checkInLicense = (): Promise<LicenseOutcome> =>
  !realDesktopApp || isPractice()
    ? Promise.resolve({ ok: true, status: SAMPLE, code: null, message: null, device: null, moves_left: 3 })
    : invoke<LicenseOutcome>("license_check_in");

export const unlinkLicense = (): Promise<LicenseOutcome> =>
  isPractice()
    ? Promise.resolve({ ok: true, status: { state: "none", notice: null }, code: null, message: null, device: null, moves_left: 2 })
    : invoke<LicenseOutcome>("license_unlink");

/** A plan people can buy, from the website. */
export interface BuyPlan {
  id: number;
  name: string;
  price: number;
  days: number | null;
  /** Short test plans count in minutes. */
  minutes?: number | null;
  lifetime: boolean;
  /** The plan this license had. */
  current?: boolean;
  /** Sold on the website (false: renew through a reseller or NexDB). */
  buyable?: boolean;
}

const SAMPLE_PLANS: { plans: BuyPlan[]; buy_url: string } = {
  plans: [
    { id: 1, name: "6 months", price: 25000, days: 182, lifetime: false, current: true, buyable: true },
    { id: 2, name: "1 year", price: 45000, days: 365, lifetime: false },
    { id: 3, name: "Lifetime", price: 349900, days: null, lifetime: true },
  ],
  buy_url: BUY_URL,
};

export const licensePlans = (current: string | null): Promise<{ plans: BuyPlan[]; buy_url: string }> =>
  realDesktopApp ? invoke("license_plans", { current }) : Promise.resolve(SAMPLE_PLANS);

/** NexDB works normally: an active license, or one that ended within the last 3 days. */
export const licenseWorks = (s: LicenseStatus | null) => s?.state === "active" || s?.state === "grace";

/** Whether the license works and its plan includes `name` (like "nexhost"). */
export const hasFeature = (s: LicenseStatus | null, name: string): boolean =>
  (s?.state === "active" || s?.state === "grace") && (s.features ?? []).includes(name);

/** Browser preview only: `?license=grace` or `?license=expired` shows those screens. */
const previewState = !realDesktopApp ? new URLSearchParams(location.search).get("license") : null;
const nowSecs = () => Math.floor(Date.now() / 1000);
export const previewLicense = (): LicenseStatus | null =>
  previewState === "grace"
    ? { state: "grace", plan: "6 months", seller: null, name: "Sample Student", email: "student@example.com", key_hint: "7KQ2", expires_at: nowSecs() - 3600, grace_until: nowSecs() + 3 * 86400 - 3600, features: [] }
    : previewState === "expired"
      ? { state: "expired", plan: "6 months", seller: "Alpha Shop", key_hint: "7KQ2", expires_at: nowSecs() - 4 * 86400 }
      : null;

export const thisDevice = (): Promise<string> => (realDesktopApp ? invoke<string>("license_device") : Promise.resolve("THIS-PC"));

/** "NEXDB-7KQ2-…" as people type it: uppercase, groups of four, dashes added for them. */
export function formatKey(raw: string): string {
  const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = chars.startsWith("NEXDB") ? chars.slice(5) : chars;
  const groups = body.slice(0, 16).match(/.{1,4}/g) ?? [];
  return ["NEXDB", ...groups].join("-").replace(/^NEXDB$/, raw.trim() ? "NEXDB-" : "");
}

export const keyLooksComplete = (key: string) => /^NEXDB(-[A-Z0-9]{4}){4}$/.test(key);

export const dateOf = (seconds: number) =>
  new Date(seconds * 1000).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
