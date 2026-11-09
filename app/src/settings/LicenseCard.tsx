import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { checkInLicense, dateOf, licenseStatus, unlinkLicense, type LicenseStatus } from "../lib/license";
import { isPractice } from "../lib/practice";
import { nexCelebrate } from "../lib/nex";

/** Settings → License: what this PC's license is, checking it now, and freeing it for another PC. */
export function LicenseCard() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    licenseStatus().then(setStatus).catch(() => {});
  }, []);

  if (!status || status.state !== "active") return null;

  async function checkNow() {
    setMessage(null);
    const out = await checkInLicense();
    if (out.status) setStatus(out.status);
    setMessage(
      out.code === "offline"
        ? { ok: false, text: "No connection to the NexDB server right now. Your license keeps working offline." }
        : out.ok
          ? { ok: true, text: "Checked just now. Your license is good." }
          : { ok: false, text: out.message ?? "The license couldn't be checked." },
    );
  }

  async function unlink() {
    setMessage(null);
    const out = await unlinkLicense();
    setConfirming(false);
    if (!out.ok) {
      setMessage({ ok: false, text: out.message ?? "The key couldn't be unlinked." });
      return;
    }
    if (isPractice()) {
      nexCelebrate("In real life, NexDB would now ask for a key again on this PC.");
      return;
    }
    // This PC has no license now: back to the license screen.
    window.location.reload();
  }

  return (
    <section className="set-card" data-guide="license-card">
      <h2 className="license-card-title">
        <KeyRound size={16} aria-hidden="true" /> Your license
      </h2>
      <dl className="license-facts">
        <div>
          <dt>Plan</dt>
          <dd>{status.plan ?? "NexDB"}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd>
            {status.lifetime || status.expires_at === null ? (
              "Never (lifetime)"
            ) : (
              <>
                {dateOf(status.expires_at)}
                {status.days_left !== null && <span className="license-days"> · {status.days_left} days left</span>}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Activated by</dt>
          <dd>
            {status.name ?? "—"}
            {status.email && <span className="license-days"> · {status.email}</span>}
          </dd>
        </div>
        <div>
          <dt>Key</dt>
          <dd className="mono">NEXDB-••••-••••-••••-{status.key_hint}</dd>
        </div>
      </dl>
      <p className="field-hint">
        Works offline. NexDB checks it with the NexDB server whenever you're online, and needs to at least once by{" "}
        {dateOf(status.check_by)}.
      </p>
      <div className="license-actions" data-guide="license-actions">
        <button className="btn btn-small" onClick={() => void checkNow()}>
          Check now
        </button>
        {confirming ? (
          <>
            <span className="license-confirm">Unlink it from this PC? NexDB here will ask for a key again.</span>
            <button className="btn btn-small" onClick={() => setConfirming(false)}>
              Keep it
            </button>
            <button className="btn btn-small btn-danger" onClick={() => void unlink()}>
              Unlink
            </button>
          </>
        ) : (
          <button className="btn btn-small" onClick={() => setConfirming(true)}>
            Move to another PC
          </button>
        )}
      </div>
      {message && (
        <p className={message.ok ? "set-ok" : "field-error"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
