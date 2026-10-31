import { useCallback, useEffect, useState } from "react";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import {
  dbBrowse,
  dbColumns,
  dbDeleteRow,
  dbExportTableCsv,
  dbInsertRow,
  dbUpdateCell,
  type Cell,
  type ColumnInfo,
  type RowKey,
  type TablePage,
} from "../lib/db";
import { nexCelebrate } from "../lib/nex";

const PAGE_SIZE = 50;

/** Binary and blob columns can't be typed into a text box. */
const editableType = (c: ColumnInfo) => !/blob|binary|geometry|point|polygon/i.test(c.column_type);

interface Editing {
  row: number;
  col: number;
  value: string;
  isNull: boolean;
}

/** Browse a table and change it: double-click a cell, add a row, delete a row, export as CSV. */
export function RowEditor({ db, table }: { db: string; table: string }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<TablePage | null>(null);
  const [cols, setCols] = useState<ColumnInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    dbBrowse(db, table, page, PAGE_SIZE)
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [db, table, page]);

  useEffect(load, [load]);
  useEffect(() => {
    dbColumns(db, table)
      .then(setCols)
      .catch(() => setCols([]));
  }, [db, table]);

  const key = cols.filter((c) => c.key === "PRI").map((c) => c.name);
  const canEdit = key.length > 0;
  const colInfo = (name: string) => cols.find((c) => c.name === name);
  const keyOf = (row: Cell[]): RowKey =>
    key.map((k) => [k, row[data!.columns.indexOf(k)]] as [string, Cell]);

  async function act(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await work();
      setStatus(done);
      load();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing || !data) return;
    const row = data.rows[editing.row];
    const column = data.columns[editing.col];
    const ok = await act(
      () => dbUpdateCell(db, table, keyOf(row), column, editing.isNull ? null : editing.value),
      `Saved ${column}.`,
    );
    if (ok) setEditing(null);
  }

  if (error && !data) {
    return (
      <div className="error-box" role="alert">
        <p>{error}</p>
      </div>
    );
  }
  if (!data) return <p className="lede">Loading…</p>;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="db-browse">
      <div className="rows-toolbar">
        {canEdit ? (
          <span className="field-hint">
            <Pencil size={12} aria-hidden="true" /> Double-click a cell to change it.
          </span>
        ) : (
          <span className="field-hint">
            This table has no primary key, so NexDB can&apos;t pick out one row safely. Change it with the SQL tab.
          </span>
        )}
        <span className="quickstart-spacer" />
        {canEdit && (
          <button className="btn btn-small" disabled={busy} onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
            <Plus size={13} aria-hidden="true" /> Add row
          </button>
        )}
        <button
          className="btn btn-small"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const n = await dbExportTableCsv(db, table);
              if (n !== null) nexCelebrate(`Saved ${n} row${n === 1 ? "" : "s"} of ${table} as CSV.`);
            }, "")
          }
        >
          <Download size={13} aria-hidden="true" /> Export CSV
        </button>
      </div>

      {status && (
        <p className="set-ok" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {adding && (
        <AddRow
          cols={cols}
          busy={busy}
          onCancel={() => setAdding(false)}
          onAdd={async (values) => {
            const ok = await act(() => dbInsertRow(db, table, values), "Row added.");
            if (ok) setAdding(false);
          }}
        />
      )}

      {data.rows.length === 0 ? (
        <p className="lede">This table has no rows.</p>
      ) : (
        <div className="data-scroll">
          <table className="data-table rows-table">
            <thead>
              <tr>
                {data.columns.map((c) => (
                  <th key={c}>
                    {c}
                    {key.includes(c) && <span className="kind rows-key">key</span>}
                  </th>
                ))}
                {canEdit && <th aria-label="Row actions" />}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => {
                    const col = colInfo(data.columns[ci]);
                    const isEditing = editing?.row === ri && editing.col === ci;
                    const editable = canEdit && (!col || editableType(col));
                    return (
                      <td
                        key={ci}
                        className={typeof cell === "number" ? "num mono" : "mono"}
                        onDoubleClick={() =>
                          editable &&
                          setEditing({ row: ri, col: ci, value: cell === null ? "" : String(cell), isNull: cell === null })
                        }
                        title={editable && !isEditing ? "Double-click to change" : undefined}
                      >
                        {isEditing ? (
                          <form
                            className="cell-edit"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void saveEdit();
                            }}
                          >
                            <input
                              className="input"
                              value={editing.isNull ? "" : editing.value}
                              disabled={editing.isNull}
                              autoFocus
                              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                              onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                              aria-label={`New value for ${data.columns[ci]}`}
                            />
                            {col?.nullable && (
                              <label className="cell-null">
                                <input
                                  type="checkbox"
                                  checked={editing.isNull}
                                  onChange={(e) => setEditing({ ...editing, isNull: e.target.checked })}
                                />
                                NULL
                              </label>
                            )}
                            <button className="btn btn-small btn-primary" type="submit" disabled={busy}>
                              Save
                            </button>
                            <button className="btn btn-small" type="button" onClick={() => setEditing(null)}>
                              Cancel
                            </button>
                          </form>
                        ) : cell === null ? (
                          <span className="null">NULL</span>
                        ) : (
                          String(cell)
                        )}
                      </td>
                    );
                  })}
                  {canEdit && (
                    <td className="rows-actions">
                      {deleting === ri ? (
                        <>
                          <button className="btn btn-small" onClick={() => setDeleting(null)}>
                            Keep
                          </button>
                          <button
                            className="btn btn-small btn-danger"
                            disabled={busy}
                            onClick={async () => {
                              const ok = await act(() => dbDeleteRow(db, table, keyOf(row)), "Row deleted.");
                              if (ok) setDeleting(null);
                            }}
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btn-small btn-icon"
                          aria-label="Delete this row"
                          title="Delete this row"
                          onClick={() => setDeleting(ri)}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pager">
        <span>
          {data.total === 0
            ? "0 rows"
            : `Rows ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + data.rows.length} of ${data.total}`}
        </span>
        <button className="btn btn-small" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <button className="btn btn-small" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

/** A form with one field per column; empty fields get the column's default. */
function AddRow({
  cols,
  busy,
  onCancel,
  onAdd,
}: {
  cols: ColumnInfo[];
  busy: boolean;
  onCancel: () => void;
  onAdd: (values: [string, Cell][]) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [nulls, setNulls] = useState<Record<string, boolean>>({});
  const fields = cols.filter(editableType);
  return (
    <form
      className="add-row"
      onSubmit={(e) => {
        e.preventDefault();
        const out: [string, Cell][] = [];
        for (const c of fields) {
          if (nulls[c.name]) out.push([c.name, null]);
          else if ((values[c.name] ?? "") !== "") out.push([c.name, values[c.name]]);
        }
        onAdd(out);
      }}
    >
      <p className="field-hint">Leave a field empty to use its default.</p>
      <div className="add-row-fields">
        {fields.map((c) => {
          const auto = c.extra.includes("auto_increment");
          return (
            <label key={c.name} className="field">
              <span className="field-label">
                {c.name} <span className="field-hint">{c.column_type}</span>
              </span>
              <input
                className="input"
                value={values[c.name] ?? ""}
                disabled={!!nulls[c.name]}
                placeholder={auto ? "automatic" : c.default !== null ? `default: ${c.default}` : ""}
                onChange={(e) => setValues({ ...values, [c.name]: e.target.value })}
              />
              {c.nullable && (
                <label className="cell-null">
                  <input
                    type="checkbox"
                    checked={!!nulls[c.name]}
                    onChange={(e) => setNulls({ ...nulls, [c.name]: e.target.checked })}
                  />
                  NULL
                </label>
              )}
            </label>
          );
        })}
      </div>
      <div className="wizard-actions">
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Add row
        </button>
      </div>
    </form>
  );
}
