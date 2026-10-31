import { CircleArrowUp, RotateCw, X } from "lucide-react";
import { restartApp } from "../lib/appsettings";
import { dismissUpdate, installUpdates, useUpdates } from "../lib/updates";

/** A small card in the rail when a new NexDB is out: update now, or later. */
export function UpdateNotice() {
  const { state, dismissed, installing } = useUpdates();

  const offer = state.kind === "available" && state.version !== dismissed;
  const progress = installing && (state.kind === "downloading" || state.kind === "ready" || state.kind === "error");
  if (!offer && !progress) return null;

  const title =
    state.kind === "available"
      ? `NexDB ${state.version} is ready`
      : state.kind === "downloading"
        ? `Downloading${state.percent === null ? "…" : ` · ${state.percent}%`}`
        : state.kind === "ready"
          ? "The update is installed"
          : "The update didn't install";

  return (
    <aside className="update-notice" role="status" aria-live="polite" aria-labelledby="update-title">
      <div className="update-head">
        <CircleArrowUp className="update-icon" size={16} strokeWidth={2} aria-hidden="true" />
        <p id="update-title" className="update-title">
          {title}
        </p>
        {state.kind === "available" && (
          <button className="update-close" onClick={dismissUpdate} aria-label="Remind me later" title="Remind me later">
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {state.kind === "available" && (
        <>
          <p className="update-text">
            {state.notes ? firstLine(state.notes) : "A new version of NexDB is available."}
          </p>
          <div className="update-actions">
            <button className="btn btn-small btn-quiet" onClick={dismissUpdate}>
              Later
            </button>
            <button className="btn btn-small btn-primary" onClick={() => void installUpdates()}>
              Update now
            </button>
          </div>
        </>
      )}
      {state.kind === "downloading" && (
        <>
          <p className="update-text">NexDB closes and reopens by itself to finish.</p>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent ?? undefined}>
            <span className="bar-fill" style={{ width: `${state.percent ?? 30}%` }} />
          </div>
        </>
      )}
      {state.kind === "ready" && (
        <div className="update-actions">
          <button className="btn btn-small btn-primary" onClick={() => void restartApp()}>
            <RotateCw size={13} aria-hidden="true" /> Restart NexDB
          </button>
        </div>
      )}
      {state.kind === "error" && (
        <>
          <p className="update-text">{state.message}</p>
          <div className="update-actions">
            <button className="btn btn-small btn-quiet" onClick={dismissUpdate}>
              Close
            </button>
            <button className="btn btn-small" onClick={() => void installUpdates()}>
              Try again
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

/** The first line of the release notes, without the "New in NexDB x.y.z:" heading. */
function firstLine(notes: string) {
  const lines = notes
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l && !/^new in nexdb/i.test(l));
  return lines[0] + (lines.length > 1 ? " …" : "");
}
