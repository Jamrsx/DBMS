import { invoke, pause } from "./invoke";
import { inDesktopApp } from "./scan";
import { onPractice } from "./practice";

export interface DockerInfo {
  installed: boolean;
  running: boolean;
  version: string | null;
}

export interface Container {
  id: string;
  name: string;
  image: string;
  /** "running", "exited", "paused", "created", "restarting"… */
  state: string;
  /** Docker's own words, like "Up 3 minutes". */
  status: string;
  ports: string;
}

// The browser preview and practice: two sample containers.
const sample = (): Container[] => [
  {
    id: "c1",
    name: "cache",
    image: "redis:7",
    state: "running",
    status: "Up 3 minutes",
    ports: "0.0.0.0:6380->6379/tcp",
  },
  {
    id: "c2",
    name: "old-postgres",
    image: "postgres:16",
    state: "exited",
    status: "Exited (0) 2 hours ago",
    ports: "",
  },
];
let preview = sample();
onPractice(() => {
  preview = sample();
});

export async function dockerInfo(): Promise<DockerInfo> {
  if (inDesktopApp) return invoke<DockerInfo>("docker_info");
  return { installed: true, running: true, version: "27.3.1" };
}

export async function dockerList(): Promise<Container[]> {
  if (inDesktopApp) return invoke<Container[]>("docker_list");
  return preview.map((c) => ({ ...c }));
}

export async function dockerAction(id: string, what: "start" | "stop" | "restart"): Promise<void> {
  if (inDesktopApp) return invoke("docker_action", { id, what });
  await pause(700);
  preview = preview.map((c) =>
    c.id !== id
      ? c
      : what === "stop"
        ? { ...c, state: "exited", status: "Exited (0) just now" }
        : { ...c, state: "running", status: "Up less than a second" },
  );
}

export async function dockerLogs(id: string): Promise<string> {
  if (inDesktopApp) return invoke<string>("docker_logs", { id });
  const c = preview.find((x) => x.id === id);
  return c?.image.startsWith("redis")
    ? "1:M 05 Nov 2026 09:00:01.123 * Ready to accept connections tcp\n"
    : "LOG:  database system is shut down\n";
}

/** "0.0.0.0:6380->6379/tcp, :::6380->6379/tcp" → ["localhost:6380"], the addresses you'd open. */
export function hostPorts(ports: string): string[] {
  const out = new Set<string>();
  for (const m of ports.matchAll(/(?:[\d.]+|\[?::\]?):(\d+)->/g)) out.add(`localhost:${m[1]}`);
  return [...out];
}
