import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Globe, Layers, LoaderCircle, MonitorSmartphone, ShieldCheck, Smartphone } from "lucide-react";
import type { DevApp } from "../lib/projects";
import { CopyButton } from "../components/CopyButton";
import { nexCelebrate } from "../lib/nex";
import { installVersion } from "../lib/versions";
import {
  allowFirewall,
  previewTunnelInstalled,
  shareInfo,
  startAppShare,
  startDevShare,
  startPublicLink,
  startShare,
  stopAppShare,
  stopDevShare,
  stopPublicLink,
  stopShare,
  type ShareInfo,
  type ShareKind,
} from "../lib/share";

/** Share a project with phones on the same Wi-Fi, and optionally with a public link. */
export function SharePanel({
  name,
  devApps,
  needsSite = false,
}: {
  name: string;
  devApps: DevApp[];
  /** The project folder has no page of its own and no site folder is chosen yet. */
  needsSite?: boolean;
}) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [devPort, setDevPort] = useState(String(devApps[0]?.port ?? 5173));
  // The whole-app form: folders, and whether the front end runs on its dev server or is built.
  const [front, setFront] = useState<string | null>(null);
  const [backend, setBackend] = useState<string | null>(null);
  const [appDev, setAppDev] = useState<boolean | null>(null);
  const [appPort, setAppPort] = useState<string | null>(null);
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

  // Reading the firewall and network takes a moment; say so instead of showing nothing.
  if (!info)
    return (
      <div className="details-section share">
        <h3>Share</h3>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="field-hint" role="status">
            <LoaderCircle size={13} className="status-spin" aria-hidden="true" /> Checking your network and firewall…
          </p>
        )}
      </div>
    );
  const shared = info.port !== null;
  // What can keep phones out: a stopped web server, a public network, the firewall.
  const notes = (
    <>
      {!info.web_running && (
        <p className="share-note" role="status">
          <AlertTriangle size={14} aria-hidden="true" /> The web server is stopped. Start it on the Dashboard and the
          link works.
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
            <ShieldCheck size={14} aria-hidden="true" /> Windows Firewall blocks phones until you allow them once. NexDB
            adds one rule for ports 8181 to 8199 on private networks only; Windows asks for your permission.
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
    </>
  );

  // A public link through Cloudflare, for the shared site, its dev server or its whole app.
  const publicLink = (kind: ShareKind, url: string | null, qr: string | null, ready: boolean) => {
    const what = kind === "dev" ? `${name}'s dev server` : name;
    return (
      <div className={kind ? "share-sub" : "share-public"}>
        <h4>
          <Globe size={14} aria-hidden="true" /> Public link
        </h4>
        {url ? (
          <div className="share-link">
            {qr && <div className="share-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} />}
            <div className="share-link-text">
              <div className="share-url">
                <code>{url}</code>
                <CopyButton text={url} label="the public link" />
              </div>
              <p className="share-note">
                <AlertTriangle size={14} aria-hidden="true" /> Anyone with this link can open {what}. Stop it when
                you're done; it also ends when NexDB closes.
              </p>
              <button
                className="btn btn-small"
                disabled={!!busy}
                onClick={() => void act("Stopping the public link…", () => stopPublicLink(name, kind))}
              >
                Stop public link
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="field-hint">
              Lets anyone open {what} from anywhere, for example to show a client. It goes through Cloudflare's free
              quick tunnels: no account, and the link changes each time.
            </p>
            {info.tunnel_installed ? (
              <button
                className="btn btn-small"
                disabled={!!busy || !ready}
                onClick={() => void act("Asking Cloudflare for a link…", () => startPublicLink(name, kind))}
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
    );
  };

  // Front end and Laravel backend on one link (projects like web + Backend).
  const parts = info.app_parts;
  const app = info.app;
  const frontDir = front ?? parts?.front ?? "";
  const backendDir = backend ?? parts?.backend ?? "";
  const built = parts && frontDir === parts.front ? parts.built : null;
  const useDev = appDev ?? !built;
  const port = appPort ?? String(parts?.dev_port ?? 5173);
  const wholeApp = (parts || app) && (
    <div className="share-public share-app">
      <h4>
        <Layers size={14} aria-hidden="true" /> Whole app on one link
      </h4>
      {app ? (
        <>
          {notes}
          {!app.front_ready && (
            <p className="share-note" role="status">
              <AlertTriangle size={14} aria-hidden="true" />{" "}
              {app.dev !== null
                ? `Nothing answers on port ${app.dev} yet. Start the front end's dev server in the Terminal (for Vite: npm run dev in ${app.front || name}).`
                : `The built front end is gone. Run npm run build in ${app.front || name}.`}
            </p>
          )}
          {app.url && (
            <div className="share-link">
              {app.qr && <div className="share-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: app.qr }} />}
              <div className="share-link-text">
                <p className="field-hint">
                  The front end in {app.front || name}
                  {app.dev !== null ? ` (dev server on port ${app.dev})` : " (built)"}, with its API from{" "}
                  {app.backend || name}:
                </p>
                <div className="share-url">
                  <code>{app.url}</code>
                  <CopyButton text={app.url} label="the app's address" />
                </div>
                <p className="field-hint">
                  In the front end, call the API at <code>/api</code> instead of a fixed address, so it works on this
                  link and the public one.
                </p>
              </div>
            </div>
          )}
          {publicLink("app", app.public_url, app.public_qr, info.web_running && app.front_ready)}
          <p className="field-hint">
            Signing in with Sanctum cookies? Add this address to SANCTUM_STATEFUL_DOMAINS in{" "}
            {app.backend ? `${app.backend}/.env` : ".env"}.
          </p>
          <button
            className="btn btn-small"
            disabled={!!busy}
            onClick={() => void act("Stopping; the web server restarts…", () => stopAppShare(name))}
          >
            Stop sharing the whole app
          </button>
        </>
      ) : (
        <>
          <p className="field-hint">
            One link for the front end and its Laravel backend: <code>/api</code>, <code>/sanctum</code> and{" "}
            <code>/storage</code> go to the backend, every other page to the front end.
          </p>
          <div className="share-app-form">
            <label className="field-hint" htmlFor={`app-front-${name}`}>
              Front end folder
            </label>
            <input
              id={`app-front-${name}`}
              className="input input-small"
              value={frontDir}
              placeholder="the project folder"
              onChange={(e) => setFront(e.target.value)}
            />
            <label className="field-hint" htmlFor={`app-backend-${name}`}>
              Laravel folder
            </label>
            <input
              id={`app-backend-${name}`}
              className="input input-small"
              value={backendDir}
              placeholder="the project folder"
              onChange={(e) => setBackend(e.target.value)}
            />
          </div>
          <fieldset className="share-app-mode">
            <legend className="field-hint">Front end</legend>
            <label>
              <input type="radio" checked={useDev} onChange={() => setAppDev(true)} /> Its dev server, with live reload,
              on port{" "}
              <input
                className="input input-small input-port"
                inputMode="numeric"
                aria-label="Front end dev server port"
                value={port}
                disabled={!useDev}
                onChange={(e) => setAppPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
              />
            </label>
            <label>
              <input type="radio" checked={!useDev} onChange={() => setAppDev(false)} /> Its built files
              {built ? ` (${built})` : `, after npm run build in ${frontDir || name}`}
            </label>
          </fieldset>
          <button
            className="btn"
            disabled={!!busy || !info.web_server || (useDev && !port)}
            onClick={() =>
              void act("Sharing the whole app; the web server restarts…", async () => {
                const next = await startAppShare(name, frontDir, backendDir, useDev ? Number(port) : null);
                nexCelebrate(`${name} is shared on one link.`);
                return next;
              })
            }
          >
            <Smartphone size={14} aria-hidden="true" /> Share the whole app
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="details-section share">
      <h3>Share</h3>
      {wholeApp}
      {needsSite && !parts && (
        <p className="share-note" role="note">
          <AlertTriangle size={14} aria-hidden="true" /> {name}'s address only lists its files until you pick its Site
          folder on the Overview tab.
          {devApps.length > 0 &&
            ` For its front end (${devApps[0].path || name}), start its dev server and share it below.`}
        </p>
      )}
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
          {!app && notes}

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

          {publicLink("", info.public_url, info.public_qr, info.web_running)}

          <button
            className="btn"
            disabled={!!busy}
            onClick={() => void act("Stopping sharing; the web server restarts…", () => stopShare(name))}
          >
            Stop sharing
          </button>
        </>
      )}
      <div className="share-public">
        <h4>
          <MonitorSmartphone size={14} aria-hidden="true" /> Dev server
        </h4>
        {info.dev ? (
          <>
            {!shared && !app && notes}
            {!info.dev.running && (
              <p className="share-note" role="status">
                <AlertTriangle size={14} aria-hidden="true" /> Nothing answers on port {info.dev.target} yet. Start the
                dev server in the Terminal (for Vite: npm run dev) and reload the page on your phone.
              </p>
            )}
            {info.dev.url && (
              <div className="share-link">
                {info.dev.qr && (
                  <div className="share-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: info.dev.qr }} />
                )}
                <div className="share-link-text">
                  <p className="field-hint">Your dev server on port {info.dev.target}, with live reload:</p>
                  <div className="share-url">
                    <code>{info.dev.url}</code>
                    <CopyButton text={info.dev.url} label="the dev server address" />
                  </div>
                  <p className="field-hint">
                    If the app calls an API at a fixed address, point it at{" "}
                    {info.lan_url ? <code>{info.lan_url}</code> : "the shared site address"} so the phone can reach it.
                  </p>
                </div>
              </div>
            )}
            {publicLink("dev", info.dev.public_url, info.dev.public_qr, info.web_running && info.dev.running)}
            <button
              className="btn btn-small"
              disabled={!!busy}
              onClick={() => void act("Stopping; the web server restarts…", () => stopDevShare(name))}
            >
              Stop sharing the dev server
            </button>
          </>
        ) : (
          <>
            <p className="field-hint">
              Open a running dev server (Vite, Next.js…) on your phone, with live reload. It doesn't need --host.
            </p>
            <div className="details-row">
              <label className="field-hint" htmlFor={`dev-port-${name}`}>
                Dev server port
              </label>
              <input
                id={`dev-port-${name}`}
                className="input input-small"
                inputMode="numeric"
                value={devPort}
                onChange={(e) => setDevPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
              />
              <button
                className="btn btn-small"
                disabled={!!busy || !info.web_server || !devPort}
                onClick={() =>
                  void act("Sharing the dev server; the web server restarts…", () =>
                    startDevShare(name, Number(devPort)),
                  )
                }
              >
                Share a dev server
              </button>
            </div>
            {devApps.length > 0 && (
              <p className="field-hint">
                Found{" "}
                {devApps.map((d) => `${d.label} in ${d.path || "the project folder"} (port ${d.port})`).join(", ")}.
              </p>
            )}
          </>
        )}
      </div>
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
