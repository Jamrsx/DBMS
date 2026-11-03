import { useEffect, useState } from "react";
import { CheckCircle2, Circle, LoaderCircle, Wrench } from "lucide-react";
import { Nex, type NexState } from "../components/Nex";
import { nexCelebrate, nexOops } from "../lib/nex";
import { onQuickstart, setupProject, type SetupTask } from "../lib/projects";

/** For a cloned project: what it still needs (packages, .env, app key) and one button to do it. */
export function SetupPanel({ name, tasks, onDone }: { name: string; tasks: SetupTask[]; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<Record<number, "running" | "done">>({});
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const off = onQuickstart((e) => {
      if (e.name !== name) return;
      if (e.kind === "step") setState((s) => ({ ...s, [e.index]: e.status }));
      if (e.kind === "line") setLines((l) => [...l.slice(-5), e.text]);
    });
    return () => void off.then((f) => f());
  }, [name]);

  async function run() {
    setRunning(true);
    setError(null);
    setFinished(false);
    setState({});
    setLines([]);
    try {
      const result = await setupProject(name);
      setNotes(result);
      setFinished(true);
      nexCelebrate(`${name} is set up.`);
      onDone();
    } catch (e) {
      setError(String(e));
      nexOops(`Setting up ${name} stopped.`);
    } finally {
      setRunning(false);
    }
  }

  if (tasks.length === 0 && notes.length === 0 && !finished) return null;
  // Nex says where things stand: worried before, hopping while it waits, happy when done.
  const [mood, say]: [NexState, string] = error
    ? ["error", "Oh no, setting up stopped. The reason is below; fix it and try again."]
    : running
      ? ["loading", "Installing… I'll wait right here. This can take a few minutes the first time."]
      : tasks.length === 0
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
