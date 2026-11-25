import { useEffect, useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { PhpSettingsPanel } from "../components/PhpSettingsPanel";
import { ThemeToggle } from "../components/ThemeToggle";
import type { AppSettings } from "../lib/appsettings";
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
      <div className="free-set-head">
        <div>
          <h2>App updates</h2>
          <p className="field-hint">NexDB Free keeps getting new app versions and security fixes.</p>
          {text && <p className="free-set-status" role="status">{text}</p>}
        </div>
        <button type="button" className="btn btn-small" disabled={state.kind === "checking"} onClick={() => void checkUpdates()}>
          Check for updates
        </button>
      </div>
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
export function FreeSettings({ settings, phpVersion, license, onSaved, onBack, onLicense, onUpgrade }: {
  settings: AppSettings | null;
  phpVersion: string | null;
  license: LicenseStatus;
  onSaved: () => void;
  onBack: () => void;
  onLicense: (mode: "key" | "signin") => void;
  onUpgrade: () => void;
}) {
  return (
    <main className="free-main free-panel free-settings">
      <button type="button" className="link-button free-back" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" /> Back to NexDB
      </button>
      <h1>Settings</h1>

      <section className="set-card">
        <div className="free-set-head">
          <div>
            <h2>Your plan: NexDB Free</h2>
            <p className="field-hint">
              {license.state === "none"
                ? "No account needed. Already bought NexDB? Sign in or enter your key."
                : "Your license has ended. Your projects and databases are safe."}
            </p>
          </div>
          <div className="free-set-actions">
            <button type="button" className="btn btn-small" onClick={() => onLicense("key")}>
              I have a key
            </button>
            <button type="button" className="btn btn-small btn-primary" onClick={() => onLicense("signin")}>
              Sign in
            </button>
          </div>
        </div>
        <div className="free-locked">
          <Lock size={14} aria-hidden="true" />
          <span>Starting with Windows, starting services when NexDB opens, and HTTPS for local sites are in the full NexDB.</span>
          <button type="button" className="link-button" onClick={onUpgrade}>
            What you get
          </button>
        </div>
      </section>

      <section className="set-card">
        <h2>Appearance</h2>
        <div className="free-theme">
          <ThemeToggle />
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
