import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Circle, CircleSlash, LoaderCircle, X } from "lucide-react";
import type { InstallPlan } from "../lib/plan";
import { inDesktopApp } from "../lib/scan";
import { cancelInstall, isGone, runInstall, type Progress } from "../lib/install";
import { loadChoices, type Choices } from "../lib/catalog";
import { Nex } from "../components/Nex";

/** Pick another version for a component whose download was taken down, then install again. */
export type SwitchVersion = (id: string, version: string, choices: Choices) => void;

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
  onSwitch,
}: {
  plan: InstallPlan;
  run: ReturnType<typeof useInstall>;
  onSwitch?: SwitchVersion;
}) {
  const { state, steps, error } = run;
  const gone = state === "failed" && isGone(error);
  const failedId = Object.values(steps)
    .find((p) => p.status === "failed" && p.step.startsWith("get-"))
    ?.step.slice(4);
  const failed = gone ? plan.components.find((c) => c.id === failedId) : undefined;

  return (
    <>
      <p className="lede" role="status">
        {state === "running" && "Installing. You can keep using your PC; this can take a few minutes."}
        {state === "done" &&
          "Everything is installed and configured. Open the dashboard to start your services."}
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

      {failed && onSwitch ? (
        <VersionGone name={failed.name} id={failed.id} version={failed.version ?? ""} onSwitch={onSwitch} />
      ) : (
        error &&
        state === "failed" && (
          <div className="error-box" role="alert">
            <p>{error}</p>
          </div>
        )
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
        {status === "done" && <Check size={12} strokeWidth={3} />}
        {status === "failed" && <X size={12} strokeWidth={3} />}
        {status === "running" && <LoaderCircle size={16} strokeWidth={2.5} />}
        {status === "cancelled" && <CircleSlash size={14} strokeWidth={2} />}
        {status === "pending" && <Circle size={14} strokeWidth={2} />}
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

/**
 * Nex explains that the vendor took the version down (not a problem with this PC) and offers
 * the versions the official site has today, the recommended one first.
 */
function VersionGone({
  name,
  id,
  version,
  onSwitch,
}: {
  name: string;
  id: string;
  version: string;
  onSwitch: SwitchVersion;
}) {
  const [choices, setChoices] = useState<Choices | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    loadChoices(true)
      .then(setChoices)
      .catch(() => setOffline(true));
  }, []);

  const component = choices?.components.find((c) => c.id === id);
  const recommended = component?.recommended;
  const others = (component?.versions ?? [])
    .filter((v) => v.downloadable && v.version !== version)
    .sort((a, b) => Number(b.version === recommended) - Number(a.version === recommended));

  return (
    <aside className="version-gone" role="alert" aria-labelledby="version-gone-title">
      <Nex state={choices ? "teacher" : "thinking"} size={72} />
      <div>
        <h2 id="version-gone-title">
          {name} {version} isn't offered any more
        </h2>
        <p>
          The official {name} download site took this version down, usually because a newer build replaced it. Nothing
          is wrong with your PC, and nothing half-installed was left behind.
        </p>
        {!choices && !offline && <p className="field-hint">Checking which versions the official site has today…</p>}
        {offline && (
          <p className="field-hint">Couldn't reach the release sites. Check the internet connection, then press Try again.</p>
        )}
        {choices && others.length === 0 && (
          <p className="field-hint">The site has no other version right now. Try again in a little while.</p>
        )}
        {choices && others.length > 0 && (
          <>
            <p>Pick one it has today and I'll carry on from where we stopped:</p>
            <div className="version-gone-actions">
              {others.map((v, i) => (
                <button
                  key={v.version}
                  className={i === 0 ? "btn btn-small btn-primary" : "btn btn-small"}
                  autoFocus={i === 0}
                  onClick={() => onSwitch(id, v.version, choices)}
                >
                  Install {name} {v.version}
                  {v.version === recommended && " (recommended)"}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function formatMB(bytes: number) {
  return `${(bytes / 2 ** 20).toFixed(1)} MB`;
}
