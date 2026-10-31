import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, DatabaseZap, Play, Plus, Table2, Trash2 } from "lucide-react";
import {
  NEEDS_PASSWORD,
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
} from "../lib/db";
import { inDesktopApp } from "../lib/scan";
import { PhpMyAdmin } from "./PhpMyAdmin";
import { Backups } from "./Backups";
import { RowEditor } from "./RowEditor";
import { Users } from "./Users";
import { dbSaveCsv } from "../lib/db";
import { nexCelebrate } from "../lib/nex";
import { sqlTemplates, touchesEveryRow, type SqlTemplate } from "../lib/sqlTemplates";
import { dbExportSql } from "../lib/db";
import { FileDown, FileUp } from "lucide-react";
import { createBackup } from "../lib/backups";

type Tab = "browse" | "structure" | "sql" | "backups" | "users";

export function Database({ active }: { active: boolean }) {
  const [version, setVersion] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [dbs, setDbs] = useState<DatabaseInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // Going up opens the .sql file picker on the Backups tab.
  const [importToken, setImportToken] = useState(0);
  // The selected database's table list; clicking that database again folds it away.
  const [listOpen, setListOpen] = useState(true);
  const choose = (name: string) => {
    if (name === selected) setListOpen((open) => !open);
    else {
      setListOpen(true);
      void pick(name);
    }
  };
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
    setTab((t) => (t === "sql" || t === "backups" ? t : "browse"));
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
          <button
            className="btn"
            disabled={!version}
            title="Bring in a .sql file from another PC or a web host"
            onClick={() => {
              setTab("backups");
              setImportToken((n) => n + 1);
            }}
          >
            <FileUp size={15} aria-hidden="true" /> Import .sql
          </button>
          <button
            className="btn btn-primary"
            disabled={!version}
            onClick={() => setCreating((v) => !v)}
            aria-expanded={creating}
          >
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
          <ConnectCard needsPassword={needsPassword} error={connectError} busy={connecting} onConnect={connect} />
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
              <DbGroup
                label="Your databases"
                dbs={userDbs}
                selected={selected}
                open={listOpen}
                tables={tables}
                table={table}
                onPick={choose}
                onTable={openTable}
              />
              <DbGroup
                label="MySQL built-in"
                folded
                dbs={systemDbs}
                selected={selected}
                open={listOpen}
                tables={tables}
                table={table}
                onPick={choose}
                onTable={openTable}
              />
            </nav>

            <section className="db-main" aria-label="Database contents">
              <div className="log-tabs db-tabs" role="tablist">
                <TabButton id="browse" tab={tab} onSelect={setTab}>
                  Browse
                </TabButton>
                <TabButton id="structure" tab={tab} onSelect={setTab}>
                  Structure
                </TabButton>
                <TabButton id="sql" tab={tab} onSelect={setTab}>
                  SQL
                </TabButton>
                <TabButton id="backups" tab={tab} onSelect={setTab}>
                  Backups
                </TabButton>
                <TabButton id="users" tab={tab} onSelect={setTab}>
                  Users
                </TabButton>
                <span className="db-where">
                  {selected ? (table ? `${selected} › ${table}` : selected) : "Pick a database"}
                </span>
              </div>

              {tab === "browse" && selected && table && (
                <RowEditor key={`${selected}.${table}`} db={selected} table={table} />
              )}
              {tab === "users" && <Users databases={dbs.filter((d) => !d.system).map((d) => d.name)} />}
              {tab === "browse" && selected && !table && (
                <Overview
                  db={selected}
                  tables={tables}
                  system={dbs.find((d) => d.name === selected)?.system ?? false}
                  onTable={openTable}
                  onImport={() => {
                    setTab("backups");
                    setImportToken((n) => n + 1);
                  }}
                  onDropped={async () => {
                    setSelected(null);
                    setTables([]);
                    await loadDbs();
                  }}
                />
              )}
              {tab === "browse" && !selected && <p className="lede">Pick a database on the left to see its tables.</p>}
              {tab === "structure" && selected && table && (
                <Structure key={`${selected}.${table}`} db={selected} table={table} />
              )}
              {tab === "structure" && !table && (
                <p className="lede">
                  {selected
                    ? `Pick a table of ${selected} on the left to see its columns.`
                    : "Pick a database on the left, then one of its tables, to see its columns."}
                </p>
              )}
              {tab === "sql" && (
                <SqlRunner db={selected} table={table} onChanged={() => selected && pick(selected).then(loadDbs)} />
              )}
              {tab === "backups" && (
                <Backups
                  importToken={importToken}
                  selected={selected}
                  databases={dbs.map((d) => d.name)}
                  onChanged={() => {
                    void loadDbs();
                    if (selected) void pick(selected);
                  }}
                />
              )}
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
  folded = false,
  dbs,
  selected,
  open,
  tables,
  table,
  onPick,
  onTable,
}: {
  label: string;
  /** Starts folded away (MySQL's own databases), unless one of them is open. */
  folded?: boolean;
  dbs: DatabaseInfo[];
  selected: string | null;
  open: boolean;
  tables: TableInfo[];
  table: string | null;
  onPick: (name: string) => void;
  onTable: (name: string) => void;
}) {
  const [shown, setShown] = useState(!folded);
  if (dbs.length === 0) return null;
  const visible = shown || dbs.some((d) => d.name === selected);
  return (
    <div className="db-group">
      {folded ? (
        <button className="db-group-label db-group-toggle" aria-expanded={visible} onClick={() => setShown((v) => !v)}>
          <ChevronRight size={12} className="db-chevron" aria-hidden="true" />
          {label} ({dbs.length})
        </button>
      ) : (
        <h2 className="db-group-label">{label}</h2>
      )}
      {visible && (
        <ul>
          {dbs.map((d) => (
            <li key={d.name}>
              <button
                className={d.name === selected ? "db-item current" : "db-item"}
                aria-expanded={d.name === selected && open}
                onClick={() => onPick(d.name)}
              >
                <ChevronRight size={14} className="db-chevron" aria-hidden="true" />
                <span className="db-name">{d.name}</span>
                <span className="db-count" title={`${d.tables} table${d.tables === 1 ? "" : "s"}`}>
                  {d.tables}
                </span>
              </button>
              {d.name === selected && open && tables.length > 0 && (
                <ul className="db-tables">
                  {tables.map((t) => (
                    <li key={t.name}>
                      <button
                        className={t.name === table ? "db-table current" : "db-table"}
                        onClick={() => onTable(t.name)}
                      >
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
      )}
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
  onImport,
}: {
  db: string;
  tables: TableInfo[];
  system: boolean;
  onTable: (name: string) => void;
  onDropped: () => Promise<void>;
  onImport: () => void;
}) {
  const [exported, setExported] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [backupFirst, setBackupFirst] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

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
        <div className="db-transfer">
          <button
            className="btn"
            onClick={async () => {
              setError(null);
              try {
                const path = await dbExportSql(db);
                if (path) {
                  setExported(path);
                  nexCelebrate(`${db} is saved as a .sql file.`);
                }
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            <FileDown size={14} aria-hidden="true" /> Export .sql…
          </button>
          <button className="btn" onClick={onImport}>
            <FileUp size={14} aria-hidden="true" /> Import .sql…
          </button>
          <span className="field-hint">
            {exported
              ? `Saved to ${exported}`
              : "Export saves the whole database as one file you can copy anywhere. Import brings one in."}
          </span>
        </div>
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
                setError(null);
                try {
                  if (backupFirst) {
                    setWorking(`Backing up ${db}…`);
                    try {
                      await createBackup(db);
                    } catch (err) {
                      throw `The backup didn't work, so nothing was deleted. ${err} Untick “Back up first” to delete without one.`;
                    }
                  }
                  setWorking(`Deleting ${db}…`);
                  await dbDrop(db);
                  await onDropped();
                } catch (err) {
                  setError(String(err));
                } finally {
                  setWorking(null);
                }
              }}
            >
              <label className="field">
                <span className="field-label">
                  This deletes <strong>{db}</strong> and everything in it. Type its name to confirm.
                </span>
                <input
                  className="input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                  spellCheck={false}
                />
              </label>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setTyped("");
                }}
              >
                Cancel
              </button>
              <label className="set-check backup-first">
                <input type="checkbox" checked={backupFirst} onChange={(e) => setBackupFirst(e.target.checked)} />
                <span>Back up {db} first (recommended)</span>
              </label>
              {working && (
                <p className="field-hint" role="status">
                  {working}
                </p>
              )}
              <button className="btn btn-danger" type="submit" disabled={typed !== db || !!working}>
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

function Structure({ db, table }: { db: string; table: string }) {
  const [cols, setCols] = useState<ColumnInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    dbColumns(db, table)
      .then(setCols)
      .catch((e) => setError(String(e)));
  }, [db, table]);
  if (error)
    return (
      <div className="error-box" role="alert">
        <p>{error}</p>
      </div>
    );
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

function SqlRunner({ db, table, onChanged }: { db: string | null; table: string | null; onChanged: () => void }) {
  const [sql, setSql] = useState("SHOW DATABASES;");
  const [out, setOut] = useState<QueryOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cols, setCols] = useState<ColumnInfo[]>([]);
  const [picked, setPicked] = useState<SqlTemplate | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!db || !table) {
      setCols([]);
      return;
    }
    dbColumns(db, table)
      .then(setCols)
      .catch(() => setCols([]));
  }, [db, table]);

  const groups = sqlTemplates(db, table, cols);

  /** Puts a template in the editor in a way Ctrl+Z can undo. */
  function applyTemplate(t: SqlTemplate) {
    setPicked(t);
    setConfirmAll(false);
    const el = editor.current;
    if (el) {
      el.focus();
      el.select();
      if (!document.execCommand("insertText", false, t.sql)) setSql(t.sql);
    } else {
      setSql(t.sql);
    }
  }

  async function run() {
    // An UPDATE or DELETE without WHERE would touch every row: ask once.
    if (touchesEveryRow(sql) && !confirmAll) {
      setConfirmAll(true);
      return;
    }
    setConfirmAll(false);
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
      <div className="sql-templates" aria-label="Ready-made SQL">
        {groups.map((g) => (
          <div key={g.label} className="sql-group">
            <span className="sql-group-label">{g.label}</span>
            {g.templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`sql-chip${t.danger ? " danger" : ""}${picked?.id === t.id ? " current" : ""}`}
                title={t.help}
                onClick={() => applyTemplate(t)}
              >
                {t.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      <p className={picked?.danger ? "sql-help danger" : "sql-help"}>
        {picked
          ? picked.help
          : table
            ? `Pick a ready-made command above; it's filled in with ${table} and its columns. Then edit it and press Run.`
            : "Pick a ready-made command above, or type your own. Pick a table on the left and the commands use its columns."}
      </p>
      <label className="visually-hidden" htmlFor="sql-input">
        SQL
      </label>
      <textarea
        id="sql-input"
        ref={editor}
        className="sql-input"
        value={sql}
        spellCheck={false}
        onChange={(e) => {
          setSql(e.target.value);
          setConfirmAll(false);
        }}
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
        <span className="field-hint">Ctrl+Enter runs it · {db ? `using ${db}` : "no database selected"}</span>
      </div>
      {confirmAll && (
        <div className="sql-confirm" role="alert">
          <p>
            <strong>This has no WHERE, so it changes or deletes every row.</strong> Add a WHERE line to pick the rows,
            or run it anyway if that&apos;s what you want.
          </p>
          <button className="btn btn-small" onClick={() => setConfirmAll(false)}>
            Go back
          </button>
          <button className="btn btn-small btn-danger" onClick={() => void run()}>
            Run on every row
          </button>
        </div>
      )}

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
              {s.rows.length > 0 && (
                <div className="rows-toolbar">
                  <span className="quickstart-spacer" />
                  <button
                    className="btn btn-small"
                    onClick={async () => {
                      try {
                        const n = await dbSaveCsv("query-result.csv", s.columns, s.rows);
                        if (n !== null) nexCelebrate(`Saved ${n} row${n === 1 ? "" : "s"} as CSV.`);
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    Export CSV
                  </button>
                </div>
              )}
              <DataTable columns={s.columns} rows={s.rows} empty="No rows." />
              {s.truncated && (
                <p className="field-hint">
                  Showing the first {s.rows.length} rows; Export CSV saves these. Add a LIMIT, or export the table from
                  Browse to get every row.
                </p>
              )}
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
