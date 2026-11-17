import { useEffect, useState } from "react";
import { Nex } from "./Nex";
import { macAppPlace, moveToApplications } from "../lib/macapp";

/**
 * macOS: NexDB opened straight from the downloaded disk image runs from a read-only, temporary
 * place, so it never stays installed. Nex offers to copy it to Applications and reopen it from
 * there; setup, projects and databases are kept. "Not now" hides it until the next launch.
 */
export function MacMoveDialog() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    macAppPlace()
      .then((p) => setShow(p.mac && !p.in_applications))
      .catch(() => setShow(false));
  }, []);

  if (!show) return null;

  async function move() {
    setBusy(true);
    setError(null);
    try {
      await moveToApplications();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="grace-overlay" role="dialog" aria-modal="true" aria-labelledby="mac-move-title">
      <div className="grace-card">
        <Nex state="teacher" size={84} />
        <div>
          <h2 id="mac-move-title">Move NexDB to Applications?</h2>
          <p>
            NexDB is running from the downloaded disk image, so macOS treats it as a new app every time. Moved to
            Applications, it opens like any other app, from Launchpad, the Dock or the shortcut NexDB puts on your Desktop.
            Your setup, projects and databases stay as they are.
          </p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="grace-actions">
            <button type="button" className="btn btn-small btn-primary" disabled={busy} data-working={busy || undefined} onClick={() => void move()}>
              {busy ? "Moving…" : "Move to Applications"}
            </button>
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => setShow(false)}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
