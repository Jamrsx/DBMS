import { invoke, pause } from "./invoke";
import { inDesktopApp } from "./scan";

export type HealthLevel = "ok" | "info" | "warn" | "bad";
export type HealthArea = "Services" | "Sites" | "Sharing" | "Projects" | "This PC";

/** One finding of "Check my setup", with the fix NexDB can do for it. */
export interface HealthCheck {
  area: HealthArea;
  level: HealthLevel;
  title: string;
  detail: string | null;
  /** action: "firewall", "hosts", "configs", "trust", "dashboard", "versions" or "project:<name>". */
  fix: { action: string; label: string } | null;
}

// Browser preview: a PC with a busy port, an address to add and a project to set up.
let previewFixed = new Set<string>();
const previewChecks = (): HealthCheck[] =>
  [
    {
      area: "Services",
      level: "bad",
      title: "Port 80 is already in use by httpd.exe (PID 9112)",
      detail: "Apache can't start while it does. Close that program, or change Apache's port in Settings.",
      fix: { action: "dashboard", label: "Open Dashboard" },
    },
    {
      area: "Sites",
      level: "warn",
      title: "2 project addresses are not set up",
      detail: "blog.test, my-shop.test only open as localhost/name until Windows knows them. Windows asks once.",
      fix: { action: "hosts", label: "Set up addresses" },
    },
    {
      area: "Sharing",
      level: "info",
      title: "Windows Firewall blocks phones from shared projects",
      detail: "One rule for ports 8181 to 8199 on private networks lets them in. Windows asks for your permission.",
      fix: { action: "firewall", label: "Allow phones" },
    },
    {
      area: "Projects",
      level: "warn",
      title: "blog isn't set up yet",
      detail: "It still needs: backend: install its php packages (composer install).",
      fix: { action: "project:blog", label: "Open project" },
    },
    { area: "This PC", level: "ok", title: "Enough disk space", detail: null, fix: null },
  ].map((c): HealthCheck =>
    c.fix && previewFixed.has(c.fix.action)
      ? { area: c.area as HealthArea, level: "ok", title: "Fixed", detail: null, fix: null }
      : (c as HealthCheck),
  );

export async function runHealthCheck(): Promise<HealthCheck[]> {
  if (inDesktopApp) return invoke("health_check");
  await pause(900);
  return previewChecks();
}

/** Writes the web server's and PHP's settings again; the web server restarts if it runs. */
export async function fixConfigs(): Promise<void> {
  if (inDesktopApp) return invoke("health_fix_configs");
  await pause(800);
}

/** Moves a damaged PostgreSQL data folder aside (kept) and makes a fresh one. */
export async function resetPostgres(): Promise<void> {
  if (inDesktopApp) return invoke("health_reset_postgres");
  await pause(1500);
}

/** Saves the support report where the user picks; resolves to its path, or null when cancelled. */
export async function saveSupportReport(): Promise<string | null> {
  if (inDesktopApp) return invoke("health_report");
  await pause(1200);
  return "C:\\Users\\you\\Downloads\\nexdb-report-0.4.0.zip";
}

/** Marks a fix as done in the browser preview. */
export function previewFixedNow(action: string) {
  if (!inDesktopApp) previewFixed = new Set([...previewFixed, action]);
}
