import { useState } from "react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Database, FolderOpen, Globe, MonitorSmartphone, SquareTerminal } from "lucide-react";
import { deleteSite, setWebRoot, type Site } from "../lib/nexhost";
import { openTerminalWindow } from "../lib/terminal";
import { inDesktopApp } from "../lib/scan";
import { DatabaseCard } from "./DatabaseCard";
import { FileManager } from "./FileManager";
import { GoLiveCard } from "./GoLiveCard";
import { SshCard } from "./SshCard";

type Tab = "overview" | "files" | "database" | "ssh" | "live" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "files", label: "Files" },
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

      {tab === "overview" && <Overview site={site} onTab={setTab} />}
      {tab === "files" && <FileManager site={site} />}
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
function Overview({ site, onTab }: { site: Site; onTab: (t: Tab) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const local = `http://127.0.0.1:${site.port}/`;
  const open = (url: string) => (inDesktopApp ? void openUrl(url) : void window.open(url, "_blank"));
  return (
    <section className="nh-overview" data-guide="nexhost-overview">
      <div className="nh-stats">
        <button className="nh-stat" onClick={() => onTab("live")}>
          <Globe size={16} aria-hidden="true" />
          <span className="nh-stat-label">Status</span>
          <strong className={site.live ? "nh-ok" : undefined}>{site.live ? "Live" : "Offline"}</strong>
          <span className="nh-stat-sub">{site.live && site.address ? site.address : "Go live to share it"}</span>
        </button>
        <button className="nh-stat" onClick={() => onTab("database")}>
          <Database size={16} aria-hidden="true" />
          <span className="nh-stat-label">Database</span>
          <strong>{site.db ?? "None yet"}</strong>
          <span className="nh-stat-sub">{site.db ? "MySQL on this PC" : "Make one in one click"}</span>
        </button>
        <button className="nh-stat" onClick={() => onTab("settings")}>
          <FolderOpen size={16} aria-hidden="true" />
          <span className="nh-stat-label">Visitors see</span>
          <strong className="nh-stat-path">{site.web_root.split(/[\\/]/).slice(-2).join("\\")}</strong>
          <span className="nh-stat-sub">{site.kind === "laravel" ? "Laravel app" : site.kind === "php" ? "PHP site" : "Static site"}</span>
        </button>
      </div>
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
        On this PC the site is at <code>{local}</code>. The terminal opens in the site's folder with NexDB's PHP, Composer, Node and Git.
      </p>
      {err && (
        <p className="field-error" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}
