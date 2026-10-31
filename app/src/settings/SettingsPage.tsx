import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, RefreshCw, RotateCw } from "lucide-react";
import { StartupToggle } from "../components/StartupToggle";
import {
  checkForUpdate,
  getAppSettings,
  installUpdate,
  restartApp,
  savePorts,
  setStartServicesOnLaunch,
  type AppSettings,
  type UpdateState,
} from "../lib/appsettings";

export function SettingsPage({ active }: { active: boolean }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getAppSettings()
      .then((s) => {
        setSettings(s);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  return (
    <main className="panel">
      <header className="panel-head dash-head">
        <div>
          <h1>Settings</h1>
          <p className="dash-summary">How NexDB starts, which ports it uses, and updates.</p>
        </div>
      </header>

      <div className="panel-body dash-body settings">
        {error && (
          <div className="error-box" role="alert">
            <p>{error}</p>
          </div>
        )}
        {settings && (
          <>
            <StartupCard settings={settings} onChanged={load} />
            <PortsCard settings={settings} onSaved={load} />
            <FoldersCard settings={settings} />
            <UpdatesCard version={settings.app_version} />
          </>
        )}
      </div>
    </main>
  );
}

function Card({ title, lede, children }: { title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section className="set-card">
      <h2>{title}</h2>
      {lede && <p className="set-lede">{lede}</p>}
      {children}
    </section>
  );
}

function StartupCard({ settings, onChanged }: { settings: AppSettings; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="Startup">
      <div className="set-rows">
        <div className="set-row">
          <StartupToggle />
          <p className="field-hint">NexDB opens quietly in the notification area when you sign in to Windows.</p>
        </div>
        <div className="set-row">
          <label className="set-check">
            <input
              type="checkbox"
              checked={settings.start_services_on_launch}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                setError(null);
                try {
                  await setStartServicesOnLaunch(e.target.checked);
                  onChanged();
                } catch (err) {
                  setError(String(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
            <span>Start all services when NexDB opens</span>
          </label>
          <p className="field-hint">Apache, PHP and MySQL start by themselves, so your sites are ready right away.</p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function PortsCard({ settings, onSaved }: { settings: AppSettings; onSaved: () => void }) {
  const [apache, setApache] = useState(String(settings.apache_port ?? ""));
  const [php, setPhp] = useState(String(settings.php_port));
  const [mysql, setMysql] = useState(String(settings.mysql_port ?? ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const num = (v: string) => (/^\d{1,5}$/.test(v) && +v >= 1 && +v <= 65535 ? +v : null);
  const fields = [
    settings.apache_port !== null && { label: "Web server (Apache)", value: apache, set: setApache, hint: "Your sites open at localhost on this port. 80 means no number is needed in the address." },
    { label: "PHP", value: php, set: setPhp, hint: "Used only inside NexDB, between Apache and PHP." },
    settings.mysql_port !== null && { label: "MySQL", value: mysql, set: setMysql, hint: "Apps and phpMyAdmin connect to MySQL on this port. 3306 is the usual one." },
  ].filter(Boolean) as { label: string; value: string; set: (v: string) => void; hint: string }[];

  const invalid = fields.find((f) => num(f.value) === null);
  const changed =
    apache !== String(settings.apache_port ?? "") || php !== String(settings.php_port) || mysql !== String(settings.mysql_port ?? "");

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await savePorts(settings.apache_port === null ? null : num(apache), num(php)!, settings.mysql_port === null ? null : num(mysql));
      setMessage({ ok: true, text: "Saved. Any services that were running have restarted on the new ports." });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Ports" lede="Change a port when another program already uses it. Running services restart when you save.">
      <div className="set-ports">
        {fields.map((f) => (
          <label key={f.label} className="field">
            <span className="field-label">{f.label}</span>
            <input
              className="input"
              inputMode="numeric"
              value={f.value}
              onChange={(e) => f.set(e.target.value.trim())}
              aria-invalid={num(f.value) === null}
            />
            <span className={num(f.value) === null ? "field-error" : "field-hint"}>
              {num(f.value) === null ? "Use a number from 1 to 65535." : f.hint}
            </span>
          </label>
        ))}
      </div>
      <div className="set-actions">
        <button className="btn btn-primary" disabled={!changed || !!invalid || busy} onClick={save}>
          {busy ? "Saving and restarting…" : "Save ports"}
        </button>
        {changed && !busy && (
          <button
            className="btn"
            onClick={() => {
              setApache(String(settings.apache_port ?? ""));
              setPhp(String(settings.php_port));
              setMysql(String(settings.mysql_port ?? ""));
              setMessage(null);
            }}
          >
            Undo changes
          </button>
        )}
        {message && (
          <p className={message.ok ? "set-ok" : "field-error"} role={message.ok ? "status" : "alert"}>
            {message.text}
          </p>
        )}
      </div>
    </Card>
  );
}

function FoldersCard({ settings }: { settings: AppSettings }) {
  return (
    <Card title="Folders">
      <dl className="set-paths">
        <dt>NexDB is installed in</dt>
        <dd>
          <code>{settings.install_root}</code>
        </dd>
        <dt>Your projects live in</dt>
        <dd>
          <code>{settings.www_dir}</code>
        </dd>
      </dl>
    </Card>
  );
}

function UpdatesCard({ version }: { version: string }) {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });

  async function check() {
    setState({ kind: "checking" });
    setState(await checkForUpdate());
  }

  async function install() {
    setState({ kind: "downloading", percent: 0 });
    setState(await installUpdate((percent) => setState({ kind: "downloading", percent })));
  }

  return (
    <Card title="NexDB updates" lede={`You have NexDB ${version}.`}>
      <div className="set-update" aria-live="polite">
        {state.kind === "idle" && (
          <button className="btn" onClick={check}>
            <RefreshCw size={14} aria-hidden="true" /> Check for updates
          </button>
        )}
        {state.kind === "checking" && <p className="field-hint">Checking for a newer NexDB…</p>}
        {state.kind === "current" && (
          <>
            <p className="set-ok">
              <CheckCircle2 size={15} aria-hidden="true" /> You have the latest NexDB.
            </p>
            <button className="btn btn-small" onClick={check}>
              Check again
            </button>
          </>
        )}
        {state.kind === "available" && (
          <div className="set-available">
            <p>
              <strong>NexDB {state.version} is available.</strong> It downloads and installs here; you don't need a browser.
            </p>
            {state.notes && <p className="set-notes">{state.notes}</p>}
            <button className="btn btn-primary" onClick={install}>
              <Download size={14} aria-hidden="true" /> Download and install
            </button>
          </div>
        )}
        {state.kind === "downloading" && (
          <div className="set-progress">
            <p className="field-hint">
              Downloading the update{state.percent === null ? "…" : ` · ${state.percent}%`}
            </p>
            <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent ?? undefined}>
              <span className="bar-fill" style={{ width: `${state.percent ?? 30}%` }} />
            </div>
          </div>
        )}
        {state.kind === "ready" && (
          <div className="set-available">
            <p>
              <strong>The update is installed.</strong> Restart NexDB to start using it. Your services start again if you
              chose that above.
            </p>
            <button className="btn btn-primary" onClick={() => void restartApp()}>
              <RotateCw size={14} aria-hidden="true" /> Restart NexDB
            </button>
          </div>
        )}
        {state.kind === "error" && (
          <>
            <p className="field-error" role="alert">
              {state.message}
            </p>
            <button className="btn btn-small" onClick={check}>
              Try again
            </button>
          </>
        )}
      </div>
    </Card>
  );
}
