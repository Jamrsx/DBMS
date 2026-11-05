import { useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, RotateCcw, Trash2 } from "lucide-react";
import { dbColumns, dbQuery, type DbEngine } from "../lib/db";
import { createBackup } from "../lib/backups";
import {
  KINDS,
  alterSql,
  blankColumn,
  createSql,
  dropsData,
  fromColumn,
  indexSql,
  listIndexesSql,
  nameProblem,
  readIndexes,
  starterColumns,
  type ColDraft,
  type IndexDraft,
  type Kind,
} from "../lib/tableDesign";

/**
 * Columns and indexes as a form. Shows the SQL it will run, and runs it only on Apply.
 * `table` null makes a new table.
 */
export function TableDesigner({
  db,
  table,
  engine,
  onDone,
  onCancel,
}: {
  db: string;
  table: string | null;
  engine: DbEngine;
  onDone: (table: string) => void;
  onCancel: () => void;
}) {
  const creating = table === null;
  const [name, setName] = useState("");
  const [before, setBefore] = useState<ColDraft[] | null>(creating ? [] : null);
  const [cols, setCols] = useState<ColDraft[]>(creating ? starterColumns() : []);
  const [indexes, setIndexes] = useState<IndexDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [backupFirst, setBackupFirst] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [showSql, setShowSql] = useState(false);

  useEffect(() => {
    if (creating) return;
    Promise.all([dbColumns(db, table), dbQuery(db, listIndexesSql(table, engine)).catch(() => null)])
      .then(([c, idx]) => {
        const drafts = c.map((x) => fromColumn(x, engine));
        setBefore(drafts);
        setCols(drafts.map((d) => ({ ...d })));
        const set = idx?.sets[0];
        setIndexes(set ? readIndexes(set.columns, set.rows, engine) : []);
      })
      .catch((e) => setError(String(e)));
  }, [db, table, engine, creating]);

  const update = (i: number, change: Partial<ColDraft>) =>
    setCols((all) => all.map((c, j) => (j === i ? { ...c, ...change } : c)));

  const live = cols.filter((c) => !c.removed);
  const problems = useMemo(() => {
    const out: string[] = [];
    if (creating) {
      const p = nameProblem(name);
      if (p) out.push(`Table name: ${p}`);
    }
    if (live.length === 0) out.push("A table needs at least one column.");
    const seen = new Set<string>();
    for (const c of live) {
      const p = nameProblem(c.name);
      if (p) out.push(`${c.name || "A new column"}: ${p}`);
      const k = c.name.toLowerCase();
      if (seen.has(k)) out.push(`Two columns are called ${c.name}.`);
      seen.add(k);
      if (c.kind === "text" && !/^\d+$/.test(c.size.trim())) out.push(`${c.name}: text length is a number, like 255.`);
      if (c.kind === "decimal" && !/^\d+\s*,\s*\d+$/.test(c.size.trim()))
        out.push(`${c.name}: decimal digits look like 10,2.`);
      if (c.kind === "other" && !c.raw.trim()) out.push(`${c.name}: type the column's SQL type.`);
    }
    for (const i of indexes.filter((x) => !x.orig && !x.removed)) {
      const p = nameProblem(i.name);
      if (p) out.push(`Index ${i.name || "(new)"}: ${p}`);
      if (i.columns.length === 0) out.push(`Index ${i.name}: pick at least one column.`);
    }
    return out;
  }, [creating, name, live, indexes]);

  const statements = useMemo(() => {
    if (!before) return [];
    const t = creating ? name : table!;
    if (creating) return problems.length ? [] : [createSql(t, cols, engine), ...indexSql(t, indexes, engine)];
    return [...alterSql(t, before, cols, engine), ...indexSql(t, indexes, engine)];
  }, [before, cols, indexes, engine, creating, name, table, problems.length]);

  const losing = before ? dropsData(cols, before) : [];

  async function apply() {
    if (losing.length && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setError(null);
    try {
      if (losing.length && backupFirst) {
        setBusy(`Backing up ${db}…`);
        try {
          await createBackup(db);
        } catch (e) {
          throw `The backup didn't work, so nothing was changed. ${e} Untick “Back up first” to go ahead without one.`;
        }
      }
      setBusy(creating ? "Making the table…" : "Changing the table…");
      // One statement at a time, so a failure says which change it was.
      for (const [i, s] of statements.entries()) {
        try {
          await dbQuery(db, s);
        } catch (e) {
          throw `Change ${i + 1} of ${statements.length} didn't work${i > 0 ? " (the ones before it are done)" : ""}: ${e}`;
        }
      }
      onDone(creating ? name : table!);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!before && !error) return <p className="lede">Reading the table…</p>;

  return (
    <div className="designer">
      <div className="designer-head">
        <h3>{creating ? "New table" : `Edit ${table}`}</h3>
        <p className="field-hint">
          {creating
            ? `In ${db}. Starts with an id, a name and a created_at column; change them as you like.`
            : "Change names, types and defaults, add columns or remove them. Nothing changes until you press Apply."}
        </p>
      </div>

      {creating && (
        <label className="field designer-name">
          <span className="field-label">Table name</span>
          <input
            className="input"
            value={name}
            autoFocus
            spellCheck={false}
            placeholder="products"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}

      <div className="designer-scroll">
        <table className="data-table designer-table">
          <thead>
            <tr>
              <th scope="col">Column</th>
              <th scope="col">Type</th>
              <th scope="col">Size</th>
              <th scope="col">Can be empty</th>
              <th scope="col">Default</th>
              <th scope="col">
                <span className="visually-hidden">Key and remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cols.map((c, i) => {
              const isNew = !c.orig;
              const was = before?.find((b) => b.name === c.orig);
              const changed = !isNew && was && JSON.stringify({ ...was }) !== JSON.stringify({ ...c });
              const lockKey = !creating && c.primary;
              return (
                <tr
                  key={c.orig ?? `new-${i}`}
                  className={c.removed ? "env-removed" : isNew || changed ? "env-changed" : undefined}
                >
                  <td>
                    <input
                      className="input"
                      aria-label="Column name"
                      value={c.name}
                      disabled={c.removed}
                      spellCheck={false}
                      placeholder="column_name"
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    {c.kind === "other" ? (
                      <div className="designer-other">
                        <input
                          className="input"
                          aria-label={`SQL type of ${c.name}`}
                          value={c.raw}
                          disabled={c.removed}
                          spellCheck={false}
                          onChange={(e) => update(i, { raw: e.target.value })}
                        />
                        <select
                          aria-label={`Type of ${c.name}`}
                          value="other"
                          disabled={c.removed}
                          onChange={(e) => update(i, { kind: e.target.value as Kind })}
                        >
                          {KINDS.map((k) => (
                            <option key={k.kind} value={k.kind}>
                              {k.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <select
                        aria-label={`Type of ${c.name}`}
                        value={c.kind}
                        disabled={c.removed || lockKey}
                        onChange={(e) => {
                          const kind = e.target.value as Kind;
                          update(i, {
                            kind,
                            size: kind === "text" ? "255" : kind === "decimal" ? "10,2" : "",
                          });
                        }}
                      >
                        {KINDS.map((k) => (
                          <option key={k.kind} value={k.kind}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {(c.kind === "text" || c.kind === "decimal") && (
                      <input
                        className="input input-size"
                        aria-label={c.kind === "text" ? `Longest text for ${c.name}` : `Digits for ${c.name}`}
                        title={
                          c.kind === "text" ? "The most characters it holds" : "Digits in all, digits after the point"
                        }
                        value={c.size}
                        disabled={c.removed}
                        onChange={(e) => update(i, { size: e.target.value })}
                      />
                    )}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${c.name} can be empty`}
                      checked={c.nullable && !c.primary}
                      disabled={c.removed || c.primary}
                      onChange={(e) => update(i, { nullable: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      aria-label={`Default for ${c.name}`}
                      value={c.autoInc ? "" : c.def}
                      placeholder={c.autoInc ? "counts up" : c.kind === "datetime" ? "CURRENT_TIMESTAMP" : "none"}
                      disabled={c.removed || c.autoInc}
                      spellCheck={false}
                      onChange={(e) => update(i, { def: e.target.value })}
                    />
                  </td>
                  <td className="designer-actions">
                    {creating ? (
                      <button
                        type="button"
                        className={
                          c.primary
                            ? "btn btn-small btn-icon designer-key on"
                            : "btn btn-small btn-icon btn-quiet designer-key"
                        }
                        aria-pressed={c.primary}
                        aria-label={`${c.name} is the primary key`}
                        title={c.primary ? "Primary key (counts up when it's a number)" : "Make it the primary key"}
                        onClick={() =>
                          update(i, {
                            primary: !c.primary,
                            autoInc: !c.primary && (c.kind === "int" || c.kind === "bigint"),
                            nullable: c.primary ? c.nullable : false,
                          })
                        }
                      >
                        <KeyRound size={13} aria-hidden="true" />
                      </button>
                    ) : (
                      c.primary && (
                        <span className="kind" title="Change the primary key in the SQL tab">
                          key
                        </span>
                      )
                    )}
                    {c.removed || changed ? (
                      <button
                        type="button"
                        className="btn btn-small btn-icon btn-quiet"
                        aria-label={`Undo changes to ${c.orig}`}
                        title="Undo"
                        onClick={() => update(i, { ...was!, removed: false })}
                      >
                        <RotateCcw size={13} aria-hidden="true" />
                      </button>
                    ) : (
                      !lockKey && (
                        <button
                          type="button"
                          className="btn btn-small btn-icon btn-quiet"
                          aria-label={`Remove ${c.name || "this column"}`}
                          title="Remove"
                          onClick={() =>
                            isNew ? setCols((all) => all.filter((_, j) => j !== i)) : update(i, { removed: true })
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
          </tbody>
        </table>
      </div>
      <div>
        <button type="button" className="btn btn-small" onClick={() => setCols((all) => [...all, blankColumn()])}>
          <Plus size={13} aria-hidden="true" /> Add a column
        </button>
      </div>

      <section className="designer-indexes" aria-labelledby="designer-indexes-title">
        <h4 id="designer-indexes-title">Indexes</h4>
        <p className="field-hint">Indexes make searches on those columns fast. Unique ones also stop duplicates.</p>
        {indexes.length === 0 && <p className="field-hint">No indexes yet.</p>}
        <ul className="designer-index-list">
          {indexes.map((ix, i) => (
            <li
              key={ix.orig ?? `new-${i}`}
              className={ix.removed ? "env-removed" : !ix.orig ? "env-changed" : undefined}
            >
              {ix.orig ? (
                <>
                  <code>{ix.name}</code>
                  <span className="muted">
                    {ix.primary ? "primary key" : ix.unique ? "unique" : "index"} on {ix.columns.join(", ")}
                  </span>
                </>
              ) : (
                <>
                  <input
                    className="input"
                    aria-label="Index name"
                    value={ix.name}
                    spellCheck={false}
                    onChange={(e) =>
                      setIndexes((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                    }
                  />
                  <span className="designer-index-cols" role="group" aria-label="Columns in this index">
                    {live
                      .filter((c) => c.name)
                      .map((c) => (
                        <label key={c.name} className="check-row">
                          <input
                            type="checkbox"
                            checked={ix.columns.includes(c.name)}
                            onChange={(e) =>
                              setIndexes((all) =>
                                all.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        columns: e.target.checked
                                          ? [...x.columns, c.name]
                                          : x.columns.filter((n) => n !== c.name),
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                          {c.name}
                        </label>
                      ))}
                  </span>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={ix.unique}
                      onChange={(e) =>
                        setIndexes((all) => all.map((x, j) => (j === i ? { ...x, unique: e.target.checked } : x)))
                      }
                    />
                    Unique
                  </label>
                </>
              )}
              {!ix.primary && (
                <button
                  type="button"
                  className="btn btn-small btn-icon btn-quiet"
                  aria-label={ix.removed ? `Keep index ${ix.name}` : `Remove index ${ix.name}`}
                  title={ix.removed ? "Keep" : "Remove"}
                  onClick={() =>
                    ix.orig
                      ? setIndexes((all) => all.map((x, j) => (j === i ? { ...x, removed: !x.removed } : x)))
                      : setIndexes((all) => all.filter((_, j) => j !== i))
                  }
                >
                  {ix.removed ? <RotateCcw size={13} aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-small"
          onClick={() =>
            setIndexes((all) => [
              ...all,
              {
                name: `${creating ? name || "table" : table}_idx_${all.length + 1}`,
                columns: [],
                unique: false,
              },
            ])
          }
        >
          <Plus size={13} aria-hidden="true" /> Add an index
        </button>
      </section>

      {problems.length > 0 && (
        <ul className="warning-list" aria-live="polite">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <details
        className="designer-sql"
        open={showSql}
        onToggle={(e) => setShowSql((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          {statements.length === 0
            ? "No changes yet"
            : `The SQL it runs (${statements.length} statement${statements.length === 1 ? "" : "s"})`}
        </summary>
        <pre className="designer-sql-text">{statements.join("\n\n") || "-- nothing to run"}</pre>
      </details>

      {confirming && (
        <div className="sql-confirm" role="alert">
          <p>
            <strong>This deletes data in {losing.join(", ")}.</strong> Removing a column, or changing what kind of data
            it holds, can't be undone.
          </p>
          <label className="set-check">
            <input type="checkbox" checked={backupFirst} onChange={(e) => setBackupFirst(e.target.checked)} />
            <span>Back up {db} first (recommended)</span>
          </label>
          <button className="btn btn-small" onClick={() => setConfirming(false)}>
            Go back
          </button>
          <button className="btn btn-small btn-danger" onClick={() => void apply()}>
            Apply anyway
          </button>
        </div>
      )}

      {error && (
        <div className="error-box" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div className={statements.length > 0 ? "env-foot pending" : "env-foot"}>
        <span className="field-hint" role="status">
          {busy ?? (statements.length ? `${statements.length} change${statements.length === 1 ? "" : "s"} ready` : "")}
        </span>
        <button type="button" className="btn" onClick={onCancel} disabled={!!busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!!busy || statements.length === 0 || problems.length > 0 || confirming}
          data-working={!!busy || undefined}
          onClick={() => void apply()}
        >
          {busy ? "Working…" : creating ? "Make the table" : "Apply changes"}
        </button>
      </div>
    </div>
  );
}
