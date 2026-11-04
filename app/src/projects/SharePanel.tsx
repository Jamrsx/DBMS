import { useCallback, useEffect, useState, type ReactNode } from "react";
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

/** Which block an action belongs to, so its progress and errors show right beside it. */
type Block = "app" | "site" | "dev";
/** The row an action's button is in ("site:start", "app:public"…); its progress shows there. */
type Where = "notes" | `${Block}:${"start" | "stop" | "public"}`;

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
  const [busy, setBusy] = useState<{ where: Where; label: string } | null>(null);
  const [error, setError] = useState<{ where: Where; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    shareInfo(name)
      .then(setInfo)
      .catch((e) => setLoadError(String(e)));
  }, [name]);
  useEffect(load, [load]);

  async function act(where: Where, label: string, work: () => Promise<ShareInfo | void>) {
    if (busy) return;
    setBusy({ where, label });
    setError(null);
    try {
      const next = await work();
      if (next) setInfo(next);
      else load();
    } catch (e) {
      setError({ where, text: String(e) });
    } finally {
      setBusy(null);
    }
  }

  // Progress or the error of the last action, in the row of the button that started it.
  const status = (where: Where) => (
    <>
      {busy?.where === where && (
        <span className="row-status" role="status">
          <LoaderCircle size={13} className="status-spin" aria-hidden="true" /> {busy.label}
        </span>
      )}
      {error?.where === where && (
        <p className="field-error row-error" role="alert">
          {error.text}
        </p>
      )}
    </>
  );

  // Reading the firewall and network takes a moment; say so instead of showing nothing.
  if (!info)
    return (
      <div className="details-section share">
        <h3>Share</h3>
        {loadError ? (
          <p className="field-error" role="alert">
            {loadError}
          </p>
        ) : (
          <p className="field-hint" role="status">
            <LoaderCircle size={13} className="status-spin" aria-hidden="true" /> Checking your network and firewall…
          </p>
        )}
      </div>
    );

  const shared = info.port !== null;
  const app = info.app;
  const parts = info.app_parts;
  const anyShared = shared || !!info.dev || !!app;

  // What keeps phones out, said once at the top while something is shared.
  const problems = anyShared && (!info.web_running || info.network_private === false || !info.firewall_ready) && (
    <div className="share-problems">
      {!info.web_running && (
        <p className="share-note" role="status">
          <AlertTriangle size={14} aria-hidden="true" /> The web server is stopped. Start it on the Dashboard and the
          links work.
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
        <div className="share-firewall">
          <p>
            <ShieldCheck size={14} aria-hidden="true" /> Windows Firewall blocks phones until you allow them once. NexDB
            adds one rule for ports 8181 to 8199 on private networks only; Windows asks for your permission.
          </p>
          <div className="share-row">
            <button
              className="btn btn-small"
              disabled={!!busy}
              onClick={() => void act("notes", "Waiting for Windows…", () => allowFirewall())}
            >
              Allow phones on my network
            </button>
            {status("notes")}
          </div>
        </div>
      )}
    </div>
  );

  // One way of sharing: its title and state, then its form or its link.
  const block = (_where: Block, icon: ReactNode, title: string, on: boolean, body: ReactNode, extra?: ReactNode) => (
    <section className={`share-option${on ? " share-on" : ""}`} aria-label={title}>
      <header className="share-option-head">
        {icon}
        <h4>{title}</h4>
        {extra}
        {on && (
          <span className="status-pill status-ok">
            <span className="status-dot" aria-hidden="true" /> Shared
          </span>
        )}
      </header>
      {body}
    </section>
  );

  // The address with its QR code.
  const linkBox = (url: string, qr: string | null, label: string, lead: ReactNode, after?: ReactNode) => (
    <div className="share-link">
      {qr && <div className="share-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} />}
      <div className="share-link-text">
        <p className="field-hint">{lead}</p>
        <div className="share-url">
          <code>{url}</code>
          <CopyButton text={url} label={label} />
        </div>
        {after}
      </div>
    </div>
  );

  // A public link through Cloudflare, under the link it belongs to.
  const publicLink = (where: Block, kind: ShareKind, url: string | null, qr: string | null, ready: boolean) => {
    const what = kind === "dev" ? `${name}'s dev server` : name;
    return (
      <div className="share-sub">
        <h5>
          <Globe size={13} aria-hidden="true" /> Public link
        </h5>
        {url ? (
          linkBox(
            url,
            qr,
            "the public link",
            "Anyone with this link can open it, from anywhere:",
            <>
              <p className="share-note">
                <AlertTriangle size={14} aria-hidden="true" /> Anyone with this link can open {what}. It ends when you
                stop it or close NexDB.
              </p>
              <div className="share-row">
                <button
                  className="btn btn-small"
                  disabled={!!busy}
                  onClick={() =>
                    void act(`${where}:public`, "Stopping the public link…", () => stopPublicLink(name, kind))
                  }
                >
                  Stop public link
                </button>
                {status(`${where}:public`)}
              </div>
            </>,
          )
        ) : (
          <div className="share-inline">
            <p className="field-hint">
              Open {what} from anywhere, for example to show a client. Through Cloudflare's free quick tunnels: no
              account, and the link changes each time.
            </p>
            {info.tunnel_installed ? (
              <button
                className="btn btn-small"
                disabled={!!busy || !ready}
                onClick={() =>
                  void act(`${where}:public`, "Asking Cloudflare for a link…", () => startPublicLink(name, kind))
                }
              >
                Create public link
              </button>
            ) : (
              info.tunnel_version && (
                <button
                  className="btn btn-small"
                  disabled={!!busy}
                  onClick={() =>
                    void act(`${where}:public`, "Downloading Cloudflare's tunnel…", async () => {
                      await installVersion("cloudflared", info.tunnel_version!, (p) =>
                        setBusy({
                          where: `${where}:public`,
                          label: `Downloading Cloudflare's tunnel… ${p === null ? "" : `${p}%`}`,
                        }),
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
            {status(`${where}:public`)}
          </div>
        )}
      </div>
    );
  };

  const stopButton = (where: Block, label: string, work: () => Promise<ShareInfo>) => (
    <div className="share-foot">
      <button
        className="btn btn-small btn-quiet"
        disabled={!!busy}
        onClick={() => void act(`${where}:stop`, "Stopping; the web server restarts…", work)}
      >
        {label}
      </button>
      {status(`${where}:stop`)}
    </div>
  );

  // Front end and Laravel backend on one link (projects like web + Backend).
  const frontDir = front ?? parts?.front ?? "";
  const backendDir = backend ?? parts?.backend ?? "";
  const built = parts && frontDir === parts.front ? parts.built : null;
  const useDev = appDev ?? !built;
  const port = appPort ?? String(parts?.dev_port ?? 5173);
  const wholeApp =
    (parts || app) &&
    block(
      "app",
      <Layers size={15} aria-hidden="true" />,
      "Whole app on one link",
      !!app,
      app ? (
        <>
          {!app.front_ready && (
            <p className="share-note" role="status">
              <AlertTriangle size={14} aria-hidden="true" />{" "}
              {app.dev !== null
                ? `Nothing answers on port ${app.dev} yet. Start the front end's dev server in the Terminal (for Vite: npm run dev in ${app.front || name}).`
                : `The built front end is gone. Run npm run build in ${app.front || name}.`}
            </p>
          )}
          {app.url &&
            linkBox(
              app.url,
              app.qr,
              "the app's address",
              <>
                The front end in {app.front || name}
                {app.dev !== null ? ` (dev server on port ${app.dev})` : " (built)"}, with its API from{" "}
                {app.backend || name}. Scan it with your phone's camera:
              </>,
              <p className="field-hint">
                In the front end, call the API at <code>/api</code> instead of a fixed address, so it works on every
                link. Signing in with Sanctum cookies? Add this address to SANCTUM_STATEFUL_DOMAINS in{" "}
                {app.backend ? `${app.backend}/.env` : ".env"}.
              </p>,
            )}
          {publicLink("app", "app", app.public_url, app.public_qr, info.web_running && app.front_ready)}
          {stopButton("app", "Stop sharing the whole app", () => stopAppShare(name))}
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
          <div className="share-foot">
            <button
              className="btn btn-primary"
              disabled={!!busy || !info.web_server || (useDev && !port)}
              onClick={() =>
                void act("app:start", "Sharing the whole app; the web server restarts…", async () => {
                  const next = await startAppShare(name, frontDir, backendDir, useDev ? Number(port) : null);
                  nexCelebrate(`${name} is shared on one link.`);
                  return next;
                })
              }
            >
              <Smartphone size={14} aria-hidden="true" /> Share the whole app
            </button>
            {status("app:start")}
          </div>
        </>
      ),
      !app && parts ? <span className="tag tag-recommended">Recommended</span> : undefined,
    );

  const site = block(
    "site",
    <Smartphone size={15} aria-hidden="true" />,
    parts ? "Website only" : "On my Wi-Fi",
    shared,
    shared ? (
      <>
        {info.lan_url ? (
          linkBox(
            info.lan_url,
            info.lan_qr,
            "the address",
            "Scan the code with your phone's camera, or type this address:",
            <p className="field-hint">
              Links that point to {name}.test won't open on the phone. Laravel and most apps use the address you opened,
              so they work.
            </p>,
          )
        ) : (
          <p className="field-error">This PC isn't connected to a network, so there's no address to share yet.</p>
        )}
        {publicLink("site", "", info.public_url, info.public_qr, info.web_running)}
        {stopButton("site", "Stop sharing", () => stopShare(name))}
      </>
    ) : (
      <>
        {needsSite && !parts && (
          <p className="share-note" role="note">
            <AlertTriangle size={14} aria-hidden="true" /> {name}'s address only lists its files until you pick its Site
            folder on the Overview tab.
          </p>
        )}
        <div className="share-inline">
          <p className="field-hint">
            {parts
              ? `Only the website folder of ${name}, on its own address, for phones on the same Wi-Fi.`
              : `Open ${name} on your phone or tablet. They need to be on the same Wi-Fi as this PC; only this project is shared, on its own address.`}
          </p>
          <button
            className="btn btn-small"
            disabled={!!busy || !info.web_server}
            onClick={() =>
              void act("site:start", "Sharing; the web server restarts…", async () => {
                const next = await startShare(name);
                nexCelebrate(`${name} is shared on your network.`);
                return next;
              })
            }
          >
            Share on my Wi-Fi
          </button>
          {status("site:start")}
        </div>
        {!info.web_server && (
          <p className="field-hint">Sharing needs a web server. Install Apache or nginx on the Versions page.</p>
        )}
      </>
    ),
  );

  const dev = block(
    "dev",
    <MonitorSmartphone size={15} aria-hidden="true" />,
    parts ? "Dev server only" : "Dev server",
    !!info.dev,
    info.dev ? (
      <>
        {!info.dev.running && (
          <p className="share-note" role="status">
            <AlertTriangle size={14} aria-hidden="true" /> Nothing answers on port {info.dev.target} yet. Start the dev
            server in the Terminal (for Vite: npm run dev) and reload the page on your phone.
          </p>
        )}
        {info.dev.url &&
          linkBox(
            info.dev.url,
            info.dev.qr,
            "the dev server address",
            `Your dev server on port ${info.dev.target}, with live reload:`,
            <p className="field-hint">
              If the app calls an API at a fixed address, point it at{" "}
              {info.lan_url ? <code>{info.lan_url}</code> : "the shared site address"} so the phone can reach it.
            </p>,
          )}
        {publicLink("dev", "dev", info.dev.public_url, info.dev.public_qr, info.web_running && info.dev.running)}
        {stopButton("dev", "Stop sharing the dev server", () => stopDevShare(name))}
      </>
    ) : (
      <>
        <p className="field-hint">
          Open a running dev server (Vite, Next.js…) on your phone, with live reload. It doesn't need --host.
          {devApps.length > 0 &&
            ` Found ${devApps.map((d) => `${d.label} in ${d.path || "the project folder"} (port ${d.port})`).join(", ")}.`}
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
              void act("dev:start", "Sharing the dev server; the web server restarts…", () =>
                startDevShare(name, Number(devPort)),
              )
            }
          >
            Share a dev server
          </button>
          {status("dev:start")}
        </div>
      </>
    ),
  );

  // With a whole app found, the other two are extras: folded away unless one is in use.
  const othersOpen = shared || !!info.dev;
  return (
    <div className="details-section share">
      <h3>Share</h3>
      {problems}
      {parts || app ? (
        <>
          {wholeApp}
          <details className="share-more" open={othersOpen || undefined}>
            <summary>Other ways to share: the website or the dev server alone</summary>
            <div className="share-more-body">
              {site}
              {dev}
            </div>
          </details>
        </>
      ) : (
        <>
          {site}
          {dev}
        </>
      )}
    </div>
  );
}
