import { useState } from "react";
import { Welcome, validateWelcome } from "./steps/Welcome";
import { SystemScan, useSystemScan } from "./steps/SystemScan";

export interface Settings {
  installRoot: string;
  wwwDir: string;
}

const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "scan", title: "System scan" },
  { id: "components", title: "Components" },
  { id: "mysql", title: "MySQL" },
  { id: "review", title: "Review" },
  { id: "install", title: "Install" },
] as const;

/** Steps built so far; the rest show a placeholder. */
const BUILT = new Set(["welcome", "scan"]);

export default function App() {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<Settings>({
    installRoot: "C:\\DevManager",
    wwwDir: "C:\\DevManager\\www",
  });
  const [error, setError] = useState<string | null>(null);

  const current = STEPS[step];
  const scanStep = STEPS.findIndex((s) => s.id === "scan");
  // Scan once the user reaches the scan step; keep the result while they move around.
  const scan = useSystemScan(settings.installRoot, step >= scanStep);

  function next() {
    if (current.id === "welcome") {
      const problem = validateWelcome(settings);
      setError(problem);
      if (problem) return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">DevManager</div>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={i === step ? "step current" : i < step ? "step done" : "step"}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="step-num">{i + 1}</span>
              {s.title}
            </li>
          ))}
        </ol>
        <p className="rail-foot">Setup</p>
      </aside>

      <main className="panel">
        <header className="panel-head">
          <p className="eyebrow">
            Step {step + 1} of {STEPS.length}
          </p>
          <h1>{current.id === "welcome" ? "Set up your local stack" : current.title}</h1>
        </header>

        <div className="panel-body">
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
          <button
            className="btn btn-primary"
            onClick={next}
            disabled={step === STEPS.length - 1 || !BUILT.has(current.id)}
          >
            Continue
          </button>
        </footer>
      </main>
    </div>
  );
}
