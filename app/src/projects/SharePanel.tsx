import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Globe, ShieldCheck, Smartphone } from "lucide-react";
import { CopyButton } from "../components/CopyButton";
import { nexCelebrate } from "../lib/nex";
import { installVersion } from "../lib/versions";
import {
  allowFirewall,
  previewTunnelInstalled,
  shareInfo,
  startPublicLink,
  startShare,
  stopPublicLink,
  stopShare,
  type ShareInfo,
} from "../lib/share";

/** Share a project with phones on the same Wi-Fi, and optionally with a public link. */
export function SharePanel({ name }: { name: string }) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    shareInfo(name)
      .then(setInfo)
      .catch((e) => setError(String(e)));
  }, [name]);
  useEffect(load, [load]);

  async function act(label: string, work: () => Promise<ShareInfo | void>) {
    if (busy) return;
    setBusy(label);
    setError(null);
    try {
      const next = await work();
      if (next) setInfo(next);
      else load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!info) return null;
  const shared = info.port !== null;

  return (
    <div className="details-section share">
      <h3>Share</h3>
      {!shared ? (
        <>
          <p className="field-hint">
            Open {name} on your phone or tablet. They need to be on the same Wi-Fi as this PC. Only this project is
            shared, on its own address.
          </p>
          <button
            className="btn"
            disabled={!!busy || !info.web_server}
            onClick={() =>
              void act("Sharing; the web server restarts…", async () => {
                const next = await startShare(name);
                nexCelebrate(`${name} is shared on your network.`);
                return next;
              })
            }
          >
            <Smartphone size={14} aria-hidden="true" /> Share on my Wi-Fi
          </button>
          {!info.web_server && (
            <p className="field-hint">Sharing needs a web server. Install Apache or nginx on the Versions page.</p>
          )}
        </>
      ) : (
        <>
          {!info.web_running && (
            <p className="share-note" role="status">
              <AlertTriangle size={14} aria-hidden="true" /> The web server is stopped. Start it on the Dashboard and
              the link works.
            </p>
          )}
          {info.network_private === false && (
            <p className="share-note" role="status">
              <AlertTriangle size={14} aria-hidden="true" /> Windows treats this Wi-Fi as a public network, so it keeps
              phones out. If this is your home or office Wi-Fi, set it to Private in Windows Settings → Network &amp;
              internet → Wi-Fi → your network.
            </p>
          )}
          {!info.firewall_ready && (
            <div className="share-note share-firewall">
              <p>
                <ShieldCheck size={14} aria-hidden="true" /> Windows Firewall blocks phones until you allow them once.
                NexDB adds one rule for ports 8181 to 8199 on private networks only; Windows asks for your permission.
              </p>
              <button
                className="btn btn-small"
                disabled={!!busy}
                onClick={() => void act("Waiting for Windows…", () => allowFirewall())}
              >
                Allow phones on my network
              </button>
            </div>
          )}

          {info.lan_url ? (
            <div className="share-link">
              {info.lan_qr && (
                <div className="share-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: info.lan_qr }} />
              )}
              <div className="share-link-text">
                <p className="field-hint">Scan the code with your phone's camera, or type this address:</p>
                <div className="share-url">
                  <code>{info.lan_url}</code>
                  <CopyButton text={info.lan_url} label="the address" />
                </div>
                <p className="field-hint">
                  Links that point to {name}.test won't open on the phone. Laravel and most apps use the address you
                  opened, so they work.
                </p>
              </div>
            </div>
          ) : (
            <p className="field-error">This PC isn't connected to a network, so there's no address to share yet.</p>
          )}

          <div className="share-public">
            <h4>
              <Globe size={14} aria-hidden="true" /> Public link
            </h4>
            {info.public_url ? (
              <div className="share-link">
                {info.public_qr && (
                  <div className="share-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: info.public_qr }} />
                )}
                <div className="share-link-text">
                  <div className="share-url">
                    <code>{info.public_url}</code>
                    <CopyButton text={info.public_url} label="the public link" />
                  </div>
                  <p className="share-note">
                    <AlertTriangle size={14} aria-hidden="true" /> Anyone with this link can open {name}. Stop it when
                    you're done; it also ends when NexDB closes.
                  </p>
                  <button
                    className="btn btn-small"
                    disabled={!!busy}
                    onClick={() => void act("Stopping the public link…", () => stopPublicLink(name))}
                  >
                    Stop public link
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="field-hint">
                  Lets anyone open {name} from anywhere, for example to show a client. It goes through Cloudflare's free
                  quick tunnels: no account, and the link changes each time.
                </p>
                {info.tunnel_installed ? (
                  <button
                    className="btn btn-small"
                    disabled={!!busy || !info.web_running}
                    onClick={() => void act("Asking Cloudflare for a link…", () => startPublicLink(name))}
                  >
                    Create public link
                  </button>
                ) : (
                  info.tunnel_version && (
                    <button
                      className="btn btn-small"
                      disabled={!!busy}
                      onClick={() =>
                        void act("Downloading Cloudflare's tunnel…", async () => {
                          await installVersion("cloudflared", info.tunnel_version!, (p) =>
                            setBusy(`Downloading Cloudflare's tunnel… ${p ?? ""}${p === null ? "" : "%"}`),
                          );
                          previewTunnelInstalled(name);
                        })
                      }
                    >
                      Download public links
                      {info.tunnel_size ? ` (${Math.round(info.tunnel_size / 2 ** 20)} MB)` : ""}
                    </button>
                  )
                )}
              </>
            )}
          </div>

          <button
            className="btn"
            disabled={!!busy}
            onClick={() => void act("Stopping sharing; the web server restarts…", () => stopShare(name))}
          >
            Stop sharing
          </button>
        </>
      )}
      {busy && (
        <p className="field-hint" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
