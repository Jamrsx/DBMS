import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Code2, ExternalLink, FolderOpen, FolderPlus, ShieldCheck, SquareTerminal } from "lucide-react";
import {
  fixPhpWarnings,
  listEditors,
  listProjects,
  openInEditor,
  openProject,
  syncHosts,
  type Editor,
  type Project,
  type ProjectsInfo,
} from "../lib/projects";
import { openTerminalWindow } from "../lib/terminal";
import { inDesktopApp } from "../lib/scan";
import { NewProjectWizard } from "./NewProjectWizard";
import { ProjectDetails } from "./ProjectDetails";

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
  const [editors, setEditors] = useState<Editor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

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
    if (!active) return;
    void refresh();
    listEditors()
      .then(setEditors)
      .catch(() => setEditors([]));
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

  async function fixPhp(p: Project) {
    setError(null);
    try {
      const n = await fixPhpWarnings(p.name);
      setNotice(`Fixed ${p.name}: updated ${n} line${n === 1 ? "" : "s"}, so the "Deprecated" warnings are gone.`);
    } catch (e) {
      setError(String(e));
    }
    await refresh();
  }

  const act = (p: Promise<unknown>) => p.catch((e) => setError(String(e)));
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
        {notice && (
          <p className="set-ok" role="status">
            {notice}
          </p>
        )}

        {opened && (
          <ProjectDetails
            key={opened}
            name={opened}
            editors={editors}
            existing={projects.map((p) => p.name)}
            addressReady={!missing.has(`${opened}.test`)}
            onBack={() => setOpened(null)}
            onChanged={async (renamedTo) => {
              setOpened(renamedTo);
              await refresh();
            }}
          />
        )}

        {!opened && creating && (
          <NewProjectWizard
            existing={projects.map((p) => p.name)}
            editors={editors}
            addressReady={(name) => !missing.has(`${name}.test`)}
            onCreated={refresh}
            onClose={() => setCreating(false)}
          />
        )}

        {info && info.web_server && missing.size > 0 && (
          <div className="addr-banner">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>
              <strong>{missing.size === 1 ? "One address isn't" : `${missing.size} addresses aren't`} set up yet.</strong>{" "}
              Each project gets a private <code>name.test</code> address that only this PC knows. Windows asks once to
              add them; until then, projects open at <code>localhost/name</code>.
            </p>
            <button className="btn btn-primary" disabled={syncing} onClick={setUpAddresses}>
              {syncing ? "Waiting for Windows…" : "Set up addresses"}
            </button>
          </div>
        )}

        {!opened && info && projects.length === 0 && !creating && (
          <div className="empty">
            <p className="lede">
              No projects yet. Click <strong>New project</strong> for a ready-to-run Laravel, WordPress or React app, or
              run <code>git clone</code> in the terminal. Every folder in <code>{info.www_dir}</code> becomes a project.
            </p>
          </div>
        )}

        {!opened && projects.length > 0 && (
          <ul className="project-list" aria-label="Projects">
            {projects.map((p) => {
              const ready = p.host !== null && !missing.has(p.host);
              return (
                <li key={p.name} className="project">
                  <div className="project-main">
                    <button className="project-name cell-link" onClick={() => setOpened(p.name)} title="Details, PHP version, rename and delete">
                      {p.name}
                    </button>
                    <span className="kind">{KIND_LABEL[p.kind]}</span>
                  </div>
                  <code className="project-addr">
                    {ready ? p.url.replace(/^https?:\/\//, "").replace(/\/$/, "") : p.local_url.replace(/^http:\/\//, "")}
                  </code>
                  <div className="project-actions">
                    {editors.length > 0 && (
                      <EditorMenu editors={editors} onPick={(id) => void act(openInEditor(p.name, id))} />
                    )}
                    <button
                      className="btn btn-small btn-icon"
                      title="Open a terminal in this project"
                      aria-label={`Open a terminal in ${p.name}`}
                      onClick={() => void act(openTerminalWindow(p.name))}
                    >
                      <SquareTerminal size={14} aria-hidden="true" />
                    </button>
                    <button
                      className="btn btn-small"
                      disabled={!info?.web_server}
                      onClick={() => void act(openProject(p.name, ready ? "url" : "local"))}
                    >
                      <ExternalLink size={14} aria-hidden="true" /> Open
                    </button>
                    <button
                      className="btn btn-small btn-icon"
                      title="Show the folder"
                      aria-label={`Show the ${p.name} folder`}
                      onClick={() => void act(openProject(p.name, "folder"))}
                    >
                      <FolderOpen size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {p.php_warnings > 0 && (
                    <div className="project-warning">
                      <AlertTriangle size={14} aria-hidden="true" />
                      <p>
                        <strong>Shows "Deprecated" warnings on PHP 8.5.</strong> It uses older PHP names that still work
                        but print a warning on every page. NexDB can update {p.php_warnings === 1 ? "that line" : `those ${p.php_warnings} lines`}{" "}
                        so it works on every PHP version.
                      </p>
                      <button className="btn btn-small" onClick={() => void fixPhp(p)}>
                        Fix it
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

/** "Code" button: the first editor, or a short list when there are several. */
function EditorMenu({ editors, onPick }: { editors: Editor[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (editors.length === 1) {
    return (
      <button className="btn btn-small" title={`Open in ${editors[0].name}`} onClick={() => onPick(editors[0].id)}>
        <Code2 size={14} aria-hidden="true" /> {editors[0].name}
      </button>
    );
  }
  return (
    <div className="menu" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <button className="btn btn-small" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Code2 size={14} aria-hidden="true" /> Code
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {editors.map((e) => (
            <button
              key={e.id}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(e.id);
              }}
            >
              Open in {e.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
