import { useCallback, useEffect, useMemo, useState } from "react";
import { Welcome, validateWelcome } from "./steps/Welcome";
import { SystemScan, useSystemScan } from "./steps/SystemScan";
import {
  Components,
  defaultSelections,
  validateComponents,
  type Selections,
} from "./steps/Components";
import {
  MySQL,
  emptyMysqlSettings,
  mysqlMode,
  validateMysql,
  type MysqlMode,
  type MysqlSettings,
} from "./steps/MySQL";
import { Review } from "./steps/Review";
import { InstallView } from "./steps/InstallView";
import { Check } from "lucide-react";
import { ThemeToggle } from "./components/ThemeToggle";
import { loadChoices, type Choices } from "./lib/catalog";
import { suggestPort } from "./lib/ports";
import { buildPlan, type InstallPlan } from "./lib/plan";

export interface Settings {
  installRoot: string;
  wwwDir: string;
}

const STEPS = [
  { id: "welcome", title: "Welcome", heading: "Set up your local stack" },
  { id: "scan", title: "System scan", heading: "Check this PC" },
  { id: "components", title: "Components", heading: "Choose components" },
  { id: "mysql", title: "MySQL", heading: "Set up MySQL" },
  { id: "review", title: "Review", heading: "Review and install" },
  { id: "install", title: "Install", heading: "Install" },
] as const;

/** Steps built so far; the rest show a placeholder. */
const BUILT = new Set(["welcome", "scan", "components", "mysql", "review", "install"]);

/** First-run setup. `onFinish` opens the dashboard once the install is done. */
export function Wizard({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<Settings>({
    installRoot: "C:\\DevManager",
    wwwDir: "C:\\DevManager\\www",
  });
  const [choices, setChoices] = useState<Choices | null>(null);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selections | null>(null);
  const [mysql, setMysql] = useState<{ mode: MysqlMode; value: MysqlSettings } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The plan as it was when the user clicked Install. */
  const [installPlan, setInstallPlan] = useState<InstallPlan | null>(null);

  const current = STEPS[step];
  const scanStep = STEPS.findIndex((s) => s.id === "scan");
  // Scan once the user reaches the scan step; keep the result while they move around.
  const scan = useSystemScan(settings.installRoot, step >= scanStep);
  const scanReport = scan.state.status === "done" ? scan.state.report : null;

  const mode = selections ? mysqlMode(selections.mysql) : "skip";
  const mysqlVersion = selections?.mysql.version ?? null;
  const mysqlExisting =
    scanReport?.components
      .find((c) => c.id === "mysql")
      ?.installs.find((i) => i.path === selections?.mysql.existingPath) ?? null;

  // Fresh MySQL settings when the step is first reached, or when the user switched between
  // installing and using an existing MySQL. New installs default to the first free port.
  useEffect(() => {
    if (current.id !== "mysql" || (mysql && mysql.mode === mode)) return;
    let cancelled = false;
    const port = mode === "new" ? suggestPort(3306) : Promise.resolve(3306);
    port
      .catch(() => 3306)
      .then((p) => !cancelled && setMysql({ mode, value: emptyMysqlSettings(p ?? 3306) }));
    return () => {
      cancelled = true;
    };
  }, [current.id, mode, mysql]);

  const updateMysql = useCallback((update: (prev: MysqlSettings) => MysqlSettings) => {
    setMysql((prev) => (prev ? { ...prev, value: update(prev.value) } : prev));
    setError(null);
  }, []);

  // After a rescan, drop "use existing" picks whose install is no longer found.
  useEffect(() => {
    if (!scanReport) return;
    setSelections((current) => {
      if (!current) return current;
      const found = new Set(scanReport.components.flatMap((c) => c.installs.map((i) => i.path)));
      const stale = Object.entries(current).filter(
        ([, s]) => s.existingPath && !found.has(s.existingPath),
      );
      if (stale.length === 0) return current;
      const next = { ...current };
      for (const [id, s] of stale) next[id] = { ...s, existingPath: null };
      return next;
    });
  }, [scanReport]);

  useEffect(() => {
    loadChoices()
      .then((c) => {
        setChoices(c);
        setSelections(defaultSelections(c));
      })
      .catch((err) => setChoicesError(String(err)));
  }, []);

  function next() {
    const problem =
      current.id === "welcome"
        ? validateWelcome(settings)
        : current.id === "components" && selections
          ? validateComponents(selections)
          : current.id === "mysql" && mysql
            ? validateMysql(mysql.value, mode, settings, mysqlVersion)
            : null;
    setError(problem);
    if (problem) return;
    if (current.id === "review") {
      if (!plan) return;
      setInstallPlan(plan);
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function goTo(id: (typeof STEPS)[number]["id"]) {
    setError(null);
    setStep(STEPS.findIndex((s) => s.id === id));
  }

  const plan = useMemo(
    () =>
      current.id === "review" && selections && choices
        ? buildPlan({ settings, selections, choices, scan: scanReport, mysql })
        : null,
    [current.id, settings, selections, choices, scanReport, mysql],
  );

  const componentsReady = current.id !== "components" || (choices && selections);
  const mysqlReady = current.id !== "mysql" || (mysql !== null && mysql.mode === mode);

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
            <rect x="1" y="1" width="16" height="16" rx="4" fill="var(--accent)" />
            <rect x="4.5" y="5" width="9" height="2" rx="1" fill="var(--accent-on)" />
            <rect x="4.5" y="8.5" width="9" height="2" rx="1" fill="var(--accent-on)" opacity="0.75" />
            <rect x="4.5" y="12" width="5" height="2" rx="1" fill="var(--accent-on)" opacity="0.5" />
          </svg>
          DevManager
        </div>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={i === step ? "step current" : i < step ? "step done" : "step"}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="step-num" aria-hidden="true">
                {i < step ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              {s.title}
              {i < step && <span className="visually-hidden"> (done)</span>}
            </li>
          ))}
        </ol>
        <ThemeToggle />
      </aside>

      <main className="panel">
        <header className="panel-head">
          <h1>{current.heading}</h1>
        </header>

        {current.id === "install" && installPlan ? (
          <InstallView
            key={JSON.stringify(installPlan)}
            plan={installPlan}
            mysqlPassword={mysql?.value.noPassword ? "" : (mysql?.value.password ?? "")}
            onBack={() => goTo("review")}
            onFinish={onFinish}
          />
        ) : (
        <>
        <div className="panel-body" key={current.id}>
          {current.id === "welcome" && (
            <Welcome
              settings={settings}
              onChange={(s) => {
                setSettings(s);
                setError(null);
              }}
            />
          )}
          {current.id === "scan" && <SystemScan state={scan.state} onRescan={scan.rescan} />}
          {current.id === "components" &&
            (choices && selections ? (
              <Components
                choices={choices}
                scan={scanReport}
                selections={selections}
                onChange={(s) => {
                  setSelections(s);
                  setError(null);
                }}
              />
            ) : (
              <p className="lede" role={choicesError ? "alert" : "status"}>
                {choicesError
                  ? `Couldn't load the version list: ${choicesError}`
                  : "Loading versions…"}
              </p>
            ))}
          {current.id === "mysql" &&
            (mysqlReady && mysql ? (
              <MySQL
                value={mysql.value}
                onChange={updateMysql}
                mode={mode}
                settings={settings}
                version={mysqlVersion}
                existing={mysqlExisting}
              />
            ) : (
              <p className="lede" role="status">
                Checking ports…
              </p>
            ))}
          {current.id === "review" && plan && <Review plan={plan} onEdit={goTo} />}
          {!BUILT.has(current.id) && (
            <p className="lede">This step is coming in the next part of the build.</p>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="panel-foot">
          <button className="btn btn-quiet" onClick={back} disabled={step === 0}>
            Back
          </button>
          <span className="foot-count">
            Step {step + 1} of {STEPS.length}
          </span>
          <button
            className="btn btn-primary"
            onClick={next}
            disabled={
              step === STEPS.length - 1 || !BUILT.has(current.id) || !componentsReady || !mysqlReady
            }
          >
            {current.id === "review" ? "Install" : "Continue"}
          </button>
        </footer>
        </>
        )}
      </main>
    </div>
  );
}
