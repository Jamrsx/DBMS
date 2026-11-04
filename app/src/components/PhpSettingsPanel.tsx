import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileCog, RotateCcw, Search } from "lucide-react";
import { nexCelebrate } from "../lib/nex";
import { applyPhpSettings, openPhpLines, phpSettings, savePhpSettings, type PhpSettings } from "../lib/phpsettings";

const LABELS: Record<string, string> = {
  memory_limit: "Memory per request",
  upload_max_filesize: "Biggest upload",
  post_max_size: "Biggest form post",
  max_execution_time: "Time limit (seconds)",
  max_input_vars: "Form fields allowed",
  display_errors: "Show errors on the page",
};

/** Extensions on or off, common limits and your own php.ini lines, for one PHP version. */
export function PhpSettingsPanel({ version }: { version: string | null }) {
  const [info, setInfo] = useState<PhpSettings | null>(null);
  const [exts, setExts] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const take = (i: PhpSettings) => {
    setInfo(i);
    setExts(Object.fromEntries(i.extensions.map((e) => [e.name, e.enabled])));
    setValues(Object.fromEntries(i.settings.map((s) => [s.key, s.value])));
  };

  useEffect(() => {
    phpSettings(version)
      .then(take)
      .catch((e) => setError(String(e)));
  }, [version]);

  const changed = useMemo(() => {
    if (!info) return 0;
    return (
      info.extensions.filter((e) => exts[e.name] !== e.enabled).length +
      info.settings.filter((s) => (values[s.key] ?? "").trim() !== s.value).length
    );
  }, [info, exts, values]);

  async function act(label: string, work: () => Promise<PhpSettings | void>, done: string) {
    setBusy(label);
    setError(null);
    setSaved(null);
    try {
      const next = await work();
      if (next) take(next);
      setSaved(done);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!info)
    return error ? <p className="field-error">{error}</p> : <p className="field-hint">Reading PHP's settings…</p>;

  const q = query.trim().toLowerCase();
  const shown = info.extensions.filter((e) => !q || e.name.includes(q) || e.note.toLowerCase().includes(q));
  const onCount = Object.values(exts).filter(Boolean).length;
  const feedback = (
    <>
      {busy && (
        <span className="row-status" role="status">
          {busy}
        </span>
      )}
      {saved && !busy && (
        <span className="set-ok" role="status">
          <CheckCircle2 size={14} aria-hidden="true" /> {saved}
        </span>
      )}
      {error && (
        <p className="field-error row-error" role="alert">
          {error}
        </p>
      )}
    </>
  );

  return (
    <div className="php-settings">
      <div className="php-settings-head">
        <h4>Extensions</h4>
        <span className="field-hint">
          {onCount} of {info.extensions.length} on
        </span>
        {info.extensions.length > 12 && (
          <span className="php-ext-search">
            <Search size={13} aria-hidden="true" />
            <input
              className="input"
              type="search"
              placeholder="Find an extension"
              aria-label="Find an extension"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </span>
        )}
      </div>
      <ul className="php-ext-list">
        {shown.map((e) => (
          <li key={e.name} title={e.blocked ?? undefined}>
            <label className={e.blocked ? "php-ext blocked" : "php-ext"}>
              <input
                type="checkbox"
                checked={!!exts[e.name]}
                disabled={!!e.blocked || !!busy}
                onChange={(ev) => setExts((x) => ({ ...x, [e.name]: ev.target.checked }))}
              />
              <span>
                <span className="php-ext-name">
                  <code>{e.name}</code>
                  {e.default && <span className="php-ext-default">default</span>}
                </span>
                <span className="field-hint">{e.blocked ?? (e.note || "No description.")}</span>
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="field-hint">No extension matches "{query}".</li>}
      </ul>

      <h4>Limits</h4>
      <div className="php-limits">
        {info.settings.map((s) => (
          <label key={s.key} className="field">
            <span className="field-label">{LABELS[s.key] ?? s.key}</span>
            {s.key === "display_errors" ? (
              <select
                className="input"
                value={/^(on|1)$/i.test(values[s.key] ?? "") ? "On" : "Off"}
                disabled={!!busy}
                onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
              >
                <option value="On">On (local development)</option>
                <option value="Off">Off</option>
              </select>
            ) : (
              <input
                className="input"
                value={values[s.key] ?? ""}
                disabled={!!busy}
                spellCheck={false}
                onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
              />
            )}
            <span className="field-hint">
              <code>{s.key}</code> · NexDB uses {s.default}
            </span>
          </label>
        ))}
      </div>

      <div className="share-row">
        <button
          className="btn btn-primary"
          disabled={!!busy || changed === 0}
          onClick={() =>
            void act(
              "Checking the settings and restarting PHP…",
              async () => {
                const next = await savePhpSettings(version, exts, values);
                nexCelebrate(`PHP ${next.version} has its new settings.`);
                return next;
              },
              "Saved. PHP restarted with them.",
            )
          }
        >
          Save{changed ? ` ${changed} change${changed === 1 ? "" : "s"}` : ""}
        </button>
        <button
          className="btn btn-quiet"
          disabled={!!busy || changed === 0}
          onClick={() => take(info)}
          title="Put back what is saved"
        >
          <RotateCcw size={13} aria-hidden="true" /> Undo changes
        </button>
        {feedback}
      </div>

      <h4>Your own php.ini lines</h4>
      <p className="field-hint">
        For anything not above (date.timezone, opcache, xdebug…). NexDB writes php.ini itself, so put your lines in your
        own file: it is added at the end and survives updates.
        {info.own_lines_used ? " Your file has lines in use." : ""}
      </p>
      <div className="share-row">
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => void act("Opening it…", () => openPhpLines(version), "Opened. Save it, then press Apply.")}
        >
          <FileCog size={14} aria-hidden="true" /> Open my php.ini lines
        </button>
        <button
          className="btn"
          disabled={!!busy}
          onClick={() =>
            void act(
              "Checking your lines and restarting PHP…",
              () => applyPhpSettings(version),
              "Applied. PHP restarted.",
            )
          }
        >
          Apply
        </button>
      </div>
      <p className="field-hint php-paths">
        Your file: <code>{info.own_lines}</code>
        <br />
        php.ini NexDB writes: <code>{info.ini}</code>
      </p>
    </div>
  );
}
