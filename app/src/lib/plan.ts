import type { Settings } from "../App";
import type { Choices } from "./catalog";
import type { ScanReport } from "./scan";
import type { Selections } from "../steps/Components";
import { effectiveDataDir, type MysqlMode, type MysqlSettings } from "../steps/MySQL";

export type ComponentAction = "install" | "use-existing";

export interface PlannedComponent {
  id: string;
  name: string;
  action: ComponentAction;
  version: string | null;
  /** Install target for new installs, or the existing install's executable. */
  path: string;
  /** Where an existing install came from, e.g. "XAMPP". */
  source: string | null;
}

export interface PlannedMysql {
  mode: "new" | "existing";
  port: number;
  /** Whether a root password was given. The password itself never enters the plan. */
  hasPassword: boolean;
  dataDir: string | null;
  autostart: boolean;
}

export interface PlanStep {
  id: string;
  title: string;
  /** Needs a Windows administrator (UAC) prompt. */
  admin: boolean;
  /** Windows shows its own confirmation dialog (not an admin prompt). */
  confirm?: boolean;
}

/** Same rule as the installer: Apache Lounge VS18 builds need runtime 14.50 or newer. */
export function vcRuntimeOk(version: string | null | undefined): boolean {
  if (!version) return false;
  const [major = 0, minor = 0] = version.replace(/^v/, "").split(".").map((n) => Number(n) || 0);
  return major > 14 || (major === 14 && minor >= 50);
}

export interface InstallPlan {
  installRoot: string;
  wwwDir: string;
  components: PlannedComponent[];
  mysql: PlannedMysql | null;
  steps: PlanStep[];
}

export interface PlanInput {
  settings: Settings;
  selections: Selections;
  choices: Choices;
  scan: ScanReport | null;
  mysql: { mode: MysqlMode; value: MysqlSettings } | null;
}

/** Folder names under `bin\` for each component. */
const BIN_FOLDER: Record<string, string> = {
  apache: "apache",
  nginx: "nginx",
  php: "php",
  mysql: "mysql",
  node: "nodejs",
  composer: "composer",
};

const ORDER = ["apache", "nginx", "php", "mysql", "node", "composer"];

export function buildPlan({ settings, selections, choices, scan, mysql }: PlanInput): InstallPlan {
  const root = settings.installRoot.trim().replace(/\\+$/, "");
  const names = new Map(choices.components.map((c) => [c.id, c.name]));
  names.set("composer", "Composer");

  const components: PlannedComponent[] = ORDER.filter((id) => selections[id]?.enabled).map(
    (id) => {
      const sel = selections[id];
      const name = names.get(id) ?? id;
      if (sel.existingPath) {
        const found = scan?.components
          .find((c) => c.id === id)
          ?.installs.find((i) => i.path === sel.existingPath);
        return {
          id,
          name,
          action: "use-existing",
          version: found?.version ?? null,
          path: sel.existingPath,
          source: found ? [found.source, found.note].filter(Boolean).join(" · ") : null,
        };
      }
      // Versioned components get side-by-side folders; Composer is one file that self-updates.
      const version = id === "composer" ? choices.composer_version : sel.version;
      const path =
        id === "composer"
          ? `${root}\\bin\\composer`
          : `${root}\\bin\\${BIN_FOLDER[id]}\\${id}-${version}`;
      return { id, name, action: "install", version, path, source: null };
    },
  );

  const plannedMysql: PlannedMysql | null =
    mysql && mysql.mode !== "skip" && selections.mysql?.enabled
      ? {
          mode: mysql.mode,
          port: Number(mysql.value.port),
          hasPassword: !mysql.value.noPassword && mysql.value.password.length > 0,
          dataDir:
            mysql.mode === "new"
              ? effectiveDataDir(mysql.value, settings.installRoot, selections.mysql.version)
              : null,
          autostart: mysql.mode === "new" && mysql.value.autostart,
        }
      : null;

  return {
    installRoot: root,
    wwwDir: settings.wwwDir.trim().replace(/\\+$/, ""),
    components,
    mysql: plannedMysql,
    steps: planSteps(components, plannedMysql, scan),
  };
}

function planSteps(
  components: PlannedComponent[],
  mysql: PlannedMysql | null,
  scan: ScanReport | null,
): PlanStep[] {
  const installing = (id: string) => components.some((c) => c.id === id && c.action === "install");
  const using = (id: string) => components.some((c) => c.id === id);
  const steps: PlanStep[] = [];

  steps.push({ id: "folders", title: "Create the install and projects folders", admin: false });
  // PHP and Apache Windows builds need the Visual C++ runtime. Unknown counts as missing.
  if ((installing("php") || installing("apache")) && !vcRuntimeOk(scan?.vc_runtime)) {
    steps.push({
      id: "vc-runtime",
      title: scan?.vc_runtime
        ? `Update the Visual C++ runtime (${scan.vc_runtime} is too old)`
        : "Install the Visual C++ runtime from Microsoft",
      admin: true,
    });
  }

  for (const c of components.filter((c) => c.action === "install")) {
    steps.push({
      id: `get-${c.id}`,
      title:
        c.id === "composer"
          ? `Download and verify Composer ${c.version}`
          : `Download, verify and unpack ${c.name} ${c.version}`,
      admin: false,
    });
  }

  const php = components.find((c) => c.id === "php");
  for (const server of ["apache", "nginx"]) {
    const s = components.find((c) => c.id === server);
    if (s) {
      steps.push({
        id: `config-${server}`,
        title: php
          ? `Configure ${s.name} to run PHP ${php.version ?? ""}`.trim()
          : `Configure ${s.name}`,
        admin: false,
      });
    }
  }

  if (mysql?.mode === "new") {
    steps.push({
      id: "mysql-init",
      title: mysql.hasPassword
        ? "Create the MySQL data folder and set the root password"
        : "Create the MySQL data folder (root user without a password)",
      admin: false,
    });
  }

  // .test addresses are added when sites are created, so there's no hosts-file step here.
  if (using("apache") || using("nginx")) {
    steps.push({
      id: "local-ca",
      title: "Create and trust a local HTTPS certificate",
      admin: false,
      confirm: true,
    });
  }

  steps.push({ id: "save", title: "Save settings", admin: false });
  return steps;
}
