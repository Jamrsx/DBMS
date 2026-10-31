import { useCallback, useEffect, useRef, useState } from "react";
import { AppWindow, LoaderCircle, Trash2 } from "lucide-react";
import { inDesktopApp } from "../lib/scan";
import {
  listServices,
  clearServiceLog,
  serviceLog,
  startServices,
  stopServices,
  type ServiceStatus,
} from "../lib/services";

const POLL_MS = 1500;

/** Order along the request path: web servers, then PHP, then MySQL. */
const PATH_ORDER = ["apache", "nginx", "php", "mysql"];

type Busy = Record<string, "starting" | "stopping">;

export function Dashboard() {
  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>({});
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped after every Start/Stop so the log reloads right away instead of on its timer.
  const [actionCount, setActionCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setServices(await listServices());
      setLoadError(null);
    } catch (err) {
      setLoadError(String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Select the first service with a problem, or the first one, once they load.
  useEffect(() => {
    if (!services || selected) return;
    const first = services.find((s) => s.state === "failed") ?? ordered(services)[0];
    if (first) setSelected(first.id);
  }, [services, selected]);

  async function run(ids: string[], kind: "starting" | "stopping", action: () => Promise<void>) {
    setBusy((b) => ({ ...b, ...Object.fromEntries(ids.map((id) => [id, kind])) }));
    try {
      await action();
    } catch {
      // The failure shows on the station and in the error list from the next status.
    } finally {
      setBusy((b) => {
        const next = { ...b };
        for (const id of ids) delete next[id];
        return next;
      });
      await refresh();
      setActionCount((n) => n + 1);
    }
  }

  const managed = services?.filter((s) => s.managed) ?? [];
  const anyBusy = Object.keys(busy).length > 0;
  const failures = services?.filter((s) => s.state === "failed" && s.message) ?? [];

  return (
      <main className="panel">
        <header className="panel-head dash-head">
          <div>
            <h1>Your stack</h1>
            <p className="dash-summary" role="status">
              {services ? summary(services) : "Checking services…"}
            </p>
          </div>
          <div className="dash-actions">
            <button
              className="btn"
              disabled={anyBusy || !managed.some((s) => s.state === "running" || s.state === "starting")}
              onClick={() => run(managed.map((s) => s.id), "stopping", () => stopServices())}
            >
              Stop all
            </button>
            <button
              className="btn btn-primary"
              disabled={anyBusy || managed.length === 0 || managed.every((s) => s.state === "running")}
              onClick={() => run(managed.map((s) => s.id), "starting", () => startServices())}
            >
              Start all
            </button>
          </div>
        </header>

        <div className="panel-body dash-body">
          {!inDesktopApp && (
            <p className="notice" role="note">
              Browser preview: services are simulated.
            </p>
          )}
          {loadError && (
            <div className="error-box" role="alert">
              <p>Couldn't read service status: {loadError}</p>
            </div>
          )}

          {services && services.length === 0 && (
            <p className="lede">No services are set up yet. Run setup to install a web server, PHP or MySQL.</p>
          )}

          {services && services.length > 0 && (
            <>
              <RequestPath
                services={services}
                busy={busy}
                selected={selected}
                onSelect={setSelected}
                onStart={(id) => run([id], "starting", () => startServices(id))}
                onStop={(id) => run([id], "stopping", () => stopServices(id))}
              />

              {failures.length > 0 && (
                <div className="error-box dash-errors" role="alert">
                  {failures.map((s) => (
                    <p key={s.id}>
                      <strong>{s.name} couldn't start.</strong> {s.message}
                    </p>
                  ))}
                </div>
              )}

              <LogPanel
                services={ordered(services)}
                selected={selected}
                onSelect={setSelected}
                reloadKey={actionCount}
              />
            </>
          )}
        </div>
      </main>
  );
}

function RequestPath({
  services,
  busy,
  selected,
  onSelect,
  onStart,
  onStop,
}: {
  services: ServiceStatus[];
  busy: Busy;
  selected: string | null;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const web = services.filter((s) => s.id === "apache" || s.id === "nginx");
  const php = services.find((s) => s.id === "php");
  const mysql = services.find((s) => s.id === "mysql");
  const columns: ServiceStatus[][] = [web, php ? [php] : [], mysql ? [mysql] : []].filter((c) => c.length > 0);
  const links = linkStates(columns);

  return (
    <ol className="path" aria-label="Request path">
      <li className="path-step">
        <div className="station station-client">
          <AppWindow size={16} strokeWidth={2} aria-hidden="true" />
          <span>Browser</span>
          <code>localhost</code>
        </div>
      </li>
      {columns.map((column, i) => (
        <li key={column.map((s) => s.id).join()} className="path-step">
          <span className={`link link-${links[i]}`} aria-hidden="true" />
          <div className="path-column">
            {column.map((s) => (
              <Station
                key={s.id}
                service={s}
                busy={busy[s.id]}
                selected={selected === s.id}
                onSelect={() => onSelect(s.id)}
                onStart={() => onStart(s.id)}
                onStop={() => onStop(s.id)}
              />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Station({
  service: s,
  busy,
  selected,
  onSelect,
  onStart,
  onStop,
}: {
  service: ServiceStatus;
  busy: "starting" | "stopping" | undefined;
  selected: boolean;
  onSelect: () => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const view = stateView(s, busy);
  const up = s.state === "running" || s.state === "starting";
  return (
    <article className={selected ? "station selected" : "station"} aria-labelledby={`st-${s.id}`}>
      <div className="station-top">
        {view.spinning ? (
          <LoaderCircle className="station-spin" size={14} strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <span className={`dot dot-${view.tone}`} aria-hidden="true" />
        )}
        <h2 id={`st-${s.id}`}>{s.name}</h2>
        {s.version && <code className="station-version">{s.version}</code>}
      </div>
      <p className={`station-state tone-${view.tone}`}>{view.label}</p>
      <dl className="station-facts">
        <dt>Port</dt>
        <dd>{s.port}</dd>
        {s.pid !== null && (
          <>
            <dt>PID</dt>
            <dd>{s.pid}</dd>
          </>
        )}
        {s.uptime_secs !== null && (
          <>
            <dt>Up</dt>
            <dd>{formatUptime(s.uptime_secs)}</dd>
          </>
        )}
      </dl>
      <div className="station-actions">
        {s.managed &&
          (up ? (
            <button className="btn btn-small" onClick={onStop} disabled={!!busy}>
              Stop
            </button>
          ) : (
            <button className="btn btn-small" onClick={onStart} disabled={!!busy}>
              Start
            </button>
          ))}
        <button className="btn btn-small" onClick={onSelect} aria-pressed={selected}>
          Logs
        </button>
      </div>
    </article>
  );
}

function LogPanel({
  services,
  selected,
  onSelect,
  reloadKey,
}: {
  services: ServiceStatus[];
  selected: string | null;
  onSelect: (id: string) => void;
  reloadKey: number;
}) {
  const [text, setText] = useState("");
  const [clearing, setClearing] = useState(false);
  const pre = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  const selectedName = services.find((s) => s.id === selected)?.name;

  async function clear() {
    if (!selected) return;
    setClearing(true);
    try {
      await clearServiceLog(selected);
      setText(await serviceLog(selected));
    } catch (err) {
      setText(`Couldn't clear the log: ${err}`);
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const load = () =>
      serviceLog(selected)
        .then((t) => !cancelled && setText(t))
        .catch((err) => !cancelled && setText(`Couldn't read the log: ${err}`));
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected, reloadKey]);

  // Keep following new lines unless the user scrolled up to read.
  useEffect(() => {
    const el = pre.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <section className="log-panel" aria-label="Service log">
      <div className="log-tabs" role="tablist">
        {services.map((s) => (
          <button
            key={s.id}
            role="tab"
            className="log-tab"
            aria-selected={selected === s.id}
            onClick={() => {
              stick.current = true;
              onSelect(s.id);
            }}
          >
            {s.name}
          </button>
        ))}
        <button
          type="button"
          className="log-clear"
          disabled={!selected || clearing}
          title={selectedName ? `Clear the ${selectedName} log` : "Clear the log"}
          aria-label={selectedName ? `Clear the ${selectedName} log` : "Clear the log"}
          onClick={clear}
        >
          <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <pre
        ref={pre}
        className="log-text"
        role="tabpanel"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {text}
      </pre>
    </section>
  );
}


function ordered(services: ServiceStatus[]) {
  return [...services].sort((a, b) => PATH_ORDER.indexOf(a.id) - PATH_ORDER.indexOf(b.id));
}

/**
 * Links along the request path. Only the hop where requests actually stop is broken (a failed
 * station); everything else, including links past a break, is neutral, never "green".
 */
export function linkStates(columns: ServiceStatus[][]): ("ok" | "broken")[] {
  let reached = true;
  return columns.map((column) => {
    if (!reached) return "ok";
    if (column.some(isUp)) return "ok";
    reached = false;
    return column.some((s) => s.state === "failed") ? "broken" : "ok";
  });
}

function isUp(s: ServiceStatus) {
  return s.state === "running" || (s.state === "external" && s.listening);
}

function stateView(
  s: ServiceStatus,
  busy: "starting" | "stopping" | undefined,
): { label: string; tone: "ok" | "warn" | "bad" | "idle"; spinning: boolean } {
  if (busy === "starting" || s.state === "starting") return { label: "Starting…", tone: "idle", spinning: true };
  if (busy === "stopping") return { label: "Stopping…", tone: "idle", spinning: true };
  switch (s.state) {
    case "running":
      return { label: "Running", tone: "ok", spinning: false };
    case "failed":
      return { label: "Couldn't start", tone: "bad", spinning: false };
    case "external":
      return {
        label: s.listening ? "Running · managed outside NexDB" : "Not running · managed outside NexDB",
        tone: s.listening ? "ok" : "idle",
        spinning: false,
      };
    default:
      return { label: "Stopped", tone: "idle", spinning: false };
  }
}

function summary(services: ServiceStatus[]) {
  if (services.length === 0) return "Nothing to run yet.";
  const web = services.filter((s) => s.id === "apache" || s.id === "nginx");
  const failedWeb = web.find((s) => s.state === "failed");
  const up = services.filter(isUp).length;
  if (failedWeb) return `${up} of ${services.length} services running · Requests to localhost stop at ${failedWeb.name}.`;
  if (up === 0) return "Nothing is running. Start all to bring your stack up.";
  if (up === services.length) return "Everything is running. Your sites are served on localhost.";
  return `${up} of ${services.length} services running.`;
}

export function formatUptime(secs: number) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
