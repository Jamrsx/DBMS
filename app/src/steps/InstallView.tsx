import type { InstallPlan } from "../lib/plan";
import { isGone } from "../lib/install";
import { Install, useInstall, type SwitchVersion } from "./Install";

/** The Install step's body and footer; the footer changes with the run state. */
export function InstallView({
  plan,
  mysqlPassword,
  onBack,
  onFinish,
  onSwitch,
}: {
  plan: InstallPlan;
  mysqlPassword: string;
  onBack: () => void;
  onFinish: () => void;
  onSwitch: SwitchVersion;
}) {
  const run = useInstall(plan, mysqlPassword);
  const running = run.state === "running";
  // When the version was taken down, Nex's choices lead; Try again would only fail the same way.
  const gone = run.state === "failed" && isGone(run.error);

  return (
    <>
      <div className="panel-body">
        <Install plan={plan} run={run} onSwitch={onSwitch} />
      </div>
      <footer className="panel-foot">
        <button className="btn btn-quiet" onClick={onBack} disabled={running}>
          Back
        </button>
        <span className="foot-count">Step 6 of 6</span>
        {running && (
          <button className="btn" onClick={() => void run.cancel()}>
            Cancel
          </button>
        )}
        {(run.state === "failed" || run.state === "cancelled") && (
          <button className={gone ? "btn" : "btn btn-primary"} onClick={run.retry}>
            Try again
          </button>
        )}
        {run.state === "done" && (
          <button className="btn btn-primary" onClick={onFinish}>
            Open dashboard
          </button>
        )}
      </footer>
    </>
  );
}
