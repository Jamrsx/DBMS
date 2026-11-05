import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Code2,
  ExternalLink,
  FolderInput,
  GitBranch,
  FolderOpen,
  FolderPlus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import {
  fixPhpWarnings,
  listDeleted,
  listEditors,
  listProjects,
  openInEditor,
  openProject,
  restoreProject,
  syncHosts,
  type DeletedProject,
  type Editor,
  type Project,
  type ProjectsInfo,
} from "../lib/projects";
import { openTerminalWindow } from "../lib/terminal";
import { realDesktopApp } from "../lib/scan";
import { Nex } from "../components/Nex";
import { nexCelebrate, nexSay } from "../lib/nex";
import { formatWhen } from "../lib/backups";
import { NewProjectWizard } from "./NewProjectWizard";
import { ImportPanel } from "./ImportPanel";
import { ClonePanel } from "./ClonePanel";
import { MoreMenu } from "../components/MoreMenu";
import { ProjectDetails } from "./ProjectDetails";

const KIND_LABEL: Record<Project["kind"], string> = {
  laravel: "Laravel",
  wordpress: "WordPress",
  node: "Node",
  php: "PHP",
  html: "HTML",
  empty: "Empty",
};

export function Projects({
  active,
  onOpenTerminal,
  openRequest,
}: {
  active: boolean;
  onOpenTerminal: () => void;
  /** Opens this project's page, when another page asks (Check my setup). */
  openRequest?: { name: string; n: number } | null;
}) {
  const [info, setInfo] = useState<ProjectsInfo | null>(null);
  const [editors, setEditors] = useState<Editor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [showBin, setShowBin] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!openRequest) return;
    setOpened(openRequest.name);
    setShowBin(false);
    setImporting(false);
    setCreating(false);
  }, [openRequest]);
  const [deleted, setDeleted] = useState<DeletedProject[]>([]);

  const loadBin = useCallback(() => {
    listDeleted()
      .then(setDeleted)
      .catch(() => setDeleted([]));
  }, []);

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
    loadBin();
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
      nexCelebrate(`${p.name} is fixed. No more "Deprecated" warnings!`);
    } catch (e) {
      setError(String(e));
    }
    await refresh();
  }

  const act = (p: Promise<unknown>) => p.catch((e) => setError(String(e)));
  const missing = new Set(info?.missing_hosts ?? []);
  const projects = info?.projects ?? [];
  const q = query.trim().toLowerCase();
  const shown = q ? projects.filter((p) => p.name.toLowerCase().includes(q) || p.kind.includes(q)) : projects;

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
          <button
            className="btn"
            aria-pressed={importing}
            onClick={() => {
              setImporting((v) => !v);
              setOpened(null);
              setShowBin(false);
              setCreating(false);
            }}
          >
            <FolderInput size={14} aria-hidden="true" /> Import
          </button>
          <button
            className="btn"
            aria-pressed={cloning}
            title="Clone a Git repository as a new project and set it up"
            onClick={() => {
              setCloning((v) => !v);
              setImporting(false);
              setOpened(null);
              setShowBin(false);
              setCreating(false);
            }}
          >
            <GitBranch size={14} aria-hidden="true" /> Clone
          </button>
          <button
            className="btn btn-primary"
            data-guide="project-new"
            onClick={() => {
              setCreating((v) => !v);
              setOpened(null);
              setShowBin(false);
              setImporting(false);
            }}
            aria-expanded={creating}
          >
            <FolderPlus size={15} aria-hidden="true" /> New project
          </button>
          <MoreMenu
            label="More project actions"
            items={[
              {
                label: `Recycle Bin${deleted.length > 0 ? ` (${deleted.length})` : ""}`,
                icon: <Trash2 size={14} aria-hidden="true" />,
                onSelect: () => {
                  setShowBin(true);
                  setOpened(null);
                  setNotice(null);
                  setCreating(false);
                  setImporting(false);
                  loadBin();
                },
              },
              {
                label: "Open the terminal",
                icon: <SquareTerminal size={14} aria-hidden="true" />,
                onSelect: onOpenTerminal,
              },
            ]}
          />
        </div>
      </header>

      <div className="panel-body dash-body">
        {!realDesktopApp && (
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
            onChanged={async (renamedTo, message) => {
              setOpened(renamedTo);
              if (message) setNotice(message);
              if (message)
                nexSay(
                  renamedTo ? "success" : "idle",
                  renamedTo ? `Now it's ${renamedTo}.` : "Moved to the Recycle Bin. You can bring it back anytime.",
                );
              await refresh();
              loadBin();
            }}
          />
        )}

        {cloning && !opened && !showBin && (
          <ClonePanel
            existing={projects.map((p) => p.name)}
            onBack={() => setCloning(false)}
            onDone={refresh}
            onOpen={(name) => {
              setCloning(false);
              setOpened(name);
            }}
          />
        )}

        {importing && !opened && !showBin && (
          <ImportPanel existing={projects.map((p) => p.name)} onBack={() => setImporting(false)} onDone={refresh} />
        )}

        {showBin && !opened && (
          <RecycleBin
            items={deleted}
            onBack={() => setShowBin(false)}
            onRestore={async (item) => {
              setError(null);
              try {
                const name = await restoreProject(item.path);
                setNotice(`${name} is back in your projects.`);
                nexCelebrate(`${name} is back!`);
                setShowBin(false);
              } catch (e) {
                setError(String(e));
              }
              await refresh();
              loadBin();
            }}
          />
        )}

        {!opened && !showBin && !importing && !cloning && creating && (
          <NewProjectWizard
            existing={projects.map((p) => p.name)}
            editors={editors}
            addressReady={(name) => !missing.has(`${name}.test`)}
            onCreated={refresh}
            onClose={() => setCreating(false)}
          />
        )}

        {!showBin && !opened && !importing && !cloning && info && info.web_server && missing.size > 0 && (
          <div className="addr-banner">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>
              <strong>
                {missing.size === 1 ? "One address isn't" : `${missing.size} addresses aren't`} set up yet.
              </strong>{" "}
              Each project gets a private <code>name.test</code> address that only this PC knows. Windows asks once to
              add them; until then, projects open at <code>localhost/name</code>.
            </p>
            <button className="btn btn-primary" disabled={syncing} onClick={setUpAddresses}>
              {syncing ? "Waiting for Windows…" : "Set up addresses"}
            </button>
          </div>
        )}

        {!opened && !showBin && !importing && !cloning && info && projects.length === 0 && !creating && (
          <div className="empty empty-nex">
            <Nex state="idle" size={120} />
            <p className="lede">
              No projects yet. Click <strong>New project</strong> for a ready-to-run Laravel, WordPress or React app,
              <strong>Clone</strong> to bring one from GitHub, or <strong>Import</strong> to copy them from Laragon or
              XAMPP. Every folder in <code>{info.www_dir}</code> becomes a project.
            </p>
          </div>
        )}

        {!opened && !showBin && !importing && !cloning && projects.length > 5 && (
          <div className="project-search">
            <Search size={14} aria-hidden="true" />
            <input
              className="input"
              type="search"
              placeholder={`Search ${projects.length} projects`}
              aria-label="Search projects"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

        {!opened && !showBin && !importing && !cloning && projects.length > 0 && shown.length === 0 && (
          <p className="field-hint">
            No project matches "{query}".{" "}
            <button className="btn btn-small btn-quiet" onClick={() => setQuery("")}>
              Show all
            </button>
          </p>
        )}

        {!opened && !showBin && !importing && !cloning && shown.length > 0 && (
          <ul className="project-list" aria-label="Projects">
            {shown.map((p) => {
              const ready = p.host !== null && !missing.has(p.host);
              return (
                <li key={p.name} className="project">
                  <div className="project-main">
                    <button
                      className="project-name cell-link"
                      title={`Open ${p.name}'s details`}
                      onClick={() => {
                        setOpened(p.name);
                        setNotice(null);
                      }}
                    >
                      {p.name}
                    </button>
                    <span className="kind">{KIND_LABEL[p.kind]}</span>
                    {p.needs_setup && (
                      <span className="tag tag-warn" title="It still needs packages, a .env or its app key">
                        Needs setup
                      </span>
                    )}
                    {p.shared && <span className="tag tag-ok">Shared</span>}
                    {p.php && <span className="tag">PHP {p.php}</span>}
                  </div>
                  <code className="project-addr">
                    {ready
                      ? p.url.replace(/^https?:\/\//, "").replace(/\/$/, "")
                      : p.local_url.replace(/^http:\/\//, "")}
                  </code>
                  <div className="project-actions">
                    <button
                      className="btn btn-small"
                      disabled={!info?.web_server}
                      title={ready ? `Open ${p.url}` : `Open ${p.local_url}`}
                      onClick={() => void act(openProject(p.name, ready ? "url" : "local"))}
                    >
                      <ExternalLink size={14} aria-hidden="true" /> Open
                    </button>
                    <MoreMenu
                      label={`More for ${p.name}`}
                      items={[
                        {
                          label: "Details, PHP and sharing",
                          icon: <Settings2 size={14} aria-hidden="true" />,
                          onSelect: () => {
                            setOpened(p.name);
                            setNotice(null);
                          },
                        },
                        ...editors.map((e) => ({
                          label: `Open in ${e.name}`,
                          icon: <Code2 size={14} aria-hidden="true" />,
                          onSelect: () => void act(openInEditor(p.name, e.id)),
                        })),
                        {
                          label: "Open a terminal here",
                          icon: <SquareTerminal size={14} aria-hidden="true" />,
                          onSelect: () => void act(openTerminalWindow(p.name)),
                        },
                        {
                          label: "Show the folder",
                          icon: <FolderOpen size={14} aria-hidden="true" />,
                          onSelect: () => void act(openProject(p.name, "folder")),
                        },
                      ]}
                    />
                  </div>
                  {p.php_warnings > 0 && (
                    <div className="project-warning">
                      <AlertTriangle size={14} aria-hidden="true" />
                      <p>
                        <strong>Shows "Deprecated" warnings on PHP 8.5.</strong> It uses older PHP names that still work
                        but print a warning on every page. NexDB can update{" "}
                        {p.php_warnings === 1 ? "that line" : `those ${p.php_warnings} lines`} so it works on every PHP
                        version.
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

/** Projects that went to the Windows Recycle Bin from the projects folder, ready to come back. */
function RecycleBin({
  items,
  onBack,
  onRestore,
}: {
  items: DeletedProject[];
  onBack: () => void;
  onRestore: (item: DeletedProject) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <section className="bin" aria-labelledby="bin-title">
      <div className="details-head">
        <button className="btn btn-small btn-quiet" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> All projects
        </button>
        <h2 id="bin-title">Recycle Bin</h2>
      </div>
      {items.length === 0 ? (
        <div className="empty empty-nex">
          <Nex state="sleeping" size={110} />
          <p className="lede">Nothing here. Projects you delete in NexDB wait here so you can bring them back.</p>
        </div>
      ) : (
        <>
          <p className="field-hint">
            Projects deleted from your projects folder. Restoring puts the folder back with the same name; its PHP
            version goes back to NexDB&apos;s default, and a deleted database doesn&apos;t come back.
          </p>
          <ul className="project-list" aria-label="Deleted projects">
            {items.map((item) => (
              <li key={item.path} className="project">
                <div className="project-main">
                  <span className="project-name">{item.name}</span>
                </div>
                <span className="field-hint">Deleted {formatWhen(item.deleted)}</span>
                <div className="project-actions">
                  <button
                    className="btn btn-small"
                    disabled={!!busy}
                    onClick={async () => {
                      setBusy(item.path);
                      await onRestore(item);
                      setBusy(null);
                    }}
                  >
                    <RotateCcw size={14} aria-hidden="true" /> {busy === item.path ? "Restoring…" : "Restore"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
