import { useCallback, useEffect, useState } from "react";
import { OtherTerminalsCard } from "./OtherTerminalsCard";
import { AlertTriangle, CheckCircle2, FileArchive, Info, RefreshCw, XCircle } from "lucide-react";
import { Nex, type NexState } from "../components/Nex";
import { allowFirewall } from "../lib/share";
import { syncHosts } from "../lib/projects";
import { trustHttps } from "../lib/https";
import {
  fixConfigs,
  resetPostgres,
  previewFixedNow,
  runHealthCheck,
  saveSupportReport,
  type HealthArea,
  type HealthCheck,
  type HealthLevel,
} from "../lib/health";

const AREAS: HealthArea[] = ["Services", "Sites", "Sharing", "Projects", "This PC"];
const ICON: Record<HealthLevel, typeof Info> = { ok: CheckCircle2, info: Info, warn: AlertTriangle, bad: XCircle };
const LEVEL_NAME: Record<HealthLevel, string> = { ok: "Fine", info: "Note", warn: "Needs attention", bad: "Problem" };

/** "Check my setup": what could stop the stack, sites or sharing, each with a plain fix. */
export function HealthPage({
  active,
  onNavigate,
  onOpenProject,
}: {
  active: boolean;
  onNavigate: (page: "dashboard" | "versions") => void;
  onOpenProject: (name: string) => void;
}) {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ busy: boolean; path: string | null; error: string | null }>({
    busy: false,
    path: null,
    error: null,
  });

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setChecks(await runHealthCheck());
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }, []);

  // Checked each time the page opens, so it reflects the PC as it is now.
  useEffect(() => {
    if (active) void check();
  }, [active, check]);

  async function fix(c: HealthCheck) {
    const action = c.fix!.action;
    if (action === "dashboard" || action === "versions") return onNavigate(action);
    if (action.startsWith("project:")) return onOpenProject(action.slice("project:".length));
    setFixing(action);
    setError(null);
    try {
      if (action === "firewall") await allowFirewall();
      else if (action === "hosts") await syncHosts();
      else if (action === "trust") await trustHttps();
      else if (action === "configs") await fixConfigs();
      else if (action === "pg-reset") await resetPostgres();
      previewFixedNow(action);
      await check();
    } catch (e) {
      setError(String(e));
    } finally {
      setFixing(null);
    }
  }

  async function saveReport() {
    setReport({ busy: true, path: null, error: null });
    try {
      const path = await saveSupportReport();
      setReport({ busy: false, path, error: null });
    } catch (e) {
      setReport({ busy: false, path: null, error: String(e) });
    }
  }

  const problems = (checks ?? []).filter((c) => c.level === "bad").length;
  const attention = (checks ?? []).filter((c) => c.level === "warn").length;
  const [mood, say]: [NexState, string] = !checks
    ? ["thinking", "Looking over your setup…"]
    : problems > 0
      ? [
          "error",
          `Found ${problems} problem${problems === 1 ? "" : "s"} that stop${problems === 1 ? "s" : ""} something from working. Each has a fix below.`,
        ]
      : attention > 0
        ? ["thinking", `Everything runs. ${attention} thing${attention === 1 ? "" : "s"} could use a look.`]
        : ["success", "All good! Nothing in your setup needs fixing."];

  return (
    <main className="panel health">
      <header className="panel-head dash-head">
        <div>
          <h1>Check my setup</h1>
          <p className="dash-summary" role="status">
            {checking
              ? "Checking ports, sites, sharing and projects…"
              : checks
                ? problems + attention === 0
                  ? "Everything looks good."
                  : [
                      problems && `${problems} problem${problems === 1 ? "" : "s"}`,
                      attention && `${attention} to look at`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                : ""}
          </p>
        </div>
        <div className="dash-actions">
          <button className="btn" aria-busy={report.busy} disabled={report.busy} onClick={() => void saveReport()}>
            <FileArchive size={14} aria-hidden="true" /> Save support report
          </button>
          <button className="btn btn-primary" aria-busy={checking} disabled={checking} onClick={() => void check()}>
            <RefreshCw size={14} aria-hidden="true" /> Check again
          </button>
        </div>
      </header>

      <div className="panel-body dash-body health-body">
        <div className="setup-nex">
          <Nex state={checking && !checks ? "loading" : mood} size={72} />
          <p className="setup-say">{say}</p>
        </div>

        {(report.path || report.error) && (
          <p className={report.error ? "field-error" : "set-ok"} role="status">
            {report.error ??
              `Saved ${report.path}. It has NexDB's settings, configs and the end of each log, with passwords removed; no project files.`}
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        {checks &&
          AREAS.map((area) => {
            const items = checks.filter((c) => c.area === area);
            if (items.length === 0) return null;
            const worst = items.some((c) => c.level === "bad")
              ? "bad"
              : items.some((c) => c.level === "warn")
                ? "warn"
                : "ok";
            return (
              <section key={area} className="health-area" aria-labelledby={`health-${area}`}>
                <h2 id={`health-${area}`}>
                  <span className={`dot dot-${worst}`} aria-hidden="true" />
                  {area}
                </h2>
                <ul className="health-list">
                  {items.map((c, i) => {
                    const Icon = ICON[c.level];
                    return (
                      <li key={i} className={`health-item health-${c.level}`}>
                        <Icon size={16} className="health-icon" aria-label={LEVEL_NAME[c.level]} />
                        <div className="health-text">
                          <p className="health-title">{c.title}</p>
                          {c.detail && <p className="field-hint">{c.detail}</p>}
                        </div>
                        {c.fix && (
                          <button
                            className={c.level === "bad" ? "btn btn-small btn-primary" : "btn btn-small"}
                            aria-busy={fixing === c.fix.action}
                            disabled={!!fixing || checking}
                            onClick={() => void fix(c)}
                          >
                            {c.fix.label}
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {area === "This PC" && <OtherTerminalsCard />}
                </ul>
              </section>
            );
          })}
      </div>
    </main>
  );
}
