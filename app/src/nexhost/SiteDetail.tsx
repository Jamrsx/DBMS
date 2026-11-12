import { useEffect, useState } from "react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { ExternalLink, FolderOpen, Globe, MonitorSmartphone, SquareTerminal } from "lucide-react";
import { CopyButton } from "../components/CopyButton";
import { fixedLinkInfo, type FixedLinkInfo } from "../lib/share";
import { deleteSite, goLive, goOffline, setWebRoot, type Site } from "../lib/nexhost";
import { openTerminalWindow } from "../lib/terminal";
import { inDesktopApp } from "../lib/scan";
import { DatabaseCard } from "./DatabaseCard";
import { DeployCard } from "./DeployCard";
import { FileManager } from "./FileManager";
import { GoLiveCard } from "./GoLiveCard";
import { SshCard } from "./SshCard";
import { ConnectionMap, ProblemsCard } from "./SiteHealth";

type Tab = "overview" | "files" | "deploy" | "database" | "ssh" | "live" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "files", label: "Files" },
  { id: "deploy", label: "Deploy" },
  { id: "database", label: "Database" },
  { id: "ssh", label: "SSH" },
  { id: "live", label: "Go live" },
  { id: "settings", label: "Settings" },
];

/** One NexHost site: its files, database, going live and settings. */
export function SiteDetail({ site, onSites, onDeleted }: { site: Site; onSites: (s: Site[]) => void; onDeleted: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [root, setRoot] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <div className="log-tabs details-tabs" role="tablist" aria-label={`${site.name} sections`}>
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="log-tab" data-guide={`nexhost-tab-${t.id}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview site={site} onTab={setTab} onSites={onSites} />}
      {tab === "files" && <FileManager site={site} onSites={onSites} />}
      {tab === "deploy" && <DeployCard site={site} />}
      {tab === "database" && <DatabaseCard site={site} onSites={onSites} />}
      {tab === "ssh" && <SshCard site={site} />}
      {tab === "live" && <GoLiveCard site={site} onSites={onSites} />}
      {tab === "settings" && (
        <section className="set-card">
          <h2>What visitors see</h2>
          <p className="set-lede">
            Now: <code>{site.web_root}</code>. Laravel sites show their public folder, so .env and your code stay hidden. Files whose
            name starts with a dot are never shown.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setWebRoot(site.name, root.trim() || null)
                .then((list) => {
                  onSites(list);
                  setMsg({ ok: true, text: root.trim() ? `Visitors now see the ${root.trim()} folder.` : "Back to the folder NexDB picks." });
                })
                .catch((err) => setMsg({ ok: false, text: String(err) }));
            }}
          >
            <label className="field">
              <span className="field-label">Folder inside the site</span>
              <input value={root} onChange={(e) => setRoot(e.target.value)} placeholder="public" spellCheck={false} />
              <span className="field-hint">Leave it empty to let NexDB pick.</span>
            </label>
            <div className="nh-buttons">
              <button className="btn">Save</button>
            </div>
          </form>
          {msg && <p className={msg.ok ? "set-ok" : "field-error"} role="status">{msg.text}</p>}

          <h2>Delete this site</h2>
          <p className="set-lede">The folder moves to C:\NexDB\nexhost\.deleted, so you can still get it back. Its database stays.</p>
          {confirming ? (
            <p>
              <button
                className="btn btn-danger"
                onClick={() =>
                  deleteSite(site.name)
                    .then((list) => {
                      onSites(list);
                      onDeleted();
                    })
                    .catch((err) => setMsg({ ok: false, text: String(err) }))
                }
              >
                Yes, delete {site.name}
              </button>{" "}
              <button className="btn btn-quiet" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </p>
          ) : (
            <button className="btn btn-danger" onClick={() => setConfirming(true)}>
              Delete site…
            </button>
          )}
        </section>
      )}
    </>
  );
}

/** The site at a glance, like a hosting panel's home: status, address, database, quick actions. */
function Overview({ site, onTab, onSites }: { site: Site; onTab: (t: Tab) => void; onSites: (s: Site[]) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const local = `http://127.0.0.1:${site.port}/`;
  const open = (url: string) => (inDesktopApp ? void openUrl(url) : void window.open(url, "_blank"));
  return (
    <section className="nh-overview" data-guide="nexhost-overview">
      <LiveSwitch site={site} onTab={onTab} onSites={onSites} open={open} />
      <ConnectionMap site={site} onTab={onTab} />
      <ProblemsCard site={site} />
      <div className="set-card nh-quick-card">
        <h2>Quick actions</h2>
        <div className="nh-quick">
          <button className="btn" onClick={() => open(local)}>
            <MonitorSmartphone size={14} aria-hidden="true" /> Open on this PC
          </button>
          <button className="btn" onClick={() => openTerminalWindow(`nexhost:${site.name}`).catch((e) => setErr(String(e)))}>
            <SquareTerminal size={14} aria-hidden="true" /> Terminal here
          </button>
          {inDesktopApp && (
            <button className="btn" onClick={() => void revealItemInDir(site.path)}>
              <FolderOpen size={14} aria-hidden="true" /> Open folder
            </button>
          )}
        </div>
        <p className="field-hint">
          On this PC: <code>{local}</code> <CopyButton text={local} label="Copy" /> The terminal opens in the site's folder with NexDB's PHP,
          Composer, Node and Git.
        </p>
      </div>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}

/**
 * Go live from the Overview with one switch. ngrok (or Cloudflare with a saved address) goes live
 * at once; anything that needs a choice first (no account yet, no address, a password) opens the
 * Go live tab, which keeps all the options.
 */
function LiveSwitch({ site, onTab, onSites, open }: { site: Site; onTab: (t: Tab) => void; onSites: (s: Site[]) => void; open: (url: string) => void }) {
  const [conn, setConn] = useState<FixedLinkInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    fixedLinkInfo()
      .then(setConn)
      .catch(() => setConn(null));
  }, []);

  const url = site.live && site.address ? `https://${site.address}` : null;
  const provider = conn?.provider ?? null;
  // A switch press that can't finish here opens the tab that can.
  const needsTab = !site.live && (!provider || (provider === "cloudflare" && !site.address));

  const toggle = () => {
    if (needsTab) {
      onTab("live");
      return;
    }
    setBusy(true);
    setMsg(null);
    (site.live ? goOffline(site.name) : goLive(site.name, provider === "cloudflare" ? site.address : null, null))
      .then((list) => {
        onSites(list);
        setMsg({ ok: true, text: site.live ? `${site.name} is offline.` : `${site.name} is live.` });
      })
      .catch((e) => setMsg({ ok: false, text: String(e) }))
      .finally(() => setBusy(false));
  };

  return (
    <div className={site.live ? "set-card nh-live-bar on" : "set-card nh-live-bar"} data-guide="nexhost-live-switch">
      <span className="nh-live-icon" aria-hidden="true">
        <Globe size={18} />
      </span>
      <div className="nh-live-text">
        <strong>{busy ? (site.live ? "Going offline…" : "Going live…") : site.live ? "Live on the internet" : "Offline"}</strong>
        {url ? (
          <span className="nh-live-url">
            <code>{url}</code>
            <CopyButton text={url} label="Copy link" />
            <button className="btn btn-small btn-quiet" onClick={() => open(url)}>
              <ExternalLink size={13} aria-hidden="true" /> Open
            </button>
          </span>
        ) : (
          <span className="field-hint">
            {conn === undefined
              ? "Checking your connection…"
              : !provider
                ? "Connect ngrok or Cloudflare first: the switch opens the Go live tab."
                : needsTab
                  ? "Pick an address on your domain first: the switch opens the Go live tab."
                  : "Only this PC can open it. Turn it on to get a link anyone can open."}
          </span>
        )}
        {msg && (
          <span className={msg.ok ? "set-ok" : "field-error"} role="status">
            {msg.text}
          </span>
        )}
      </div>
      <div className="nh-live-control">
        <button
          type="button"
          role="switch"
          aria-checked={site.live}
          aria-label="Go live"
          className={site.live ? "nh-switch on" : "nh-switch"}
          disabled={busy || conn === undefined}
          onClick={toggle}
        >
          <span className="nh-switch-knob" />
        </button>
        <button className="btn btn-small btn-quiet" onClick={() => onTab("live")}>
          Options
        </button>
      </div>
    </div>
  );
}
