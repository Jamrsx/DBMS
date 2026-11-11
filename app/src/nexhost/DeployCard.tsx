import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Database, Download, Hammer, Package, Rocket } from "lucide-react";
import { deployInfo, deployStep, linkProject, pullUpdates, type DeployInfo, type DeployStep, type Site } from "../lib/nexhost";
import { listProjects, type Project } from "../lib/projects";

const STEP_TEXT: Record<DeployStep, string> = {
  install: "Installing packages",
  build: "Building",
  clear: "Clearing caches",
  migrate: "Updating the database",
};

const when = (secs: number | null) => (secs ? new Date(secs * 1000).toLocaleString() : "never");

/**
 * Deploy: pull the site's updates from the www project it came from (only what changed), then
 * install packages, build and clear caches here, like a hosting panel. Output shows live.
 */
export function DeployCard({ site }: { site: Site }) {
  const [info, setInfo] = useState<DeployInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [pick, setPick] = useState("");
  const [confirmMigrate, setConfirmMigrate] = useState(false);
  const out = useRef<HTMLPreElement>(null);

  const load = useCallback(() => {
    deployInfo(site.name)
      .then(setInfo)
      .catch((e) => setMsg({ ok: false, text: String(e) }));
  }, [site.name]);
  useEffect(load, [load]);
  useEffect(() => {
    out.current?.scrollTo(0, out.current.scrollHeight);
  }, [lines]);

  const add = (line: string) => setLines((l) => [...l.slice(-400), line]);
  const step = (s: DeployStep) => {
    add(`— ${STEP_TEXT[s]} —`);
    return deployStep(site.name, s, add);
  };
  const pull = async () => {
    const r = await pullUpdates(site.name);
    add(`Pulled from www: ${r.copied} new or changed, ${r.removed} removed.`);
    return r;
  };
  const go = (label: string, work: () => Promise<string>) => {
    setBusy(label);
    setMsg(null);
    work()
      .then((text) => setMsg({ ok: true, text }))
      .catch((e) => {
        add(String(e));
        setMsg({ ok: false, text: String(e) });
      })
      .finally(() => {
        setBusy(null);
        load();
      });
  };

  if (!info) return <section className="set-card">{msg ? <p className="field-error">{msg.text}</p> : <p role="status">Loading…</p>}</section>;

  if (!info.source) {
    return (
      <section className="set-card nh-deploy" data-guide="nexhost-deploy">
        <h2>
          <Rocket size={16} aria-hidden="true" /> Deploy from a project
        </h2>
        <p className="field-hint">
          Link this site to a project in NexDB's www folder. Then Pull updates copies only what you changed there, and the buttons install
          packages, build and clear caches here, like a hosting panel. Files → Import project links it for you.
        </p>
        {projects === null ? (
          <button className="btn btn-small" onClick={() => listProjects().then((i) => (setProjects(i.projects), setPick(i.projects[0]?.name ?? "")))}>
            Link a project
          </button>
        ) : projects.length === 0 ? (
          <p className="field-hint">NexDB's www folder has no projects yet.</p>
        ) : (
          <div className="nh-deploy-link">
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Project">
              {projects.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
            <p className="field-hint">
              Updates go into the folder <code>{pick}</code> of this site. Files there that aren't in the project are removed on each pull,
              except .env, storage, vendor, node_modules and public/build.
            </p>
            <button className="btn btn-small btn-primary" disabled={!pick} onClick={() => go("link", () => linkProject(site.name, pick, pick).then(() => `Linked to ${pick}.`))}>
              Link {pick}
            </button>
          </div>
        )}
        {msg && (
          <p className={msg.ok ? "set-ok" : "field-error"} role="status">
            {msg.text}
          </p>
        )}
      </section>
    );
  }

  const any = busy !== null;
  return (
    <section className="nh-deploy" data-guide="nexhost-deploy">
      <div className="set-card">
        <h2>
          <Rocket size={16} aria-hidden="true" /> Deploy
        </h2>
        <p className="field-hint">
          Pulls from <code>www\{info.source}</code> into <code>{info.folder || site.name}</code>. Last pull: {when(info.last_pull)}. The site keeps
          its own .env, storage, vendor, node_modules and public/build.
        </p>
        <div className="nh-deploy-main">
          <button
            className="btn btn-primary"
            disabled={any}
            data-guide="nexhost-deploy-update"
            onClick={() =>
              go("update", async () => {
                const r = await pull();
                if (r.composer_changed || r.npm_changed || !info.has_packages) await step("install");
                if (info.npm) await step("build");
                if (info.laravel) await step("clear");
                return "The site is up to date.";
              })
            }
          >
            <Rocket size={15} aria-hidden="true" /> {busy === "update" ? "Updating…" : "Update site"}
          </button>
          <span className="field-hint">Pull, install packages if they changed, build, clear caches. Doesn't touch the database.</span>
        </div>
        <div className="nh-deploy-steps">
          <button className="btn btn-small" disabled={any} onClick={() => go("pull", async () => (await pull(), "Pulled the latest files."))}>
            <Download size={14} aria-hidden="true" /> Pull updates
          </button>
          <button className="btn btn-small" disabled={any} onClick={() => go("install", () => step("install").then(() => "Packages installed."))}>
            <Package size={14} aria-hidden="true" /> Install packages
          </button>
          {info.npm && (
            <button className="btn btn-small" disabled={any} onClick={() => go("build", () => step("build").then(() => "Built."))}>
              <Hammer size={14} aria-hidden="true" /> Run build
            </button>
          )}
          {info.laravel && (
            <button className="btn btn-small" disabled={any} onClick={() => go("clear", () => step("clear").then(() => "Caches cleared."))}>
              <Brush size={14} aria-hidden="true" /> Clear cache
            </button>
          )}
          {info.laravel &&
            (confirmMigrate ? (
              <span className="nh-deploy-confirm">
                Run migrations on this site's database?{" "}
                <button
                  className="btn btn-small btn-danger"
                  disabled={any}
                  onClick={() => {
                    setConfirmMigrate(false);
                    go("migrate", () => step("migrate").then(() => "Database updated."));
                  }}
                >
                  Yes, migrate
                </button>{" "}
                <button className="btn btn-small" onClick={() => setConfirmMigrate(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="btn btn-small" disabled={any} onClick={() => setConfirmMigrate(true)}>
                <Database size={14} aria-hidden="true" /> Migrate
              </button>
            ))}
        </div>
        {!info.has_packages && info.npm && <p className="field-hint">The first build installs this site's own node_modules (a few hundred MB, a minute or two).</p>}
        {msg && (
          <p className={msg.ok ? "set-ok" : "field-error"} role="status">
            {msg.text}
          </p>
        )}
      </div>

      <div className="set-card">
        <div className="nh-deploy-outhead">
          <h2>Output</h2>
          {lines.length > 0 && !any && (
            <button className="btn btn-small btn-quiet" onClick={() => setLines([])}>
              Clear
            </button>
          )}
        </div>
        <pre className="nh-deploy-out" ref={out} aria-live="polite">
          {lines.length ? lines.join("\n") : "Nothing run yet. What each step prints shows here."}
          {busy && "\n…"}
        </pre>
      </div>
    </section>
  );
}
