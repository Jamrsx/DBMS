import { useCallback, useEffect, useRef, useState } from "react";
import type { InstallPlan } from "../lib/plan";
import { inDesktopApp } from "../lib/scan";
import { cancelInstall, runInstall, type Progress } from "../lib/install";

export type RunState = "running" | "done" | "failed" | "cancelled";

/** Runs the plan once when mounted; `retry` runs it again (finished items are skipped). */
export function useInstall(plan: InstallPlan, mysqlPassword: string) {
  const [state, setState] = useState<RunState>("running");
  const [steps, setSteps] = useState<Record<string, Progress>>({});
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    setState("running");
    setError(null);
    runInstall(plan, mysqlPassword, (p) => setSteps((s) => ({ ...s, [p.step]: p })))
      .then(() => setState("done"))
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setState(message === "Installation cancelled." ? "cancelled" : "failed");
      });
  }, [plan, mysqlPassword, attempt]);

  const retry = useCallback(() => {
    setSteps({});
    setAttempt((n) => n + 1);
  }, []);

  return { state, steps, error, retry, cancel: cancelInstall };
}

export function Install({
  plan,
  run,
}: {
  plan: InstallPlan;
  run: ReturnType<typeof useInstall>;
}) {
  const { state, steps, error } = run;

  return (
    <>
      <p className="lede" role="status">
        {state === "running" && "Installing. You can keep using your PC; this can take a few minutes."}
        {state === "done" &&
          "Everything is installed and configured. Starting the services comes with the dashboard."}
        {state === "failed" && "Installation stopped."}
        {state === "cancelled" && "Installation cancelled. Nothing half-installed was left behind."}
      </p>

      {!inDesktopApp && (
        <p className="notice" role="note">
          Browser preview: progress is simulated and nothing is downloaded.
        </p>
      )}

      <ol className="install-steps">
        {plan.steps.map((s) => (
          <InstallStep
            key={s.id}
            title={s.title}
            admin={s.admin}
            confirm={s.confirm ?? false}
            progress={steps[s.id]}
            runState={state}
          />
        ))}
      </ol>

      {error && state === "failed" && (
        <div className="error-box" role="alert">
          <p>{error}</p>
        </div>
      )}
    </>
  );
}

function InstallStep({
  title,
  admin,
  confirm,
  progress,
  runState,
}: {
  title: string;
  admin: boolean;
  confirm: boolean;
  progress: Progress | undefined;
  runState: RunState;
}) {
  const status = progress?.status ?? "pending";
  const percent =
    progress?.status === "running" && progress.bytes_total
      ? Math.min(100, Math.round((progress.bytes_done / progress.bytes_total) * 100))
      : null;

  return (
    <li className={`install-step is-${status}`}>
      <span className="install-icon" aria-hidden="true">
        {status === "done" ? "✓" : status === "failed" ? "!" : status === "running" ? "" : "·"}
      </span>
      <span className="install-title">
        {title}
        {admin && <span className="tag tag-admin">Admin</span>}
        {confirm && <span className="tag tag-admin">Windows asks</span>}
      </span>
      <span className="install-state">
        {status === "pending" && (runState === "running" ? "Waiting" : "Not started")}
        {status === "running" &&
          (percent !== null
            ? `${progress?.message ?? ""} ${formatMB(progress!.bytes_done)} of ${formatMB(progress!.bytes_total!)}`
            : (progress?.message ?? "Working…"))}
        {status === "done" && (progress?.message ?? "Done")}
        {status === "failed" && "Failed"}
        {status === "cancelled" && "Cancelled"}
      </span>
      {percent !== null && (
        <span
          className="bar"
          role="progressbar"
          aria-label={title}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="bar-fill" style={{ width: `${percent}%` }} />
        </span>
      )}
    </li>
  );
}

function formatMB(bytes: number) {
  return `${(bytes / 2 ** 20).toFixed(1)} MB`;
}
