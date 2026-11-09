import { invoke } from "./invoke";
import { isPractice } from "./practice";
import { realDesktopApp } from "./scan";

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
    }
  | { state: "needs_checkin"; key_hint: string; check_by: number }
  | { state: "expired"; key_hint: string; expires_at: number }
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

/** Where people get a key. */
export const BUY_URL = "https://nexdb.test/#price";

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
  days_left: 140,
};

/** Browser preview only: `?license=none` shows the license screen. */
const previewNone = !realDesktopApp && new URLSearchParams(location.search).get("license") === "none";

export const licenseStatus = (): Promise<LicenseStatus> =>
  previewNone
    ? Promise.resolve({ state: "none", notice: null })
    : !realDesktopApp || isPractice()
      ? Promise.resolve(SAMPLE)
      : invoke<LicenseStatus>("license_status");

export const activateLicense = (key: string, name: string, email: string, moveHere = false) =>
  invoke<LicenseOutcome>("license_activate", { key, name, email, moveHere });

export const checkInLicense = (): Promise<LicenseOutcome> =>
  !realDesktopApp || isPractice()
    ? Promise.resolve({ ok: true, status: SAMPLE, code: null, message: null, device: null, moves_left: 3 })
    : invoke<LicenseOutcome>("license_check_in");

export const unlinkLicense = (): Promise<LicenseOutcome> =>
  isPractice()
    ? Promise.resolve({ ok: true, status: { state: "none", notice: null }, code: null, message: null, device: null, moves_left: 2 })
    : invoke<LicenseOutcome>("license_unlink");

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
