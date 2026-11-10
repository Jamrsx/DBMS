import { useEffect, useState } from "react";
import { CopyButton } from "../components/CopyButton";
import { createDatabase, databaseInfo, listSites, writeEnv, type DbInfo, type Site } from "../lib/nexhost";

/** The site's own database and user, shown the way a hosting panel shows them. */
export function DatabaseCard({ site, onSites }: { site: Site; onSites: (s: Site[]) => void }) {
  const [info, setInfo] = useState<DbInfo | null | undefined>(undefined);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    databaseInfo(site.name)
      .then(setInfo)
      .catch((e) => setMsg({ ok: false, text: String(e) }));
  }, [site.name]);

  const rows: [string, string][] = info
    ? [
        ["Database", info.name],
        ["User", info.user],
        ["Password", info.password],
        ["Host", info.host],
        ["Port", String(info.port)],
      ]
    : [];

  return (
    <section className="set-card" data-guide="nexhost-db">
      <h2>Database</h2>
      {info === undefined ? (
        <p role="status">Loading…</p>
      ) : info === null ? (
        <>
          <p className="set-lede">Give this site its own MySQL database and a user that can only use it.</p>
          <button
            className="btn btn-primary"
            onClick={() =>
              createDatabase(site.name)
                .then((d) => {
                  setInfo(d);
                  setShow(true);
                  setMsg({ ok: true, text: `Made ${d.name}. Put these details in your site's settings.` });
                  return listSites().then(onSites);
                })
                .catch((e) => setMsg({ ok: false, text: String(e) }))
            }
          >
            Create database
          </button>
        </>
      ) : (
        <>
          <dl className="nh-db">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>
                  <code>{k === "Password" && !show ? "••••••••••" : v || "(not saved on this PC)"}</code> {v && <CopyButton text={v} label={`Copy ${k.toLowerCase()}`} />}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            <button className="btn btn-small btn-quiet" onClick={() => setShow((v) => !v)}>
              {show ? "Hide password" : "Show password"}
            </button>{" "}
            {site.kind === "laravel" && (
              <button
                className="btn btn-small"
                onClick={() =>
                  writeEnv(site.name)
                    .then(() => setMsg({ ok: true, text: "Saved these in the site's .env." }))
                    .catch((e) => setMsg({ ok: false, text: String(e) }))
                }
              >
                Put these in .env
              </button>
            )}
          </p>
          <p className="set-lede">The database only works on this PC; visitors reach it through your site, never directly.</p>
        </>
      )}
      {msg && (
        <p className={msg.ok ? "set-ok" : "field-error"} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}
