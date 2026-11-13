import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Network, ShieldCheck } from "lucide-react";
import { CopyButton } from "../components/CopyButton";
import { TutorialVideo } from "../components/TutorialVideo";
import { allowNexhostTailscale, nexhostTailscale, setSiteTailscale, type Site } from "../lib/nexhost";
import { TAILSCALE_DOWNLOAD, TAILSCALE_MACHINES, TAILSCALE_USERS, type TailscaleInfo } from "../lib/share";
import { isPractice } from "../lib/practice";
import { realDesktopApp } from "../lib/scan";

/*
 * Tailscale for a NexHost site: on top of (or instead of) its ngrok or Cloudflare link, devices
 * in the user's own Tailscale network open it at this PC's Tailscale address. Nobody else can.
 * The Overview has the switch (TailscaleRow); the Sharing tab has the setup (TailscaleCard).
 */

type Msg = { ok: boolean; text: string } | null;

/** Tailscale's state for NexHost, the site's links on it, and the actions both views share. */
function useTailscale(site: Site, onSites: (s: Site[]) => void) {
  const [ts, setTs] = useState<TailscaleInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(() => {
    nexhostTailscale()
      .then(setTs)
      .catch((e) => setMsg({ ok: false, text: String(e) }));
  }, []);
  useEffect(load, [load]);

  const run = (label: string, work: () => Promise<unknown>, done: string) => {
    setBusy(label);
    setMsg(null);
    work()
      .then(() => setMsg({ ok: true, text: done }))
      .catch((e) => setMsg({ ok: false, text: String(e) }))
      .finally(() => {
        setBusy(null);
        load();
      });
  };

  const running = ts?.state === "running" && !!ts.ip;
  const on = site.tailscale && running;
  const links = on ? [ts!.dns_name, ts!.ip].filter((h): h is string => !!h).map((h) => `http://${h}:${site.port}/`) : [];

  const toggle = () =>
    run(
      site.tailscale ? "Closing it to Tailscale…" : "Opening it to Tailscale…",
      () => setSiteTailscale(site.name, !site.tailscale).then(onSites),
      site.tailscale ? `${site.name} is closed to Tailscale.` : `${site.name} is open to your Tailscale network.`,
    );
  const allow = () => run("Waiting for Windows…", allowNexhostTailscale, "Your Tailscale devices can open it now.");
  // Tailscale's pages open in the browser; practice only says where they'd go.
  const openTs = (url: string) => {
    if (isPractice() || !realDesktopApp) setMsg({ ok: true, text: `Practice: this opens ${url} in your browser.` });
    else void openUrl(url);
  };

  return { ts, busy, msg, load, running, on, links, toggle, allow, openTs };
}

function Status({ msg }: { msg: Msg }) {
  return msg ? (
    <span className={msg.ok ? "set-ok" : "field-error"} role="status">
      {msg.text}
    </span>
  ) : null;
}

/** The firewall step, shown only while Tailscale is on for the site and Windows still blocks it. */
function FirewallStep({ busy, allow }: { busy: string | null; allow: () => void }) {
  return (
    <span className="nh-access-warn" data-guide="nexhost-tailscale-firewall">
      <span className="field-hint">
        <ShieldCheck size={13} aria-hidden="true" /> Windows Firewall keeps your Tailscale devices out until you allow
        them once. NexDB adds one rule for NexHost's ports (8201 to 8219) that lets in only Tailscale addresses
        (100.64.0.0/10); Windows asks for your permission.
      </span>
      <button className="btn btn-small" disabled={!!busy} onClick={allow}>
        Allow my Tailscale devices
      </button>
    </span>
  );
}

/** Overview row: one switch, the links, and the firewall step when needed. Setup lives in Sharing. */
export function TailscaleRow({
  site,
  onSites,
  open,
  onSetup,
}: {
  site: Site;
  onSites: (s: Site[]) => void;
  open: (url: string) => void;
  onSetup: () => void;
}) {
  const t = useTailscale(site, onSites);
  return (
    <div className={t.on ? "nh-access-row on" : "nh-access-row"} data-guide="nexhost-tailscale">
      <span className="nh-live-icon" aria-hidden="true">
        <Network size={18} />
      </span>
      <div className="nh-live-text">
        <strong>{t.busy ?? (t.on ? "Your Tailscale network" : "Tailscale: off")}</strong>
        {t.ts === null ? (
          <span className="field-hint">Checking Tailscale…</span>
        ) : !t.running ? (
          <span className="field-hint">
            {t.ts.state === "missing" ? "Tailscale isn't on this PC yet." : "Tailscale isn't connected on this PC."}{" "}
            <button className="btn-link" onClick={onSetup}>
              Set it up in Sharing
            </button>
          </span>
        ) : t.on ? (
          t.links.map((u) => (
            <span className="nh-live-url" key={u} data-guide="nexhost-tailscale-link">
              <code>{u}</code>
              <CopyButton text={u} label="Copy link" />
              <button className="btn btn-small btn-quiet" onClick={() => open(u)}>
                <ExternalLink size={13} aria-hidden="true" /> Open
              </button>
            </span>
          ))
        ) : (
          <span className="field-hint">Turn it on so devices in your Tailscale network can open it from anywhere.</span>
        )}
        {t.on && !t.ts!.firewall_ready && <FirewallStep busy={t.busy} allow={t.allow} />}
        <Status msg={t.msg} />
      </div>
      <div className="nh-live-control">
        <button
          type="button"
          role="switch"
          aria-checked={site.tailscale}
          aria-label="Open to my Tailscale network"
          className={site.tailscale ? "nh-switch on" : "nh-switch"}
          disabled={!!t.busy || (!t.running && !site.tailscale)}
          title={t.running ? undefined : "Connect Tailscale on this PC first"}
          onClick={t.toggle}
        >
          <span className="nh-switch-knob" />
        </button>
      </div>
    </div>
  );
}

/** Sharing tab: setting up Tailscale, letting people in, and what it costs. */
export function TailscaleCard({ site, onSites }: { site: Site; onSites: (s: Site[]) => void }) {
  const t = useTailscale(site, onSites);
  const ts = t.ts;
  return (
    <section className="set-card" data-guide="nexhost-tailscale-setup">
      <h2>
        <Network size={16} aria-hidden="true" /> Tailscale: private, from anywhere
      </h2>
      <p className="set-lede">
        Devices in your own Tailscale network open {site.name} from anywhere; nobody else can. It works on its own or
        next to the public link. NexDB doesn't install Tailscale or sign in for you.
      </p>
      <div className="nh-buttons">
        <TutorialVideo video="tailscale" />
      </div>
      {ts === null ? (
        <p className="field-hint">Checking Tailscale…</p>
      ) : ts.state === "missing" ? (
        <>
          <p className="nh-state">Not on this PC yet. Install Tailscale and sign in, then check again.</p>
          <div className="nh-buttons">
            <button className="btn" onClick={() => t.openTs(TAILSCALE_DOWNLOAD)}>
              Get Tailscale
            </button>
            <button className="btn btn-quiet" onClick={t.load}>
              Check again
            </button>
          </div>
        </>
      ) : !t.running ? (
        <>
          <p className="nh-state">Installed but not connected. Open Tailscale from the taskbar, sign in and turn it on.</p>
          <div className="nh-buttons">
            <button className="btn btn-quiet" onClick={t.load}>
              Check again
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={t.on ? "nh-state on" : "nh-state"} role="status">
            This PC is <code>{ts.dns_name ?? ts.ip}</code>
            {ts.user ? ` in ${ts.user}'s network` : ""}.{" "}
            {t.on ? `${site.name} is open to it.` : `${site.name} is closed to it: turn it on from the Overview or here.`}
          </p>
          <div className="nh-buttons">
            <button className="btn" disabled={!!t.busy} onClick={t.toggle}>
              {site.tailscale ? "Close it to Tailscale" : "Open it to Tailscale"}
            </button>
          </div>
          {t.on && !ts.firewall_ready && <FirewallStep busy={t.busy} allow={t.allow} />}
          <h3>Let someone in</h3>
          <p className="field-hint">
            Your own devices: install Tailscale and sign in with your account. Other people: they sign in with their own
            account, then you either share just this PC with them (they reach only this PC) or invite them to your
            network.
          </p>
          <div className="nh-buttons">
            <button className="btn btn-small" onClick={() => t.openTs(TAILSCALE_MACHINES)}>
              Share this PC
            </button>
            <button className="btn btn-small" onClick={() => t.openTs(TAILSCALE_USERS)}>
              Invite people
            </button>
          </div>
          <p className="field-hint">
            Tailscale is free for personal projects; for client or company work it asks for a paid plan. Visitors who
            come through Tailscale don't get the public link's password page.
          </p>
        </>
      )}
      {t.busy && (
        <p className="field-hint" role="status">
          {t.busy}
        </p>
      )}
      <Status msg={t.msg} />
    </section>
  );
}
