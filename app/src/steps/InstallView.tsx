import type { InstallPlan } from "../lib/plan";
import { Install, useInstall } from "./Install";

/** The Install step's body and footer; the footer changes with the run state. */
export function InstallView({
  plan,
  mysqlPassword,
  onBack,
}: {
  plan: InstallPlan;
  mysqlPassword: string;
  onBack: () => void;
}) {
  const run = useInstall(plan, mysqlPassword);
  const running = run.state === "running";

  return (
    <>
      <div className="panel-body">
        <Install plan={plan} run={run} />
      </div>
      <footer className="panel-foot">
        <button className="btn btn-quiet" onClick={onBack} disabled={running}>
          Back
        </button>
        {running && (
          <button className="btn" onClick={() => void run.cancel()}>
            Cancel
          </button>
        )}
        {(run.state === "failed" || run.state === "cancelled") && (
          <button className="btn btn-primary" onClick={run.retry}>
            Try again
          </button>
        )}
        {run.state === "done" && (
          <button className="btn btn-primary" disabled title="The dashboard comes in a later part">
            Finish
          </button>
        )}
      </footer>
    </>
  );
}
