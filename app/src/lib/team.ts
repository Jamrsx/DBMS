import { invoke, pause } from "./invoke";
import { inDesktopApp } from "./scan";
import { onPractice } from "./practice";

export interface TeamSetup {
  nexdb: number;
  project: string;
  php: string | null;
  services: string[];
  database: string | null;
  env_folder: string;
  env: { key: string; value: string }[];
}

export interface TeamCheck {
  setup: TeamSetup;
  missing: string[];
  has_env: boolean;
  php_here: string | null;
}

// Practice and the browser preview: the sample blog has a setup file once you share it.
let previewSetup: TeamSetup | null = null;
onPractice(() => {
  previewSetup = null;
});

export async function exportTeamSetup(name: string): Promise<string> {
  if (inDesktopApp) return invoke<string>("team_setup_export", { name });
  await pause(500);
  previewSetup = {
    nexdb: 1,
    project: name,
    php: "8.5.12",
    services: ["mysql", "redis", "mailpit"],
    database: name,
    env_folder: "",
    env: [
      { key: "APP_NAME", value: "Blog" },
      { key: "APP_KEY", value: "" },
      { key: "DB_CONNECTION", value: "mysql" },
      { key: "DB_DATABASE", value: name },
      { key: "DB_PASSWORD", value: "" },
    ],
  };
  return `C:\\NexDB\\www\\${name}\\nexdb-setup.json`;
}

export async function checkTeamSetup(name: string): Promise<TeamCheck | null> {
  if (inDesktopApp) return invoke<TeamCheck | null>("team_setup_check", { name });
  return previewSetup ? { setup: previewSetup, missing: [], has_env: true, php_here: "8.5.12" } : null;
}

export async function applyTeamSetup(name: string): Promise<string[]> {
  if (inDesktopApp) return invoke<string[]>("team_setup_apply", { name });
  await pause(500);
  return ["Everything the file asks for was already set."];
}

export const SERVICE_NAMES: Record<string, string> = {
  mysql: "MySQL",
  mariadb: "MariaDB",
  postgres: "PostgreSQL",
  mongodb: "MongoDB",
  redis: "Redis",
  memcached: "Memcached",
  mailpit: "Mail catcher",
};
