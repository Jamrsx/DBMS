import { useEffect, useState } from "react";
import { FolderGit2 } from "lucide-react";
import { CopyButton } from "../components/CopyButton";
import { dbDatabases, dbTargets, dbUseInProject, type DbEngine, type DbTarget, type UseResult } from "../lib/db";
import { listProjects } from "../lib/projects";
import { nexCelebrate } from "../lib/nex";

const KIND_LABEL: Record<DbTarget["kind"], string> = {
  laravel: "Laravel app",
  wordpress: "WordPress site",
  other: "PHP app",
};

/** Which file NexDB changes for each kind of app. */
const FILE_LABEL: Record<DbTarget["kind"], string> = {
  laravel: ".env",
  wordpress: "wp-config.php",
  other: "",
};

/**
 * Points a project at a database. Either side can be fixed: after creating a database the
 * project is picked here; from a project's page the database is. Picking nothing is fine.
 */
export function UseInProject({
  database: fixedDb,
  project: fixedProject,
  engine,
  title,
  onClose,
  onDone,
}: {
  database?: string;
  project?: string;
  engine: DbEngine;
  title?: string;
  onClose: () => void;
  onDone?: (r: UseResult) => void;
}) {
  const [projects, setProjects] = useState<string[] | null>(fixedProject ? [fixedProject] : null);
  const [databases, setDatabases] = useState<string[] | null>(fixedDb ? [fixedDb] : null);
  const [project, setProject] = useState(fixedProject ?? "");
  const [database, setDatabase] = useState(fixedDb ?? "");
  const [targets, setTargets] = useState<DbTarget[] | null>(null);
  const [folder, setFolder] = useState("");
  const [ownUser, setOwnUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UseResult | null>(null);

  useEffect(() => {
    if (fixedProject) return;
    listProjects()
      .then((p) => setProjects(p.projects.map((x) => x.name)))
      .catch((e) => setError(String(e)));
  }, [fixedProject]);

  useEffect(() => {
    if (fixedDb) return;
    dbDatabases()
      .then((d) => setDatabases(d.filter((x) => !x.system).map((x) => x.name)))
      .catch(() =>
        setError(
          "NexDB isn't signed in to the database server yet. Open the Database page once, then try again.",
        ),
      );
  }, [fixedDb]);

  useEffect(() => {
    setTargets(null);
    setResult(null);
    if (!project) return;
    let live = true;
    dbTargets(project)
      .then((t) => {
        if (!live) return;
        setTargets(t);
        // Start on the folder already using this database, else the first app found.
        const using = t.find((x) => x.database === database);
        setFolder((using ?? t[0])?.folder ?? "");
      })
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [project, database]);

  const target = targets?.find((t) => t.folder === folder) ?? null;
  const where = (t: DbTarget) => (t.folder ? `${project}/${t.folder}` : project);

  async function connect() {
    if (!project || !database) return;
    setBusy(true);
    setError(null);
    try {
      const r = await dbUseInProject(project, folder, database, engine, ownUser);
      setResult(r);
      if (r.written) nexCelebrate(`${where(target!)} now uses ${database}.`);
      onDone?.(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const headingId = "use-in-project-title";
  return (
    <section className="use-project" aria-labelledby={headingId}>
      <h2 id={headingId}>
        <FolderGit2 size={16} aria-hidden="true" /> {title ?? "Use it in a project"}
      </h2>

      {result ? (
        <Done result={result} database={database} where={target ? where(target) : project} onClose={onClose} />
      ) : (
        <form
          className="use-project-form"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <p className="field-hint">
            Optional. NexDB writes the connection into the project's settings for you, so the app can sign in. You
            can do this later from the database or the project.
          </p>

          {!fixedProject && (
            <label className="field">
              <span className="field-label">Project</span>
              <select value={project} onChange={(e) => setProject(e.target.value)} disabled={!projects}>
                <option value="">{projects ? "No project for now" : "Loading projects…"}</option>
                {projects?.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {projects?.length === 0 && <span className="field-hint">You have no projects yet.</span>}
            </label>
          )}

          {!fixedDb && (
            <label className="field">
              <span className="field-label">Database</span>
              <select value={database} onChange={(e) => setDatabase(e.target.value)} disabled={!databases}>
                <option value="">{databases ? "Pick a database" : "Loading databases…"}</option>
                {databases?.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {databases?.length === 0 && (
                <span className="field-hint">There are no databases yet. Create one on the Database page.</span>
              )}
            </label>
          )}

          {project && !targets && <p className="field-hint" role="status">Looking inside {project}…</p>}

          {targets && targets.length > 1 && (
            <label className="field">
              <span className="field-label">Which app in {project}</span>
              <select value={folder} onChange={(e) => setFolder(e.target.value)}>
                {targets.map((t) => (
                  <option key={t.folder} value={t.folder}>
                    {where(t)}: {KIND_LABEL[t.kind]}
                    {t.database ? `, uses ${t.database} now` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {target && (
            <p className="field-hint">
              {target.kind === "other"
                ? `${where(target)} has no .env or wp-config.php, so NexDB shows the values to copy into it.`
                : target.kind === "wordpress" && engine === "postgres"
                  ? "WordPress needs MySQL. Switch the Database page to MySQL to connect it."
                  : `NexDB updates ${where(target)}/${FILE_LABEL[target.kind]} and keeps a copy of the old one as ${FILE_LABEL[target.kind]}.backup.`}
              {target.database && target.database !== database && ` It uses ${target.database} now.`}
            </p>
          )}

          {project && (
            <fieldset className="use-project-user">
              <legend className="field-label">Sign in as</legend>
              <label className="check-row">
                <input type="radio" name="use-user" checked={ownUser} onChange={() => setOwnUser(true)} />
                <span>
                  A user of its own <span className="muted">(recommended)</span>
                  <span className="field-hint use-project-sub">
                    Can reach only {database || "this database"}. NexDB makes it with a new password.
                  </span>
                </span>
              </label>
              <label className="check-row">
                <input type="radio" name="use-user" checked={!ownUser} onChange={() => setOwnUser(false)} />
                <span>
                  {engine === "postgres" ? "postgres" : "root"}
                  <span className="field-hint use-project-sub">
                    Can change every database. The password is written into the project's file as plain text.
                  </span>
                </span>
              </label>
            </fieldset>
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <div className="use-project-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={
                busy || !project || !database || !target || (target.kind === "wordpress" && engine === "postgres")
              }
              data-working={busy || undefined}
            >
              {busy ? "Connecting…" : target?.kind === "other" ? "Show the values" : "Connect"}
            </button>
            <button className="btn" type="button" onClick={onClose}>
              Not now
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Done({
  result,
  database,
  where,
  onClose,
}: {
  result: UseResult;
  database: string;
  where: string;
  onClose: () => void;
}) {
  const all = result.values.map(([k, v]) => `${k}=${v}`).join("\n");
  return (
    <div className="use-project-done" role="status">
      {result.written ? (
        <p>
          <strong>{where}</strong> now uses <code>{database}</code>, signing in as <code>{result.user}</code>. NexDB
          changed <code>{result.written}</code> and kept the old one next to it as a <code>.backup</code>.
        </p>
      ) : (
        <p>
          Copy these into <strong>{where}</strong>'s settings. It signs in as <code>{result.user}</code>.
        </p>
      )}
      <table className="data-table use-project-values">
        <tbody>
          {result.values.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>
                <code>{v || "(empty)"}</code>
              </td>
              <td className="num">{v && <CopyButton text={v} label={k} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="use-project-actions">
        <CopyAll text={all} />
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function CopyAll({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? "Copied" : "Copy all"}
    </button>
  );
}
