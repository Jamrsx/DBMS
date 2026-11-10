import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Globe, Plus, Server } from "lucide-react";
import { PlanLock, useFeature } from "../components/PlanLock";
import { createSite, listSites, type Site } from "../lib/nexhost";
import { SiteDetail } from "./SiteDetail";

/**
 * NexHost (4-year plan): small test sites hosted from this PC, like a tiny hosting panel.
 * Put the files in, give the site a database, press Go live.
 */
export function NexHostPage({ active }: { active: boolean }) {
  const nexhost = useFeature("nexhost");
  const [sites, setSites] = useState<Site[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listSites()
      .then(setSites)
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (active && nexhost) load();
  }, [active, nexhost, load]);
  // The Nex tour opens a site by name.
  useEffect(() => {
    const onOpen = (e: Event) => setOpen((e as CustomEvent<string>).detail);
    window.addEventListener("nexdb:open-nexhost-site", onOpen);
    return () => window.removeEventListener("nexdb:open-nexhost-site", onOpen);
  }, []);

  const site = sites?.find((s) => s.name === open) ?? null;

  if (nexhost === false) {
    return (
      <main className="panel">
        <header className="panel-head dash-head">
          <div>
            <h1>NexHost</h1>
            <p className="dash-summary">Put your test sites online from this PC.</p>
          </div>
        </header>
        <div className="panel-body dash-body">
        <PlanLock
          title="NexHost"
          text="Turn this PC into a small web host: upload a site, give it a database, and show it to a client or test payments on a real https address."
        />
        </div>
      </main>
    );
  }

  return (
    <main className="panel" data-guide="nexhost-page">
      <header className="panel-head dash-head">
        <div>
          {site && (
            <button className="btn btn-small btn-quiet" onClick={() => setOpen(null)}>
              <ArrowLeft size={14} aria-hidden="true" /> All sites
            </button>
          )}
          <h1>{site ? site.name : "NexHost"}</h1>
          <p className="dash-summary" role="status">
            {sites === null
              ? "Loading sites…"
              : site
                ? site.live
                  ? `Online at https://${site.address}`
                  : "Offline: only this PC can open it."
                : `${sites.length} ${sites.length === 1 ? "site" : "sites"} hosted from this PC. They're online only while this PC is on.`}
          </p>
        </div>
        {!site && (
          <div className="dash-actions">
            <button className="btn btn-primary" data-guide="nexhost-new" onClick={() => setCreating((v) => !v)} aria-pressed={creating}>
              <Plus size={14} aria-hidden="true" /> New site
            </button>
          </div>
        )}
      </header>
      <div className="panel-body dash-body">

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {!site && creating && (
        <form
          className="set-card nh-new"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            createSite(newName.trim())
              .then((list) => {
                setSites(list);
                setCreating(false);
                setOpen(newName.trim());
                setNewName("");
              })
              .catch((err) => setError(String(err)));
          }}
        >
          <h2>New site</h2>
          <label className="field">
            <span className="field-label">Site name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value.toLowerCase())}
              placeholder="my-shop"
              autoFocus
              spellCheck={false}
              pattern="[a-z0-9][a-z0-9\-]{0,39}"
              title="Small letters, numbers and dashes"
            />
            <span className="field-hint">Small letters, numbers and dashes. It becomes the folder C:\NexDB\nexhost\{newName || "my-shop"}.</span>
          </label>
          <div className="nh-buttons">
            <button className="btn btn-primary" disabled={!newName.trim()}>
              Make the site
            </button>{" "}
            <button type="button" className="btn btn-quiet" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {site ? (
        <SiteDetail site={site} onSites={setSites} onDeleted={() => setOpen(null)} />
      ) : sites && sites.length === 0 && !creating ? (
        <div className="nh-empty">
          <Server size={28} aria-hidden="true" />
          <p>No sites yet. Make one, drop your website's files in, and press Go live.</p>
        </div>
      ) : (
        <ul className="nh-list" data-guide="nexhost-list">
          {sites?.map((s) => (
            <li key={s.name}>
              <button className="nh-row" onClick={() => setOpen(s.name)}>
                <span className="nh-name">{s.name}</span>
                <span className="nh-kind">{s.kind === "laravel" ? "Laravel" : s.kind === "php" ? "PHP" : "Static"}</span>
                <span className={s.live ? "nh-live on" : "nh-live"}>
                  <Globe size={13} aria-hidden="true" /> {s.live ? s.address : "Offline"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </main>
  );
}
