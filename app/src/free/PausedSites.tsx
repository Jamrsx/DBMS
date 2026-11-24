import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { pausedSites, useLocalhost, type PausedSite } from "../lib/free";

/** Shown only to someone whose `.test` sites paused when their license or trial ended. */
export function PausedSites() {
  const [sites, setSites] = useState<PausedSite[]>([]);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => void pausedSites().then(setSites).catch(() => {});
  useEffect(load, []);

  if (sites.length === 0) return null;

  async function change(name: string) {
    setBusy(true);
    setResult(null);
    try {
      await useLocalhost(name);
      setResult({ ok: true, text: `${name} now uses its localhost address.` });
      setConfirming(null);
      load();
    } catch (e) {
      setResult({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="free-paused">
      <div className="free-row">
        <p>
          <strong>{sites.length === 1 ? "1 site is paused." : `${sites.length} sites are paused.`}</strong> Nothing was deleted.
        </p>
        <button type="button" className="btn btn-small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <ul className="free-version-list">
          {sites.map((s) => (
            <li key={s.name}>
              <span>{s.host}</span>
              {confirming === s.name ? (
                <span className="free-confirm">
                  <span>This changes APP_URL in its .env. NexDB restores it after you upgrade.</span>
                  <button type="button" className="btn btn-small" disabled={busy} onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void change(s.name)}>
                    Change it
                  </button>
                </span>
              ) : (
                <span className="free-confirm">
                  {s.can_use_localhost && (
                    <button type="button" className="btn btn-small" onClick={() => setConfirming(s.name)}>
                      Use localhost
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => void openUrl(s.local_url).catch(() => window.open(s.local_url, "_blank", "noopener"))}
                  >
                    Open at localhost
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {result && (
        <p className={result.ok ? "set-ok" : "field-error"} role={result.ok ? "status" : "alert"}>
          {result.text}
        </p>
      )}
    </section>
  );
}
