import type { Settings } from "../Wizard";
import { useState } from "react";
import { Nex } from "../components/Nex";
import { adoptInstall, type FoundInstall } from "../lib/services";

interface Props {
  /** An earlier NexDB folder whose settings file is missing. */
  repairRoot: string | null;
  settings: Settings;
  onChange: (settings: Settings) => void;
  /** NexDB folders from before that can be used as they are. */
  found: FoundInstall[];
  onAdopted: () => void;
}

export function Welcome({ settings, onChange, repairRoot, found, onAdopted }: Props) {
  return (
    <>
      {found.length > 0 && <FoundInstalls found={found} onAdopted={onAdopted} />}
      {repairRoot && (
        <div className="missing-banner" role="status">
          <p>
            <strong>NexDB found an earlier install in {repairRoot}, but its settings file is missing.</strong> Run setup
            again to repair it: anything still on disk is kept, and only the missing parts are downloaded. Your projects
            folder isn't touched.
          </p>
        </div>
      )}
      <div className="welcome-nex">
        <Nex state="hello" size={88} label="Nex, the NexDB mascot, waving hello" />
        <p className="lede">
          NexDB installs and runs PHP, Node.js, Apache and MySQL for local development. Pick only what you need;
          everything stays in one folder and never touches existing installs.
        </p>
      </div>

      <div className="fields">
        <label className="field">
          <span className="field-label">Install folder</span>
          <input
            value={settings.installRoot}
            spellCheck={false}
            onChange={(e) => onChange({ ...settings, installRoot: e.target.value })}
          />
          <span className="field-hint">Runtimes, configs and databases are kept here.</span>
        </label>

        <label className="field">
          <span className="field-label">Projects folder</span>
          <input
            value={settings.wwwDir}
            spellCheck={false}
            onChange={(e) => onChange({ ...settings, wwwDir: e.target.value })}
          />
          <span className="field-hint">
            Each folder inside becomes a site at <code>http://&lt;folder&gt;.test</code>.
          </span>
        </label>
      </div>
    </>
  );
}

/** Returns a message for the first invalid field, or null when both paths look usable. */
export function validateWelcome(settings: Settings): string | null {
  return (
    pathProblem("Install folder", settings.installRoot, "C:\\NexDB") ??
    pathProblem("Projects folder", settings.wwwDir, "C:\\NexDB\\www")
  );
}

export function pathProblem(label: string, value: string, example: string): string | null {
  const path = value.trim();
  if (!/^[a-zA-Z]:\\[^\\]/.test(path)) {
    return `${label} must be a full path to a folder, like ${example}.`;
  }
  if (/[<>"|?*]/.test(path.slice(2))) {
    return `${label} can't contain < > " | ? or *.`;
  }
  return null;
}

/** NexDB folders from before: use one as it is instead of setting up again. */
function FoundInstalls({ found, onAdopted }: { found: FoundInstall[]; onAdopted: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="found-installs" aria-labelledby="found-title">
      <h2 id="found-title">Pick up where you left off</h2>
      <p className="field-hint">
        NexDB was set up on this PC before. Use that folder and your projects, databases and versions are back, with
        nothing to download.
      </p>
      <ul className="found-list">
        {found.map((f) => (
          <li key={f.root} className="found-item">
            <div>
              <code>{f.root}</code>
              <p className="field-hint">
                {f.projects === 1 ? "1 project" : `${f.projects} projects`}
                {f.moved_from && `. It was in ${f.moved_from} before; NexDB updates its settings to the new place.`}
              </p>
            </div>
            <button
              className="btn btn-primary"
              disabled={busy !== null}
              data-working={busy === f.root || undefined}
              onClick={async () => {
                setBusy(f.root);
                setError(null);
                try {
                  await adoptInstall(f.root);
                  onAdopted();
                } catch (e) {
                  setError(String(e));
                  setBusy(null);
                }
              }}
            >
              {busy === f.root ? "Opening…" : "Use this folder"}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="field-hint">Or set up a new install below.</p>
    </section>
  );
}
