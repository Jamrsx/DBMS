import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Database, FolderUp, Globe, KeyRound, Link2, Lock, ServerCog, ShieldCheck, Sparkles } from "lucide-react";
import { licensePlans } from "../lib/license";
import { inDesktopApp } from "../lib/scan";
import { showSettingsSection } from "../lib/settingsNav";

const BENEFITS = [
  { Icon: Globe, title: "Show clients a real link", text: "Send a link that opens your site from anywhere, while it still lives on your PC. No uploading every change." },
  { Icon: ShieldCheck, title: "Real https", text: "PayMongo webhooks, Google sign-in and phone testing need https. Every NexHost site has it." },
  { Icon: Link2, title: "Your own domain", text: "Use test.yourshop.com with your Cloudflare account, or a free fixed ngrok address when you have no domain." },
  { Icon: FolderUp, title: "Drag-and-drop files", text: "A file manager like a hosting panel: drop files, folders or a .zip straight from Explorer." },
  { Icon: Database, title: "One-click database", text: "Each site gets its own MySQL database and user, with phpMyAdmin a click away." },
  { Icon: ServerCog, title: "No hosting bill", text: "Your PC does the work. Test for months before you pay for real hosting, then move the finished site." },
] as const;

const STEPS = ["Make a site and drop your files in", "Create its database in one click", "Press Go live and share the link"] as const;

/** NexHost when the license doesn't include it: what it is, why it's worth it, and how to get it. */
export function NexHostUpsell() {
  const [price, setPrice] = useState<number | null>(null);
  const [buyUrl, setBuyUrl] = useState<string | null>(null);

  useEffect(() => {
    licensePlans(null)
      .then((r) => {
        const plan = r.plans.find((p) => (p as { features?: string[] }).features?.includes("nexhost")) ?? r.plans.find((p) => p.days === 1460);
        if (plan) setPrice(plan.price);
        if (r.buy_url) setBuyUrl(r.buy_url);
      })
      .catch(() => {});
  }, []);

  const pesos = price ?? 490000;
  const perMonth = pesos / 100 / 48;

  return (
    <div className="nh-up" data-guide="nexhost-upsell">
      <section className="nh-up-hero">
        <span className="nh-up-badge">
          <Sparkles size={13} aria-hidden="true" /> 4-year plan
        </span>
        <h2>Your PC, your web host.</h2>
        <p>
          NexHost turns this PC into a small hosting panel for testing. Put a project online with a real https link, give it a database, and
          show it to a client before you ever pay for hosting.
        </p>
        <div className="nh-up-actions">
          <button className="btn btn-primary" onClick={() => buyUrl && (inDesktopApp ? void openUrl(buyUrl) : window.open(buyUrl, "_blank"))} disabled={!buyUrl}>
            Get the 4-year plan
          </button>
          <button
            className="btn"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("nexdb:open-page", { detail: "settings" }));
              showSettingsSection("license");
            }}
          >
            <KeyRound size={14} aria-hidden="true" /> I have a key
          </button>
        </div>
        <p className="nh-up-price">
          <strong>₱{(pesos / 100).toLocaleString("en-PH")}</strong> for 4 years · less than ₱{Math.ceil(perMonth)} a month · everything in NexDB, plus NexHost
        </p>
      </section>

      <section className="nh-up-grid" aria-label="What you get">
        {BENEFITS.map(({ Icon, title, text }) => (
          <article key={title} className="nh-up-card">
            <span className="nh-up-icon">
              <Icon size={18} aria-hidden="true" />
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className="nh-up-steps" aria-label="How it works">
        <h3>How it works</h3>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s}>
              <span>{i + 1}</span> {s}
            </li>
          ))}
        </ol>
        <p className="nh-up-note">
          <Lock size={13} aria-hidden="true" /> Your database and NexDB's tools never go online; only the site does, and only while this PC is on.
        </p>
      </section>
    </div>
  );
}
