import { useEffect, useState } from "react";
import { Bookmark, History, Trash2 } from "lucide-react";
import type { DbEngine } from "../lib/db";
import { storageKey } from "../lib/practice";

/** One query that ran: what, where, when, and whether it worked. */
export interface HistoryItem {
  sql: string;
  db: string | null;
  engine: DbEngine;
  at: number;
  ok: boolean;
  /** Rows returned or changed, when it worked. */
  rows?: number;
}

export interface SavedQuery {
  name: string;
  sql: string;
  db: string | null;
  engine: DbEngine;
}

const HISTORY_KEY = "nexdb.sqlHistory";
const SAVED_KEY = "nexdb.sqlSaved";
const HISTORY_MAX = 100;
const CHANGED = "nexdb:sql-library";

function read<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(key)) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(items));
  } catch {
    // Too full or blocked: the list just isn't kept this time.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Adds a query to the history; running the same text again moves it to the top. */
export function remember(item: HistoryItem) {
  const rest = read<HistoryItem>(HISTORY_KEY).filter((h) => !(h.sql.trim() === item.sql.trim() && h.db === item.db));
  write(HISTORY_KEY, [item, ...rest].slice(0, HISTORY_MAX));
}

export function saveQuery(q: SavedQuery) {
  const rest = read<SavedQuery>(SAVED_KEY).filter((s) => s.name !== q.name);
  write(SAVED_KEY, [q, ...rest]);
}

export function savedNames(): string[] {
  return read<SavedQuery>(SAVED_KEY).map((s) => s.name);
}

function useList<T>(key: string): T[] {
  const [items, setItems] = useState(() => read<T>(key));
  useEffect(() => {
    const again = () => setItems(read<T>(key));
    window.addEventListener(CHANGED, again);
    return () => window.removeEventListener(CHANGED, again);
  }, [key]);
  return items;
}

function when(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** The first line that says something, for the list. */
function preview(sql: string): string {
  const line =
    sql
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("--")) ?? sql.trim();
  return line.length > 90 ? `${line.slice(0, 90)}…` : line;
}

/**
 * History and Saved, under the SQL editor. Picking one puts it in the editor (Ctrl+Z undoes);
 * nothing runs until Run is pressed.
 */
export function SqlLibrary({ engine, onPick }: { engine: DbEngine; onPick: (sql: string) => void }) {
  const [view, setView] = useState<"history" | "saved" | null>(null);
  const [filter, setFilter] = useState("");
  const [clearing, setClearing] = useState(false);
  const history = useList<HistoryItem>(HISTORY_KEY).filter((h) => h.engine === engine);
  const saved = useList<SavedQuery>(SAVED_KEY).filter((s) => s.engine === engine);

  const q = filter.trim().toLowerCase();
  const shownHistory = q
    ? history.filter((h) => h.sql.toLowerCase().includes(q) || h.db?.toLowerCase().includes(q))
    : history;
  const shownSaved = q
    ? saved.filter((s) => s.name.toLowerCase().includes(q) || s.sql.toLowerCase().includes(q))
    : saved;

  const toggle = (v: "history" | "saved") => {
    setView((cur) => (cur === v ? null : v));
    setClearing(false);
  };

  return (
    <div className="sql-library">
      <div className="sql-library-tabs" role="group" aria-label="Earlier queries">
        <button
          type="button"
          className="btn btn-small btn-quiet"
          data-guide="sql-history"
          aria-expanded={view === "history"}
          aria-controls="sql-library-list"
          onClick={() => toggle("history")}
        >
          <History size={13} aria-hidden="true" /> History
          {history.length > 0 && ` (${history.length})`}
        </button>
        <button
          type="button"
          className="btn btn-small btn-quiet"
          aria-expanded={view === "saved"}
          aria-controls="sql-library-list"
          onClick={() => toggle("saved")}
        >
          <Bookmark size={13} aria-hidden="true" /> Saved
          {saved.length > 0 && ` (${saved.length})`}
        </button>
      </div>

      {view && (
        <div className="sql-library-panel" id="sql-library-list">
          <div className="sql-library-head">
            <input
              className="input input-small"
              type="search"
              placeholder={view === "history" ? "Search history" : "Search saved queries"}
              aria-label={view === "history" ? "Search history" : "Search saved queries"}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {view === "history" && history.length > 0 && !clearing && (
              <button type="button" className="btn btn-small btn-quiet" onClick={() => setClearing(true)}>
                Clear history…
              </button>
            )}
            {clearing && (
              <span className="sql-library-confirm" role="alert">
                Clear all {history.length}? Saved queries stay.
                <button type="button" className="btn btn-small" onClick={() => setClearing(false)}>
                  Keep
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => {
                    write(
                      HISTORY_KEY,
                      read<HistoryItem>(HISTORY_KEY).filter((h) => h.engine !== engine),
                    );
                    setClearing(false);
                  }}
                >
                  Clear
                </button>
              </span>
            )}
          </div>

          {view === "history" ? (
            shownHistory.length === 0 ? (
              <p className="field-hint">
                {history.length === 0 ? "Queries you run show up here." : `Nothing matches “${filter}”.`}
              </p>
            ) : (
              <ul className="sql-library-list">
                {shownHistory.map((h) => (
                  <li key={`${h.at}-${h.sql.length}`}>
                    <button type="button" className="sql-library-item" onClick={() => onPick(h.sql)} title={h.sql}>
                      <code className="sql-library-sql">{preview(h.sql)}</code>
                      <span className="sql-library-meta">
                        <span className={h.ok ? "hint-ok" : "hint-bad"}>{h.ok ? "worked" : "failed"}</span>
                        {h.db && ` · ${h.db}`} · {when(h.at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : shownSaved.length === 0 ? (
            <p className="field-hint">
              {saved.length === 0
                ? "Press Save next to Run to keep a query here with a name."
                : `Nothing matches “${filter}”.`}
            </p>
          ) : (
            <ul className="sql-library-list">
              {shownSaved.map((s) => (
                <li key={s.name} className="sql-library-row">
                  <button type="button" className="sql-library-item" onClick={() => onPick(s.sql)} title={s.sql}>
                    <strong>{s.name}</strong>
                    <code className="sql-library-sql">{preview(s.sql)}</code>
                    {s.db && <span className="sql-library-meta">{s.db}</span>}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-icon btn-quiet"
                    aria-label={`Delete saved query ${s.name}`}
                    title="Delete"
                    onClick={() =>
                      write(
                        SAVED_KEY,
                        read<SavedQuery>(SAVED_KEY).filter((x) => x.name !== s.name),
                      )
                    }
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="field-hint">Picking one puts it in the editor. Nothing runs until you press Run.</p>
        </div>
      )}
    </div>
  );
}

/** The Save button beside Run: asks for a name inline. */
export function SaveQuery({ sql, db, engine }: { sql: string; db: string | null; engine: DbEngine }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const taken = savedNames().includes(name.trim());

  if (!naming)
    return (
      <>
        <button
          type="button"
          className="btn"
          disabled={!sql.trim()}
          onClick={() => {
            setNaming(true);
            setSaved(null);
            setName(preview(sql).slice(0, 40));
          }}
        >
          <Bookmark size={14} aria-hidden="true" /> Save…
        </button>
        {saved && (
          <span className="field-hint hint-ok" role="status">
            Saved as “{saved}”.
          </span>
        )}
      </>
    );

  return (
    <form
      className="sql-save"
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (!n) return;
        saveQuery({ name: n, sql, db, engine });
        setSaved(n);
        setNaming(false);
      }}
    >
      <label className="visually-hidden" htmlFor="sql-save-name">
        Name for this query
      </label>
      <input
        id="sql-save-name"
        className="input input-small"
        value={name}
        autoFocus
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
      />
      <button type="submit" className="btn btn-small btn-primary" disabled={!name.trim()}>
        {taken ? "Replace" : "Save"}
      </button>
      <button type="button" className="btn btn-small" onClick={() => setNaming(false)}>
        Cancel
      </button>
      {taken && <span className="field-hint">A saved query has this name; saving replaces it.</span>}
    </form>
  );
}
