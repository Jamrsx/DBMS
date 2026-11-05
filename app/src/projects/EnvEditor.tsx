import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Plus, RotateCcw, Trash2 } from "lucide-react";
import { envFiles, envSave, type EnvChange, type EnvEntry, type EnvFile } from "../lib/projects";

/** What the user has done to one setting before saving. */
type Edit = { value: string } | { removed: true };

/**
 * A project's .env as a form: each setting with its value, secrets hidden until shown,
 * changes counted and saved together. The old file is kept as .env.backup.
 */
export function EnvEditor({ project }: { project: string }) {
  const [files, setFiles] = useState<EnvFile[] | null>(null);
  const [folder, setFolder] = useState("");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [added, setAdded] = useState<{ key: string; value: string }[]>([]);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const load = useCallback(() => {
    envFiles(project)
      .then((f) => {
        setFiles(f);
        setFolder((cur) => (f.some((x) => x.folder === cur) ? cur : (f[0]?.folder ?? "")));
      })
      .catch((e) => setError(String(e)));
  }, [project]);
  useEffect(load, [load]);

  const file = files?.find((f) => f.folder === folder) ?? null;

  const changes: EnvChange[] = useMemo(() => {
    const out: EnvChange[] = [];
    for (const [key, e] of Object.entries(edits)) out.push([key, "removed" in e ? null : e.value]);
    for (const a of added) if (a.key.trim()) out.push([a.key.trim(), a.value]);
    return out;
  }, [edits, added]);

  function reset() {
    setEdits({});
    setAdded([]);
    setError(null);
  }

  function setValue(entry: EnvEntry, value: string) {
    setSaved(null);
    setEdits((all) => {
      const next = { ...all };
      if (value === entry.value && !entry.missing) delete next[entry.key];
      else next[entry.key] = { value };
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const path = await envSave(project, folder, changes);
      setSaved(
        file?.exists
          ? `Saved ${changes.length} change${changes.length === 1 ? "" : "s"} to ${path}. The old file is kept as .env.backup.`
          : `Made ${path} from .env.example, with your changes.`,
      );
      reset();
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !files)
    return (
      <p className="field-error" role="alert">
        {error}
      </p>
    );
  if (!files)
    return (
      <p className="field-hint" role="status">
        Reading .env…
      </p>
    );
  if (files.length === 0)
    return (
      <p className="lede">
        <code>{project}</code> has no <code>.env</code> or <code>.env.example</code>, so there are no settings to edit
        here.
      </p>
    );

  const keyTaken = (k: string) => !!file?.entries.some((e) => e.key === k) || added.some((a) => a.key === k);
  const newKeyProblem =
    newKey && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(newKey)
      ? "Use letters, numbers and _, like MAIL_HOST."
      : newKey && keyTaken(newKey)
        ? `${newKey} is already in the list.`
        : null;

  const q = filter.trim().toLowerCase();
  const rows = (file?.entries ?? []).filter(
    (e) => !q || e.key.toLowerCase().includes(q) || (!e.secret && e.value.toLowerCase().includes(q)),
  );

  return (
    <div className="env-editor">
      <div className="env-head">
        {files.length > 1 && (
          <label className="field env-folder">
            <span className="field-label">File</span>
            <select
              value={folder}
              disabled={changes.length > 0}
              aria-describedby={changes.length > 0 ? "env-folder-locked" : undefined}
              onChange={(e) => {
                reset();
                setFolder(e.target.value);
              }}
            >
              {files.map((f) => (
                <option key={f.folder} value={f.folder}>
                  {f.folder ? `${f.folder}/.env` : ".env"}
                </option>
              ))}
            </select>
            {changes.length > 0 && (
              <span className="field-hint" id="env-folder-locked">
                Save or discard your changes to switch file.
              </span>
            )}
          </label>
        )}
        <input
          className="input env-filter"
          type="search"
          placeholder="Find a setting"
          aria-label="Find a setting"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <p className="field-hint">
        {file?.exists ? (
          <>
            <code>{file.path}</code>. Passwords and keys stay hidden until you press the eye.
          </>
        ) : (
          <>
            There's no <code>.env</code> yet. These come from <code>.env.example</code>; saving makes <code>.env</code>{" "}
            with them.
          </>
        )}
      </p>

      <table className="data-table env-table">
        <thead>
          <tr>
            <th scope="col">Setting</th>
            <th scope="col">Value</th>
            <th scope="col">
              <span className="visually-hidden">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const edit = edits[e.key];
            const removed = !!edit && "removed" in edit;
            const value = edit && "value" in edit ? edit.value : e.value;
            const visible = !e.secret || !!shown[e.key];
            const id = `env-${folder}-${e.key}`;
            return (
              <tr key={e.key} className={removed ? "env-removed" : edit ? "env-changed" : undefined}>
                <th scope="row">
                  <label htmlFor={id}>
                    <code>{e.key}</code>
                  </label>
                  {e.missing && !edit && <span className="kind">not set</span>}
                  {e.note && <span className="field-hint env-note">{e.note}</span>}
                </th>
                <td>
                  <div className="env-value">
                    <input
                      id={id}
                      className="input"
                      type={visible ? "text" : "password"}
                      value={value}
                      disabled={removed}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder={e.missing ? "Not set yet" : "(empty)"}
                      onChange={(ev) => setValue(e, ev.target.value)}
                    />
                    {e.secret && (
                      <button
                        type="button"
                        className="btn btn-small btn-icon btn-quiet"
                        aria-label={visible ? `Hide ${e.key}` : `Show ${e.key}`}
                        aria-pressed={visible}
                        title={visible ? "Hide" : "Show"}
                        onClick={() => setShown((s) => ({ ...s, [e.key]: !visible }))}
                      >
                        {visible ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
                      </button>
                    )}
                  </div>
                </td>
                <td className="num">
                  {edit ? (
                    <button
                      type="button"
                      className="btn btn-small btn-icon btn-quiet"
                      aria-label={`Undo the change to ${e.key}`}
                      title="Undo"
                      onClick={() =>
                        setEdits((all) => {
                          const next = { ...all };
                          delete next[e.key];
                          return next;
                        })
                      }
                    >
                      <RotateCcw size={13} aria-hidden="true" />
                    </button>
                  ) : (
                    !e.missing && (
                      <button
                        type="button"
                        className="btn btn-small btn-icon btn-quiet"
                        aria-label={`Remove ${e.key}`}
                        title="Remove"
                        onClick={() =>
                          setEdits((all) => ({
                            ...all,
                            [e.key]: { removed: true },
                          }))
                        }
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
          {added.map((a, i) => (
            <tr key={`new-${a.key}`} className="env-changed">
              <th scope="row">
                <code>{a.key}</code> <span className="kind">new</span>
              </th>
              <td>
                <input
                  className="input"
                  aria-label={`Value for ${a.key}`}
                  value={a.value}
                  spellCheck={false}
                  onChange={(ev) =>
                    setAdded((list) => list.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)))
                  }
                />
              </td>
              <td className="num">
                <button
                  type="button"
                  className="btn btn-small btn-icon btn-quiet"
                  aria-label={`Don't add ${a.key}`}
                  title="Don't add"
                  onClick={() => setAdded((list) => list.filter((_, j) => j !== i))}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && q && <p className="field-hint">No setting matches “{filter}”.</p>}

      <form
        className="env-add"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!newKey || newKeyProblem) return;
          setAdded((list) => [...list, { key: newKey, value: newValue }]);
          setNewKey("");
          setNewValue("");
          setSaved(null);
        }}
      >
        <input
          className="input"
          placeholder="NEW_SETTING"
          aria-label="New setting name"
          value={newKey}
          spellCheck={false}
          onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/\s/g, "_"))}
        />
        <input
          className="input"
          placeholder="value"
          aria-label="New setting value"
          value={newValue}
          spellCheck={false}
          onChange={(e) => setNewValue(e.target.value)}
        />
        <button type="submit" className="btn btn-small" disabled={!newKey || !!newKeyProblem}>
          <Plus size={13} aria-hidden="true" /> Add
        </button>
        {newKeyProblem && <span className="field-hint hint-bad">{newKeyProblem}</span>}
      </form>

      <div className={changes.length > 0 ? "env-foot pending" : "env-foot"} role="status">
        {changes.length > 0 ? (
          <>
            <span>
              {changes.length} change{changes.length === 1 ? "" : "s"} not saved yet
            </span>
            <button type="button" className="btn" disabled={busy} onClick={reset}>
              Discard
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              data-working={busy || undefined}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : file?.exists ? "Save .env" : "Create .env"}
            </button>
          </>
        ) : (
          <span className={saved ? "hint-ok" : "field-hint"}>{saved ?? "No changes."}</span>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
