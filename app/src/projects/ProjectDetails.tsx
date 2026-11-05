import { useCallback, useEffect, useState } from "react";
import { TeamSetupCard } from "./TeamSetupCard";
import {
  ArrowLeft,
  Code2,
  ExternalLink,
  FolderOpen,
  GitBranch,
  LoaderCircle,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import {
  deleteProject,
  nameProblem,
  openInEditor,
  openProject,
  projectDetails,
  renameProject,
  setProjectNode,
  setProjectPhp,
  setProjectSite,
  type Editor,
  type ProjectDetails as Details,
} from "../lib/projects";
import { openTerminalWindow } from "../lib/terminal";
import { SharePanel } from "./SharePanel";
import { SetupPanel } from "./SetupPanel";
import { LaravelPanel } from "./LaravelPanel";
import { PhpSettingsPanel } from "../components/PhpSettingsPanel";
import { MoreMenu } from "../components/MoreMenu";
import { UseInProject } from "../database/UseInProject";
import { EnvEditor } from "./EnvEditor";

/** The server the Database page shows; a project connects to that one. */
function currentEngine(): "mysql" | "postgres" {
  try {
    return localStorage.getItem("nexdb.dbEngine") === "postgres" ? "postgres" : "mysql";
  } catch {
    return "mysql";
  }
}

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
  onChanged: (renamedTo: string | null, message?: string) => Promise<void>;
}) {
  const [info, setInfo] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [php, setPhp] = useState<string>("");
  const [siteFolder, setSiteFolder] = useState<string>("");
  const [tab, setTab] = useState<"overview" | "share" | "env" | "laravel" | "manage">("overview");
  const [newName, setNewName] = useState(name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [dropDb, setDropDb] = useState(false);
  const [pickDb, setPickDb] = useState(false);

  const load = useCallback(() => {
    projectDetails(name)
      .then((d) => {
        setInfo(d);
        setPhp(d.php.chosen ?? "");
        setSiteFolder(d.site.chosen ?? "");
      })
      .catch((e) => setError(String(e)));
  }, [name]);

  useEffect(load, [load]);

  // Which section the last action belongs to, so its progress and result show beside its button.
  const [where, setWhere] = useState<"top" | "site" | "php" | "rename" | "delete">("top");

  async function act(
    label: string,
    work: () => Promise<unknown>,
    done?: string,
    section: "top" | "site" | "php" | "rename" | "delete" = "top",
  ) {
    if (busy) return; // one change at a time; a second click must not repeat it
    setWhere(section);
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
  const run = (p: Promise<unknown>) => {
    setWhere("top");
    return p.catch((e) => setError(String(e)));
  };

  // Progress, result or error of the last action, shown in its own section.
  const feedback = (section: typeof where) =>
    where === section && (
      <>
        {busy && (
          <span className="row-status" role="status">
            <LoaderCircle size={13} className="status-spin" aria-hidden="true" /> {busy}
          </span>
        )}
        {saved && (
          <p className="set-ok" role="status">
            {saved}
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </>
    );

  return (
    <section className="details" aria-labelledby="details-title">
      <div className="details-head">
        <button className="btn btn-small btn-quiet" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> All projects
        </button>
        <h2 id="details-title">{name}</h2>
        <code className="details-addr">{site}</code>
        <div className="details-actions">
          <button
            className="btn btn-small btn-primary"
            onClick={() => void run(openProject(name, addressReady ? "url" : "local"))}
          >
            <ExternalLink size={13} aria-hidden="true" /> Open site
          </button>
          {editors[0] && (
            <button className="btn btn-small" onClick={() => void run(openInEditor(name, editors[0].id))}>
              <Code2 size={13} aria-hidden="true" /> {editors[0].name}
            </button>
          )}
          <MoreMenu
            label={`More for ${name}`}
            items={[
              ...editors.slice(1).map((e) => ({
                label: `Open in ${e.name}`,
                icon: <Code2 size={14} aria-hidden="true" />,
                onSelect: () => void run(openInEditor(name, e.id)),
              })),
              {
                label: "Open a terminal here",
                icon: <SquareTerminal size={14} aria-hidden="true" />,
                onSelect: () => void run(openTerminalWindow(name)),
              },
              {
                label: "Show the folder",
                icon: <FolderOpen size={14} aria-hidden="true" />,
                onSelect: () => void run(openProject(name, "folder")),
              },
            ]}
          />
        </div>
      </div>

      <div className="log-tabs details-tabs" role="tablist" aria-label="Project">
        {(
          [
            ["overview", "Overview"],
            ["share", "Share"],
            ["env", "Settings (.env)"],
            ["laravel", "Laravel"],
            ["manage", "Rename or delete"],
          ] as const
        )
          .filter(([id]) => id !== "laravel" || info?.laravel != null)
          .map(([id, label]) => (
            <button
              key={id}
              role="tab"
              className="log-tab"
              data-guide={`tab-${id}`}
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
              {id === "overview" && ((info?.site.needs_choice && !info.site.chosen) || !!info?.setup.length) && (
                <span className="details-tab-dot" aria-label="needs attention" />
              )}
            </button>
          ))}
      </div>

      {feedback("top")}

      {tab === "overview" && (
        <>
          {info && <SetupPanel name={name} tasks={info.setup} onDone={load} />}
          {info && <TeamSetupCard name={name} />}
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
                <dd>
                  {info.database ? <code>{info.database}</code> : <span className="muted">None set in its config</span>}{" "}
                  {!pickDb && (
                    <button className="btn btn-small" onClick={() => setPickDb(true)}>
                      {info.database ? "Change…" : "Connect a database…"}
                    </button>
                  )}
                </dd>
              </div>
              <div>
                <dt>Git</dt>
                <dd>
                  {info.git ? (
                    <>
                      <GitBranch size={13} aria-hidden="true" /> <code>{info.git.branch}</code>
                      <span className="muted">
                        {" "}
                        ·{" "}
                        {info.git.changes === 0
                          ? "nothing to commit"
                          : `${info.git.changes} changed file${info.git.changes === 1 ? "" : "s"}`}
                      </span>
                    </>
                  ) : (
                    <span className="muted">Not a Git repository</span>
                  )}
                </dd>
              </div>
            </dl>
          )}
          {info && pickDb && (
            <UseInProject
              project={name}
              engine={currentEngine()}
              title="Connect a database"
              onClose={() => setPickDb(false)}
              onDone={load}
            />
          )}

          {info && (info.site.needs_choice || info.site.folders.length > 0 || info.site.chosen) && (
            <div className="details-section">
              <h3>Site folder</h3>
              <p className={info.site.needs_choice && !info.site.chosen ? "share-note" : "field-hint"}>
                {info.site.needs_choice && !info.site.chosen
                  ? `${name} keeps its apps in subfolders, so its address only lists files. Pick the folder that is the website.`
                  : `The folder ${name}.test and its shared address open. The rest of the project stays out of reach.`}
              </p>
              <div className="details-row">
                <select
                  className="input input-medium"
                  value={siteFolder}
                  onChange={(e) => setSiteFolder(e.target.value)}
                  disabled={!!busy}
                  aria-label="Site folder"
                >
                  <option value="">
                    The project folder
                    {info.kind === "laravel" ? " (its public folder)" : ""}
                  </option>
                  {info.site.folders.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path} · {f.label}
                    </option>
                  ))}
                  {info.site.chosen && !info.site.folders.some((f) => f.path === info.site.chosen) && (
                    <option value={info.site.chosen}>{info.site.chosen}</option>
                  )}
                </select>
                <button
                  className="btn"
                  disabled={!!busy || siteFolder === (info.site.chosen ?? "")}
                  onClick={() =>
                    void act(
                      "Saving; the web server restarts…",
                      async () => {
                        await setProjectSite(name, siteFolder || null);
                        load();
                      },
                      siteFolder ? `${name} now opens ${siteFolder}.` : `${name} opens its project folder again.`,
                      "site",
                    )
                  }
                >
                  Use this folder
                </button>
              </div>
              {feedback("site")}
              {info.site.dev_apps.length > 0 && (
                <p className="field-hint">
                  {info.site.dev_apps.map((d) => `${d.path || name} is a ${d.label} app`).join(", ")}: it runs on its
                  own dev server. Start it in the Terminal, then share it below with "Share a dev server".
                </p>
              )}
            </div>
          )}

          {info && (
            <div className="details-section">
              <h3>PHP version</h3>
              <p className="field-hint">
                The website, its terminal and Composer all use this version. Install more versions on the Versions page.
              </p>
              <div className="details-row">
                <select
                  className="input input-medium"
                  value={php}
                  onChange={(e) => setPhp(e.target.value)}
                  disabled={!!busy}
                >
                  <option value="">
                    NexDB default
                    {info.php.default ? ` (PHP ${info.php.default})` : ""}
                  </option>
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
                      "php",
                    )
                  }
                >
                  Use this version
                </button>
              </div>
              {feedback("php")}
              {info.php.current && (
                <details className="ver-php-settings">
                  <summary>PHP {info.php.current} extensions and settings</summary>
                  <PhpSettingsPanel version={info.php.current} />
                </details>
              )}
              {info.php.installed.length < 2 && (
                <p className="field-hint">
                  Only one PHP version is installed. Add another on the Versions page to choose here.
                </p>
              )}
            </div>
          )}

          {info && <NodeSection name={name} node={info.node} busy={!!busy} onChanged={load} />}
        </>
      )}

      {tab === "share" && (
        <SharePanel
          name={name}
          devApps={info?.site.dev_apps ?? []}
          needsSite={!!info?.site.needs_choice && !info.site.chosen}
        />
      )}

      {tab === "env" && <EnvEditor key={name} project={name} />}

      {tab === "laravel" && info?.laravel != null && <LaravelPanel name={name} folder={info.laravel} />}

      {tab === "manage" && (
        <>
          <div className="details-section">
            <h3>Rename</h3>
            <form
              className="details-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (newName === name || renameProblem) return;
                void act(
                  "Renaming…",
                  async () => {
                    await renameProject(name, newName);
                    await onChanged(newName, `Renamed to ${newName}. Its address is now ${newName}.test.`);
                  },
                  undefined,
                  "rename",
                );
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
            {feedback("rename")}
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
                  void act(
                    `Deleting ${name}…`,
                    async () => {
                      const warning = await deleteProject(name, dropDb);
                      await onChanged(
                        null,
                        `${name} is in the Recycle Bin; restore it from Recycle Bin above.${warning ? " " + warning : ""}`,
                      );
                    },
                    undefined,
                    "delete",
                  );
                }}
              >
                <label className="field">
                  <span className="field-label">
                    Moves <strong>{name}</strong> to the Recycle Bin. Type its name to confirm.
                  </span>
                  <input
                    className="input"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoFocus
                    spellCheck={false}
                  />
                </label>
                {info?.database && (
                  <label className="set-check backup-first">
                    <input type="checkbox" checked={dropDb} onChange={(e) => setDropDb(e.target.checked)} />
                    <span>
                      Also delete its database <code>{info.database}</code> and its MySQL user (this can't be undone;
                      back it up first on the Database page if you might need it)
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
            {feedback("delete")}
          </div>
        </>
      )}
    </section>
  );
}

/** Node.js for this project: what its .nvmrc asks for, what it runs on, and a way to change it. */
function NodeSection({
  name,
  node,
  busy,
  onChanged,
}: {
  name: string;
  node: import("../lib/projects").NodeChoice;
  busy: boolean;
  onChanged: () => void;
}) {
  const [pick, setPick] = useState(node.using ?? "");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setPick(node.using ?? ""), [node.using]);

  if (node.installed.length === 0) return null;
  const major = (v: string) => v.split(".")[0];
  return (
    <div className="details-section" data-guide="node-section">
      <h3>Node.js version</h3>
      <p className="field-hint">
        {node.wanted ? (
          <>
            <code>{node.file}</code> asks for Node <strong>{node.wanted}</strong>. Its terminal and npm use{" "}
            {node.using ? `Node ${node.using}` : "the default"}.
          </>
        ) : (
          <>Uses NexDB's default, Node {node.default}. Pick a version to save it in the project's .nvmrc.</>
        )}
      </p>
      {node.missing && (
        <p className="notice notice-warn" role="status">
          Node {node.wanted} isn't installed, so this project uses Node {node.default} for now. Install Node{" "}
          {major(node.wanted ?? "")} on the Versions page.
        </p>
      )}
      <div className="details-row">
        <select
          className="input input-medium"
          aria-label={`Node.js version for ${name}`}
          value={pick}
          disabled={busy || working}
          onChange={(e) => setPick(e.target.value)}
        >
          {node.installed.map((v) => (
            <option key={v} value={v}>
              Node {v}
              {v === node.default ? " (default)" : ""}
            </option>
          ))}
        </select>
        <button
          className="btn"
          disabled={busy || working || (pick === node.using && !node.missing)}
          data-working={working || undefined}
          onClick={async () => {
            setWorking(true);
            setMessage(null);
            try {
              await setProjectNode(name, pick);
              setMessage({
                ok: true,
                text: `Saved Node ${pick} in ${name}/.nvmrc. Open a new terminal tab to use it.`,
              });
              onChanged();
            } catch (e) {
              setMessage({ ok: false, text: String(e) });
            } finally {
              setWorking(false);
            }
          }}
        >
          {working ? "Saving…" : "Use this version"}
        </button>
      </div>
      {message && (
        <p className={message.ok ? "field-hint hint-ok" : "field-error"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
