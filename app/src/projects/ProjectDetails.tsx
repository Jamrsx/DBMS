import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Code2, ExternalLink, FolderOpen, GitBranch, SquareTerminal, Trash2 } from "lucide-react";
import {
  deleteProject,
  nameProblem,
  openInEditor,
  openProject,
  projectDetails,
  renameProject,
  setProjectPhp,
  type Editor,
  type ProjectDetails as Details,
} from "../lib/projects";
import { openTerminalWindow } from "../lib/terminal";

/** One project: where it lives, its PHP, database and Git, plus rename and delete. */
export function ProjectDetails({
  name,
  editors,
  existing,
  addressReady,
  onBack,
  onChanged,
}: {
  name: string;
  editors: Editor[];
  existing: string[];
  addressReady: boolean;
  onBack: () => void;
  /** The project was renamed (new name) or deleted (null). */
  onChanged: (renamedTo: string | null) => Promise<void>;
}) {
  const [info, setInfo] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [php, setPhp] = useState<string>("");
  const [newName, setNewName] = useState(name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [dropDb, setDropDb] = useState(false);

  const load = useCallback(() => {
    projectDetails(name)
      .then((d) => {
        setInfo(d);
        setPhp(d.php.chosen ?? "");
      })
      .catch((e) => setError(String(e)));
  }, [name]);

  useEffect(load, [load]);

  async function act(label: string, work: () => Promise<unknown>, done?: string) {
    setBusy(label);
    setError(null);
    setSaved(null);
    try {
      await work();
      if (done) setSaved(done);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  const renameProblem = newName === name ? null : nameProblem(newName, existing);
  const site = addressReady ? `${name}.test` : `localhost/${name}`;
  const run = (p: Promise<unknown>) => p.catch((e) => setError(String(e)));

  return (
    <section className="details" aria-labelledby="details-title">
      <div className="details-head">
        <button className="btn btn-small btn-quiet" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> All projects
        </button>
        <h2 id="details-title">{name}</h2>
        <code className="details-addr">{site}</code>
        <div className="details-actions">
          {editors.slice(0, 2).map((e) => (
            <button key={e.id} className="btn btn-small" onClick={() => void run(openInEditor(name, e.id))}>
              <Code2 size={13} aria-hidden="true" /> {e.name}
            </button>
          ))}
          <button className="btn btn-small" onClick={() => void run(openTerminalWindow(name))}>
            <SquareTerminal size={13} aria-hidden="true" /> Terminal
          </button>
          <button className="btn btn-small" onClick={() => void run(openProject(name, addressReady ? "url" : "local"))}>
            <ExternalLink size={13} aria-hidden="true" /> Open site
          </button>
          <button className="btn btn-small btn-icon" title="Show the folder" aria-label="Show the folder" onClick={() => void run(openProject(name, "folder"))}>
            <FolderOpen size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="set-ok" role="status">
          {saved}
        </p>
      )}
      {busy && (
        <p className="field-hint" role="status">
          {busy}
        </p>
      )}

      {info && (
        <dl className="details-facts">
          <div>
            <dt>Folder</dt>
            <dd>
              <code>{info.path}</code>
            </dd>
          </div>
          <div>
            <dt>Database</dt>
            <dd>{info.database ? <code>{info.database}</code> : <span className="muted">None set in its config</span>}</dd>
          </div>
          <div>
            <dt>Git</dt>
            <dd>
              {info.git ? (
                <>
                  <GitBranch size={13} aria-hidden="true" /> <code>{info.git.branch}</code>
                  <span className="muted">
                    {" "}
                    · {info.git.changes === 0 ? "nothing to commit" : `${info.git.changes} changed file${info.git.changes === 1 ? "" : "s"}`}
                  </span>
                </>
              ) : (
                <span className="muted">Not a Git repository</span>
              )}
            </dd>
          </div>
        </dl>
      )}

      {info && (
        <div className="details-section">
          <h3>PHP version</h3>
          <p className="field-hint">
            The website, its terminal and Composer all use this version. Install more versions on the Versions page.
          </p>
          <div className="details-row">
            <select className="input input-medium" value={php} onChange={(e) => setPhp(e.target.value)} disabled={!!busy}>
              <option value="">NexDB default{info.php.default ? ` (PHP ${info.php.default})` : ""}</option>
              {info.php.installed
                .filter((v) => v !== info.php.default)
                .map((v) => (
                  <option key={v} value={v}>
                    PHP {v}
                  </option>
                ))}
            </select>
            <button
              className="btn"
              disabled={!!busy || php === (info.php.chosen ?? "")}
              onClick={() =>
                void act(
                  "Switching PHP; running services restart…",
                  async () => {
                    await setProjectPhp(name, php || null);
                    load();
                  },
                  `${name} now runs on PHP ${php || info.php.default}.`,
                )
              }
            >
              Use this version
            </button>
          </div>
          {info.php.installed.length < 2 && (
            <p className="field-hint">Only one PHP version is installed. Add another on the Versions page to choose here.</p>
          )}
        </div>
      )}

      <div className="details-section">
        <h3>Rename</h3>
        <form
          className="details-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName === name || renameProblem) return;
            void act("Renaming…", async () => {
              await renameProject(name, newName);
              await onChanged(newName);
            });
          }}
        >
          <input
            className="input input-medium"
            value={newName}
            onChange={(e) => setNewName(e.target.value.trim().toLowerCase())}
            spellCheck={false}
            aria-label="New name"
          />
          <button className="btn" type="submit" disabled={!!busy || newName === name || !!renameProblem}>
            Rename
          </button>
        </form>
        <p className={renameProblem ? "field-error" : "field-hint"}>
          {renameProblem ??
            `Renames the folder and its address to ${newName}.test. Close its terminal, editor and dev server first.`}
        </p>
      </div>

      <div className="details-section danger-zone">
        <h3>Delete</h3>
        {!confirmDelete ? (
          <>
            <p className="field-hint">The folder goes to the Recycle Bin, so you can still bring it back.</p>
            <button className="btn" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} aria-hidden="true" /> Delete project…
            </button>
          </>
        ) : (
          <form
            className="confirm-delete"
            onSubmit={(e) => {
              e.preventDefault();
              void act(`Deleting ${name}…`, async () => {
                await deleteProject(name, dropDb);
                await onChanged(null);
              });
            }}
          >
            <label className="field">
              <span className="field-label">
                Moves <strong>{name}</strong> to the Recycle Bin. Type its name to confirm.
              </span>
              <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus spellCheck={false} />
            </label>
            {info?.database && (
              <label className="set-check backup-first">
                <input type="checkbox" checked={dropDb} onChange={(e) => setDropDb(e.target.checked)} />
                <span>
                  Also delete its database <code>{info.database}</code> and its MySQL user (this can't be undone; back it
                  up first on the Database page if you might need it)
                </span>
              </label>
            )}
            <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" type="submit" disabled={typed !== name || !!busy}>
              Move to Recycle Bin
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
