import { useState } from "react";
import { deleteSite, setWebRoot, type Site } from "../lib/nexhost";
import { DatabaseCard } from "./DatabaseCard";
import { FileManager } from "./FileManager";
import { GoLiveCard } from "./GoLiveCard";

type Tab = "files" | "database" | "live" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "database", label: "Database" },
  { id: "live", label: "Go live" },
  { id: "settings", label: "Settings" },
];

/** One NexHost site: its files, database, going live and settings. */
export function SiteDetail({ site, onSites, onDeleted }: { site: Site; onSites: (s: Site[]) => void; onDeleted: () => void }) {
  const [tab, setTab] = useState<Tab>("files");
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

      {tab === "files" && <FileManager site={site} />}
      {tab === "database" && <DatabaseCard site={site} onSites={onSites} />}
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
            <label htmlFor="nh-root">Folder inside the site (empty: let NexDB pick)</label>
            <input id="nh-root" value={root} onChange={(e) => setRoot(e.target.value)} placeholder="public" />{" "}
            <button className="btn">Save</button>
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
