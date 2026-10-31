import { useCallback, useEffect, useState } from "react";
import { Check, Circle, ExternalLink, FolderOpen, FolderPlus, LoaderCircle, ShieldCheck, SquareTerminal, X } from "lucide-react";
import {
  createProject,
  isStarter,
  listProjects,
  nameProblem,
  onQuickstart,
  openProject,
  quickstart,
  STARTERS,
  syncHosts,
  type Created,
  type NewKind,
  type Starter,
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
            onCreated={refresh}
            onClose={() => setCreating(false)}
            onOpenTerminal={onOpenTerminal}
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

type Kind = NewKind | Starter;

interface Progress {
  steps: string[];
  /** Index of the step running now; steps before it are done. */
  at: number;
  lines: string[];
  outcome: { ok: true; created: Created } | { ok: false; error: string } | null;
}

function NewProject({
  existing,
  onCreated,
  onClose,
  onOpenTerminal,
}: {
  existing: string[];
  onCreated: () => Promise<void>;
  onClose: () => void;
  onOpenTerminal: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("php");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const problem = nameProblem(name, existing);
  const starter = isStarter(kind) ? STARTERS.find((s) => s.id === kind) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || problem) return;
    setBusy(true);
    setError(null);
    if (isStarter(kind)) {
      setProgress({ steps: [], at: 0, lines: [], outcome: null });
      // Listen before starting, so the first steps aren't missed.
      const unlisten = await onQuickstart((ev) => {
        if (ev.name !== name) return;
        setProgress((p) => {
          if (!p) return p;
          if (ev.kind === "plan") return { ...p, steps: ev.steps, at: 0 };
          if (ev.kind === "step") return { ...p, at: ev.status === "done" ? ev.index + 1 : ev.index };
          return { ...p, lines: [...p.lines.slice(-400), ev.text] };
        });
      });
      try {
        const created = await quickstart(name, kind);
        setProgress((p) => p && { ...p, at: p.steps.length, outcome: { ok: true, created } });
        await onCreated();
      } catch (err) {
        setProgress((p) => p && { ...p, outcome: { ok: false, error: String(err) } });
      } finally {
        unlisten();
        setBusy(false);
      }
      return;
    }
    try {
      await createProject(name, kind);
      await onCreated();
      onClose();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  if (progress) {
    return (
      <QuickstartProgress
        name={name}
        label={starter?.label ?? kind}
        progress={progress}
        onOpenTerminal={onOpenTerminal}
        onClose={onClose}
        onBack={() => setProgress(null)}
      />
    );
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
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <optgroup label="Simple">
            <option value="php">PHP page</option>
            <option value="html">HTML page</option>
            <option value="empty">Empty folder</option>
          </optgroup>
          <optgroup label="Ready-to-run starters">
            {STARTERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <button className="btn btn-primary" type="submit" disabled={!name || !!problem || busy}>
        {busy ? "Creating…" : "Create"}
      </button>
      {starter && (
        <p className="field-hint new-project-note">
          NexDB downloads {starter.label} and sets it up for you; this takes a few minutes and needs the internet. Uses{" "}
          {starter.needs}.
          {(kind.startsWith("laravel") || kind === "wordpress") &&
            " It gets its own database and MySQL user, so your MySQL password is never written into the project."}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function QuickstartProgress({
  name,
  label,
  progress,
  onOpenTerminal,
  onClose,
  onBack,
}: {
  name: string;
  label: string;
  progress: Progress;
  onOpenTerminal: () => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const [details, setDetails] = useState(false);
  const { steps, at, lines, outcome } = progress;
  const failed = outcome && !outcome.ok;
  return (
    <section className="quickstart" aria-live="polite">
      <h2 className="quickstart-title">
        {outcome?.ok ? `${name} is ready` : failed ? `${name} couldn't be made` : `Making ${name} (${label})…`}
      </h2>
      <ol className="quickstart-steps">
        {steps.map((step, i) => {
          const state = i < at ? "done" : i === at && failed ? "failed" : i === at && !outcome ? "running" : "waiting";
          return (
            <li key={step} className={`quickstart-step ${state}`}>
              {state === "done" && <Check size={14} aria-hidden="true" />}
              {state === "running" && <LoaderCircle size={14} className="status-spin" aria-hidden="true" />}
              {state === "failed" && <X size={14} aria-hidden="true" />}
              {state === "waiting" && <Circle size={14} aria-hidden="true" />}
              <span>{step}</span>
            </li>
          );
        })}
        {steps.length === 0 && !outcome && <li className="quickstart-step running">Getting ready…</li>}
      </ol>

      {failed && (
        <p className="field-error" role="alert">
          {outcome.error} Nothing was left behind, so you can try again.
        </p>
      )}
      {outcome?.ok && (
        <p className="set-ok quickstart-done">
          {outcome.created.run_hint
            ? `Start it from the Terminal: open the ${name} folder and run ${outcome.created.run_hint}.`
            : `Open http://${name}.test/ in your browser.`}
          {outcome.created.database && ` Its database is ${outcome.created.database}.`}
        </p>
      )}

      <div className="quickstart-actions">
        {lines.length > 0 && (
          <button className="btn btn-small btn-quiet" onClick={() => setDetails((d) => !d)} aria-expanded={details}>
            {details ? "Hide details" : "Show details"}
          </button>
        )}
        <span className="quickstart-spacer" />
        {failed && (
          <button className="btn btn-small" onClick={onBack}>
            Back
          </button>
        )}
        {outcome?.ok && outcome.created.run_hint && (
          <button className="btn btn-small" onClick={onOpenTerminal}>
            <SquareTerminal size={13} aria-hidden="true" /> Open terminal
          </button>
        )}
        {outcome?.ok && !outcome.created.run_hint && (
          <button className="btn btn-small" onClick={() => void openProject(name, "url")}>
            <ExternalLink size={13} aria-hidden="true" /> Open site
          </button>
        )}
        {outcome && (
          <button className="btn btn-small btn-primary" onClick={onClose}>
            Done
          </button>
        )}
      </div>
      {details && <pre className="quickstart-log">{lines.join("\n")}</pre>}
    </section>
  );
}
