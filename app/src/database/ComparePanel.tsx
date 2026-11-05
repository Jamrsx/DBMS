import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { dbCompare, type SchemaDiff } from "../lib/schema";

const KIND_LABEL: Record<SchemaDiff["kind"], string> = {
  table: "Tables",
  column: "Columns",
  index: "Indexes",
  key: "Links (foreign keys)",
};

/**
 * Puts the selected database next to another one and lists what differs: tables, columns
 * (type, empty or not, default), indexes and foreign keys. Read-only: nothing is changed.
 */
export function ComparePanel({ db, others, onClose }: { db: string; others: string[]; onClose: () => void }) {
  const [other, setOther] = useState(others[0] ?? "");
  const [diffs, setDiffs] = useState<SchemaDiff[] | null>(null);
  const [compared, setCompared] = useState<[string, string] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<SchemaDiff["kind"] | "all">("all");

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setDiffs(await dbCompare(db, other));
      setCompared([db, other]);
      setKind("all");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of diffs ?? []) c[d.kind] = (c[d.kind] ?? 0) + 1;
    return c;
  }, [diffs]);
  const shown = (diffs ?? []).filter((d) => kind === "all" || d.kind === kind);
  const [a, b] = compared ?? [db, other];
  const changeText = (d: SchemaDiff) =>
    d.change === "only_a" ? `Only in ${a}` : d.change === "only_b" ? `Only in ${b}` : "Different";

  return (
    <section className="compare" aria-labelledby="compare-title" data-guide="compare-panel">
      <div className="compare-head">
        <h3 id="compare-title">
          <ArrowLeftRight size={15} aria-hidden="true" /> Compare {db} with another database
        </h3>
        <button className="btn btn-small btn-quiet" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="field-hint">
        Finds tables, columns, indexes and links that differ, for example between your app's database and a copy of the
        live one. It only reads; nothing is changed.
      </p>
      {others.length === 0 ? (
        <p className="field-hint">There's no other database on this server to compare with yet.</p>
      ) : (
        <div className="compare-pick">
          <code>{db}</code>
          <span aria-hidden="true">with</span>
          <label className="visually-hidden" htmlFor="compare-other">
            Database to compare with
          </label>
          <select id="compare-other" value={other} onChange={(e) => setOther(e.target.value)}>
            {others.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary btn-small"
            data-guide="compare-run"
            disabled={busy || !other}
            data-working={busy || undefined}
            onClick={() => void run()}
          >
            {busy ? "Comparing…" : "Compare"}
          </button>
        </div>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {diffs && (
        <div className="compare-result" role="status">
          {diffs.length === 0 ? (
            <p className="hint-ok">
              <strong>
                {a} and {b} have the same tables, columns, indexes and links.
              </strong>{" "}
              (Their data may still differ.)
            </p>
          ) : (
            <>
              <p>
                <strong>
                  {diffs.length} difference{diffs.length === 1 ? "" : "s"}
                </strong>{" "}
                between <code>{a}</code> and <code>{b}</code>.
              </p>
              <div className="compare-filter" role="group" aria-label="Show">
                <button className="btn btn-small" aria-pressed={kind === "all"} onClick={() => setKind("all")}>
                  All ({diffs.length})
                </button>
                {(Object.keys(KIND_LABEL) as SchemaDiff["kind"][])
                  .filter((k) => counts[k])
                  .map((k) => (
                    <button key={k} className="btn btn-small" aria-pressed={kind === k} onClick={() => setKind(k)}>
                      {KIND_LABEL[k]} ({counts[k]})
                    </button>
                  ))}
              </div>
              <div className="compare-scroll">
                <table className="data-table compare-table">
                  <thead>
                    <tr>
                      <th scope="col">What</th>
                      <th scope="col">Where</th>
                      <th scope="col">{a}</th>
                      <th scope="col">{b}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((d) => (
                      <tr key={`${d.kind}.${d.table}.${d.name}.${d.change}`}>
                        <td>
                          <span className={`compare-change ${d.change}`}>{changeText(d)}</span>
                        </td>
                        <td>
                          <code>{d.name ? `${d.table}.${d.name}` : d.table}</code>{" "}
                          <span className="muted">{d.kind === "key" ? "link" : d.kind}</span>
                        </td>
                        <td>
                          {d.a ??
                            (d.change === "only_b" ? (
                              <span className="muted">missing</span>
                            ) : d.kind === "table" ? (
                              "the whole table"
                            ) : (
                              ""
                            ))}
                        </td>
                        <td>
                          {d.b ??
                            (d.change === "only_a" ? (
                              <span className="muted">missing</span>
                            ) : d.kind === "table" ? (
                              "the whole table"
                            ) : (
                              ""
                            ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
