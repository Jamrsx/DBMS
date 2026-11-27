import { invoke } from "./invoke";
import { inDesktopApp, type PortStatus } from "./scan";
import { getAppSettings, savePorts } from "./appsettings";
import { startServices, type ServiceStatus } from "./services";

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

/** Services whose port the user can change (Settings → Ports): the web server, PHP and MySQL. */
export const MOVABLE_PORT = ["apache", "nginx", "php", "mysql"];

/** The next free port after a service's taken one, skipping ports NexDB's other services use. */
export async function nextFreePort(service: ServiceStatus, all: ServiceStatus[]): Promise<number | null> {
  const others = new Set(all.filter((s) => s.id !== service.id).map((s) => s.port));
  let port = await suggestPort(service.port + 1);
  while (port !== null && others.has(port) && port < 65535) port = await suggestPort(port + 1);
  return port;
}

/** Saves `port` as the service's port (the same as Settings → Ports), then starts the service. */
export async function moveServiceToPort(service: ServiceStatus, port: number): Promise<void> {
  const s = await getAppSettings();
  const web = service.id === "apache" || service.id === "nginx";
  await savePorts(
    web ? port : s.apache_port,
    service.id === "php" ? port : s.php_port,
    service.id === "mysql" ? port : s.mysql_port,
  );
  await startServices(service.id);
}
