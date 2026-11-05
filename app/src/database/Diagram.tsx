import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { KeyRound, LayoutGrid, List, Maximize2, Minus, Plus, RefreshCw, Search } from "lucide-react";
import { dbSchema, type Schema, type SchemaLink, type SchemaTable } from "../lib/schema";

const CARD_W = 230;
const HEAD_H = 34;
const ROW_H = 22;
const GAP_X = 110;
const GAP_Y = 36;

type Pos = Record<string, { x: number; y: number }>;

const layoutKey = (db: string) => `nexdb.diagram.${db}`;

/** Tables placed in columns by how they point at each other: tables nothing points away from on
 * the left (users), the ones pointing at them to the right (posts → comments). */
export function autoLayout(schema: Schema, keysOnly: boolean): Pos {
  const level = new Map<string, number>(schema.tables.map((t) => [t.name, 0]));
  // A table sits one column right of every table it points at (cycles stop after a few passes).
  for (let pass = 0; pass < schema.tables.length; pass++) {
    let moved = false;
    for (const l of schema.links) {
      if (l.table === l.to_table) continue;
      const want = (level.get(l.to_table) ?? 0) + 1;
      if ((level.get(l.table) ?? 0) < want && want < schema.tables.length) {
        level.set(l.table, want);
        moved = true;
      }
    }
    if (!moved) break;
  }
  // Tables with no links at all go in a column of their own at the end.
  const linked = new Set(schema.links.flatMap((l) => [l.table, l.to_table]));
  const maxLevel = Math.max(0, ...[...level.entries()].filter(([n]) => linked.has(n)).map(([, v]) => v));
  const columns: string[][] = [];
  for (const t of schema.tables) {
    const c = linked.has(t.name) ? (level.get(t.name) ?? 0) : maxLevel + (schema.links.length ? 1 : 0);
    (columns[c] ??= []).push(t.name);
  }
  const pos: Pos = {};
  columns.forEach((names, c) => {
    let y = 20;
    for (const n of names ?? []) {
      pos[n] = { x: 20 + c * (CARD_W + GAP_X), y };
      y +=
        cardHeight(
          schema.tables.find((t) => t.name === n)!,
          keysOnly,
        ) + GAP_Y;
    }
  });
  return pos;
}

function shownColumns(t: SchemaTable, keysOnly: boolean, linkedCols: Set<string>) {
  return keysOnly ? t.columns.filter((c) => c.key === "PRI" || linkedCols.has(`${t.name}.${c.name}`)) : t.columns;
}

function cardHeight(t: SchemaTable, keysOnly: boolean, linkedCols = new Set<string>()) {
  return HEAD_H + Math.max(1, shownColumns(t, keysOnly, linkedCols).length) * ROW_H + 8;
}

function loadPositions(db: string): Pos | null {
  try {
    const v = JSON.parse(localStorage.getItem(layoutKey(db)) ?? "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/**
 * A database's tables and the foreign keys between them. Drag tables to arrange them (the layout
 * is remembered), drag the background or use the wheel to move around, Ctrl+wheel to zoom.
 */
export function Diagram({ db, onClose }: { db: string; onClose?: () => void }) {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos>({});
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [keysOnly, setKeysOnly] = useState(false);
  const [mode, setMode] = useState<"diagram" | "list">("diagram");
  const [find, setFind] = useState("");
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: "pan" | "card"; name?: string; sx: number; sy: number; ox: number; oy: number } | null>(
    null,
  );

  const load = useCallback(() => {
    setError(null);
    dbSchema(db)
      .then((s) => {
        setSchema(s);
        const saved = loadPositions(db);
        const auto = autoLayout(s, false);
        // Keep saved spots for known tables; new tables get the automatic place.
        setPos(Object.fromEntries(s.tables.map((t) => [t.name, saved?.[t.name] ?? auto[t.name]])));
      })
      .catch((e) => setError(String(e)));
  }, [db]);
  useEffect(load, [load]);

  const linkedCols = useMemo(
    () =>
      new Set(
        (schema?.links ?? []).flatMap((l) => [
          ...l.columns.map((c) => `${l.table}.${c}`),
          ...l.to_columns.map((c) => `${l.to_table}.${c}`),
        ]),
      ),
    [schema],
  );

  const save = (next: Pos) => {
    try {
      localStorage.setItem(layoutKey(db), JSON.stringify(next));
    } catch {
      // The layout just isn't remembered.
    }
  };

  const fit = useCallback(() => {
    if (!schema || !svg.current) return;
    const box = svg.current.getBoundingClientRect();
    const xs = schema.tables.map((t) => pos[t.name]?.x ?? 0);
    const ys = schema.tables.map((t) => pos[t.name]?.y ?? 0);
    const right = Math.max(...schema.tables.map((t) => (pos[t.name]?.x ?? 0) + CARD_W));
    const bottom = Math.max(...schema.tables.map((t) => (pos[t.name]?.y ?? 0) + cardHeight(t, keysOnly, linkedCols)));
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const zoom = Math.min(
      1.4,
      Math.max(0.3, Math.min((box.width - 40) / (right - left), (box.height - 40) / (bottom - top))),
    );
    setView({ zoom, x: 20 - left * zoom, y: 20 - top * zoom });
  }, [schema, pos, keysOnly, linkedCols]);

  // Fit once when the diagram first appears.
  const fitted = useRef(false);
  useLayoutEffect(() => {
    if (schema && !fitted.current && Object.keys(pos).length) {
      fitted.current = true;
      fit();
    }
  }, [schema, pos, fit]);

  // Searching jumps to the first table that matches.
  useEffect(() => {
    if (!schema || !find.trim() || !svg.current) return;
    const t = schema.tables.find((x) => x.name.toLowerCase().includes(find.trim().toLowerCase()));
    if (!t || !pos[t.name]) return;
    const box = svg.current.getBoundingClientRect();
    setSelected(t.name);
    setView((v) => ({
      ...v,
      x: box.width / 2 - (pos[t.name].x + CARD_W / 2) * v.zoom,
      y: 60 - pos[t.name].y * v.zoom,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find]);

  const zoomBy = (factor: number, cx?: number, cy?: number) =>
    setView((v) => {
      const zoom = Math.min(2.5, Math.max(0.2, v.zoom * factor));
      const box = svg.current?.getBoundingClientRect();
      const px = cx ?? (box ? box.width / 2 : 0);
      const py = cy ?? (box ? box.height / 2 : 0);
      return { zoom, x: px - ((px - v.x) * zoom) / v.zoom, y: py - ((py - v.y) * zoom) / v.zoom };
    });

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      const box = svg.current!.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - box.left, e.clientY - box.top);
    } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
  };

  const onPointerDown = (e: React.PointerEvent, name?: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (name) {
      setSelected(name);
      drag.current = { kind: "card", name, sx: e.clientX, sy: e.clientY, ox: pos[name].x, oy: pos[name].y };
    } else {
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.kind === "pan") setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    else setPos((p) => ({ ...p, [d.name!]: { x: d.ox + dx / view.zoom, y: d.oy + dy / view.zoom } }));
  };
  const onPointerUp = () => {
    if (drag.current?.kind === "card") save(pos);
    drag.current = null;
  };

  const resetLayout = () => {
    if (!schema) return;
    const auto = autoLayout(schema, keysOnly);
    setPos(auto);
    save(auto);
    fitted.current = false;
  };

  if (error)
    return (
      <div className="diagram diagram-message">
        <p className="field-error" role="alert">
          {error}
        </p>
        <button className="btn" onClick={load}>
          Try again
        </button>
      </div>
    );
  if (!schema)
    return (
      <div className="diagram diagram-message">
        <p className="lede" role="status">
          Reading {db}'s tables and keys…
        </p>
      </div>
    );

  const related = (l: SchemaLink) => !selected || l.table === selected || l.to_table === selected;
  const rowY = (t: SchemaTable, column: string) => {
    const cols = shownColumns(t, keysOnly, linkedCols);
    const i = Math.max(
      0,
      cols.findIndex((c) => c.name === column),
    );
    return (pos[t.name]?.y ?? 0) + HEAD_H + i * ROW_H + ROW_H / 2;
  };

  return (
    <div className="diagram">
      <div className="diagram-bar" role="toolbar" aria-label="Diagram">
        <strong className="diagram-title">{db}</strong>
        <span className="field-hint">
          {schema.tables.length} tables · {schema.links.length} links
          {schema.partial && " · very large database: some keys may be missing"}
        </span>
        <label className="diagram-find">
          <Search size={13} aria-hidden="true" />
          <span className="visually-hidden">Find a table</span>
          <input
            className="input input-small"
            type="search"
            placeholder="Find a table"
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
        </label>
        <div className="diagram-tools">
          <button
            className="btn btn-small"
            aria-pressed={mode === "list"}
            onClick={() => setMode(mode === "list" ? "diagram" : "list")}
            title={
              mode === "list"
                ? "Show the diagram"
                : "Show the links as a list (easier with a keyboard or screen reader)"
            }
          >
            {mode === "list" ? <LayoutGrid size={13} aria-hidden="true" /> : <List size={13} aria-hidden="true" />}
            {mode === "list" ? "Diagram" : "List"}
          </button>
          {mode === "diagram" && (
            <>
              <label className="check-row">
                <input type="checkbox" checked={keysOnly} onChange={(e) => setKeysOnly(e.target.checked)} />
                Keys only
              </label>
              <button
                className="btn btn-small btn-icon"
                aria-label="Zoom out"
                title="Zoom out (Ctrl+wheel)"
                onClick={() => zoomBy(1 / 1.2)}
              >
                <Minus size={13} aria-hidden="true" />
              </button>
              <span className="diagram-zoom" aria-live="polite">
                {Math.round(view.zoom * 100)}%
              </span>
              <button
                className="btn btn-small btn-icon"
                aria-label="Zoom in"
                title="Zoom in (Ctrl+wheel)"
                onClick={() => zoomBy(1.2)}
              >
                <Plus size={13} aria-hidden="true" />
              </button>
              <button className="btn btn-small" onClick={fit} title="Show every table">
                <Maximize2 size={13} aria-hidden="true" /> Fit
              </button>
              <button
                className="btn btn-small btn-quiet"
                onClick={resetLayout}
                title="Put the tables back in their automatic places"
              >
                Tidy up
              </button>
            </>
          )}
          <button
            className="btn btn-small btn-icon"
            aria-label="Read the database again"
            title="Read again"
            onClick={load}
          >
            <RefreshCw size={13} aria-hidden="true" />
          </button>
          {onClose && (
            <button className="btn btn-small" data-guide="diagram-close" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      {mode === "list" ? (
        <LinkList schema={schema} />
      ) : (
        <div className="diagram-canvas-wrap">
          {schema.links.length === 0 && (
            <p className="notice diagram-empty" role="status">
              {db} has no foreign keys, so there are no lines to draw. Tables link when a column like posts.user_id is
              declared to point at users.id.
            </p>
          )}
          <svg
            ref={svg}
            className="diagram-canvas"
            role="img"
            aria-label={`Relationship diagram of ${db}: ${schema.links.length} links between ${schema.tables.length} tables. Use List for a readable version.`}
            onWheel={onWheel}
            onPointerDown={(e) => {
              setSelected(null);
              onPointerDown(e);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <defs>
              <marker
                id="dg-one"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="10"
                markerHeight="10"
                orient="auto-start-reverse"
              >
                <path d="M9 1 V9 M6 1 V9" className="diagram-mark" />
              </marker>
              <marker
                id="dg-many"
                viewBox="0 0 12 12"
                refX="1"
                refY="6"
                markerWidth="12"
                markerHeight="12"
                orient="auto-start-reverse"
              >
                <path d="M1 6 L11 1 M1 6 L11 6 M1 6 L11 11" className="diagram-mark" />
              </marker>
            </defs>
            <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
              {schema.links.map((l) => {
                const from = schema.tables.find((t) => t.name === l.table);
                const to = schema.tables.find((t) => t.name === l.to_table);
                if (!from || !to || !pos[from.name] || !pos[to.name]) return null;
                const fy = rowY(from, l.columns[0]);
                const ty = rowY(to, l.to_columns[0]);
                const fromLeft = pos[from.name].x > pos[to.name].x + CARD_W / 2;
                const fx = fromLeft ? pos[from.name].x : pos[from.name].x + CARD_W;
                const tx = fromLeft ? pos[to.name].x + CARD_W : pos[to.name].x;
                const bend = Math.max(40, Math.abs(tx - fx) / 2) * (fromLeft ? -1 : 1);
                const on = related(l);
                return (
                  <path
                    key={`${l.table}.${l.name}`}
                    d={`M${fx} ${fy} C${fx + bend} ${fy} ${tx - bend} ${ty} ${tx} ${ty}`}
                    className={on ? (selected ? "diagram-link on" : "diagram-link") : "diagram-link dim"}
                    markerStart="url(#dg-many)"
                    markerEnd="url(#dg-one)"
                  >
                    <title>
                      {l.table}.{l.columns.join(", ")} → {l.to_table}.{l.to_columns.join(", ")}
                    </title>
                  </path>
                );
              })}
              {schema.tables.map((t) => {
                const p = pos[t.name];
                if (!p) return null;
                const cols = shownColumns(t, keysOnly, linkedCols);
                const dim =
                  selected &&
                  selected !== t.name &&
                  !schema.links.some(
                    (l) =>
                      (l.table === selected && l.to_table === t.name) ||
                      (l.to_table === selected && l.table === t.name),
                  );
                return (
                  <g
                    key={t.name}
                    transform={`translate(${p.x} ${p.y})`}
                    className={`diagram-card${selected === t.name ? " selected" : ""}${dim ? " dim" : ""}`}
                    onPointerDown={(e) => onPointerDown(e, t.name)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${t.name}, ${t.columns.length} columns`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelected(selected === t.name ? null : t.name);
                    }}
                  >
                    <rect
                      width={CARD_W}
                      height={cardHeight(t, keysOnly, linkedCols)}
                      rx="8"
                      className="diagram-card-bg"
                    />
                    <rect width={CARD_W} height={HEAD_H} rx="8" className="diagram-card-head" />
                    <rect y={HEAD_H - 8} width={CARD_W} height="8" className="diagram-card-head" />
                    <text x="12" y="22" className="diagram-card-title">
                      {t.name}
                    </text>
                    {t.rows != null && (
                      <text x={CARD_W - 12} y="22" textAnchor="end" className="diagram-card-rows">
                        {t.rows} rows
                      </text>
                    )}
                    {cols.map((c, i) => {
                      const y = HEAD_H + i * ROW_H;
                      const isFk = schema.links.some((l) => l.table === t.name && l.columns.includes(c.name));
                      return (
                        <g key={c.name} transform={`translate(0 ${y})`}>
                          <text
                            x="12"
                            y="15"
                            className={c.key === "PRI" ? "diagram-col key" : isFk ? "diagram-col fk" : "diagram-col"}
                          >
                            {c.key === "PRI" && <tspan className="diagram-tag">PK </tspan>}
                            {isFk && <tspan className="diagram-tag fk">FK </tspan>}
                            {c.name}
                          </text>
                          <text x={CARD_W - 12} y="15" textAnchor="end" className="diagram-type">
                            {c.column_type.length > 18 ? `${c.column_type.slice(0, 17)}…` : c.column_type}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          </svg>
          <p className="diagram-help field-hint">
            <KeyRound size={12} aria-hidden="true" /> PK primary key · FK points at another table · drag tables to
            arrange them · drag the background or scroll to move · Ctrl+scroll to zoom · click a table to see its links
          </p>
        </div>
      )}
    </div>
  );
}

/** The same relationships as text: which table points at which, through which columns. */
function LinkList({ schema }: { schema: Schema }) {
  const byTable = schema.tables.map((t) => ({
    table: t,
    out: schema.links.filter((l) => l.table === t.name),
    into: schema.links.filter((l) => l.to_table === t.name),
  }));
  return (
    <div className="diagram-list">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Table</th>
            <th scope="col">Points at</th>
            <th scope="col">Pointed at by</th>
          </tr>
        </thead>
        <tbody>
          {byTable.map(({ table, out, into }) => (
            <tr key={table.name}>
              <th scope="row">
                <code>{table.name}</code>
              </th>
              <td>
                {out.length === 0
                  ? "—"
                  : out.map((l) => (
                      <div key={l.name}>
                        <code>{l.columns.join(", ")}</code> → <code>{l.to_table}</code>
                      </div>
                    ))}
              </td>
              <td>
                {into.length === 0
                  ? "—"
                  : into.map((l) => (
                      <div key={`${l.table}.${l.name}`}>
                        <code>{l.table}</code>.<code>{l.columns.join(", ")}</code>
                      </div>
                    ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
