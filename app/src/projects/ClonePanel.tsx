import { useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, GitBranch, LoaderCircle } from "lucide-react";
import { Nex } from "../components/Nex";
import { nexCelebrate, nexOops } from "../lib/nex";
import { cloneProject, nameFromRepo, nameProblem, onQuickstart, setupProject } from "../lib/projects";
import { dismissTask, runTask, useTask } from "../lib/tasks";

/** What the clone task keeps, so leaving this screen doesn't lose it. */
interface CloneData {
  name: string;
  steps: string[];
  state: Record<number, "running" | "done">;
  percent: number | null;
  line: string;
  notes: string[];
}
const TASK = "clone";

/** Clone a Git repository as a new project, then set it up (packages, .env, app key) in one go. */
export function ClonePanel({
  existing,
  onBack,
  onDone,
  onOpen,
}: {
  existing: string[];
  onBack: () => void;
  onDone: () => Promise<void> | void;
  onOpen: (name: string) => void;
}) {
  const task = useTask<CloneData>(TASK);
  const [url, setUrl] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [branch, setBranch] = useState("");
  const [setup, setSetup] = useState(true);

  const projectName = name ?? (url.trim() ? nameFromRepo(url) : "");
  const problem = nameProblem(projectName, existing);
  const urlProblem =
    url.trim() && !/^(https?:\/\/|ssh:\/\/|git@)\S+$/.test(url.trim())
      ? "Paste the repository's address, like https://github.com/you/app.git or git@github.com:you/app.git."
      : null;

  async function start() {
    const n = projectName;
    await runTask<CloneData, void>(
      TASK,
      `Clone ${n}`,
      { name: n, steps: ["Download the repository"], state: {}, percent: null, line: "", notes: [] },
      async (update) => {
        // Download, then setup: both report as quickstart events under the project's name.
        let offset = 0;
        let setupLabels: string[] = [];
        const unlisten = await onQuickstart((e) => {
          if (e.name !== n) return;
          if (e.kind === "plan" && offset > 0) {
            setupLabels = e.steps;
            update({ data: (d) => ({ ...d, steps: [d.steps[0], ...e.steps] }) });
          }
          if (e.kind === "step") {
            const i = e.index + offset;
            update({
              data: (d) => ({ ...d, state: { ...d.state, [i]: e.status }, percent: null }),
              ...(e.status === "running"
                ? { detail: offset === 0 ? "Downloading" : (setupLabels[e.index] ?? null), percent: null }
                : {}),
            });
          }
          if (e.kind === "percent" && offset === 0)
            update({ percent: e.percent, data: (d) => ({ ...d, percent: e.percent }) });
          if (e.kind === "line") update({ data: (d) => ({ ...d, line: e.text }) });
        });
        try {
          const needs = await cloneProject(url.trim(), n, branch.trim() || null);
          await onDone();
          if (setup && needs.length > 0) {
            offset = 1;
            const notes = await setupProject(n);
            update({ data: (d) => ({ ...d, notes }) });
          } else if (needs.length > 0) {
            update({
              data: (d) => ({ ...d, notes: ["It isn't set up yet; open it and press Set up now when you're ready."] }),
            });
          }
          await onDone();
          nexCelebrate(`${n} is cloned and ready.`);
        } catch (e) {
          nexOops(`Cloning ${n} stopped.`);
          throw e;
        } finally {
          unlisten();
        }
      },
      () => `${n} is ready.`,
    ).catch(() => {});
  }

  const running = task?.status === "running";
  const finished = task && task.status !== "running";

  return (
    <section className="bin import clone" aria-labelledby="clone-title">
      <div className="details-head">
        <button className="btn btn-small btn-quiet" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> All projects
        </button>
        <h2 id="clone-title">Clone from Git</h2>
      </div>

      {!task ? (
        <form
          className="clone-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() && !urlProblem && !problem && projectName) void start();
          }}
        >
          <label className="field">
            <span className="field-label">Repository address</span>
            <input
              className="input"
              value={url}
              autoFocus
              spellCheck={false}
              placeholder="https://github.com/you/app.git"
              aria-invalid={!!urlProblem}
              onChange={(e) => setUrl(e.target.value)}
            />
            <span className={urlProblem ? "field-error" : "field-hint"}>
              {urlProblem ?? "From GitHub, GitLab or any Git server. For a private one, Git asks you to sign in."}
            </span>
          </label>
          <div className="clone-row">
            <label className="field">
              <span className="field-label">Project name</span>
              <input
                className="input"
                value={projectName}
                spellCheck={false}
                aria-invalid={!!problem}
                onChange={(e) => setName(e.target.value.trim().toLowerCase())}
              />
              <span className={problem ? "field-error" : "field-hint"}>
                {problem ?? (projectName ? `Opens at ${projectName}.test.` : "Filled in from the address.")}
              </span>
            </label>
            <label className="field">
              <span className="field-label">
                Branch <span className="field-hint">(optional)</span>
              </span>
              <input
                className="input"
                value={branch}
                spellCheck={false}
                placeholder="its main branch"
                onChange={(e) => setBranch(e.target.value)}
              />
            </label>
          </div>
          <label className="set-check">
            <input type="checkbox" checked={setup} onChange={(e) => setSetup(e.target.checked)} />
            <span>
              <strong>Set it up after cloning</strong>
              <span className="field-hint">
                {" "}
                Installs its PHP and Node packages, makes its .env with a database user and its app key, as a cloned
                project needs.
              </span>
            </span>
          </label>
          <div className="share-row">
            <button className="btn btn-primary" type="submit" disabled={!url.trim() || !!urlProblem || !!problem}>
              <GitBranch size={14} aria-hidden="true" /> Clone {projectName || "project"}
            </button>
            <button className="btn btn-quiet" type="button" onClick={onBack}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="import-progress">
          <div className="setup-nex" role="status">
            <Nex state={running ? "loading" : task.status === "done" ? "success" : "error"} size={64} />
            <p className="setup-say">
              {running
                ? `Getting ${task.data.name}… this keeps going if you open another page.`
                : task.status === "done"
                  ? `${task.data.name} is ready. Time to start coding.`
                  : `Oh no, that stopped: ${task.message}`}
            </p>
          </div>
          <ul className="setup-steps">
            {task.data.steps.map((label, i) => (
              <li key={i} className={task.data.state[i] ? `setup-${task.data.state[i]}` : undefined}>
                {task.data.state[i] === "done" ? (
                  <CheckCircle2 size={15} aria-hidden="true" />
                ) : task.data.state[i] === "running" ? (
                  <LoaderCircle size={15} className="status-spin" aria-hidden="true" />
                ) : (
                  <Circle size={15} aria-hidden="true" />
                )}
                <span>
                  {label}
                  {i === 0 && task.data.state[0] === "running" && task.data.percent !== null
                    ? ` · ${task.data.percent}%`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          {running && task.data.line && <code className="import-line">{task.data.line}</code>}
          {task.data.notes.map((n) => (
            <p key={n} className="field-hint">
              {n}
            </p>
          ))}
          {finished && (
            <div className="share-row">
              {task.status === "done" && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    dismissTask(TASK);
                    onOpen(task.data.name);
                  }}
                >
                  Open {task.data.name}
                </button>
              )}
              <button className="btn" onClick={() => dismissTask(TASK)}>
                Clone another
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
