import { useCallback, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Database, FolderOpen, Globe, Monitor, Network, Users, Wrench } from "lucide-react";
import { fixProblem, siteProblems, type Problem, type Site } from "../lib/nexhost";

type Tab = "files" | "database" | "live";

/**
 * The site's path from a visitor to its database, as one map: each stop says whether it works,
 * and the lines between them show where the connection stops. Clicking a stop opens its tab.
 */
export function ConnectionMap({ site, onTab }: { site: Site; onTab: (t: Tab) => void }) {
  const live = site.live;
  const ts = site.tailscale;
  const tunnel = site.address?.includes("ngrok") ? "ngrok" : site.address ? "Cloudflare" : "Tunnel";
  // The way in: the public tunnel, Tailscale, or both side by side.
  const wayIn = live && ts ? `${tunnel} + Tailscale` : ts ? "Tailscale" : tunnel;
  const wayDetail = live && site.address ? (ts ? `${site.address} and your Tailscale network` : site.address) : ts ? "Your Tailscale network" : "Off: turn on a way in";
  const files = site.web_root.split(/[\\/]/).slice(-2).join("\\");
  const nodes: { key: string; icon: typeof Globe; title: string; detail: string; on: boolean; tab?: Tab }[] = [
    {
      key: "visitors",
      icon: Users,
      title: "Visitors",
      detail: live ? "Anyone with the link" : ts ? "Your Tailscale devices" : "Nobody outside this PC",
      on: live || ts,
      tab: "live",
    },
    { key: "tunnel", icon: ts && !live ? Network : Globe, title: wayIn, detail: wayDetail, on: live || ts, tab: "live" },
    { key: "pc", icon: Monitor, title: "This PC", detail: `127.0.0.1:${site.port}`, on: true },
    { key: "files", icon: FolderOpen, title: "Site files", detail: files, on: true, tab: "files" },
    { key: "db", icon: Database, title: "Database", detail: site.db ?? "None yet", on: !!site.db, tab: "database" },
  ];

  return (
    <div className="nh-map" role="list" aria-label="How visitors reach this site" data-guide="nexhost-map">
      {nodes.map((n, i) => {
        const Icon = n.icon;
        const body = (
          <>
            <span className="nh-map-icon">
              <Icon size={16} aria-hidden="true" />
            </span>
            <span className="nh-map-title">{n.title}</span>
            <span className="nh-map-detail">{n.detail}</span>
            <span className="nh-map-state">{n.on ? "Working" : "Off"}</span>
          </>
        );
        // The line into this stop: live when both ends work.
        const linkOn = i > 0 && nodes[i - 1].on && n.on;
        return (
          <div key={n.key} className="nh-map-step" role="listitem">
            {i > 0 && <span className={linkOn ? "nh-map-link on" : "nh-map-link"} aria-hidden="true" />}
            {n.tab ? (
              <button className={n.on ? "nh-map-node on" : "nh-map-node"} onClick={() => onTab(n.tab!)}>
                {body}
              </button>
            ) : (
              <div className={n.on ? "nh-map-node on" : "nh-map-node"}>{body}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** What stops the site from working, each with a Fix button and the manual way. */
/** `quietWhenOk`: show nothing while there are no problems (the Overview only speaks up when needed). */
export function ProblemsCard({ site, quietWhenOk = false }: { site: Site; quietWhenOk?: boolean }) {
  const [list, setList] = useState<Problem[] | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    siteProblems(site.name)
      .then(setList)
      .catch((e) => setMsg({ ok: false, text: String(e) }));
  }, [site.name]);
  useEffect(load, [load]);

  const fix = (p: Problem) => {
    setFixing(p.id);
    setMsg(null);
    setLines([]);
    fixProblem(site.name, p.id, (l) => setLines((x) => [...x.slice(-200), l]))
      .then(() => setMsg({ ok: true, text: `Fixed: ${p.title.toLowerCase()}. Reload the site to check.` }))
      .catch((e) => setMsg({ ok: false, text: String(e) }))
      .finally(() => {
        setFixing(null);
        load();
      });
  };

  if (list === null) return msg ? <p className="field-error">{msg.text}</p> : null;
  if (quietWhenOk && list.length === 0 && !msg) return null;

  return (
    <section className="set-card nh-health" data-guide="nexhost-problems" aria-label="Problems">
      {list.length === 0 ? (
        <p className="nh-health-ok">
          <CircleCheck size={16} aria-hidden="true" /> No problems found. The site's files, packages and settings look ready.
        </p>
      ) : (
        <>
          <h2>
            <CircleAlert size={16} aria-hidden="true" /> {list.length === 1 ? "1 problem stops this site" : `${list.length} problems stop this site`}
          </h2>
          <ul className="nh-health-list">
            {list.map((p) => (
              <li key={p.id}>
                <div className="nh-health-text">
                  <strong>{p.title}</strong>
                  <span>{p.why}</span>
                  <details>
                    <summary>Fix it yourself</summary>
                    <p>{p.manual}</p>
                  </details>
                </div>
                <button className="btn btn-small btn-primary" disabled={fixing !== null} onClick={() => fix(p)}>
                  <Wrench size={14} aria-hidden="true" /> {fixing === p.id ? "Fixing…" : "Fix"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {msg && (
        <p className={msg.ok ? "set-ok" : "field-error"} role="status">
          {msg.text}
        </p>
      )}
      {lines.length > 0 && <pre className="nh-deploy-out">{lines.join("\n")}</pre>}
    </section>
  );
}
