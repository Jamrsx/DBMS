import { openUrl } from "@tauri-apps/plugin-opener";
import { RenewOptions } from "./RenewOptions";
import { useEffect, useRef, useState } from "react";
import { Nex } from "./Nex";
import type { NexState } from "./Nex";
import {
  activateLicense,
  BUY_URL,
  checkInLicense,
  dateOf,
  formatKey,
  keyLooksComplete,
  thisDevice,
  type LicenseStatus,
} from "../lib/license";

/**
 * The license screen. Shown after setup, and on every start until this PC has a valid license.
 * There is no way past it: no close button, no skip, Escape does nothing. Activating needs the
 * internet once; after that NexDB works offline.
 */
export function LicenseGate({
  status,
  onActive,
  onClose,
}: {
  status: LicenseStatus;
  onActive: (s: LicenseStatus) => void;
  /** Only while NexDB still works (grace days): goes back without a new key. */
  onClose?: () => void;
}) {
  const ended = status.state === "expired" || status.state === "grace";
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(status.state === "none" ? status.notice : null);
  const [move, setMove] = useState<{ device: string | null; left: number | null } | null>(null);
  const [device, setDevice] = useState("this PC");
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    thisDevice().then(setDevice).catch(() => {});
    keyRef.current?.focus();
  }, []);

  // Only a key that's still on file but needs the internet can be fixed without typing a key.
  const needsInternet = status.state === "needs_checkin";
  const clockBack = status.state === "clock_back";

  const nex: { state: NexState; line: string } = busy
    ? { state: "loading", line: "Checking your key with the NexDB server…" }
    : problem
      ? { state: "error", line: problem }
      : move
        ? { state: "thinking", line: "That key is on another PC. Move it here?" }
        : ended
          ? { state: "sleeping", line: `Your license ended on ${dateOf(status.expires_at)}. Renew or upgrade, then type the new key.` }
          : needsInternet
            ? { state: "thinking", line: "It's been a while! Connect to the internet so I can check your license." }
            : clockBack
              ? { state: "error", line: "Your PC's date looks wrong. Fix the date and time in Windows, then try again." }
              : { state: "hello", line: "Almost there! Type your license key and you're in." };

  async function submit(moveHere = false) {
    setBusy(true);
    setProblem(null);
    try {
      const out = await activateLicense(key, name, email, moveHere);
      if (out.ok && (out.status?.state === "active" || out.status?.state === "grace")) {
        onActive(out.status);
        return;
      }
      if (out.code === "other_device") {
        setMove({ device: out.device, left: out.moves_left });
        return;
      }
      setMove(null);
      setProblem(out.message ?? "The key couldn't be activated.");
    } catch (e) {
      setProblem(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function retryCheck() {
    setBusy(true);
    setProblem(null);
    try {
      const out = await checkInLicense();
      if (out.status?.state === "active") onActive(out.status);
      else if (out.code === "offline") setProblem("Still no connection to the NexDB server. Check your internet and try again.");
      else setProblem(out.message ?? "The license couldn't be checked.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = keyLooksComplete(key) && name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && !busy;

  return (
    <div className="license-gate" role="dialog" aria-modal="true" aria-labelledby="license-title" onKeyDown={(e) => e.key === "Escape" && e.preventDefault()}>
      <div className="license-glow" aria-hidden="true" />
      <div className="license-card">
        <aside className="license-side">
          <div className="license-brand">
            <img src="/nexdb-logo.png" alt="" width={28} height={28} />
            NexDB
          </div>
          <div className="license-nex">
            <p className="license-bubble" role="status" aria-live="polite">
              {nex.line}
            </p>
            <Nex state={nex.state} size={150} />
          </div>
          <ul className="license-points">
            <li>Needs the internet once, to activate</li>
            <li>Then works offline</li>
            <li>One PC at a time; move it yourself</li>
          </ul>
        </aside>

        <main className="license-main">
          <h1 id="license-title">{ended ? "Renew your license" : "Activate NexDB"}</h1>
          <p className="license-lede">
            {status.state === "grace"
              ? "Type the new key you bought. Until then NexDB keeps working for the rest of the 3 grace days."
              : status.state === "expired"
              ? "Your license has ended and the 3 grace days are over. Your projects and databases are safe; renew or upgrade, then type the new key."
              : "Type the license key you bought from NexDB or got from a reseller."}
          </p>

          {needsInternet || clockBack ? (
            <div className="license-form">
              <p className="license-note">
                {needsInternet
                  ? `NexDB checks your license online at least once every 30 days. The last check was due ${dateOf(status.check_by)}.`
                  : "NexDB noticed the date on this PC is earlier than before. Set the correct date and time in Windows Settings, then press Try again."}
              </p>
              <button className="btn btn-primary license-submit" disabled={busy} onClick={() => void (needsInternet ? retryCheck() : window.location.reload())}>
                {busy ? "Checking…" : "Try again"}
              </button>
            </div>
          ) : move ? (
            <div className="license-form">
              <p className="license-note">
                This key is active on <strong>{move.device ?? "another PC"}</strong>. Moving it here signs that PC out of NexDB.
                {move.left !== null && (
                  <>
                    {" "}
                    You can move it {move.left} more {move.left === 1 ? "time" : "times"} this month.
                  </>
                )}
              </p>
              <div className="license-row">
                <button className="btn" disabled={busy} onClick={() => setMove(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={busy || move.left === 0} onClick={() => void submit(true)}>
                  {busy ? "Moving…" : `Move it to ${device}`}
                </button>
              </div>
            </div>
          ) : (
            <form
              className="license-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) void submit();
              }}
            >
              <label className="field">
                <span className="field-label">License key</span>
                <input
                  ref={keyRef}
                  className="input license-key"
                  value={key}
                  onChange={(e) => setKey(formatKey(e.target.value))}
                  placeholder="NEXDB-XXXX-XXXX-XXXX-XXXX"
                  spellCheck={false}
                  autoComplete="off"
                  aria-describedby="license-key-hint"
                />
                <span className="field-hint" id="license-key-hint">
                  Paste it whole; the dashes are added for you.
                </span>
              </label>
              <div className="license-row">
                <label className="field">
                  <span className="field-label">Full name</span>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your full name" />
                </label>
                <label className="field">
                  <span className="field-label">Email</span>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
                </label>
              </div>
              <button type="submit" className="btn btn-primary license-submit" disabled={!canSubmit}>
                {busy ? "Activating…" : "Activate"}
              </button>
              <p className="license-small">
                Your name and email are linked to this key so it can't be used by someone else. NexDB sends them only to the NexDB
                license server.
              </p>
            </form>
          )}

          {problem && (
            <p className="field-error license-problem" role="alert">
              {problem}
            </p>
          )}

          {ended ? (
            <RenewOptions plan={status.plan} seller={status.seller} />
          ) : (
            <p className="license-buy">
              No key yet?{" "}
              <button type="button" className="link-button" onClick={() => void openUrl(BUY_URL).catch(() => {})}>
                Get one
              </button>
            </p>
          )}
          {onClose && (
            <button type="button" className="link-button license-back" onClick={onClose}>
              Back to NexDB
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
