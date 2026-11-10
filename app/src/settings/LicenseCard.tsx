import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { changeLicense, checkInLicense, dateOf, formatKey, licenseStatus, timeLeft, unlinkLicense, type LicenseStatus } from "../lib/license";
import { RenewOptions } from "../components/RenewOptions";
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

  if (status?.state === "grace")
    return (
      <section className="set-card" data-guide="license-card">
        <h2 className="license-card-title">
          <KeyRound size={16} aria-hidden="true" /> Your license has ended
        </h2>
        <p>
          {status.plan ?? "Your plan"} ended {dateOf(status.expires_at)}. NexDB keeps working for another {timeLeft(status.grace_until)}. Renew it, or
          upgrade to a longer plan:
        </p>
        <RenewOptions plan={status.plan} seller={status.seller} />
        <ChangeLicense onChanged={setStatus} />
      </section>
    );
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
                <span className="license-days"> · {timeLeft(status.expires_at)} left</span>
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
            <span className="license-confirm">Sign out of this PC? Then sign in on your other PC with your email and password.</span>
            <button className="btn btn-small" onClick={() => setConfirming(false)}>
              Keep it
            </button>
            <button className="btn btn-small btn-danger" onClick={() => void unlink()}>
              Sign out
            </button>
          </>
        ) : (
          <button className="btn btn-small" onClick={() => setConfirming(true)}>
            Sign out of this PC
          </button>
        )}
      </div>
      {message && (
        <p className={message.ok ? "set-ok" : "field-error"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      )}
      <ChangeLicense onChanged={setStatus} />
    </section>
  );
}

/**
 * Change license: type another key of the same NexDB account (an upgrade like the 4-year plan,
 * or a renewal). The new key takes over this PC; the old one is freed.
 */
function ChangeLicense({ onChanged }: { onChanged: (s: LicenseStatus) => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [offerMove, setOfferMove] = useState(false);

  async function submit(moveHere: boolean) {
    setBusy(true);
    setMessage(null);
    const out = await changeLicense(key, password, moveHere).finally(() => setBusy(false));
    if (out.ok) {
      if (isPractice()) {
        nexCelebrate("In real life, this PC would now use the new key.");
        return;
      }
      const fresh = out.status ?? (await licenseStatus());
      onChanged(fresh);
      setOpen(false);
      setKey("");
      setPassword("");
      setMessage({ ok: true, text: "Done. This PC uses the new key now." });
      return;
    }
    setOfferMove(out.code === "other_device");
    setMessage({
      ok: false,
      text:
        out.code === "offline"
          ? "No connection to the NexDB server. Changing the key needs the internet."
          : out.code === "other_device"
            ? `That key is in use on ${out.device ?? "another PC"}. Move it here?`
            : (out.message ?? "The key couldn't be changed."),
    });
  }

  if (!open)
    return (
      <div className="license-actions">
        <button className="btn btn-small" data-guide="license-change" onClick={() => setOpen(true)}>
          <KeyRound size={14} aria-hidden="true" /> Change license
        </button>
        {message && (
          <p className={message.ok ? "set-ok" : "field-error"} role={message.ok ? "status" : "alert"}>
            {message.text}
          </p>
        )}
      </div>
    );

  return (
    <form
      className="license-change"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <h3>Change license</h3>
      <p className="field-hint">Bought another plan, like the 4-year plan with NexHost? Type its key. The old key is freed from this PC.</p>
      <label className="field">
        <span className="field-label">New license key</span>
        <input value={key} onChange={(e) => setKey(formatKey(e.target.value))} placeholder="NEXDB-XXXX-XXXX-XXXX-XXXX" spellCheck={false} autoFocus />
      </label>
      <label className="field">
        <span className="field-label">Your NexDB account password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      {message && (
        <p className={message.ok ? "set-ok" : "field-error"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      )}
      <div className="license-actions">
        {offerMove ? (
          <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void submit(true)}>
            Move it here
          </button>
        ) : (
          <button className="btn btn-small btn-primary" disabled={busy || key.length < 24 || !password}>
            {busy ? "Changing…" : "Use this key"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-small btn-quiet"
          onClick={() => {
            setOpen(false);
            setMessage(null);
            setOfferMove(false);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
