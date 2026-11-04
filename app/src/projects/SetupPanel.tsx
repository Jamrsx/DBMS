import { runTask, useTask } from "../lib/tasks";
import { CheckCircle2, Circle, LoaderCircle, Wrench } from "lucide-react";
import { Nex, type NexState } from "../components/Nex";
import { nexCelebrate, nexOops } from "../lib/nex";
import { onQuickstart, setupProject, type SetupTask } from "../lib/projects";

/** For a cloned project: what it still needs (packages, .env, app key) and one button to do it. */
/** What the setup task keeps, so the panel shows it again after leaving the page. */
interface SetupData {
  state: Record<number, "running" | "done">;
  lines: string[];
  notes: string[];
}

/** For a cloned project: what it still needs (packages, .env, app key) and one button to do it. */
export function SetupPanel({ name, tasks, onDone }: { name: string; tasks: SetupTask[]; onDone: () => void }) {
  const id = `setup:${name}`;
  const task = useTask<SetupData>(id);
  const running = task?.status === "running";
  const state = task?.data.state ?? {};
  const lines = task?.data.lines ?? [];
  const finished = task?.status === "done";
  const notes = finished ? task.data.notes : [];
  const error = task?.status === "failed" ? task.message : null;

  async function run() {
    const labels = tasks.map((t) => t.label);
    await runTask<SetupData, string[]>(
      id,
      `Set up ${name}`,
      { state: {}, lines: [], notes: [] },
      async (update) => {
        // The listener belongs to the task, so it keeps going on other pages.
        const unlisten = await onQuickstart((e) => {
          if (e.name !== name) return;
          if (e.kind === "step")
            update({
              data: (d) => ({ ...d, state: { ...d.state, [e.index]: e.status } }),
              ...(e.status === "running" ? { detail: labels[e.index] ?? null } : {}),
            });
          if (e.kind === "line") update({ data: (d) => ({ ...d, lines: [...d.lines.slice(-5), e.text] }) });
        });
        try {
          const result = await setupProject(name);
          update({ data: (d) => ({ ...d, notes: result }) });
          nexCelebrate(`${name} is set up.`);
          onDone();
          return result;
        } catch (e) {
          nexOops(`Setting up ${name} stopped.`);
          throw e;
        } finally {
          unlisten();
        }
      },
      () => `${name} is set up.`,
    ).catch(() => {});
  }

  if (tasks.length === 0 && notes.length === 0 && !finished) return null;
  // Nex says where things stand: worried before, hopping while it waits, happy when done.
  const [mood, say]: [NexState, string] = error
    ? ["error", "Oh no, setting up stopped. The reason is below; fix it and try again."]
    : running
      ? ["loading", "Installing… I'll wait right here. This can take a few minutes the first time."]
      : finished || tasks.length === 0
        ? ["success", `All set! ${name} is ready. Time to start coding.`]
        : ["thinking", `Oh no! ${name} isn't installed yet, so its pages show errors. Set it up to start coding.`];
  return (
    <div className="details-section setup">
      <h3>Set up this project</h3>
      <div className="setup-nex" role="status">
        <Nex state={mood} size={72} />
        <p className="setup-say">{say}</p>
      </div>
      {tasks.length > 0 ? (
        <>
          <ul className="setup-steps">
            {tasks.map((t, i) => (
              <li key={i} className={state[i] ? `setup-${state[i]}` : undefined}>
                {state[i] === "done" ? (
                  <CheckCircle2 size={15} aria-hidden="true" />
                ) : state[i] === "running" ? (
                  <LoaderCircle size={15} className="status-spin" aria-hidden="true" />
                ) : (
                  <Circle size={15} aria-hidden="true" />
                )}
                <span>{t.label}</span>
              </li>
            ))}
          </ul>
          {running && lines.length > 0 && <pre className="setup-log">{lines.join("\n")}</pre>}
          <button className="btn btn-primary" disabled={running} onClick={() => void run()}>
            <Wrench size={14} aria-hidden="true" /> {running ? "Setting up…" : "Set up now"}
          </button>
          <p className="field-hint">
            Downloads packages, so it takes a few minutes the first time. An existing database is kept as it is.
          </p>
        </>
      ) : null}
      {notes.map((n) => (
        <p key={n} className="field-hint">
          {n}
        </p>
      ))}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
