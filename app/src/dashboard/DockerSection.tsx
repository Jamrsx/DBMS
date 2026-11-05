import { useCallback, useEffect, useState } from "react";
import { Box, LoaderCircle, Play, RotateCw, ScrollText, Square } from "lucide-react";
import {
  dockerAction,
  dockerInfo,
  dockerList,
  dockerLogs,
  hostPorts,
  type Container,
  type DockerInfo,
} from "../lib/docker";

/**
 * Docker containers, next to NexDB's own services: what each one runs, whether it's up, its
 * address, and Start, Stop, Restart and its log. Hidden entirely when Docker isn't on the PC,
 * apart from one line saying so.
 */
export function DockerSection({ active }: { active: boolean }) {
  const [info, setInfo] = useState<DockerInfo | null>(null);
  const [list, setList] = useState<Container[] | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const i = await dockerInfo();
      setInfo(i);
      if (i.running) setList(await dockerList());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), 5000);
    return () => window.clearInterval(t);
  }, [active, load]);

  async function act(c: Container, what: "start" | "stop" | "restart") {
    const label = { start: "Starting…", stop: "Stopping…", restart: "Restarting…" }[what];
    setBusy((b) => ({ ...b, [c.id]: label }));
    setError(null);
    try {
      await dockerAction(c.id, what);
    } catch (e) {
      setError(`${c.name}: ${String(e)}`);
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[c.id];
        return n;
      });
      void load();
    }
  }

  async function showLog(c: Container) {
    if (log?.id === c.id) return setLog(null);
    try {
      setLog({ id: c.id, text: (await dockerLogs(c.id)) || "(It hasn't printed anything yet.)" });
    } catch (e) {
      setError(String(e));
    }
  }

  if (!info) return null;
  if (!info.installed)
    return (
      <p className="docker-off field-hint" data-guide="docker">
        <Box size={14} aria-hidden="true" /> Use Docker? Install Docker Desktop, and your containers show up here to
        start and stop next to NexDB's services.
      </p>
    );

  const up = list?.filter((c) => c.state === "running").length ?? 0;
  return (
    <section className="svc-group-block docker" aria-labelledby="group-docker" data-guide="docker">
      <h3 className="svc-group-title" id="group-docker">
        Docker
        <span className="svc-group-count">
          {info.running ? `${up} of ${list?.length ?? 0} running` : "Docker Desktop isn't running"}
        </span>
      </h3>
      {!info.running ? (
        <p className="field-hint docker-note">
          Start Docker Desktop, and your containers appear here within a few seconds.
        </p>
      ) : list && list.length === 0 ? (
        <p className="field-hint docker-note">
          No containers yet. Make one with docker run or docker compose, and it shows up here.
        </p>
      ) : (
        <ul className="svc-list">
          {list?.map((c) => {
            const running = c.state === "running";
            const doing = busy[c.id];
            return (
              <li key={c.id} className="svc docker-row" aria-labelledby={`docker-${c.id}`}>
                <span className="svc-icon" aria-hidden="true">
                  <Box size={18} strokeWidth={1.75} />
                </span>
                <div className="svc-name">
                  <h4 id={`docker-${c.id}`}>
                    {c.name} <code className="svc-version">{c.image}</code>
                  </h4>
                  <p>{c.status}</p>
                  {hostPorts(c.ports).length > 0 && (
                    <p className="svc-inline-facts">
                      {hostPorts(c.ports).map((p) => (
                        <span key={p} className="svc-chip" title="Open it at this address">
                          <span className="svc-chip-k">At</span> <code>{p}</code>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <span className={`status-pill status-${doing ? "idle" : running ? "ok" : "idle"}`}>
                  {doing ? (
                    <LoaderCircle className="status-spin" size={12} strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    <span className="status-dot" aria-hidden="true" />
                  )}
                  {doing ?? (running ? "Running" : "Stopped")}
                </span>
                <div className="svc-actions">
                  {running ? (
                    <>
                      <button className="btn btn-small" disabled={!!doing} onClick={() => void act(c, "stop")}>
                        <Square size={13} aria-hidden="true" /> Stop
                      </button>
                      <button
                        className="btn btn-small btn-icon"
                        disabled={!!doing}
                        aria-label={`Restart ${c.name}`}
                        title="Restart"
                        onClick={() => void act(c, "restart")}
                      >
                        <RotateCw size={13} aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-small" disabled={!!doing} onClick={() => void act(c, "start")}>
                      <Play size={13} aria-hidden="true" /> Start
                    </button>
                  )}
                  <button className="btn btn-small" aria-expanded={log?.id === c.id} onClick={() => void showLog(c)}>
                    <ScrollText size={13} aria-hidden="true" /> Logs
                  </button>
                </div>
                {log?.id === c.id && <pre className="docker-log">{log.text}</pre>}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
