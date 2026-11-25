import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { startTrial } from "../lib/free";
import { BUY_URL, licensePlans, type BuyPlan, type LicenseStatus } from "../lib/license";

/** Already in Free: shown once, so the table only lists what the full NexDB adds. */
const IN_FREE = ["Start and stop Apache, PHP and MySQL", "Terminal", "phpMyAdmin", "PHP settings and extensions", "App updates"];

/** What changes with the full NexDB. "No" means Free doesn't have it. */
const ROWS: [string, string, string][] = [
  ["Add PHP and Node versions", "By hand", "One click"],
  ["Composer and Git", "By hand", "Installed for you"],
  ["Create projects", "By hand", "Templates"],
  ["Site address", "localhost/project", "project.test with HTTPS"],
  ["PHP version per project", "No", "Yes"],
  ["Database tools", "phpMyAdmin", "Manager and diagrams"],
  ["Project export, import and backups", "No", "Yes"],
  ["Mail catcher", "No", "Yes"],
  ["Start with Windows", "No", "Yes"],
  ["Web sharing and Cloudflare links", "No", "4-year plan"],
  ["NexHost", "No", "4-year plan"],
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

  const seePlans = () => void openUrl(BUY_URL).catch(() => window.open(BUY_URL, "_blank", "noopener"));

  return (
    <main className="free-main free-panel">
      <button type="button" className="link-button free-back" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" /> Back to NexDB
      </button>
      <div>
        <h1>Get the full NexDB</h1>
        <p className="free-sub">Your projects and databases stay exactly where they are.</p>
      </div>

      <section className="free-offer" aria-label="Ways to get the full NexDB">
        <div className="free-offer-text">
          <strong>{canTry ? "Try everything free for 14 days" : "Pick a plan that fits"}</strong>
          <span>
            {canTry ? "No card and no email. " : ""}
            {cheapest ? <>Plans from <strong>{pesos(cheapest.price)}</strong> for {cheapest.name}.</> : "See the plans on the NexDB website."}
          </span>
        </div>
        <div className="free-offer-actions">
          <button type="button" className="link-button" onClick={onKey}>
            I have a key
          </button>
          <button type="button" className={canTry ? "btn" : "btn btn-primary"} onClick={seePlans}>
            See plans
          </button>
          {canTry && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void tryIt()}>
              {busy ? "Starting…" : "Start 14-day free trial"}
            </button>
          )}
        </div>
      </section>
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}

      <div className="free-included">
        <span className="free-included-label">Already in Free:</span>
        <ul>
          {IN_FREE.map((item) => (
            <li key={item}>
              <Check size={13} strokeWidth={2.5} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="free-table-wrap">
        <table className="free-table">
          <thead>
            <tr>
              <th scope="col">What the full NexDB adds</th>
              <th scope="col">Free</th>
              <th scope="col">Full NexDB</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([feature, free, full]) => (
              <tr key={feature}>
                <th scope="row">{feature}</th>
                <td>
                  {free === "No" ? (
                    <span className="free-cell">
                      <Minus size={14} aria-hidden="true" />
                      Not in Free
                    </span>
                  ) : (
                    free
                  )}
                </td>
                <td>
                  <span className="free-cell is-full">
                    <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                    {full === "Yes" ? "Included" : full}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="free-card-detail">The 14-day trial has everything except NexHost and public links, which come with the 4-year plan.</p>
    </main>
  );
}
