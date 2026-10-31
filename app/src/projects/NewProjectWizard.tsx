import { useState } from "react";
import {
  AppWindow,
  ArrowLeft,
  Check,
  Circle,
  Code2,
  Copy,
  ExternalLink,
  LoaderCircle,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  createProject,
  defaultDbName,
  isStarter,
  nameProblem,
  needsDatabase,
  onQuickstart,
  openInEditor,
  openProject,
  quickstart,
  type Created,
  type Editor,
  type NewKind,
  type Starter,
} from "../lib/projects";
import { openTerminalWindow } from "../lib/terminal";
import { Nex } from "../components/Nex";
import { nexCelebrate, nexOops } from "../lib/nex";

type Kind = NewKind | Starter;

interface Choice {
  id: Kind;
  title: string;
  about: string;
}

const GROUPS: { label: string; choices: Choice[] }[] = [
  {
    label: "Laravel",
    choices: [
      { id: "laravel", title: "Laravel", about: "The latest Laravel, with a database ready." },
      { id: "laravel-react", title: "Laravel + React", about: "Inertia starter kit: login, register and a React frontend." },
      { id: "laravel-vue", title: "Laravel + Vue", about: "Inertia starter kit: login, register and a Vue frontend." },
      { id: "laravel-livewire", title: "Laravel + Livewire", about: "Starter kit with login and register, all in PHP." },
    ],
  },
  {
    label: "Websites",
    choices: [
      { id: "wordpress", title: "WordPress", about: "The latest WordPress with its database set up." },
      { id: "php", title: "PHP page", about: "A folder with an index.php to start from." },
      { id: "html", title: "HTML page", about: "A folder with an index.html." },
      { id: "empty", title: "Empty folder", about: "Nothing inside; bring your own code." },
    ],
  },
  {
    label: "JavaScript",
    choices: [
      { id: "vite-react", title: "React (Vite)", about: "A fast React app with TypeScript." },
      { id: "vite-vue", title: "Vue (Vite)", about: "A fast Vue app with TypeScript." },
      { id: "nextjs", title: "Next.js", about: "React framework with pages and routing built in." },
    ],
  },
];

const TITLE = Object.fromEntries(GROUPS.flatMap((g) => g.choices.map((c) => [c.id, c.title]))) as Record<Kind, string>;

interface Guide {
  /** Where it opens: the .test site, or a dev server address. */
  opens: "site" | string;
  intro: string;
  commands: { cmd: string; why: string }[];
}

/** What to do next, per starter, in plain words. */
function guideFor(kind: Kind): Guide {
  const laravel = [
    { cmd: "php artisan make:model Post -m", why: "Make a model and a table for it" },
    { cmd: "php artisan migrate", why: "Apply table changes to the database" },
  ];
  switch (kind) {
    case "laravel":
      return {
        opens: "site",
        intro: "NexDB's Apache already serves it, so there's no need for php artisan serve.",
        commands: laravel,
      };
    case "laravel-react":
    case "laravel-vue":
    case "laravel-livewire":
      return {
        opens: "site",
        intro: "NexDB's Apache serves the site. While you edit pages, run the dev server so changes show instantly.",
        commands: [
          { cmd: "npm run dev", why: "Keep running while you edit; the page updates by itself" },
          { cmd: "npm run build", why: "Build the final files before sharing or deploying" },
          ...laravel,
        ],
      };
    case "wordpress":
      return {
        opens: "site",
        intro: "Open the site to finish WordPress's setup: pick a site title, your admin name and password.",
        commands: [],
      };
    case "vite-react":
    case "vite-vue":
      return {
        opens: "http://localhost:5173",
        intro: "This app runs on its own dev server. Start it, then open the address it prints.",
        commands: [
          { cmd: "npm run dev", why: "Start the app at http://localhost:5173" },
          { cmd: "npm run build", why: "Build the final files into dist/" },
        ],
      };
    case "nextjs":
      return {
        opens: "http://localhost:3000",
        intro: "This app runs on its own dev server. Start it, then open the address it prints.",
        commands: [
          { cmd: "npm run dev", why: "Start the app at http://localhost:3000" },
          { cmd: "npm run build", why: "Build for production" },
        ],
      };
    default:
      return { opens: "site", intro: "Add your files to the folder and refresh the page.", commands: [] };
  }
}

interface Progress {
  steps: string[];
  /** Index of the step running now; steps before it are done. */
  at: number;
  percent: number | null;
  lines: string[];
  outcome: { ok: true; created: Created | null } | { ok: false; error: string } | null;
}

type Stage = "pick" | "options" | "making";

/** New project, step by step: what it is, its options, then making it and what to do next. */
export function NewProjectWizard({
  existing,
  editors,
  addressReady,
  onCreated,
  onClose,
}: {
  existing: string[];
  editors: Editor[];
  /** False while .test addresses aren't in Windows yet. */
  addressReady: (name: string) => boolean;
  onCreated: () => Promise<void>;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("laravel");
  const [dbName, setDbName] = useState<string | null>(null);
  const [ai, setAi] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const problem = nameProblem(name, existing);
  const starter = isStarter(kind) ? kind : null;
  const database = dbName ?? defaultDbName(name);
  const dbProblem =
    starter && needsDatabase(starter) && !/^[A-Za-z0-9_]{1,32}$/.test(database)
      ? "Use up to 32 letters, numbers and _ for the database name."
      : null;

  async function make() {
    setStage("making");
    setProgress({ steps: [], at: 0, percent: null, lines: [], outcome: null });
    if (!starter) {
      try {
        await createProject(name, kind as NewKind);
        await onCreated();
        setProgress((p) => p && { ...p, outcome: { ok: true, created: null } });
        nexCelebrate(`${name} is ready!`);
      } catch (err) {
        setProgress((p) => p && { ...p, outcome: { ok: false, error: String(err) } });
      }
      return;
    }
    // Listen before starting, so the first steps aren't missed.
    const unlisten = await onQuickstart((ev) => {
      if (ev.name !== name) return;
      setProgress((p) => {
        if (!p) return p;
        if (ev.kind === "plan") return { ...p, steps: ev.steps, at: 0, percent: null };
        if (ev.kind === "step") return { ...p, at: ev.status === "done" ? ev.index + 1 : ev.index, percent: null };
        if (ev.kind === "percent") return ev.index === p.at ? { ...p, percent: ev.percent } : p;
        return { ...p, lines: [...p.lines.slice(-400), ev.text] };
      });
    });
    try {
      const created = await quickstart(name, starter, {
        db_name: needsDatabase(starter) ? database : undefined,
        ai: starter.startsWith("laravel") && ai,
      });
      setProgress((p) => p && { ...p, at: p.steps.length, outcome: { ok: true, created } });
      nexCelebrate(`${name} is ready! Let's build something.`);
      await onCreated();
    } catch (err) {
      setProgress((p) => p && { ...p, outcome: { ok: false, error: String(err) } });
      nexOops(`${name} couldn't be made. The details say why.`);
    } finally {
      unlisten();
    }
  }

  return (
    <section className="wizard" aria-label="New project">
      <ol className="wizard-steps" aria-label="Steps">
        {(["What to make", "Options", "Making it"] as const).map((label, i) => {
          const at = stage === "pick" ? 0 : stage === "options" ? 1 : 2;
          return (
            <li key={label} className={i === at ? "current" : i < at ? "done" : ""} aria-current={i === at ? "step" : undefined}>
              <span className="wizard-num">{i < at ? <Check size={12} aria-hidden="true" /> : i + 1}</span>
              {label}
            </li>
          );
        })}
        <li className="wizard-close">
          <button className="update-close" onClick={onClose} aria-label="Close" title="Close">
            <X size={14} aria-hidden="true" />
          </button>
        </li>
      </ol>

      {stage === "pick" && (
        <form
          className="wizard-body"
          onSubmit={(e) => {
            e.preventDefault();
            if (name && !problem) setStage("options");
          }}
        >
          <label className="field wizard-name">
            <span className="field-label">Project name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value.trim().toLowerCase())}
              placeholder="my-shop"
              autoFocus
              spellCheck={false}
              aria-invalid={!!problem}
              aria-describedby="wz-hint"
            />
            <span id="wz-hint" className={problem ? "field-error" : "field-hint"}>
              {problem ??
                (name
                  ? `Folder ${name} in your projects folder. On this PC it opens at ${name}.test, a private address only your computer knows.`
                  : "Lowercase letters, numbers and hyphens, for example my-shop.")}
            </span>
          </label>

          <div className="wizard-groups" role="radiogroup" aria-label="Starts as">
            {GROUPS.map((g) => (
              <fieldset key={g.label} className="wizard-group">
                <legend>{g.label}</legend>
                <div className="wizard-cards">
                  {g.choices.map((c) => (
                    <label key={c.id} className={kind === c.id ? "wizard-card selected" : "wizard-card"}>
                      <input type="radio" name="kind" checked={kind === c.id} onChange={() => setKind(c.id)} />
                      <strong>{c.title}</strong>
                      <span>{c.about}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="wizard-actions">
            <button className="btn btn-quiet" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={!name || !!problem}>
              Next
            </button>
          </div>
        </form>
      )}

      {stage === "options" && (
        <form
          className="wizard-body"
          onSubmit={(e) => {
            e.preventDefault();
            if (!dbProblem) void make();
          }}
        >
          <p className="wizard-summary">
            <strong>
              {name} · {TITLE[kind]}
            </strong>
            {starter
              ? " NexDB downloads the latest version and sets it up for you. This takes a few minutes and needs the internet."
              : " NexDB makes the folder right away."}
          </p>

          {starter && needsDatabase(starter) && (
            <label className="field">
              <span className="field-label">Database name</span>
              <input
                className="input input-medium"
                value={database}
                onChange={(e) => setDbName(e.target.value.trim())}
                spellCheck={false}
                aria-invalid={!!dbProblem}
              />
              <span className={dbProblem ? "field-error" : "field-hint"}>
                {dbProblem ??
                  `A new MySQL database with its own user and password, filled into ${starter === "wordpress" ? "wp-config.php" : ".env"} for you. Your MySQL password is never written into the project.`}
              </span>
            </label>
          )}

          {starter?.startsWith("laravel") && (
            <label className="set-check wizard-ai">
              <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
              <span>
                <strong>Set up AI assistant support</strong>
                <span className="field-hint">
                  Installs Laravel Boost, so AI coding assistants (Claude Code, Cursor, Copilot and others) understand
                  your Laravel project and follow its conventions.
                </span>
              </span>
            </label>
          )}

          <div className="wizard-actions">
            <button className="btn btn-quiet" type="button" onClick={() => setStage("pick")}>
              <ArrowLeft size={14} aria-hidden="true" /> Back
            </button>
            <button className="btn btn-primary" type="submit" disabled={!!dbProblem}>
              Create {name}
            </button>
          </div>
        </form>
      )}

      {stage === "making" && progress && (
        <Making
          name={name}
          kind={kind}
          progress={progress}
          editors={editors}
          addressReady={addressReady(name)}
          onBack={() => {
            setProgress(null);
            setStage("options");
          }}
          onClose={onClose}
        />
      )}
    </section>
  );
}

function Making({
  name,
  kind,
  progress,
  editors,
  addressReady,
  onBack,
  onClose,
}: {
  name: string;
  kind: Kind;
  progress: Progress;
  editors: Editor[];
  addressReady: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const [details, setDetails] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { steps, at, percent, lines, outcome } = progress;
  const failed = outcome && !outcome.ok;
  const done = outcome?.ok;
  const guide = guideFor(kind);
  const site = addressReady ? `http://${name}.test` : `http://localhost/${name}/`;
  const run = (p: Promise<unknown>) => p.catch((e) => setProblem(String(e)));

  return (
    <div className="wizard-body making" aria-live="polite">
      <div className="making-nex">
        <Nex state={done ? "success" : failed ? "error" : "loading"} size={150} />
      </div>
      <div className="quickstart-head">
        <h2 className="quickstart-title">
          {done ? `${name} is ready` : failed ? `${name} couldn't be made` : `Making ${name}…`}
        </h2>
      </div>

      {steps.length > 0 && (
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
                {state === "running" && percent !== null && (
                  <span className="quickstart-pct">
                    <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                      <span className="bar-fill" style={{ width: `${percent}%` }} />
                    </span>
                    {percent}%
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!outcome && steps.length === 0 && <p className="field-hint">Getting ready…</p>}

      {failed && (
        <p className="field-error" role="alert">
          {outcome.error} Nothing was left behind, so you can try again.
        </p>
      )}

      {done && (
        <div className="guide">
          <p className="guide-intro">
            {guide.opens === "site" ? (
              <>
                Open <code>{site.replace(/\/$/, "")}</code> in your browser. {guide.intro}
              </>
            ) : (
              guide.intro
            )}
            {outcome.created?.database && (
              <>
                {" "}
                Its database is <code>{outcome.created.database}</code>.
              </>
            )}
          </p>
          {guide.opens === "site" && !addressReady && (
            <p className="field-hint">
              <code>{name}.test</code> starts working once you click <strong>Set up addresses</strong> on this page
              (Windows asks once). Until then use <code>localhost/{name}</code>.
            </p>
          )}
          {guide.commands.length > 0 && (
            <>
              <p className="guide-label">
                Commands to run in the terminal, inside the <code>{name}</code> folder:
              </p>
              <ul className="guide-commands">
                {guide.commands.map((c) => (
                  <li key={c.cmd}>
                    <code>{c.cmd}</code>
                    <span>{c.why}</span>
                    <CopyButton text={c.cmd} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}

      <div className="wizard-actions">
        {lines.length > 0 && (
          <button className="btn btn-small btn-quiet" onClick={() => setDetails((d) => !d)} aria-expanded={details}>
            {details ? "Hide details" : "Show details"}
          </button>
        )}
        <span className="quickstart-spacer" />
        {failed && (
          <button className="btn btn-small" onClick={onBack}>
            <ArrowLeft size={13} aria-hidden="true" /> Back
          </button>
        )}
        {done &&
          editors.slice(0, 3).map((e) => (
            <button key={e.id} className="btn btn-small" onClick={() => void run(openInEditor(name, e.id))}>
              <Code2 size={13} aria-hidden="true" /> Open in {e.name}
            </button>
          ))}
        {done && (
          <button className="btn btn-small" onClick={() => void run(openTerminalWindow(name))}>
            <SquareTerminal size={13} aria-hidden="true" /> Terminal here
          </button>
        )}
        {done && guide.opens === "site" && (
          <button className="btn btn-small" onClick={() => void run(openProject(name, addressReady ? "url" : "local"))}>
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
      {done && editors.length === 0 && (
        <p className="field-hint">
          <AppWindow size={12} aria-hidden="true" /> No code editor found. VS Code is free:{" "}
          <code>code.visualstudio.com</code>
        </p>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-small btn-icon"
      title={copied ? "Copied" : "Copy"}
      aria-label={copied ? "Copied" : `Copy ${text}`}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}
