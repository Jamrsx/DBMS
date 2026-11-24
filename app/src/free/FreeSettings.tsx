import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PhpSettingsPanel } from "../components/PhpSettingsPanel";
import { StartupToggle } from "../components/StartupToggle";
import { ThemeToggle } from "../components/ThemeToggle";
import { setStartServicesOnLaunch, type AppSettings } from "../lib/appsettings";
import { formatWhen, listBackups, openBackupsFolder, restoreBackup, type BackupFile } from "../lib/backups";
import type { LicenseStatus } from "../lib/license";
import { checkUpdates, useUpdates } from "../lib/updates";
import { PortsCard, UninstallCard } from "../settings/SettingsPage";

function UpdatesCard() {
  const { state } = useUpdates();
  const text =
    state.kind === "checking"
      ? "Checking for updates…"
      : state.kind === "current"
        ? "NexDB is up to date."
        : state.kind === "available"
          ? `NexDB ${state.version} is ready. Use the update card at the top of this window.`
          : null;
  return (
    <section className="set-card">
      <h2>App updates</h2>
      <p className="field-hint">NexDB Free keeps getting new app versions and security fixes.</p>
      {text && <p role="status">{text}</p>}
      <button type="button" className="btn btn-small" disabled={state.kind === "checking"} onClick={() => void checkUpdates()}>
        Check for updates
      </button>
    </section>
  );
}

/** Backups made while NexDB had a license stay usable, so data is never out of reach. */
function BackupsCard() {
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    listBackups().then(setFiles).catch(() => {});
  }, []);

  if (files.length === 0) return null;

  async function restore(file: BackupFile) {
    if (!file.database) return;
    setBusy(true);
    setResult(null);
    try {
      await restoreBackup(file.name, file.database);
      setResult({ ok: true, text: `${file.database} was restored.` });
      setConfirming(null);
    } catch (e) {
      setResult({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="set-card">
      <h2>Your backups</h2>
      <p className="field-hint">MySQL must be running to restore. Restoring replaces the current contents of that database.</p>
      <ul className="free-version-list">
        {files.map((f) => (
          <li key={f.name}>
            <span>
              {f.database ?? f.name} <span className="free-card-detail">· {formatWhen(f.created)}</span>
            </span>
            {confirming === f.name ? (
              <span className="free-confirm">
                <button type="button" className="btn btn-small" disabled={busy} onClick={() => setConfirming(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={() => void restore(f)}>
                  Replace and restore
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-small" disabled={!f.database} onClick={() => setConfirming(f.name)}>
                Restore
              </button>
            )}
          </li>
        ))}
      </ul>
      {result && (
        <p className={result.ok ? "set-ok" : "field-error"} role={result.ok ? "status" : "alert"}>
          {result.text}
        </p>
      )}
      <button type="button" className="btn btn-small" onClick={() => void openBackupsFolder()}>
        Open folder
      </button>
    </section>
  );
}

/** Settings in NexDB Free: only what the simple stack needs. */
export function FreeSettings({ settings, phpVersion, license, onSaved, onBack, onLicense }: {
  settings: AppSettings | null;
  phpVersion: string | null;
  license: LicenseStatus;
  onSaved: () => void;
  onBack: () => void;
  onLicense: (mode: "key" | "signin") => void;
}) {
  const [onLaunch, setOnLaunch] = useState(settings?.start_services_on_launch ?? false);
  useEffect(() => setOnLaunch(settings?.start_services_on_launch ?? false), [settings?.start_services_on_launch]);

  const toggleLaunch = (on: boolean) => {
    setOnLaunch(on);
    setStartServicesOnLaunch(on).then(onSaved).catch(() => setOnLaunch(!on));
  };

  return (
    <main className="free-main free-panel free-settings">
      <button type="button" className="link-button free-back" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" /> Back to NexDB
      </button>
      <h1>Settings</h1>

      <section className="set-card">
        <h2>Appearance and startup</h2>
        <ThemeToggle />
        <StartupToggle />
        <label className="free-check">
          <input type="checkbox" checked={onLaunch} onChange={(e) => toggleLaunch(e.target.checked)} />
          Start services when NexDB opens
        </label>
      </section>

      <section className="set-card">
        <h2>License</h2>
        <p className="field-hint">{license.state === "none" ? "You're using NexDB Free. No account needed." : "NexDB is in Free mode. Your projects and databases are safe."}</p>
        <div className="free-row">
          <button type="button" className="btn btn-small" onClick={() => onLicense("signin")}>
            Sign in
          </button>
          <button type="button" className="btn btn-small" onClick={() => onLicense("key")}>
            I have a key
          </button>
        </div>
      </section>

      {settings && <PortsCard settings={settings} onSaved={onSaved} />}

      <section className="set-card">
        <h2>PHP settings and extensions</h2>
        <PhpSettingsPanel version={phpVersion} />
      </section>

      <BackupsCard />
      <UpdatesCard />
      <UninstallCard />
    </main>
  );
}
