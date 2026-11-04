import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, Database, Download, FolderInput, LoaderCircle } from "lucide-react";
import { Nex } from "../components/Nex";
import { nexCelebrate, nexOops } from "../lib/nex";
import { onQuickstart } from "../lib/projects";
import { dismissTask, runTask, useTask } from "../lib/tasks";
import { importDatabases, importSources, runImport, type ImportServer, type ImportSource } from "../lib/importer";

/** What the import task keeps. */
interface ImportData {
  steps: string[];
  state: Record<number, "running" | "done">;
  line: string;
  notes: string[];
}
const TASK = "import";

const ENGINE: Record<ImportServer["engine"], string> = { mysql: "MySQL", mariadb: "MariaDB", postgres: "PostgreSQL" };

/** Copies projects and databases from Laragon, XAMPP, WAMP and other database servers. */
export function ImportPanel({
  existing,
  onBack,
  onDone,
}: {
  existing: string[];
  onBack: () => void;
  onDone: () => void;
}) {
  const [sources, setSources] = useState<ImportSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Picked projects: source path -> name in NexDB.
  const [projects, setProjects] = useState<Record<string, string>>({});
  // Per server (by its bin folder): password, its databases once listed, and the picked ones.
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [listed, setListed] = useState<Record<string, string[]>>({});
  const [listing, setListing] = useState<string | null>(null);
  const [listError, setListError] = useState<Record<string, string>>({});
  const [dbs, setDbs] = useState<Record<string, string[]>>({});
  // The copy runs as a task, so leaving this screen (or the page) doesn't lose its progress.
  const task = useTask<ImportData>(TASK);
  const running = task?.status === "running";
  const steps = task?.data.steps ?? [];
  const state = task?.data.state ?? {};
  const line = task?.data.line ?? "";
  const notes = task?.status === "done" ? task.data.notes : null;

  useEffect(() => {
    importSources()
      .then(setSources)
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (task?.status === "failed") setError(task.message);
  }, [task?.status, task?.message]);

  const servers = useMemo(() => (sources ?? []).flatMap((s) => s.servers), [sources]);
  const pickedDbs = Object.values(dbs).reduce((n, l) => n + l.length, 0);
  const pickedProjects = Object.keys(projects).length;
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const clash = Object.values(projects).some((n) => !n.trim() || taken.has(n.trim().toLowerCase()));

  async function list(server: ImportServer) {
    setListing(server.bin);
    setListError((e) => ({ ...e, [server.bin]: "" }));
    try {
      const names = await importDatabases(server, passwords[server.bin] || null);
      setListed((l) => ({ ...l, [server.bin]: names }));
    } catch (e) {
      setListError((x) => ({ ...x, [server.bin]: String(e) }));
    } finally {
      setListing(null);
    }
  }

  async function start() {
    setError(null);
    const plan = {
      projects: Object.entries(projects).map(([path, name]) => ({ path, name: name.trim() })),
      databases: Object.entries(dbs).flatMap(([bin, names]) => {
        const server = servers.find((s) => s.bin === bin)!;
        return names.map((name) => ({ server, password: passwords[bin] || null, name }));
      }),
    };
    await runTask<ImportData, string[]>(
      TASK,
      "Import from other tools",
      { steps: [], state: {}, line: "", notes: [] },
      async (update) => {
        let labels: string[] = [];
        const unlisten = await onQuickstart((e) => {
          if (e.name !== "import") return;
          if (e.kind === "plan") {
            labels = e.steps;
            update({ data: (d) => ({ ...d, steps: e.steps }) });
          }
          if (e.kind === "step")
            update({
              data: (d) => ({ ...d, state: { ...d.state, [e.index]: e.status } }),
              ...(e.status === "running" ? { detail: labels[e.index] ?? null } : {}),
            });
          if (e.kind === "line") update({ data: (d) => ({ ...d, line: e.text }) });
        });
        try {
          const result = await runImport(plan);
          update({ data: (d) => ({ ...d, notes: result }) });
          nexCelebrate("Imported into NexDB.");
          onDone();
          return result;
        } catch (e) {
          nexOops("The import didn't work.");
          throw e;
        } finally {
          unlisten();
        }
      },
      () => "Copied into NexDB.",
    ).catch(() => {});
  }

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const serverNote = (s: ImportServer) =>
    s.same_port
      ? `Set to port ${s.port}, like NexDB's own ${ENGINE[s.engine]}, so they can't run at once. NexDB starts it briefly on a spare port to copy from it.`
      : s.running
        ? `Running on port ${s.port}.`
        : s.mysqld
          ? "Not running. NexDB starts it briefly on a spare port to copy from it."
          : `Not running. Start it in its own app (port ${s.port}), then show its databases.`;

  return (
    <section className="bin import" aria-labelledby="import-title">
      <div className="details-head">
        <button className="btn btn-small btn-quiet" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> All projects
        </button>
        <h2 id="import-title">Import from other tools</h2>
      </div>
      <p className="field-hint">
        Copies projects and databases from Laragon, XAMPP, WAMP and other MySQL, MariaDB or PostgreSQL installs on this
        PC into NexDB. The originals stay exactly where they are.
      </p>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {!sources ? (
        !error && (
          <p className="field-hint" role="status">
            <LoaderCircle size={13} className="status-spin" aria-hidden="true" /> Looking for Laragon, XAMPP, WAMP and
            database servers…
          </p>
        )
      ) : sources.length === 0 ? (
        <div className="empty empty-nex">
          <Nex state="sleeping" size={110} />
          <p className="lede">
            No Laragon, XAMPP, WAMP or other MySQL, MariaDB or PostgreSQL install found on this PC.
          </p>
        </div>
      ) : notes ? (
        <div className="import-done" role="status">
          <p className="set-ok">
            <CheckCircle2 size={14} aria-hidden="true" /> Done. Imported projects are in your list, and their sites are
            ready.
          </p>
          {notes.length > 0 && (
            <ul className="import-notes">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <button
            className="btn"
            onClick={() => {
              dismissTask(TASK);
              onBack();
            }}
          >
            Back to projects
          </button>
        </div>
      ) : running ? (
        <div className="import-progress" role="status">
          <ul className="setup-steps">
            {steps.map((label, i) => (
              <li key={i} className={state[i] ? `setup-${state[i]}` : undefined}>
                {state[i] === "done" ? (
                  <CheckCircle2 size={15} aria-hidden="true" />
                ) : state[i] === "running" ? (
                  <LoaderCircle size={15} className="status-spin" aria-hidden="true" />
                ) : (
                  <Circle size={15} aria-hidden="true" />
                )}
                <span>{label}</span>
              </li>
            ))}
          </ul>
          {line && <code className="import-line">{line}</code>}
        </div>
      ) : (
        <>
          {sources.map((src) => (
            <div key={src.id} className="share-public import-source">
              <h4>
                <FolderInput size={14} aria-hidden="true" /> {src.label}
                <span className="field-hint">{src.path}</span>
              </h4>

              {src.projects.length > 0 && (
                <fieldset className="import-group">
                  <legend>Projects in {src.www}</legend>
                  {src.projects.map((p) => {
                    const picked = projects[p.path] !== undefined;
                    const name = projects[p.path] ?? p.name;
                    const nameTaken = picked && taken.has(name.trim().toLowerCase());
                    return (
                      <div key={p.path} className="import-row">
                        <label>
                          <input
                            type="checkbox"
                            checked={picked}
                            onChange={() =>
                              setProjects((m) => {
                                const next = { ...m };
                                if (picked) delete next[p.path];
                                else next[p.path] = p.taken ? `${p.name}-imported` : p.name;
                                return next;
                              })
                            }
                          />{" "}
                          {p.name}
                          {p.kind !== "empty" && <span className="tag">{p.kind}</span>}
                        </label>
                        {picked && (
                          <span className="import-rename">
                            <span className="field-hint">as</span>
                            <input
                              className="input input-small"
                              aria-label={`Name for ${p.name} in NexDB`}
                              value={name}
                              onChange={(e) => setProjects((m) => ({ ...m, [p.path]: e.target.value }))}
                            />
                            {nameTaken && <span className="field-error">NexDB already has one with this name.</span>}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </fieldset>
              )}

              {src.servers.map((s) => (
                <fieldset key={s.bin} className="import-group">
                  <legend>
                    <Database size={13} aria-hidden="true" /> {ENGINE[s.engine]} {s.version ?? ""} databases
                  </legend>
                  <p className="field-hint">{serverNote(s)}</p>
                  {listed[s.bin] ? (
                    listed[s.bin].length === 0 ? (
                      <p className="field-hint">It has no databases of your own.</p>
                    ) : (
                      <div className="import-dbs">
                        {listed[s.bin].map((d) => (
                          <label key={d}>
                            <input
                              type="checkbox"
                              checked={(dbs[s.bin] ?? []).includes(d)}
                              onChange={() => setDbs((m) => ({ ...m, [s.bin]: toggle(m[s.bin] ?? [], d) }))}
                            />{" "}
                            {d}
                          </label>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="details-row">
                      <input
                        className="input input-medium"
                        type="password"
                        aria-label={`${s.user} password for ${ENGINE[s.engine]} on port ${s.port}`}
                        placeholder={`${s.user} password (empty in Laragon and XAMPP)`}
                        value={passwords[s.bin] ?? ""}
                        onChange={(e) => setPasswords((p) => ({ ...p, [s.bin]: e.target.value }))}
                      />
                      <button className="btn btn-small" disabled={!!listing} onClick={() => void list(s)}>
                        {listing === s.bin ? (
                          <>
                            <LoaderCircle size={13} className="status-spin" aria-hidden="true" /> Looking…
                          </>
                        ) : (
                          "Show databases"
                        )}
                      </button>
                    </div>
                  )}
                  {listError[s.bin] && (
                    <p className="field-error" role="alert">
                      {listError[s.bin]}
                    </p>
                  )}
                </fieldset>
              ))}
            </div>
          ))}

          <div className="import-go">
            <button
              className="btn btn-primary"
              disabled={pickedProjects + pickedDbs === 0 || clash}
              onClick={() => void start()}
            >
              <Download size={14} aria-hidden="true" /> Copy {pickedProjects} project{pickedProjects === 1 ? "" : "s"}{" "}
              and {pickedDbs} database{pickedDbs === 1 ? "" : "s"}
            </button>
            <p className="field-hint">
              Databases go into NexDB's MySQL (it needs to be running), and a copied Laravel app whose database comes
              along is pointed at it with a user of its own. Passwords are used once and never saved.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
