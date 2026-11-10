import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Globe, TriangleAlert } from "lucide-react";
import { CopyButton } from "../components/CopyButton";
import { inDesktopApp } from "../lib/scan";
import { fixedLinkInfo, type FixedLinkInfo } from "../lib/share";
import { goLive, goOffline, type Site } from "../lib/nexhost";

/** Put the site online through the user's own Cloudflare or ngrok account. */
export function GoLiveCard({ site, onSites }: { site: Site; onSites: (s: Site[]) => void }) {
  const [conn, setConn] = useState<FixedLinkInfo | null>(null);
  const [address, setAddress] = useState(site.address ?? "");
  const [ask, setAsk] = useState(false);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fixedLinkInfo()
      .then(setConn)
      .catch(() => setConn(null));
  }, []);

  const provider = conn?.provider ?? null;
  const domain = conn?.address ?? "";
  const url = site.address ? `https://${site.address}` : null;

  return (
    <section className="set-card" data-guide="nexhost-live">
      <h2>
        <Globe size={16} aria-hidden="true" /> Go live
      </h2>
      <p className={site.live ? "nh-state on" : "nh-state"} role="status">
        {site.live ? "Live: anyone with the link can open it." : "Offline: only this PC can open it."}
      </p>

      {site.live && url ? (
        <>
          <p className="nh-link">
            <code>{url}</code> <CopyButton text={url} label="Copy link" />{" "}
            <button className="btn btn-small" onClick={() => (inDesktopApp ? void openUrl(url) : window.open(url, "_blank"))}>
              Test it
            </button>
          </p>
          <button
            className="btn"
            onClick={() =>
              goOffline(site.name)
                .then((list) => {
                  onSites(list);
                  setMsg({ ok: true, text: `${site.name} is offline.` });
                })
                .catch((e) => setMsg({ ok: false, text: String(e) }))
            }
          >
            Go offline
          </button>
        </>
      ) : !provider ? (
        <p className="set-lede">
          First connect your own Cloudflare or ngrok account in Settings → Sharing (NexHost connection). With your own domain use
          Cloudflare; without one, ngrok's free address works.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setMsg({ ok: true, text: "Going live…" });
            goLive(site.name, provider === "cloudflare" ? address.trim() || null : null, ask ? password.trim() : null)
              .then((list) => {
                onSites(list);
                setMsg({ ok: true, text: `${site.name} is live.` });
              })
              .catch((err) => setMsg({ ok: false, text: String(err) }));
          }}
        >
          {provider === "cloudflare" ? (
            <>
              <label className="field">
                <span className="field-label">Address on your domain</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={`${site.name}.${domain}`} spellCheck={false} />
                <span className="field-hint">
                  In Cloudflare, this address (or *.{domain}) must point at http://localhost:8899 under your tunnel's public hostnames.
                </span>
              </label>
            </>
          ) : (
            <p className="set-lede">
              It uses your ngrok address <code>{domain}</code>. ngrok gives one free address, so another live site goes offline.
            </p>
          )}
          <label className="check-row">
            <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} /> Ask visitors for a password
          </label>
          {ask && (
            <label className="field">
              <span className="field-label">Password</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 4 characters" spellCheck={false} />
            </label>
          )}
          <p className="nh-buttons">
            <button className="btn btn-primary" disabled={ask && password.trim().length < 4}>
              Go live
            </button>
          </p>
        </form>
      )}

      <ul className="nh-notes">
        <li>
          <TriangleAlert size={13} aria-hidden="true" /> The site works only while this PC is on, awake and NexDB is open.
        </li>
        {provider === "ngrok" && (
          <li>
            <TriangleAlert size={13} aria-hidden="true" /> ngrok shows visitors a "You are about to visit" page once. Payment webhooks
            aren't affected.
          </li>
        )}
      </ul>
      {msg && (
        <p className={msg.ok ? "set-ok" : "field-error"} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}
