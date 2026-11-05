import { useMemo, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { dbQuery } from "../lib/db";
import type { Schema, SchemaLink } from "../lib/schema";
import { addForeignKeySql, dropForeignKeySql, foreignKeyName, linkProblem, type OnDelete } from "../lib/tableDesign";

const ON_DELETE: { value: OnDelete; label: string; help: (to: string, from: string) => string }[] = [
  {
    value: "restrict",
    label: "Stop it",
    help: (to, from) => `A ${to} row can't be deleted while ${from} rows point at it. The safest choice.`,
  },
  {
    value: "cascade",
    label: "Delete them too",
    help: (to, from) => `Deleting a ${to} row also deletes the ${from} rows that point at it.`,
  },
  {
    value: "set null",
    label: "Clear the link",
    help: (to, from) =>
      `Deleting a ${to} row leaves the ${from} rows, with the column emptied. The column must allow empty values.`,
  },
];

/**
 * Makes a link (foreign key) between two tables, or removes one. Shows the SQL first and only
 * runs it on Apply. `from`/`to` come prefilled when the link was drawn by dragging.
 */
export function LinkDialog({
  schema,
  db,
  mode,
  onDone,
  onCancel,
}: {
  schema: Schema;
  db: string;
  mode: { kind: "add"; table?: string; column?: string; toTable?: string } | { kind: "drop"; link: SchemaLink };
  onDone: (change: { added?: SchemaLink; removed?: SchemaLink }) => void;
  onCancel: () => void;
}) {
  const tables = schema.tables.filter((t) => !t.is_view);
  const pkOf = (name: string) => {
    const t = tables.find((x) => x.name === name);
    return t?.columns.find((c) => c.key === "PRI")?.name ?? t?.columns[0]?.name ?? "";
  };
  const [table, setTable] = useState(mode.kind === "add" ? (mode.table ?? tables[0]?.name ?? "") : "");
  const [column, setColumn] = useState(
    mode.kind === "add" ? (mode.column ?? tables.find((t) => t.name === table)?.columns[0]?.name ?? "") : "",
  );
  const [toTable, setToTable] = useState(mode.kind === "add" ? (mode.toTable ?? "") : "");
  const [toColumn, setToColumn] = useState(mode.kind === "add" && mode.toTable ? pkOf(mode.toTable) : "");
  const [onDelete, setOnDelete] = useState<OnDelete>("restrict");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromCol = tables.find((t) => t.name === table)?.columns.find((c) => c.name === column);
  const toCol = tables.find((t) => t.name === toTable)?.columns.find((c) => c.name === toColumn);
  const name = foreignKeyName(table, [column]);
  const exists = schema.links.some((l) => l.table === table && l.columns.join() === column && l.to_table === toTable);

  const sql = useMemo(() => {
    if (mode.kind === "drop") return dropForeignKeySql(schema.engine, mode.link.table, mode.link.name);
    if (!table || !column || !toTable || !toColumn) return "";
    return addForeignKeySql(schema.engine, table, [column], toTable, [toColumn], name, onDelete);
  }, [mode, schema.engine, table, column, toTable, toColumn, name, onDelete]);

  const typeWarning = fromCol && toCol ? linkProblem(fromCol.column_type, toCol.column_type) : null;
  const nullProblem = onDelete === "set null" && fromCol && !fromCol.nullable;

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await dbQuery(db, sql);
      if (mode.kind === "drop") onDone({ removed: mode.link });
      else onDone({ added: { name, table, columns: [column], to_table: toTable, to_columns: [toColumn] } });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const title = mode.kind === "drop" ? "Remove this link?" : "Link two tables";
  return (
    <div
      className="link-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-dialog-title"
      data-guide="link-dialog"
    >
      <h3 id="link-dialog-title">
        {mode.kind === "drop" ? <Unlink size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}{" "}
        {title}
      </h3>

      {mode.kind === "drop" ? (
        <p>
          <code>
            {mode.link.table}.{mode.link.columns.join(", ")}
          </code>{" "}
          stops pointing at <code>{mode.link.to_table}</code>. The columns and their data stay; only the link goes.
        </p>
      ) : (
        <>
          <p className="field-hint">
            A link (foreign key) says a column holds the id of a row in another table, like posts.user_id → users.id.
            The database then keeps them consistent.
          </p>
          <div className="link-pick">
            <label className="field">
              <span className="field-label">This column</span>
              <span className="link-pair">
                <select
                  aria-label="Table with the column"
                  value={table}
                  onChange={(e) => {
                    setTable(e.target.value);
                    setColumn(tables.find((t) => t.name === e.target.value)?.columns[0]?.name ?? "");
                  }}
                >
                  {tables.map((t) => (
                    <option key={t.name}>{t.name}</option>
                  ))}
                </select>
                <select aria-label="Column" value={column} onChange={(e) => setColumn(e.target.value)}>
                  {tables
                    .find((t) => t.name === table)
                    ?.columns.map((c) => (
                      <option key={c.name}>{c.name}</option>
                    ))}
                </select>
              </span>
            </label>
            <span className="link-arrow" aria-hidden="true">
              →
            </span>
            <label className="field">
              <span className="field-label">points at</span>
              <span className="link-pair">
                <select
                  aria-label="Table it points at"
                  value={toTable}
                  onChange={(e) => {
                    setToTable(e.target.value);
                    setToColumn(pkOf(e.target.value));
                  }}
                >
                  <option value="">Pick a table</option>
                  {tables.map((t) => (
                    <option key={t.name}>{t.name}</option>
                  ))}
                </select>
                <select aria-label="Column it points at" value={toColumn} onChange={(e) => setToColumn(e.target.value)}>
                  {tables
                    .find((t) => t.name === toTable)
                    ?.columns.map((c) => (
                      <option key={c.name}>{c.name}</option>
                    ))}
                </select>
              </span>
            </label>
          </div>

          {toTable && (
            <fieldset className="link-delete">
              <legend className="field-label">When a {toTable} row is deleted</legend>
              {ON_DELETE.map((o) => (
                <label key={o.value} className="check-row">
                  <input
                    type="radio"
                    name="on-delete"
                    checked={onDelete === o.value}
                    onChange={() => setOnDelete(o.value)}
                  />
                  <span>
                    {o.label}
                    {o.value === "restrict" && <span className="muted"> (recommended)</span>}
                    <span className="field-hint link-sub">{o.help(toTable, table)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          {exists && (
            <p className="field-warn">
              {table}.{column} already points at {toTable}.
            </p>
          )}
          {typeWarning && <p className="field-warn">{typeWarning}</p>}
          {nullProblem && (
            <p className="field-warn">
              {table}.{column} can't be empty, so "Clear the link" won't work. Pick another choice, or allow empty
              values first.
            </p>
          )}
        </>
      )}

      {sql && (
        <details className="designer-sql" open>
          <summary>The SQL it runs</summary>
          <pre className="designer-sql-text">{sql}</pre>
        </details>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="link-actions">
        <button className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className={mode.kind === "drop" ? "btn btn-danger" : "btn btn-primary"}
          data-guide="link-apply"
          disabled={
            busy ||
            !sql ||
            (mode.kind === "add" && (exists || !!nullProblem || (table === toTable && column === toColumn)))
          }
          data-working={busy || undefined}
          onClick={() => void apply()}
        >
          {busy ? "Working…" : mode.kind === "drop" ? "Remove the link" : "Make the link"}
        </button>
      </div>
    </div>
  );
}
