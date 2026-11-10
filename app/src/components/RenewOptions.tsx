import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BUY_URL, licensePlans, type BuyPlan } from "../lib/license";

const peso = (centavos: number) => `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

/** A plan's length in minutes, for comparing; lifetime is the longest. */
const minutesOf = (p: BuyPlan) => (p.lifetime ? Infinity : (p.minutes ?? (p.days ?? 0) * 1440));

/**
 * Renew the plan this license had (always listed first), or upgrade to a longer one. Each choice
 * opens the NexDB website to buy it; the new key is then typed in the app. A key from a reseller
 * is renewed through them.
 */
export function RenewOptions({ plan, seller, onNewKey }: { plan: string | null; seller: string | null; onNewKey?: () => void }) {
  const [plans, setPlans] = useState<BuyPlan[] | null>(null);
  const [buyUrl, setBuyUrl] = useState(BUY_URL);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    licensePlans(plan)
      .then((r) => {
        setPlans(r.plans);
        if (r.buy_url) setBuyUrl(r.buy_url);
      })
      .catch(() => setOffline(true));
  }, [plan]);

  const current = plans?.find((p) => p.current || p.name === plan);
  // The current plan first, then the rest from shortest to longest.
  const ordered = plans ? [...(current ? [current] : []), ...plans.filter((p) => p !== current)] : [];
  const buy = () => void openUrl(buyUrl).catch(() => {});

  return (
    <div className="renew-options">
      {seller && (
        <p className="renew-seller">
          You got this key from <strong>{seller}</strong>. Ask them for a new key, or buy one from NexDB below.
        </p>
      )}
      {offline && <p className="field-hint">Connect to the internet to see the plans and prices.</p>}
      {!plans && !offline && <p className="field-hint">Loading plans…</p>}
      {plans && !current && plan && (
        <div className="renew-plan is-current">
          <span>
            <strong>{plan}</strong>
            <span className="renew-tag">Your plan</span>
          </span>
          <button type="button" className="btn btn-small btn-primary" onClick={buy}>
            Renew
          </button>
        </div>
      )}
      {ordered.length > 0 && (
        <ul className="renew-list">
          {ordered.map((p) => {
            const isCurrent = p === current;
            const label = isCurrent ? "Renew" : current && minutesOf(p) > minutesOf(current) ? "Upgrade" : current ? "Switch" : "Choose";
            return (
              <li key={p.id} className={isCurrent ? "renew-plan is-current" : "renew-plan"}>
                <span>
                  <strong>{p.name}</strong>
                  {isCurrent && <span className="renew-tag">Your plan</span>}
                  <span className="renew-price">{peso(p.price)}</span>
                </span>
                <button type="button" className={label === "Switch" ? "btn btn-small" : "btn btn-small btn-primary"} onClick={buy}>
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {onNewKey && (
        <button type="button" className="link-button" onClick={onNewKey}>
          I have a new key
        </button>
      )}
    </div>
  );
}
