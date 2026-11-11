import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { hasFeature, LICENSE_UPDATED, licenseStatus, type LicenseStatus } from "../lib/license";
import { RenewOptions } from "./RenewOptions";

/** Shown where a feature needs the 4-year plan (NexHost, public links). */
export const NEXHOST_LOCKED = "NexHost and public links come with plans that include NexHost, like the 4-year plan.";

/** Whether this license includes `name`; null while it is still being read. */
export function useFeature(name: string): boolean | null {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void licenseStatus()
        .then((s) => alive && setStatus(s))
        .catch(() => {});
    read();
    // A check-in with the website can bring new plan features (the owner ticked "Includes NexHost").
    window.addEventListener(LICENSE_UPDATED, read);
    return () => {
      alive = false;
      window.removeEventListener(LICENSE_UPDATED, read);
    };
  }, []);
  return status ? hasFeature(status, name) : null;
}

/** A locked feature: what it is, that it needs the 4-year plan, and a way to see that plan. */
export function PlanLock({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  useEffect(() => {
    licenseStatus().then(setStatus).catch(() => {});
  }, []);
  const plan = status && "plan" in status ? status.plan : null;
  const seller = status && "seller" in status ? (status.seller ?? null) : null;
  return (
    <div className="plan-lock" role="note">
      <p className="plan-lock-title">
        <Lock size={14} aria-hidden="true" /> {title}
      </p>
      <p>{text}</p>
      <p className="plan-lock-why">{NEXHOST_LOCKED}</p>
      {open ? (
        <RenewOptions plan={plan} seller={seller} />
      ) : (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          See the 4-year plan
        </button>
      )}
    </div>
  );
}
