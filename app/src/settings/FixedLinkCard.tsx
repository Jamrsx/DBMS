import { useCallback, useEffect, useState } from "react";
import { fixedLinkInfo, pickNgrok, saveFixedLink, type FixedLinkInfo } from "../lib/share";

/**
 * A public link that stays the same, on the user's own free ngrok or Cloudflare account. NexDB
 * keeps the token on this PC and never shows it again; the link is turned on per project on its
 * Share tab.
 */
export function FixedLinkCard({ active }: { active: boolean }) {
  const [info, setInfo] = useState<FixedLinkInfo | null>(null);
  const [provider, setProvider] = useState<"ngrok" | "cloudflare">("ngrok");
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    fixedLinkInfo()
      .then((i) => {
        setInfo(i);
        if (i.provider) setProvider(i.provider);
        setAddress(i.address ?? "");
      })
      .catch((e) => setMessage({ ok: false, text: String(e) }));
  }, []);
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  async function save(remove = false) {
    setBusy(true);
    setMessage(null);
    try {
      await saveFixedLink(remove ? null : provider, address, token);
      setToken("");
      setEditing(false);
      setMessage({
        ok: true,
        text: remove
          ? "Removed. Public links change each time again."
          : "Saved. Turn it on from a project's Share tab.",
      });
      load();
    } catch (e) {
      setMessage({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!info) return null;
  const set = info.has_token && !editing;
  return (
    <section className="set-card" data-guide="fixed-link-card">
      <h2>Public links that stay the same</h2>
      <p className="set-lede">
        Normal public links get a new address every time. With your own free ngrok or Cloudflare account, a project can
        use one fixed address instead, like https://my-shop.ngrok-free.app.
      </p>

      {set ? (
        <div className="fixed-set">
          <p>
            Using <strong>{info.provider === "ngrok" ? "ngrok" : "Cloudflare"}</strong> at{" "}
            <code>https://{info.address}</code>. The token is saved on this PC only.
          </p>
          {info.provider === "ngrok" && !info.ngrok && (
            <p className="field-warn">
              NexDB can't find ngrok on this PC. Install it from ngrok.com, then{" "}
              <button className="link-btn" onClick={() => void pickNgrok().then(load)}>
                pick ngrok.exe
              </button>
              .
            </p>
          )}
          <div className="set-row-actions">
            <button className="btn btn-small" onClick={() => setEditing(true)}>
              Change…
            </button>
            <button className="btn btn-small btn-quiet" disabled={busy} onClick={() => void save(true)}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <form
          className="fixed-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset className="fixed-provider">
            <legend className="field-label">Your account</legend>
            <label className="check-row">
              <input type="radio" checked={provider === "ngrok"} onChange={() => setProvider("ngrok")} />
              <span>
                ngrok <span className="muted">(easiest: a free account comes with one fixed address)</span>
              </span>
            </label>
            <label className="check-row">
              <input type="radio" checked={provider === "cloudflare"} onChange={() => setProvider("cloudflare")} />
              <span>
                Cloudflare <span className="muted">(for an address on your own domain)</span>
              </span>
            </label>
          </fieldset>

          {provider === "ngrok" ? (
            <ol className="fixed-steps">
              <li>Sign up for free at ngrok.com and install ngrok.</li>
              <li>
                In dashboard.ngrok.com, copy <strong>Your Authtoken</strong>, and under <strong>Domains</strong> your
                free static domain.
              </li>
              <li>Paste both below.</li>
            </ol>
          ) : (
            <ol className="fixed-steps">
              <li>In the Cloudflare dashboard, open Zero Trust → Networks → Tunnels and create a tunnel.</li>
              <li>
                Add a public hostname (like dev.yourdomain.com) and point its service at{" "}
                <code>http://localhost:{info.port}</code>.
              </li>
              <li>Copy the tunnel's token and paste it below with the hostname.</li>
            </ol>
          )}

          <label className="field">
            <span className="field-label">{provider === "ngrok" ? "Your static domain" : "Your hostname"}</span>
            <input
              value={address}
              placeholder={provider === "ngrok" ? "my-app.ngrok-free.app" : "dev.yourdomain.com"}
              spellCheck={false}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{provider === "ngrok" ? "Authtoken" : "Tunnel token"}</span>
            <input
              type="password"
              value={token}
              autoComplete="off"
              placeholder={info.has_token && info.provider === provider ? "Leave empty to keep the saved one" : ""}
              onChange={(e) => setToken(e.target.value)}
            />
            <span className="field-hint">Saved on this PC only, and never shown again.</span>
          </label>
          <div className="set-row-actions">
            <button
              className="btn btn-primary btn-small"
              type="submit"
              disabled={busy || !address.trim()}
              data-working={busy || undefined}
            >
              Save
            </button>
            {editing && (
              <button className="btn btn-small" type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
      {message && (
        <p className={message.ok ? "set-ok" : "field-error"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
