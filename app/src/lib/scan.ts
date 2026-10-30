import { invoke, isTauri } from "@tauri-apps/api/core";

export interface Install {
  path: string;
  version: string | null;
  version_from_folder: boolean;
  source: string;
  on_path: boolean;
  note: string | null;
}

export interface ComponentFinding {
  id: string;
  name: string;
  installs: Install[];
}

export interface PortStatus {
  port: number;
  purpose: string;
  in_use: boolean;
  pid: number | null;
  process: string | null;
}

export interface DiskSpace {
  mount: string;
  free_bytes: number;
  total_bytes: number;
}

export interface ScanReport {
  components: ComponentFinding[];
  ports: PortStatus[];
  vc_runtime: string | null;
  disk: DiskSpace | null;
  duration_ms: number;
}

/** True when running inside the desktop app; false in a plain browser preview. */
export const inDesktopApp = isTauri();

export async function runSystemScan(installRoot: string): Promise<ScanReport> {
  if (inDesktopApp) {
    return invoke<ScanReport>("system_scan", { installRoot });
  }
  // Browser preview: the scan needs the desktop app, so show fixed sample data.
  await new Promise((resolve) => setTimeout(resolve, 900));
  return PREVIEW_REPORT;
}

const PREVIEW_REPORT: ScanReport = {
  components: [
    {
      id: "php",
      name: "PHP",
      installs: [
        {
          path: "C:\\xampp\\php\\php.exe",
          version: "8.2.12",
          version_from_folder: false,
          source: "XAMPP",
          on_path: true,
          note: null,
        },
      ],
    },
    {
      id: "node",
      name: "Node.js",
      installs: [
        {
          path: "C:\\Program Files\\nodejs\\node.exe",
          version: "22.11.0",
          version_from_folder: false,
          source: "Program Files",
          on_path: true,
          note: null,
        },
      ],
    },
    {
      id: "apache",
      name: "Apache",
      installs: [
        {
          path: "C:\\xampp\\apache\\bin\\httpd.exe",
          version: "2.4.58",
          version_from_folder: false,
          source: "XAMPP",
          on_path: false,
          note: null,
        },
      ],
    },
    { id: "nginx", name: "nginx", installs: [] },
    {
      id: "mysql",
      name: "MySQL / MariaDB",
      installs: [
        {
          path: "C:\\xampp\\mysql\\bin\\mysqld.exe",
          version: "10.4.32",
          version_from_folder: false,
          source: "XAMPP",
          on_path: false,
          note: "MariaDB",
        },
      ],
    },
    {
      id: "git",
      name: "Git",
      installs: [
        {
          path: "C:\\Program Files\\Git\\cmd\\git.exe",
          version: "2.47.1",
          version_from_folder: false,
          source: "Program Files",
          on_path: true,
          note: null,
        },
      ],
    },
  ],
  ports: [
    { port: 80, purpose: "Web server (HTTP)", in_use: true, pid: 4, process: "System (Windows HTTP service)" },
    { port: 443, purpose: "Web server (HTTPS)", in_use: false, pid: null, process: null },
    { port: 3306, purpose: "MySQL", in_use: true, pid: 6120, process: "mysqld.exe" },
    { port: 8800, purpose: "Database manager", in_use: false, pid: null, process: null },
  ],
  vc_runtime: null,
  disk: { mount: "C:\\", free_bytes: 64.3 * 2 ** 30, total_bytes: 476 * 2 ** 30 },
  duration_ms: 900,
};
