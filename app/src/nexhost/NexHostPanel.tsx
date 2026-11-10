import { useCallback, useEffect, useState } from "react";
import { Globe, Plus, Server } from "lucide-react";
import { useFeature } from "../components/PlanLock";
import { createSite, listSites, type Site } from "../lib/nexhost";
import { NexHostUpsell } from "./NexHostUpsell";
import { SiteDetail } from "./SiteDetail";

/**
 * The hosting panel in its own big window (`?view=nexhost`): every site on the left, the open
 * site's overview, files, database, going live and settings on the right, like a hosting panel.
 */
export function NexHostPanel() {
  const nexhost = useFeature("nexhost");
  const [sites, setSites] = useState<Site[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listSites()
      .then((list) => {
        setSites(list);
        setOpen((cur) => cur ?? list[0]?.name ?? null);
      })
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (nexhost) load();
  }, [nexhost, load]);

  if (nexhost === false)
    return (
      <div className="nh-panel-locked">
        <NexHostUpsell />
      </div>
    );

  const site = sites?.find((s) => s.name === open) ?? null;
  const live = sites?.filter((s) => s.live).length ?? 0;

  return (
    <div className="nh-panel">
      <aside className="nh-panel-side">
        <div className="nh-panel-brand">
          <Server size={18} aria-hidden="true" />
          <div>
            <strong>NexHost</strong>
            <span>
              {sites ? `${sites.length} ${sites.length === 1 ? "site" : "sites"} · ${live} live` : "Loading…"}
            </span>
          </div>
        </div>
        <button className="btn btn-primary nh-panel-new" onClick={() => setCreating((v) => !v)} aria-pressed={creating}>
          <Plus size={14} aria-hidden="true" /> New site
        </button>
        {creating && (
          <form
            className="nh-panel-form"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              const name = newName.trim();
              createSite(name)
                .then((list) => {
                  setSites(list);
                  setOpen(name);
                  setCreating(false);
                  setNewName("");
                })
                .catch((err) => setError(String(err)));
            }}
          >
            <label className="field">
              <span className="field-label">Site name</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value.toLowerCase())} placeholder="my-shop" autoFocus spellCheck={false} />
            </label>
            <button className="btn btn-small btn-primary" disabled={!newName.trim()}>
              Make the site
            </button>
          </form>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <nav className="nh-panel-sites" aria-label="Sites">
          {sites?.map((s) => (
            <button key={s.name} className={s.name === open ? "nh-panel-site current" : "nh-panel-site"} aria-current={s.name === open ? "page" : undefined} onClick={() => setOpen(s.name)}>
              <span className={s.live ? "nh-dot on" : "nh-dot"} aria-hidden="true" />
              <span className="nh-panel-site-name">{s.name}</span>
              <span className="nh-panel-site-kind">{s.kind === "laravel" ? "Laravel" : s.kind === "php" ? "PHP" : "Static"}</span>
            </button>
          ))}
        </nav>
        <p className="nh-panel-foot">Sites are online only while this PC is on and NexDB is open.</p>
      </aside>

      <main className="nh-panel-main">
        {site ? (
          <>
            <header className="nh-panel-head">
              <div>
                <h1>{site.name}</h1>
                <p className={site.live ? "nh-state on" : "nh-state"}>
                  <Globe size={14} aria-hidden="true" /> {site.live ? `Live at https://${site.address}` : "Offline: only this PC can open it"}
                </p>
              </div>
            </header>
            <SiteDetail key={site.name} site={site} onSites={setSites} onDeleted={() => setOpen(null)} />
          </>
        ) : (
          <div className="nh-empty">
            <Server size={32} aria-hidden="true" />
            <p>{sites?.length === 0 ? "No sites yet. Press New site to make one." : "Pick a site on the left."}</p>
          </div>
        )}
      </main>
    </div>
  );
}
