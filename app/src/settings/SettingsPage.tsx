import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, RefreshCw, RotateCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { getHttps, setHttps, trustHttps, type HttpsInfo } from "../lib/https";
import { formatWhen, getAutoBackup, setAutoBackup, type AutoBackup } from "../lib/backups";
import { StartupToggle } from "../components/StartupToggle";
import {
  getAppSettings,
  restartApp,
  savePorts,
  setStartServicesOnLaunch,
  type AppSettings,
} from "../lib/appsettings";
import { checkUpdates, installUpdates, useUpdates } from "../lib/updates";

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
            <HttpsCard active={active} />
            <AutoBackupCard active={active} />
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

function AutoBackupCard({ active }: { active: boolean }) {
  const [info, setInfo] = useState<AutoBackup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getAutoBackup()
      .then(setInfo)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  async function save(schedule: AutoBackup["schedule"], keep: number) {
    setError(null);
    try {
      await setAutoBackup(schedule, keep);
    } catch (e) {
      setError(String(e));
    }
    load();
  }

  if (!info) return null;
  const on = info.schedule !== "off";
  return (
    <Card
      title="Automatic backups"
      lede="NexDB backs up all your databases on a schedule while it's open, into the same backups folder as the ones you make."
    >
      <div className="set-rows">
        <div className="set-auto">
          <label className="field">
            <span className="field-label">Back up</span>
            <select
              className="input"
              value={info.schedule}
              onChange={(e) => void save(e.target.value as AutoBackup["schedule"], info.keep)}
            >
              <option value="off">Never</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Keep the newest</span>
            <input
              className="input input-short"
              type="number"
              min={1}
              max={90}
              value={info.keep}
              disabled={!on}
              onChange={(e) => setInfo({ ...info, keep: Number(e.target.value) || 1 })}
              onBlur={() => void save(info.schedule, info.keep)}
            />
          </label>
        </div>
        {on && (
          <p className="field-hint">
            Older automatic backups of each database are deleted once there are more than {info.keep}. Backups you make
            yourself are never deleted.
          </p>
        )}
        {on && (
          <p className={info.problem ? "field-warn" : "field-hint"} role="status">
            {info.problem
              ? info.problem
              : info.last_ok
                ? `Last automatic backup: ${formatWhen(info.last_ok)} (${info.last_count} ${info.last_count === 1 ? "database" : "databases"}).`
                : "The first automatic backup runs within a few minutes while MySQL is running."}
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}

function HttpsCard({ active }: { active: boolean }) {
  const [info, setInfo] = useState<HttpsInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getHttps()
      .then(setInfo)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  async function act(label: string, work: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
      load();
    }
  }

  if (!info) return null;
  const port = info.port === 443 ? "" : `:${info.port}`;
  return (
    <Card
      title="HTTPS"
      lede="Open localhost and your .test sites with https://, the way they run on a real server."
    >
      <div className="set-rows">
        <div className="set-row">
          <label className="set-check">
            <input
              type="checkbox"
              checked={info.enabled}
              disabled={!!busy || !info.web_server}
              onChange={(e) => {
                const on = e.target.checked;
                void act(on ? "Turning HTTPS on…" : "Turning HTTPS off…", () => setHttps(on));
              }}
            />
            <span>Serve my sites over HTTPS too</span>
          </label>
          <p className="field-hint">
            {info.web_server
              ? `Uses port ${info.port}. Sites keep working over http:// as well. Apache restarts if it's running.`
              : "HTTPS needs NexDB's Apache web server. Install it on the Versions page first."}
          </p>
        </div>

        {info.enabled && (
          <div className={info.trusted ? "set-trust ok" : "set-trust"}>
            {info.trusted ? (
              <ShieldCheck size={18} aria-hidden="true" />
            ) : (
              <ShieldAlert size={18} aria-hidden="true" />
            )}
            <div>
              <p className="set-trust-title">
                {info.trusted ? "Windows trusts NexDB's certificate" : "Windows doesn't trust NexDB's certificate yet"}
              </p>
              <p className="field-hint">
                {info.trusted
                  ? `Browsers open https://localhost${port} and https://yourproject.test${port} without a warning.`
                  : "Until you trust it, browsers warn that the connection isn't private. The certificate only works for .test and localhost addresses, never for real websites."}
              </p>
            </div>
            {!info.trusted && (
              <button
                className="btn"
                disabled={!!busy}
                onClick={() => void act("Waiting for Windows…", trustHttps)}
              >
                Trust certificate…
              </button>
            )}
          </div>
        )}

        {busy && (
          <p className="field-hint" role="status">
            {busy}
            {busy.startsWith("Waiting") && " Windows asks you to confirm."}
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Card>
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
  const { state } = useUpdates();
  const check = () => void checkUpdates();
  const install = () => void installUpdates();

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
