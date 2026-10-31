import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FolderOpen, FolderPlus, ShieldCheck } from "lucide-react";
import {
  createProject,
  listProjects,
  nameProblem,
  openProject,
  syncHosts,
  type NewKind,
  type Project,
  type ProjectsInfo,
} from "../lib/projects";
import { inDesktopApp } from "../lib/scan";

const KIND_LABEL: Record<Project["kind"], string> = {
  laravel: "Laravel",
  wordpress: "WordPress",
  node: "Node",
  php: "PHP",
  html: "HTML",
  empty: "Empty",
};

export function Projects({ active, onOpenTerminal }: { active: boolean; onOpenTerminal: () => void }) {
  const [info, setInfo] = useState<ProjectsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setInfo(await listProjects());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Reload whenever the page is shown, so folders made in the terminal appear.
  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  async function setUpAddresses() {
    setSyncing(true);
    setError(null);
    try {
      await syncHosts();
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
      await refresh();
    }
  }

  const missing = new Set(info?.missing_hosts ?? []);
  const projects = info?.projects ?? [];

  return (
    <main className="panel">
      <header className="panel-head dash-head">
        <div>
          <h1>Projects</h1>
          <p className="dash-summary" role="status">
            {info ? `${projects.length} in ${info.www_dir}` : "Loading projects…"}
          </p>
        </div>
        <div className="dash-actions">
          <button className="btn" onClick={onOpenTerminal}>
            Open terminal
          </button>
          <button className="btn btn-primary" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
            <FolderPlus size={15} aria-hidden="true" /> New project
          </button>
        </div>
      </header>

      <div className="panel-body dash-body">
        {!inDesktopApp && (
          <p className="notice" role="note">
            Browser preview: projects are simulated.
          </p>
        )}
        {error && (
          <div className="error-box" role="alert">
            <p>{error}</p>
          </div>
        )}

        {creating && (
          <NewProject
            existing={projects.map((p) => p.name)}
            onDone={async () => {
              setCreating(false);
              await refresh();
            }}
          />
        )}

        {info && info.web_server && missing.size > 0 && (
          <div className="addr-banner">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>
              <strong>{missing.size === 1 ? "One address isn't" : `${missing.size} addresses aren't`} set up yet.</strong>{" "}
              Windows asks once for permission to add <code>.test</code> names. Until then, projects open at{" "}
              <code>localhost/name</code>.
            </p>
            <button className="btn btn-primary" disabled={syncing} onClick={setUpAddresses}>
              {syncing ? "Waiting for Windows…" : "Set up addresses"}
            </button>
          </div>
        )}

        {info && projects.length === 0 && (
          <div className="empty">
            <p className="lede">
              No projects yet. Create one, or run <code>git clone</code> in the terminal. Every folder in{" "}
              <code>{info.www_dir}</code> becomes a project.
            </p>
          </div>
        )}

        {projects.length > 0 && (
          <ul className="project-list" aria-label="Projects">
            {projects.map((p) => {
              const ready = p.host !== null && !missing.has(p.host);
              return (
                <li key={p.name} className="project">
                  <div className="project-main">
                    <span className="project-name">{p.name}</span>
                    <span className="kind">{KIND_LABEL[p.kind]}</span>
                  </div>
                  <code className="project-addr">
                    {ready ? p.url.replace(/^http:\/\//, "").replace(/\/$/, "") : p.local_url.replace(/^http:\/\//, "")}
                  </code>
                  <div className="project-actions">
                    <button
                      className="btn btn-small"
                      disabled={!info?.web_server}
                      onClick={() => openProject(p.name, ready ? "url" : "local").catch((e) => setError(String(e)))}
                    >
                      <ExternalLink size={14} aria-hidden="true" /> Open
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() => openProject(p.name, "folder").catch((e) => setError(String(e)))}
                    >
                      <FolderOpen size={14} aria-hidden="true" /> Folder
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

function NewProject({ existing, onDone }: { existing: string[]; onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<NewKind>("php");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = nameProblem(name, existing);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || problem) return;
    setBusy(true);
    setError(null);
    try {
      await createProject(name, kind);
      await onDone();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  return (
    <form className="new-project" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Project name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value.trim())}
          placeholder="my-shop"
          autoFocus
          spellCheck={false}
          aria-invalid={!!problem}
          aria-describedby="np-hint"
        />
        <span id="np-hint" className={problem ? "field-error" : "field-hint"}>
          {problem ?? (name ? `Address: ${name}.test` : "Lowercase letters, numbers and hyphens.")}
        </span>
      </label>
      <label className="field">
        <span className="field-label">Starts as</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as NewKind)}>
          <option value="php">PHP page</option>
          <option value="html">HTML page</option>
          <option value="empty">Empty folder</option>
        </select>
      </label>
      <button className="btn btn-primary" type="submit" disabled={!name || !!problem || busy}>
        {busy ? "Creating…" : "Create"}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
