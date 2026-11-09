import { useState } from "react";
import { Nex } from "./Nex";
import { RenewOptions } from "./RenewOptions";
import { dateOf, type LicenseStatus } from "../lib/license";

type Grace = Extract<LicenseStatus, { state: "grace" }>;

/** "2 days", "5 hours", "12 minutes" until the grace days are over. */
function timeLeft(until: number): string {
  const secs = Math.max(0, until - Math.floor(Date.now() / 1000));
  const [n, unit] = secs >= 86400 ? [Math.ceil(secs / 86400), "day"] : secs >= 3600 ? [Math.ceil(secs / 3600), "hour"] : [Math.max(1, Math.ceil(secs / 60)), "minute"];
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * The license ended: NexDB keeps working for 3 days. A bar says so on every screen; it opens
 * Nex's renew-or-upgrade card. Nothing is locked until the grace days are over.
 */
export function GraceNotice({ status, onNewKey }: { status: Grace; onNewKey: () => void }) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <div className="grace-bar" role="status">
        <span>
          Your license ended {dateOf(status.expires_at)}. NexDB keeps working for another <strong>{timeLeft(status.grace_until)}</strong>.
        </span>
        <button type="button" className="btn btn-small btn-primary" onClick={() => setOpen(true)}>
          Renew or upgrade
        </button>
      </div>

      {open && (
        <div className="grace-overlay" role="dialog" aria-modal="true" aria-labelledby="grace-title">
          <div className="grace-card">
            <Nex state="teacher" size={84} />
            <div>
              <h2 id="grace-title">Your license has ended</h2>
              <p>
                Nothing is locked yet: NexDB keeps working for another {timeLeft(status.grace_until)}, and your projects and databases are
                safe. Renew {status.plan ? `your ${status.plan} plan` : "your plan"} or upgrade to a longer one before then.
              </p>
              <RenewOptions plan={status.plan} seller={status.seller} onNewKey={onNewKey} />
              <div className="grace-actions">
                <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
                  Remind me later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
