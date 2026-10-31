import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, DatabaseZap, Play, Plus, Table2, Trash2 } from "lucide-react";
import {
  NEEDS_PASSWORD,
  dbBrowse,
  dbColumns,
  dbConnect,
  dbCreate,
  dbDatabases,
  dbDrop,
  dbNameProblem,
  dbQuery,
  dbTables,
  formatSize,
  type Cell,
  type ColumnInfo,
  type DatabaseInfo,
  type QueryOutput,
  type TableInfo,
  type TablePage,
} from "../lib/db";
import { inDesktopApp } from "../lib/scan";
import { PhpMyAdmin } from "./PhpMyAdmin";

type Tab = "browse" | "structure" | "sql";
const PAGE_SIZE = 50;

export function Database({ active }: { active: boolean }) {
  const [version, setVersion] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [dbs, setDbs] = useState<DatabaseInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [table, setTable] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("sql");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDbs = useCallback(async () => {
    try {
      setDbs(await dbDatabases());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const connect = useCallback(
    async (password?: string) => {
      setConnecting(true);
      setConnectError(null);
      try {
        const info = await dbConnect(password);
        setVersion(info.version);
        setNeedsPassword(false);
        await loadDbs();
      } catch (e) {
        const msg = String(e);
        if (msg === NEEDS_PASSWORD) {
          setNeedsPassword(true);
          if (password) setConnectError("That password didn't work.");
        } else {
          setConnectError(msg);
        }
      } finally {
        setConnecting(false);
      }
    },
    [loadDbs],
  );

  // Connect the first time the page is shown.
  const tried = useRef(false);
  useEffect(() => {
    if (active && !tried.current) {
      tried.current = true;
      void connect();
    }
  }, [active, connect]);

  async function pick(name: string) {
    setSelected(name);
    setTable(null);
    setTables([]);
    setError(null);
    try {
      setTables(await dbTables(name));
    } catch (e) {
      setError(String(e));
    }
    setTab((t) => (t === "sql" ? "sql" : "browse"));
  }

  function openTable(name: string) {
    setTable(name);
    setTab("browse");
  }

  const userDbs = dbs.filter((d) => !d.system);
  const systemDbs = dbs.filter((d) => d.system);

  return (
    <main className="panel">
      <header className="panel-head dash-head">
        <div>
          <h1>Database</h1>
          <p className="dash-summary" role="status">
            {version ? `MySQL ${version} · ${userDbs.length} of your own databases` : "Not connected"}
          </p>
        </div>
        <div className="dash-actions">
          <PhpMyAdmin onError={setError} />
          <button className="btn btn-primary" disabled={!version} onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
            <Plus size={15} aria-hidden="true" /> New database
          </button>
        </div>
      </header>

      <div className="panel-body dash-body">
        {!inDesktopApp && (
          <p className="notice" role="note">
            Browser preview: the database is simulated.
          </p>
        )}

        {!version && (
          <ConnectCard
            needsPassword={needsPassword}
            error={connectError}
            busy={connecting}
            onConnect={connect}
          />
        )}

        {error && (
          <div className="error-box" role="alert">
            <p>{error}</p>
          </div>
        )}

        {version && creating && (
          <NewDatabase
            existing={dbs.map((d) => d.name)}
            onDone={async (name) => {
              setCreating(false);
              await loadDbs();
              await pick(name);
              setTab("sql");
            }}
          />
        )}

        {version && (
          <div className="db-layout">
            <nav className="db-tree" aria-label="Databases">
              <DbGroup label="Your databases" dbs={userDbs} selected={selected} tables={tables} table={table} onPick={pick} onTable={openTable} />
              <DbGroup label="MySQL built-in" dbs={systemDbs} selected={selected} tables={tables} table={table} onPick={pick} onTable={openTable} />
            </nav>

            <section className="db-main" aria-label="Database contents">
              <div className="log-tabs db-tabs" role="tablist">
                <TabButton id="browse" tab={tab} disabled={!table} onSelect={setTab}>
                  Browse
                </TabButton>
                <TabButton id="structure" tab={tab} disabled={!table} onSelect={setTab}>
                  Structure
                </TabButton>
                <TabButton id="sql" tab={tab} onSelect={setTab}>
                  SQL
                </TabButton>
                <span className="db-where">
                  {selected ? (table ? `${selected} › ${table}` : selected) : "Pick a database"}
                </span>
              </div>

              {tab === "browse" && selected && table && <Browse key={`${selected}.${table}`} db={selected} table={table} />}
              {tab === "browse" && selected && !table && (
                <Overview
                  db={selected}
                  tables={tables}
                  system={dbs.find((d) => d.name === selected)?.system ?? false}
                  onTable={openTable}
                  onDropped={async () => {
                    setSelected(null);
                    setTables([]);
                    await loadDbs();
                  }}
                />
              )}
              {tab === "browse" && !selected && <p className="lede">Pick a database on the left to see its tables.</p>}
              {tab === "structure" && selected && table && <Structure key={`${selected}.${table}`} db={selected} table={table} />}
              {tab === "sql" && <SqlRunner db={selected} onChanged={() => selected && pick(selected).then(loadDbs)} />}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function ConnectCard({
  needsPassword,
  error,
  busy,
  onConnect,
}: {
  needsPassword: boolean;
  error: string | null;
  busy: boolean;
  onConnect: (password?: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  return (
    <form
      className="connect-card"
      onSubmit={(e) => {
        e.preventDefault();
        void onConnect(password);
      }}
    >
      <DatabaseZap size={20} aria-hidden="true" />
      <div className="connect-text">
        <strong>{needsPassword ? "MySQL needs the root password" : "Connecting to MySQL…"}</strong>
        {error && error !== NEEDS_PASSWORD && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {needsPassword && (
          <label className="field">
            <span className="field-label">Root password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              autoFocus
            />
            <span className="field-hint">Kept in memory only while NexDB is open. It is never saved.</span>
          </label>
        )}
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Connecting…" : needsPassword ? "Connect" : "Try again"}
      </button>
    </form>
  );
}

function DbGroup({
  label,
  dbs,
  selected,
  tables,
  table,
  onPick,
  onTable,
}: {
  label: string;
  dbs: DatabaseInfo[];
  selected: string | null;
  tables: TableInfo[];
  table: string | null;
  onPick: (name: string) => void;
  onTable: (name: string) => void;
}) {
  if (dbs.length === 0) return null;
  return (
    <div className="db-group">
      <h2 className="db-group-label">{label}</h2>
      <ul>
        {dbs.map((d) => (
          <li key={d.name}>
            <button
              className={d.name === selected ? "db-item current" : "db-item"}
              aria-expanded={d.name === selected}
              onClick={() => onPick(d.name)}
            >
              <ChevronRight size={14} className="db-chevron" aria-hidden="true" />
              <span className="db-name">{d.name}</span>
              <span className="db-count">{d.tables}</span>
            </button>
            {d.name === selected && tables.length > 0 && (
              <ul className="db-tables">
                {tables.map((t) => (
                  <li key={t.name}>
                    <button className={t.name === table ? "db-table current" : "db-table"} onClick={() => onTable(t.name)}>
                      <Table2 size={13} aria-hidden="true" />
                      {t.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabButton({
  id,
  tab,
  disabled,
  onSelect,
  children,
}: {
  id: Tab;
  tab: Tab;
  disabled?: boolean;
  onSelect: (t: Tab) => void;
  children: React.ReactNode;
}) {
  return (
    <button role="tab" className="log-tab" aria-selected={tab === id} disabled={disabled} onClick={() => onSelect(id)}>
      {children}
    </button>
  );
}

function NewDatabase({ existing, onDone }: { existing: string[]; onDone: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = dbNameProblem(name, existing);

  return (
    <form
      className="new-project new-db"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name || problem) return;
        setBusy(true);
        setError(null);
        try {
          await dbCreate(name);
          await onDone(name);
        } catch (err) {
          setError(String(err));
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <span className="field-label">Database name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value.trim())}
          placeholder="my_shop"
          autoFocus
          spellCheck={false}
          aria-invalid={!!problem}
          aria-describedby="nd-hint"
        />
        <span id="nd-hint" className={problem ? "field-error" : "field-hint"}>
          {problem ?? "Created with utf8mb4, which handles every language and emoji."}
        </span>
      </label>
      <button className="btn btn-primary" type="submit" disabled={!name || !!problem || busy}>
        {busy ? "Creating…" : "Create"}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function Overview({
  db,
  tables,
  system,
  onTable,
  onDropped,
}: {
  db: string;
  tables: TableInfo[];
  system: boolean;
  onTable: (name: string) => void;
  onDropped: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="db-overview">
      {tables.length === 0 ? (
        <p className="lede">
          <code>{db}</code> has no tables yet. Use the SQL tab to create one.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Engine</th>
              <th className="num">Rows</th>
              <th className="num">Size</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.name}>
                <td>
                  <button className="cell-link" onClick={() => onTable(t.name)}>
                    {t.name}
                  </button>
                  {t.is_view && <span className="kind">view</span>}
                </td>
                <td>{t.engine ?? "—"}</td>
                <td className="num">{t.rows ?? "—"}</td>
                <td className="num">{formatSize(t.size_bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!system && (
        <div className="danger-zone">
          {!confirming ? (
            <button className="btn" onClick={() => setConfirming(true)}>
              <Trash2 size={14} aria-hidden="true" /> Delete database…
            </button>
          ) : (
            <form
              className="confirm-delete"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await dbDrop(db);
                  await onDropped();
                } catch (err) {
                  setError(String(err));
                }
              }}
            >
              <label className="field">
                <span className="field-label">
                  This deletes <strong>{db}</strong> and everything in it. Type its name to confirm.
                </span>
                <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus spellCheck={false} />
              </label>
              <button className="btn" type="button" onClick={() => { setConfirming(false); setTyped(""); }}>
                Cancel
              </button>
              <button className="btn btn-danger" type="submit" disabled={typed !== db}>
                Delete forever
              </button>
              {error && (
                <p className="field-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Browse({ db, table }: { db: string; table: string }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<TablePage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    dbBrowse(db, table, page, PAGE_SIZE)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [db, table, page]);

  if (error) return <div className="error-box" role="alert"><p>{error}</p></div>;
  if (!data) return <p className="lede">Loading…</p>;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  return (
    <div className="db-browse">
      <DataTable columns={data.columns} rows={data.rows} empty="This table has no rows." />
      <div className="pager">
        <span>
          {data.total === 0 ? "0 rows" : `Rows ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + data.rows.length} of ${data.total}`}
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

function Structure({ db, table }: { db: string; table: string }) {
  const [cols, setCols] = useState<ColumnInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    dbColumns(db, table).then(setCols).catch((e) => setError(String(e)));
  }, [db, table]);
  if (error) return <div className="error-box" role="alert"><p>{error}</p></div>;
  if (!cols) return <p className="lede">Loading…</p>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Column</th>
          <th>Type</th>
          <th>Null</th>
          <th>Key</th>
          <th>Default</th>
          <th>Extra</th>
        </tr>
      </thead>
      <tbody>
        {cols.map((c) => (
          <tr key={c.name}>
            <td className="mono">{c.name}</td>
            <td className="mono">{c.column_type}</td>
            <td>{c.nullable ? "yes" : "no"}</td>
            <td>{c.key === "PRI" ? "primary" : c.key === "UNI" ? "unique" : c.key === "MUL" ? "index" : ""}</td>
            <td className="mono">{c.default ?? <span className="null">NULL</span>}</td>
            <td>{c.extra}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SqlRunner({ db, onChanged }: { db: string | null; onChanged: () => void }) {
  const [sql, setSql] = useState("SHOW DATABASES;");
  const [out, setOut] = useState<QueryOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const result = await dbQuery(db, sql);
      setOut(result);
      // Statements that change things may add or remove tables.
      if (result.sets.length === 0 || /\b(create|drop|alter|rename)\b/i.test(sql)) onChanged();
    } catch (e) {
      setOut(null);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sql">
      <label className="visually-hidden" htmlFor="sql-input">
        SQL
      </label>
      <textarea
        id="sql-input"
        className="sql-input"
        value={sql}
        spellCheck={false}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void run();
          }
        }}
        rows={6}
      />
      <div className="sql-bar">
        <button className="btn btn-primary" onClick={run} disabled={busy || !sql.trim()}>
          <Play size={14} aria-hidden="true" /> {busy ? "Running…" : "Run"}
        </button>
        <span className="field-hint">
          Ctrl+Enter runs it · {db ? `using ${db}` : "no database selected"}
        </span>
      </div>

      {error && (
        <div className="error-box" role="alert">
          <p>{error}</p>
        </div>
      )}
      {out && (
        <div className="sql-result" aria-live="polite">
          <p className="sql-summary">
            {out.sets.length === 0
              ? `Done. ${out.affected} ${out.affected === 1 ? "row" : "rows"} affected`
              : `${out.sets.map((s) => s.rows.length).join(" + ")} rows`}{" "}
            in {out.elapsed_ms} ms
          </p>
          {out.sets.map((s, i) => (
            <div key={i}>
              <DataTable columns={s.columns} rows={s.rows} empty="No rows." />
              {s.truncated && <p className="field-hint">Showing the first {s.rows.length} rows. Add a LIMIT to see others.</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataTable({ columns, rows, empty }: { columns: string[]; rows: Cell[][]; empty: string }) {
  if (rows.length === 0) {
    return (
      <p className="lede">
        {empty} {columns.length > 0 && <span className="field-hint">Columns: {columns.join(", ")}</span>}
      </p>
    );
  }
  return (
    <div className="data-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={rows.some((r) => typeof r[i] === "number") ? "num" : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={typeof cell === "number" ? "num mono" : "mono"}>
                  {cell === null ? <span className="null">NULL</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
