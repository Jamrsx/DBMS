import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft } from "lucide-react";
import { startTrial } from "../lib/free";
import { BUY_URL, licensePlans, type BuyPlan, type LicenseStatus } from "../lib/license";

const ROWS: [string, string, string][] = [
  ["Start and stop Apache, PHP, MySQL", "Included", "Included"],
  ["Terminal, phpMyAdmin, app updates", "Included", "Included"],
  ["PHP settings and extensions", "Included", "Included"],
  ["Add PHP and Node versions", "By hand", "One click"],
  ["Create projects", "By hand", "Templates"],
  ["Site address", "localhost/project", "project.test"],
  ["Database tools", "phpMyAdmin", "Manager + diagrams"],
  ["Project export, import, backups", "Not included", "Included"],
  ["Mail catcher", "Not included", "Included"],
  ["Web sharing and Cloudflare links", "Not included", "4-year plan"],
  ["NexHost", "Not included", "4-year plan"],
];

const pesos = (centavos: number) => `₱${(centavos / 100).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

/** Free next to the full NexDB, with the ways to get it. */
export function WhatYouGet({ trialAvailable, onBack, onKey, onActive }: {
  trialAvailable: boolean;
  onBack: () => void;
  onKey: () => void;
  onActive: (status: LicenseStatus) => void;
}) {
  const [cheapest, setCheapest] = useState<BuyPlan | null>(null);
  const [canTry, setCanTry] = useState(trialAvailable);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    licensePlans(null)
      .then((r) => setCheapest([...r.plans].filter((p) => p.buyable !== false).sort((a, b) => a.price - b.price)[0] ?? null))
      .catch(() => {});
  }, []);

  async function tryIt() {
    setBusy(true);
    setProblem(null);
    try {
      const out = await startTrial();
      if (out.ok && out.status) {
        onActive(out.status);
        return;
      }
      if (out.code === "trial_used") setCanTry(false);
      setProblem(out.code === "offline" ? "Connect to the internet to start your trial." : (out.message ?? "The free trial couldn't be started."));
    } catch (e) {
      setProblem(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="free-main free-panel">
      <button type="button" className="link-button free-back" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" /> Back to NexDB
      </button>
      <h1>What you get with the full NexDB</h1>
      <p className="free-sub">Your projects and databases stay exactly where they are.</p>

      <div className="free-table-wrap">
        <table className="free-table">
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Free</th>
              <th scope="col">Full</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([feature, free, full]) => (
              <tr key={feature}>
                <th scope="row">{feature}</th>
                <td>{free}</td>
                <td>{full}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="free-card-detail">The trial does not include NexHost or public links.</p>
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}

      <div className="free-row free-buy">
        <span>{cheapest ? <>From <strong>{pesos(cheapest.price)}</strong> for {cheapest.name}</> : "See the plans on the NexDB website"}</span>
        <button type="button" className="btn" onClick={onKey}>
          I have a key
        </button>
        <button type="button" className={canTry ? "btn" : "btn btn-primary"} onClick={() => void openUrl(BUY_URL).catch(() => window.open(BUY_URL, "_blank", "noopener"))}>
          See plans
        </button>
        {canTry && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void tryIt()}>
            {busy ? "Starting…" : "Start 14-day free trial"}
          </button>
        )}
      </div>
    </main>
  );
}
