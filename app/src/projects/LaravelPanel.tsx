import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Database,
  Eraser,
  Link2,
  LoaderCircle,
  Play,
  RefreshCw,
  Sprout,
  Square,
} from "lucide-react";
import { nexOops } from "../lib/nex";
import {
  laravelLogs,
  laravelWorkers,
  runLaravel,
  startWorker,
  stopWorker,
  type LaravelAction,
  type LogView,
  type Outcome,
  type WorkerInfo,
  type WorkerKind,
} from "../lib/laravel";

const ACTIONS: { id: LaravelAction; label: string; hint: string; icon: typeof Database }[] = [
  {
    id: "migrate",
    label: "Update tables",
    hint: "Creates or changes the database tables (php artisan migrate).",
    icon: Database,
  },
  {
    id: "seed",
    label: "Add sample data",
    hint: "Runs the app's seeders (php artisan db:seed). Running it twice can add the rows twice.",
    icon: Sprout,
  },
  {
    id: "storage_link",
    label: "Link uploads",
    hint: "Makes uploaded files reachable at /storage (php artisan storage:link).",
    icon: Link2,
  },
  {
    id: "clear",
    label: "Clear caches",
    hint: "Forgets cached config, routes and views, after editing .env (php artisan optimize:clear).",
    icon: Eraser,
  },
];

const WORKERS: Record<WorkerKind, { label: string; hint: string }> = {
  queue: {
    label: "Queue worker",
    hint: "Runs queued jobs, such as emails sent in the background (php artisan queue:work).",
  },
  schedule: { label: "Scheduler", hint: "Runs the app's scheduled tasks every minute (php artisan schedule:work)." },
};

const LEVEL: Record<string, string> = { error: "Error", warning: "Warning", info: "Info" };

/** Laravel's everyday commands, its queue worker and scheduler, and its log in plain words. */
export function LaravelPanel({ name, folder }: { name: string; folder: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<(Outcome & { label: string }) | null>(null);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [log, setLog] = useState<LogView | null>(null);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const where = folder || name;

  const loadLog = useCallback(() => {
    laravelLogs(name)
      .then(setLog)
      .catch((e) => setError(String(e)));
  }, [name]);

  useEffect(() => {
    loadLog();
    const poll = () =>
      laravelWorkers(name)
        .then(setWorkers)
        .catch(() => {});
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [name, loadLog]);

  async function run(a: (typeof ACTIONS)[number]) {
    if (busy) return;
    setBusy(a.id);
    setError(null);
    setResult(null);
    try {
      const out = await runLaravel(name, a.id);
      setResult({ ...out, label: a.label });
      if (!out.ok) nexOops(`${a.label} didn't work.`);
      loadLog();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(w: WorkerInfo) {
    if (busy) return;
    setBusy(w.kind);
    setError(null);
    try {
      setWorkers(await (w.running ? stopWorker(name, w.kind) : startWorker(name, w.kind)));
    } catch (e) {
      setError(String(e));
      nexOops(`The ${WORKERS[w.kind].label.toLowerCase()} didn't start.`);
    } finally {
      setBusy(null);
    }
  }

  const entries = (log?.entries ?? []).filter((e) => !errorsOnly || e.level === "error");

  return (
    <>
      <div className="details-section">
        <h3>Laravel</h3>
        <p className="field-hint">Runs in {where} with the project's PHP.</p>
        <div className="laravel-actions">
          {ACTIONS.map((a) => (
            <div key={a.id} className="laravel-action">
              <button className="btn btn-small" disabled={!!busy} onClick={() => void run(a)}>
                {busy === a.id ? (
                  <LoaderCircle size={14} className="status-spin" aria-hidden="true" />
                ) : (
                  <a.icon size={14} aria-hidden="true" />
                )}
                {a.label}
              </button>
              <span className="field-hint">{a.hint}</span>
            </div>
          ))}
        </div>
        {result && (
          <div className={`laravel-result ${result.ok ? "laravel-ok" : "laravel-bad"}`} role="status">
            <p>
              {result.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
              <span>
                <strong>{result.label}:</strong> {result.summary}
              </span>
            </p>
            {result.output && (
              <details>
                <summary>What artisan said</summary>
                <pre>{result.output}</pre>
              </details>
            )}
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="details-section">
        <h3>In the background</h3>
        <p className="field-hint">They keep running until you stop them or close NexDB.</p>
        <ul className="laravel-workers">
          {workers.map((w) => (
            <li key={w.kind}>
              <div className="laravel-worker-head">
                <span className={`dot ${w.running ? "dot-ok" : ""}`} aria-hidden="true" />
                <strong>{WORKERS[w.kind].label}</strong>
                <span className="field-hint">{w.running ? "Running" : "Stopped"}</span>
                <button className="btn btn-small" disabled={!!busy} onClick={() => void toggle(w)}>
                  {w.running ? <Square size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                  {busy === w.kind ? (w.running ? "Stopping…" : "Starting…") : w.running ? "Stop" : "Start"}
                </button>
              </div>
              <p className="field-hint">{WORKERS[w.kind].hint}</p>
              {w.running && w.tail.length > 0 && <pre className="laravel-tail">{w.tail.join("\n")}</pre>}
            </li>
          ))}
        </ul>
      </div>

      <div className="details-section">
        <div className="laravel-log-head">
          <h3>Log</h3>
          <label className="field-hint">
            <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> Errors only
          </label>
          <button className="btn btn-small" onClick={loadLog}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </button>
        </div>
        {!log ? (
          <p className="field-hint">Reading the log…</p>
        ) : !log.file ? (
          <p className="field-hint">No log yet. Laravel writes one to storage/logs when something happens.</p>
        ) : entries.length === 0 ? (
          <p className="field-hint">{errorsOnly ? "No errors in the latest entries." : `${log.file} is empty.`}</p>
        ) : (
          <>
            <p className="field-hint">Newest first, from {log.file}.</p>
            <ul className="laravel-log">
              {entries.map((e, i) => (
                <li key={i} className={`laravel-entry laravel-${e.level}`}>
                  <div className="laravel-entry-head">
                    <span className="tag">{LEVEL[e.level]}</span>
                    <time className="log-time">{e.time}</time>
                  </div>
                  <p className="laravel-message">{e.message}</p>
                  {e.place && <p className="field-hint">In {e.place}</p>}
                  {e.detail && (
                    <details>
                      <summary>Details</summary>
                      <pre>{e.detail}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
