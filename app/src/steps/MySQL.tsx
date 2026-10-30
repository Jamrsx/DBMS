import { useEffect, useState } from "react";
import type { Settings } from "../Wizard";
import type { Selection } from "./Components";
import { pathProblem } from "./Welcome";
import { checkPort } from "../lib/ports";
import type { Install, PortStatus } from "../lib/scan";

export interface MysqlSettings {
  port: string;
  password: string;
  confirm: string;
  noPassword: boolean;
  /** Empty means "use the default folder", which follows the install folder and version. */
  dataDir: string;
  autostart: boolean;
  /** Result of the last live check of `port`. */
  portCheck: PortStatus | null;
}

export const emptyMysqlSettings = (port: number): MysqlSettings => ({
  port: String(port),
  password: "",
  confirm: "",
  noPassword: false,
  dataDir: "",
  autostart: true,
  portCheck: null,
});

export type MysqlMode = "skip" | "existing" | "new";

export function mysqlMode(selection: Selection): MysqlMode {
  if (!selection.enabled) return "skip";
  return selection.existingPath ? "existing" : "new";
}

/** `C:\NexDB\data\mysql-9.7` for version 9.7.4. */
export function defaultDataDir(installRoot: string, version: string | null): string {
  const line = version?.split(".").slice(0, 2).join(".") ?? "server";
  return `${installRoot.replace(/\\+$/, "")}\\data\\mysql-${line}`;
}

export function effectiveDataDir(m: MysqlSettings, installRoot: string, version: string | null) {
  return m.dataDir.trim() || defaultDataDir(installRoot, version);
}

/** Problems that block Continue, or null. */
export function validateMysql(
  m: MysqlSettings,
  mode: MysqlMode,
  settings: Settings,
  version: string | null,
): string | null {
  if (mode === "skip") return null;

  const port = Number(m.port);
  if (!/^\d+$/.test(m.port.trim()) || port < 1024 || port > 65535) {
    return "Port must be a number from 1024 to 65535.";
  }
  if (mode === "existing") return null;

  if (m.portCheck?.port === port && m.portCheck.in_use) {
    return `Port ${port} is in use by ${m.portCheck.process ?? "another program"}. Pick another port.`;
  }
  if (!m.noPassword) {
    if (!m.password) return "Enter a root password, or choose no password.";
    if (!m.confirm) return "Type the password again in Confirm.";
    if (m.password !== m.confirm) return "The two passwords don't match.";
  }
  const dataDir = effectiveDataDir(m, settings.installRoot, version);
  const dirProblem = pathProblem("Data folder", dataDir, "C:\\NexDB\\data\\mysql");
  if (dirProblem) return dirProblem;
  if (isInside(dataDir, settings.wwwDir)) {
    return "Keep the data folder outside the projects folder, so it's never served on the web.";
  }
  return null;
}

function isInside(path: string, folder: string) {
  const norm = (p: string) => p.trim().replace(/\\+$/, "").toLowerCase();
  const [p, f] = [norm(path), norm(folder)];
  return p === f || p.startsWith(f + "\\");
}

interface Props {
  value: MysqlSettings;
  /** Takes an updater so async results never overwrite newer typing. */
  onChange: (update: (prev: MysqlSettings) => MysqlSettings) => void;
  mode: MysqlMode;
  settings: Settings;
  version: string | null;
  existing: Install | null;
}

export function MySQL({ value, onChange, mode, settings, version, existing }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(false);
  const set = (patch: Partial<MysqlSettings>) => onChange((prev) => ({ ...prev, ...patch }));

  // Live port check, debounced while typing.
  const port = Number(value.port);
  const portValid = /^\d+$/.test(value.port.trim()) && port >= 1024 && port <= 65535;
  useEffect(() => {
    if (mode !== "new" || !portValid || value.portCheck?.port === port) return;
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      checkPort(port, "MySQL")
        .then((status) => {
          if (cancelled) return;
          // Only keep the result if the user hasn't changed the port meanwhile.
          onChange((prev) => (Number(prev.port) === port ? { ...prev, portCheck: status } : prev));
        })
        .catch(() => {})
        .finally(() => !cancelled && setChecking(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setChecking(false);
    };
  }, [port, portValid, mode, value.portCheck?.port, onChange]);

  if (mode === "skip") {
    return (
      <p className="lede">
        MySQL isn't selected, so there's nothing to set up here. You can add it later from the
        dashboard.
      </p>
    );
  }

  const existingName = existing?.note?.includes("MariaDB") ? "MariaDB" : "MySQL";

  return (
    <>
      <p className="lede">
        {mode === "new"
          ? `MySQL ${version ?? ""} will run on this PC with the usual root user, like any MySQL install.`
          : `NexDB will use your existing ${existingName} ${existing?.version ?? ""}. Tell it how to connect so the database manager works.`}
      </p>

      {mode === "existing" && existing && (
        <p className="muted small">
          <code>{existing.path}</code>
        </p>
      )}

      <div className="fields">
        <label className="field">
          <span className="field-label">Port</span>
          <input
            className="input-short"
            inputMode="numeric"
            value={value.port}
            onChange={(e) => set({ port: e.target.value.trim(), portCheck: null })}
          />
          <PortHint
            mode={mode}
            valid={portValid}
            checking={checking}
            status={value.portCheck?.port === port ? value.portCheck : null}
          />
        </label>

        <div className="field">
          <span className="field-label" id="root-password-label">
            Root password
          </span>
          {mode === "new" && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={value.noPassword}
                onChange={(e) =>
                  set({ noPassword: e.target.checked, password: "", confirm: "" })
                }
              />
              No password (local development only)
            </label>
          )}
          {!value.noPassword && (
            <div className="password-row">
              <input
                type={showPassword ? "text" : "password"}
                aria-labelledby="root-password-label"
                autoComplete="new-password"
                value={value.password}
                onChange={(e) => set({ password: e.target.value })}
              />
              {mode === "new" && (
                <input
                  type={showPassword ? "text" : "password"}
                  aria-label="Confirm root password"
                  placeholder="Confirm"
                  autoComplete="new-password"
                  value={value.confirm}
                  onChange={(e) => set({ confirm: e.target.value })}
                />
              )}
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          )}
          <span className="field-hint">
            {value.noPassword
              ? "Anyone on this PC can sign in as root. Fine for local development; don't use it for real data."
              : mode === "new"
                ? "Used once to set up MySQL. NexDB doesn't save it."
                : "Leave empty if your root user has no password."}
          </span>
        </div>

        {mode === "new" && (
          <>
            <label className="field">
              <span className="field-label">Data folder</span>
              <input
                spellCheck={false}
                value={value.dataDir}
                placeholder={defaultDataDir(settings.installRoot, version)}
                onChange={(e) => set({ dataDir: e.target.value })}
              />
              <span className="field-hint">
                Where your databases are stored. Leave empty to use the default shown.
              </span>
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                checked={value.autostart}
                onChange={(e) => set({ autostart: e.target.checked })}
              />
              Start MySQL when NexDB starts
            </label>
          </>
        )}
      </div>
    </>
  );
}

function PortHint({
  mode,
  valid,
  checking,
  status,
}: {
  mode: MysqlMode;
  valid: boolean;
  checking: boolean;
  status: PortStatus | null;
}) {
  if (!valid) return <span className="field-hint">1024–65535. MySQL's usual port is 3306.</span>;
  if (mode === "existing") {
    return <span className="field-hint">The port your existing MySQL listens on.</span>;
  }
  if (checking || !status) return <span className="field-hint">Checking…</span>;
  return status.in_use ? (
    <span className="field-hint hint-bad">
      In use by {status.process ?? "another program"}
      {status.pid ? ` (PID ${status.pid})` : ""}.
    </span>
  ) : (
    <span className="field-hint hint-ok">Free.</span>
  );
}
