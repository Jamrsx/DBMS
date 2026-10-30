import type { Settings } from "../Wizard";

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

export function Welcome({ settings, onChange }: Props) {
  return (
    <>
      <p className="lede">
        NexDB installs and runs PHP, Node.js, Apache and MySQL for local development. Pick
        only what you need; everything stays in one folder and never touches existing installs.
      </p>

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
