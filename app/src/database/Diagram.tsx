import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  KeyRound,
  LayoutGrid,
  List,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Link2,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { measure, organize, score } from "../lib/organize";
import { LinkDialog } from "./LinkDialog";
import { TableDesigner } from "./TableDesigner";
import { realDesktopApp } from "../lib/scan";
import { isPractice } from "../lib/practice";
import { Nex } from "../components/Nex";
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

/** Tables in name order, four to a row: how a diagram looks before anyone arranges it. */
function gridLayout(schema: Schema): Pos {
  const pos: Pos = {};
  const sorted = [...schema.tables].sort((a, b) => a.name.localeCompare(b.name));
  const perRow = 4;
  let y = 20;
  for (let i = 0; i < sorted.length; i += perRow) {
    const row = sorted.slice(i, i + perRow);
    row.forEach((t, j) => (pos[t.name] = { x: 20 + j * (CARD_W + 60), y }));
    y += Math.max(...row.map((t) => cardHeight(t, false))) + 40;
  }
  return pos;
}

/** Nex's layout for a schema (see lib/organize.ts). */
function nexLayout(schema: Schema, keysOnly: boolean, linkedCols: Set<string>) {
  return organize(
    schema.tables.map((t) => ({ name: t.name, h: cardHeight(t, keysOnly, linkedCols) })),
    schema.links.map((l) => ({ from: l.table, to: l.to_table })),
    { cardW: CARD_W, gapX: GAP_X, gapY: GAP_Y },
  );
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
        // Tables new since last time get a spot of their own.
        // Practice starts from a plain alphabetical grid, so Nex has something to untangle.
        const auto = isPractice() ? gridLayout(s) : nexLayout(s, false, new Set()).pos;
        if (isPractice()) {
          setPos(auto);
          return;
        }
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
  // Building: a link being drawn, the link dialog, the new-table designer.
  const [linking, setLinking] = useState<{ table: string; column: string; x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<
    { kind: "add"; table?: string; column?: string; toTable?: string } | { kind: "drop"; link: SchemaLink } | null
  >(null);
  const [designing, setDesigning] = useState(false);
  const toWorld = (clientX: number, clientY: number) => {
    const box = svg.current!.getBoundingClientRect();
    return { x: (clientX - box.left - view.x) / view.zoom, y: (clientY - box.top - view.y) / view.zoom };
  };
  const startLink = (e: React.PointerEvent, table: string, column: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setLinking({ table, column, ...toWorld(e.clientX, e.clientY) });
  };
  const tableAt = (x: number, y: number) =>
    schema?.tables.find((t) => {
      const p = pos[t.name];
      return p && x >= p.x && x <= p.x + CARD_W && y >= p.y && y <= p.y + cardHeight(t, keysOnly, linkedCols);
    });
  /** After a change: read the real database again, or (practice, preview) change the drawing only. */
  const applied = (change: { added?: SchemaLink; removed?: SchemaLink; table?: string }) => {
    setDialog(null);
    setDesigning(false);
    if (realDesktopApp && !isPractice()) {
      load();
      return;
    }
    setSchema((s) => {
      if (!s) return s;
      let links = s.links;
      if (change.removed)
        links = links.filter((l) => !(l.table === change.removed!.table && l.name === change.removed!.name));
      if (change.added) links = [...links, change.added];
      let tables = s.tables;
      if (change.table && !tables.some((t) => t.name === change.table))
        tables = [
          ...tables,
          {
            name: change.table,
            is_view: false,
            rows: 0,
            columns: [
              {
                name: "id",
                column_type: "bigint unsigned",
                nullable: false,
                key: "PRI",
                default: null,
                extra: "auto_increment",
              },
            ],
            indexes: [],
          },
        ];
      return { ...s, links, tables };
    });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (linking) {
      setLinking({ ...linking, ...toWorld(e.clientX, e.clientY) });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.kind === "pan") setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    else setPos((p) => ({ ...p, [d.name!]: { x: d.ox + dx / view.zoom, y: d.oy + dy / view.zoom } }));
  };
  const onPointerUp = () => {
    if (linking) {
      const target = tableAt(linking.x, linking.y);
      setLinking(null);
      if (target && target.name !== linking.table)
        setDialog({ kind: "add", table: linking.table, column: linking.column, toTable: target.name });
      return;
    }
    if (drag.current?.kind === "card") save(pos);
    drag.current = null;
  };

  // "Nex, organize this": Nex (in his wizard hat) lays the tables out, they glide into place,
  // and he says what changed. Undo puts them back.
  const [wizard, setWizard] = useState<{ stage: "casting" | "done"; text: string; undo: Pos | null } | null>(null);
  const [magic, setMagic] = useState<"casting" | "gliding" | "landed" | null>(null);
  const anim = useRef(0);
  const organizeNow = () => {
    if (!schema) return;
    const before = pos;
    const boxes = schema.tables.map((t) => ({ name: t.name, h: cardHeight(t, keysOnly, linkedCols) }));
    const edges = schema.links.map((l) => ({ from: l.table, to: l.to_table }));
    const was = measure(boxes, edges, before, CARD_W);
    setWizard({ stage: "casting", text: `Reading how ${schema.tables.length} tables connect…`, undo: before });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setMagic("casting");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A short pause so you see Nex at work; the layout itself takes a fraction of a second.
    window.setTimeout(
      () => {
        const next = nexLayout(schema, keysOnly, linkedCols).pos;
        const now = measure(boxes, edges, next, CARD_W);
        // Already clearer than anything Nex found: leave it, and say so.
        if (score(now) >= score(was)) {
          setWizard({
            stage: "done",
            undo: null,
            text: "This is already about as clear as it gets, so I left it as it is.",
          });
          setMagic(null);
          return;
        }
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          cancelAnimationFrame(anim.current);
          setPos(next);
          save(next);
          setMagic((m) => (m ? "landed" : null));
          window.setTimeout(() => setMagic(null), 900);
          fitted.current = false;
          const lonely = schema.tables.filter(
            (t) => !schema.links.some((l) => l.table === t.name || l.to_table === t.name),
          ).length;
          // Say what got better, in numbers people can check by looking.
          const better: string[] = [];
          if (now.through < was.through) better.push(`lines through other tables ${was.through} → ${now.through}`);
          if (now.crossings < was.crossings) better.push(`crossing lines ${was.crossings} → ${now.crossings}`);
          const shorter = Math.round((1 - now.length / Math.max(1, was.length)) * 100);
          if (better.length === 0 && shorter > 0) better.push(`lines ${shorter}% shorter`);
          setWizard({
            stage: "done",
            undo: before,
            text: `${better.length ? `Done: ${better.join(", ")}.` : "Done."} The most-linked tables are in the middle, related ones side by side${lonely ? `, and ${lonely} tables with no links are grouped to the right` : ""}.`,
          });
        };
        if (reduce) return done();
        // Glide from where they are to where they go.
        const start = performance.now();
        const from = before;
        cancelAnimationFrame(anim.current);
        setMagic("gliding");
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / 700);
          const e = 1 - Math.pow(1 - t, 3);
          setPos(
            Object.fromEntries(
              Object.entries(next).map(([n, p]) => {
                const a = from[n] ?? p;
                return [n, { x: a.x + (p.x - a.x) * e, y: a.y + (p.y - a.y) * e }];
              }),
            ),
          );
          if (t < 1) anim.current = requestAnimationFrame(step);
          else done();
        };
        anim.current = requestAnimationFrame(step);
        // A minimized or background window gets no animation frames: finish anyway.
        window.setTimeout(done, 1000);
      },
      reduce ? 0 : 900,
    );
  };
  const undoOrganize = () => {
    if (!wizard?.undo) return;
    setPos(wizard.undo);
    save(wizard.undo);
    setWizard(null);
  };
  useEffect(() => () => cancelAnimationFrame(anim.current), []);
  // After Nex moves things, show them all.
  useEffect(() => {
    if (wizard?.stage === "done") fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard?.stage]);

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
              <button className="btn btn-small" data-guide="diagram-new-table" onClick={() => setDesigning(true)}>
                <Table2 size={13} aria-hidden="true" /> New table
              </button>
              <button
                className="btn btn-small"
                data-guide="diagram-add-link"
                onClick={() => setDialog({ kind: "add" })}
                title="Link a column to another table (or drag from a column's dot onto a table)"
              >
                <Link2 size={13} aria-hidden="true" /> Add a link
              </button>
              <button
                className="btn btn-small btn-primary"
                data-guide="diagram-organize"
                disabled={wizard?.stage === "casting"}
                onClick={organizeNow}
                title="Nex reads how the tables connect and lays them out: fewer crossing lines, related tables together"
              >
                <WandSparkles size={13} aria-hidden="true" /> Nex, organize
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
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setDialog({ kind: "drop", link: l })}
                  >
                    <title>
                      {l.table}.{l.columns.join(", ")} → {l.to_table}.{l.to_columns.join(", ")} (click to remove)
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
                    className={`diagram-card${selected === t.name ? " selected" : ""}${dim ? " dim" : ""}${magic === "gliding" ? " gliding" : ""}`}
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
                          {c.key !== "PRI" && (
                            <circle
                              cx={CARD_W}
                              cy="11"
                              r="6"
                              className="diagram-handle"
                              data-guide={`handle-${t.name}-${c.name}`}
                              onPointerDown={(e) => startLink(e, t.name, c.name)}
                            >
                              <title>Drag onto another table to link {c.name} to it</title>
                            </circle>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
              {linking && pos[linking.table] && (
                <path
                  className="diagram-link drawing"
                  d={`M${pos[linking.table].x + CARD_W} ${rowY(
                    schema.tables.find((t) => t.name === linking.table)!,
                    linking.column,
                  )} L${linking.x} ${linking.y}`}
                />
              )}
            </g>
          </svg>
          {magic && <Sparkles stage={magic} />}
          {dialog && (
            <div className="diagram-dialog-wrap">
              <LinkDialog schema={schema} db={db} mode={dialog} onCancel={() => setDialog(null)} onDone={applied} />
            </div>
          )}
          {designing && (
            <div className="diagram-dialog-wrap">
              <div className="diagram-designer">
                <TableDesigner
                  db={db}
                  table={null}
                  engine={schema.engine}
                  onCancel={() => setDesigning(false)}
                  onDone={(name) => {
                    // Place it where the user is looking.
                    const box = svg.current?.getBoundingClientRect();
                    if (box)
                      setPos((p) => ({
                        ...p,
                        [name]: {
                          x: (box.width / 2 - view.x) / view.zoom - CARD_W / 2,
                          y: (box.height / 3 - view.y) / view.zoom,
                        },
                      }));
                    applied({ table: name });
                  }}
                />
              </div>
            </div>
          )}
          {wizard && (
            <div className="diagram-wizard" role="status" data-guide="diagram-wizard">
              <Nex state={wizard.stage === "casting" ? "wizard" : "success"} size={72} />
              <div className="diagram-wizard-bubble">
                <strong>{wizard.stage === "casting" ? "Abracadabra…" : "All organized"}</strong>
                <p>{wizard.text}</p>
                {wizard.stage === "done" && (
                  <div className="diagram-wizard-actions">
                    {wizard.undo && (
                      <button className="btn btn-small" onClick={undoOrganize}>
                        <Undo2 size={13} aria-hidden="true" /> Undo
                      </button>
                    )}
                    <button className="btn btn-small btn-quiet" onClick={() => setWizard(null)}>
                      OK
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
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

/** Twinkling sparkles and a golden shimmer over the diagram while Nex works (decorative only). */
function Sparkles({ stage }: { stage: "casting" | "gliding" | "landed" }) {
  // Fixed spots, so the sparkles don't jump around between renders.
  const spots = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const r = (n: number) => ((Math.sin(i * 97.13 + n * 13.7) + 1) / 2) % 1;
        return {
          left: `${4 + r(1) * 92}%`,
          top: `${6 + r(2) * 86}%`,
          size: 8 + Math.round(r(3) * 14),
          delay: `${(r(4) * 1.2).toFixed(2)}s`,
          hue: i % 3,
        };
      }),
    [],
  );
  return (
    <div className={`diagram-magic ${stage}`} aria-hidden="true">
      <div className="diagram-magic-shimmer" />
      {spots.map((p, i) => (
        <svg
          key={i}
          className={`diagram-spark h${p.hue}`}
          style={{ left: p.left, top: p.top, width: p.size, height: p.size, animationDelay: p.delay }}
          viewBox="-12 -12 24 24"
        >
          <path d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3 Z" />
        </svg>
      ))}
    </div>
  );
}
