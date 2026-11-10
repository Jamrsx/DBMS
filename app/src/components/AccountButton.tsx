import { useEffect, useRef, useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { licenseStatus, unlinkLicense, type LicenseStatus } from "../lib/license";
import { isPractice } from "../lib/practice";
import { nexCelebrate } from "../lib/nex";

/** "Althian Baron" → "AB"; an email or nothing → its first letter or "N". */
function initials(name: string | null, email: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length) return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
  return (email?.[0] ?? "N").toUpperCase();
}

/**
 * Who is signed in on this PC, at the foot of the sidebar. Opens a small menu: the license
 * details in Settings, or Sign out (frees this PC so the account can sign in on another one).
 */
export function AccountButton({ onOpenLicense }: { onOpenLicense: () => void }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    licenseStatus().then(setStatus).catch(() => {});
  }, [open]);

  // Closes on Escape or a click outside, like any menu.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const click = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", click);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      setError(null);
    }
  }, [open]);

  if (!status || (status.state !== "active" && status.state !== "grace")) return null;
  const name = status.name ?? null;
  const email = status.email ?? null;
  const plan = status.plan;
  const ended = status.state === "grace";

  async function signOut() {
    setBusy(true);
    setError(null);
    const out = await unlinkLicense().catch(() => null);
    setBusy(false);
    if (!out?.ok) {
      setError(
        out?.code === "offline"
          ? "No connection to the NexDB server. Connect to the internet, then sign out."
          : (out?.message ?? "NexDB couldn't sign you out. Try again in a moment."),
      );
      return;
    }
    if (isPractice()) {
      setOpen(false);
      nexCelebrate("In real life, NexDB would now ask you to sign in or type a key on this PC.");
      return;
    }
    // This PC has no license now: back to the sign-in screen.
    window.location.reload();
  }

  return (
    <div className="account" ref={box}>
      {open && (
        <div className="account-pop" role="dialog" aria-label="Your NexDB account" style={at ? { left: at.left, bottom: at.bottom } : undefined}>
          <div className="account-who">
            <span className="account-avatar" aria-hidden="true">
              {initials(name, email)}
            </span>
            <div>
              <strong>{name ?? "Your NexDB account"}</strong>
              {email && <span className="field-hint">{email}</span>}
              <span className={ended ? "account-plan is-ended" : "account-plan"}>
                {plan ?? "NexDB"}
                {ended ? " · ended" : ""}
              </span>
            </div>
          </div>
          {confirming ? (
            <div className="account-confirm">
              <p>
                Sign out of this PC? Your projects and databases stay here. To use NexDB again, sign in with your email and password, here or
                on another PC.
              </p>
              <div className="account-actions">
                <button type="button" className="btn btn-small" onClick={() => setConfirming(false)} disabled={busy}>
                  Stay signed in
                </button>
                <button type="button" className="btn btn-small btn-danger" onClick={() => void signOut()} disabled={busy}>
                  {busy ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          ) : (
            <div className="account-menu">
              <button
                type="button"
                className="account-item"
                onClick={() => {
                  setOpen(false);
                  onOpenLicense();
                }}
              >
                <KeyRound size={15} aria-hidden="true" /> License details
              </button>
              <button type="button" className="account-item is-danger" onClick={() => setConfirming(true)}>
                <LogOut size={15} aria-hidden="true" /> Sign out
              </button>
            </div>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        className="account-button"
        aria-expanded={open}
        title={name ?? email ?? "Your NexDB account"}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAt({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
          setOpen((v) => !v);
        }}
      >
        <span className="account-avatar" aria-hidden="true">
          {initials(name, email)}
        </span>
        <span className="nav-label account-name">{name ?? email ?? "Account"}</span>
      </button>
    </div>
  );
}
