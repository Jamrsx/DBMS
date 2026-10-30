import { ShieldCheck } from "lucide-react";
import { LABEL_TEXT, type Choices, type ComponentChoices } from "../lib/catalog";
import type { Install, ScanReport } from "../lib/scan";

/** What the user picked for one component. */
export interface Selection {
  enabled: boolean;
  /** Version to install; ignored when `existingPath` is set. */
  version: string | null;
  /** Path of an install found by the scan that should be used instead of installing. */
  existingPath: string | null;
}

export type Selections = Record<string, Selection>;

interface ComponentInfo {
  id: string;
  description: string;
  defaultOn: boolean;
}

/** Display order, descriptions and defaults. Composer has no catalog versions. */
const COMPONENTS: ComponentInfo[] = [
  { id: "apache", description: "Web server for your .test sites.", defaultOn: true },
  { id: "php", description: "Runs PHP sites and tools like Laravel and WordPress.", defaultOn: true },
  { id: "mysql", description: "Database server, with the built-in database manager.", defaultOn: true },
  { id: "node", description: "JavaScript runtime with npm, for front-end builds.", defaultOn: true },
  { id: "composer", description: "PHP package manager (latest stable).", defaultOn: true },
  { id: "nginx", description: "Alternative web server. Optional.", defaultOn: false },
];

export function defaultSelections(choices: Choices): Selections {
  const byId = new Map(choices.components.map((c) => [c.id, c]));
  return Object.fromEntries(
    COMPONENTS.map((info) => [
      info.id,
      {
        enabled: info.defaultOn,
        version: byId.get(info.id)?.recommended ?? null,
        existingPath: null,
      },
    ]),
  );
}

/** Problems that block Continue, or null. */
export function validateComponents(selections: Selections): string | null {
  if (!Object.values(selections).some((s) => s.enabled)) {
    return "Pick at least one component to install.";
  }
  return null;
}

interface Props {
  choices: Choices;
  scan: ScanReport | null;
  selections: Selections;
  onChange: (selections: Selections) => void;
}

export function Components({ choices, scan, selections, onChange }: Props) {
  const byId = new Map(choices.components.map((c) => [c.id, c]));
  const set = (id: string, patch: Partial<Selection>) => {
    const next = { ...selections, [id]: { ...selections[id], ...patch } };
    // Composer needs PHP.
    if (id === "php" && patch.enabled === false) {
      next.composer = { ...next.composer, enabled: false };
    }
    onChange(next);
  };

  const warnings = selectionWarnings(selections, scan);
  const count = Object.values(selections).filter((s) => s.enabled).length;

  return (
    <>
      <p className="lede">
        Choose what to install. Recommended versions are preselected; everything installs into
        its own folder, side by side with any other versions.
      </p>

      <ul className="choice-list">
        {COMPONENTS.map((info) => {
          const sel = selections[info.id];
          const catalog = byId.get(info.id);
          // NexDB installs its own copies; it never borrows another tool's PHP, Apache or MySQL.
          const existing: Install[] = [];
          const name = catalog?.name ?? "Composer";
          const blocked = info.id === "composer" && !selections.php.enabled;
          return (
            <li key={info.id} className={sel.enabled ? "choice on" : "choice"}>
              <label className="choice-head">
                <input
                  type="checkbox"
                  checked={sel.enabled}
                  disabled={blocked}
                  onChange={(e) => set(info.id, { enabled: e.target.checked })}
                />
                <span className="choice-title">
                  <span className="choice-name">{name}</span>
                  <span className="muted">
                    {blocked ? "Needs PHP." : info.description}
                  </span>
                </span>
                <span className="choice-summary">{summary(sel, existing)}</span>
              </label>

              {sel.enabled && catalog && (
                <VersionPicker
                  component={catalog}
                  existing={existing}
                  selection={sel}
                  onPick={(patch) => set(info.id, patch)}
                />
              )}
            </li>
          );
        })}
      </ul>

      {warnings.length > 0 && (
        <ul className="warning-list" aria-label="Things to know">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <p className="muted small">
        {count} selected · Versions from release data dated {choices.catalog_date}.
      </p>
    </>
  );
}

function VersionPicker({
  component,
  existing,
  selection,
  onPick,
}: {
  component: ComponentChoices;
  existing: Install[];
  selection: Selection;
  onPick: (patch: Partial<Selection>) => void;
}) {
  const group = `version-${component.id}`;
  return (
    <div className="picker">
      <fieldset>
        <legend className="picker-legend">Install</legend>
        {component.versions.map((v) => (
          <label key={v.version} className={v.downloadable ? "option" : "option is-disabled"}>
            <input
              type="radio"
              name={group}
              disabled={!v.downloadable}
              checked={!selection.existingPath && selection.version === v.version}
              onChange={() => onPick({ version: v.version, existingPath: null })}
            />
            <span className="option-version">{v.version}</span>
            <span className="option-labels">
              {v.labels.map((l) => (
                <span key={l} className={`tag tag-${l}`}>
                  {l === "security-fix" && <ShieldCheck size={12} strokeWidth={2.25} aria-hidden="true" />}
                  {LABEL_TEXT[l]}
                  {l === "ends-soon" && v.eol ? ` (${v.eol})` : ""}
                </span>
              ))}
            </span>
            <span className="option-note">
              {[
                v.note,
                v.downloadable
                  ? v.download_size && `${Math.round(v.download_size / 2 ** 20)} MB`
                  : "No Windows download yet",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </label>
        ))}
      </fieldset>

      {existing.length > 0 && (
        <fieldset>
          <legend className="picker-legend">Or use what's already on this PC</legend>
          {existing.map((i) => (
            <label key={i.path} className="option" title={i.path}>
              <input
                type="radio"
                name={group}
                checked={selection.existingPath === i.path}
                onChange={() => onPick({ existingPath: i.path })}
              />
              <span className="option-version">{i.version ?? "unknown"}</span>
              <span className="option-note">
                {i.source}
                {i.note ? ` · ${i.note}` : ""}
              </span>
              <code className="option-path">{i.path}</code>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

function summary(sel: Selection, existing: Install[]) {
  if (!sel.enabled) return "Not installing";
  if (sel.existingPath) {
    const found = existing.find((i) => i.path === sel.existingPath);
    return `Use existing ${found?.version ?? ""}`.trim();
  }
  return sel.version ?? "Latest";
}

function selectionWarnings(selections: Selections, scan: ScanReport | null): string[] {
  const warnings: string[] = [];
  const on = (id: string) => selections[id]?.enabled;
  if (on("php") && !on("apache") && !on("nginx")) {
    warnings.push("PHP sites need a web server: turn on Apache or nginx to serve them.");
  }
  if (on("apache") && on("nginx")) {
    warnings.push("Apache and nginx can't both use port 80. You'll pick the main one later.");
  }
  const mysqlPort = scan?.ports.find((p) => p.port === 3306);
  if (on("mysql") && !selections.mysql.existingPath && mysqlPort?.in_use) {
    warnings.push(
      `Port 3306 is used by ${mysqlPort.process ?? "another program"}. You can pick another port in the next step.`,
    );
  }
  return warnings;
}
