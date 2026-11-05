/**
 * "Nex, organize this": lays out a relationship diagram so it reads at a glance.
 *
 * 1. Tables that link to each other are kept together (one group per connected set); tables
 *    with no links go in a tidy grid off to the side.
 * 2. In each group the most-linked table is the centre column. Tables it points at go to its
 *    left, tables pointing at it to its right, and so on outwards.
 * 3. Inside each column, tables are reordered over several passes so each sits level with the
 *    tables it links to (the barycentre method), which removes most crossing lines.
 * 4. Each table is then moved up or down towards its partners' rows, without overlapping.
 *
 * Pure and deterministic: the same schema always gives the same picture.
 */

export interface Box {
  name: string;
  /** Height of the table's card. */
  h: number;
}

export interface Edge {
  /** The table with the foreign key. */
  from: string;
  /** The table it points at. */
  to: string;
}

export type Positions = Record<string, { x: number; y: number }>;

export interface Layout {
  pos: Positions;
  crossings: number;
  /** Lines that run through another table's box. */
  through: number;
}

/** How readable a layout is: crossing lines, lines through other tables, and total line length. */
export interface Measure {
  crossings: number;
  through: number;
  length: number;
}

/** One number to compare layouts by; lower is clearer. A line through a box is the worst. */
export const score = (m: Measure) => m.crossings * 3 + m.through * 5 + m.length / 400;

interface Options {
  cardW: number;
  gapX: number;
  gapY: number;
  /** Space between groups. */
  groupGap: number;
}

const DEFAULTS: Options = { cardW: 230, gapX: 120, gapY: 34, groupGap: 90 };

/** Lines that cross each other (pairs of links that don't share a table). */
export function countCrossings(boxes: Box[], edges: Edge[], pos: Positions, cardW = DEFAULTS.cardW): number {
  return measure(boxes, edges, pos, cardW).crossings;
}

/** Crossings, lines through other tables, and total length, for straight lines between the cards' facing sides. */
export function measure(boxes: Box[], edges: Edge[], pos: Positions, cardW = DEFAULTS.cardW): Measure {
  const h = new Map(boxes.map((b) => [b.name, b.h]));
  const seg = edges
    .filter((e) => e.from !== e.to && pos[e.from] && pos[e.to])
    .map((e) => {
      const a = pos[e.from];
      const b = pos[e.to];
      const ay = a.y + (h.get(e.from) ?? 0) / 2;
      const by = b.y + (h.get(e.to) ?? 0) / 2;
      // From the facing sides of the two cards.
      const leftFirst = a.x <= b.x;
      return leftFirst
        ? { x1: a.x + cardW, y1: ay, x2: b.x, y2: by, ends: [e.from, e.to] }
        : { x1: b.x + cardW, y1: by, x2: a.x, y2: ay, ends: [e.from, e.to] };
    });
  let crossings = 0;
  for (let i = 0; i < seg.length; i++) {
    for (let j = i + 1; j < seg.length; j++) {
      const s = seg[i];
      const t = seg[j];
      if (s.ends.some((e) => t.ends.includes(e))) continue;
      if (intersects(s, t)) crossings++;
    }
  }
  let through = 0;
  let length = 0;
  for (const s of seg) {
    length += Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    for (const b of boxes) {
      if (s.ends.includes(b.name) || !pos[b.name]) continue;
      const r = { x: pos[b.name].x, y: pos[b.name].y, w: cardW, h: b.h };
      if (crossesBox(s, r)) through++;
    }
  }
  return { crossings, through, length };
}

/** Whether a line passes through a box (enters it, not just touches a corner). */
function crossesBox(
  s: { x1: number; y1: number; x2: number; y2: number },
  r: { x: number; y: number; w: number; h: number },
) {
  const inside = (x: number, y: number) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  if (inside(s.x1, s.y1) || inside(s.x2, s.y2)) return true;
  const sides = [
    { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y },
    { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h },
    { x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h },
    { x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h },
  ];
  return sides.some((side) => intersects(s, side));
}

function intersects(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): boolean {
  const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = d(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const d2 = d(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  const d3 = d(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const d4 = d(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Connected groups of tables, biggest first; ties by name so the result is stable. */
function groups(names: string[], edges: Edge[]): string[][] {
  const adj = new Map(names.map((n) => [n, new Set<string>()]));
  for (const e of edges) {
    if (e.from === e.to || !adj.has(e.from) || !adj.has(e.to)) continue;
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of [...names].sort()) {
    if (seen.has(n)) continue;
    const comp: string[] = [];
    const stack = [n];
    seen.add(n);
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      for (const m of adj.get(c)!) if (!seen.has(m)) (seen.add(m), stack.push(m));
    }
    out.push(comp.sort());
  }
  return out.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

/** Column for each table of a group: the hub is 0, what it points at is -1, what points at it +1. */
function columns(comp: string[], edges: Edge[], hubRank = 0): Map<string, number> {
  const inComp = new Set(comp);
  const local = edges.filter((e) => e.from !== e.to && inComp.has(e.from) && inComp.has(e.to));
  const degree = new Map(comp.map((n) => [n, 0]));
  for (const e of local) {
    degree.set(e.from, degree.get(e.from)! + 1);
    degree.set(e.to, degree.get(e.to)! + 1);
  }
  const ranked = [...comp].sort((a, b) => degree.get(b)! - degree.get(a)! || a.localeCompare(b));
  const hub = ranked[Math.min(hubRank, ranked.length - 1)];
  const col = new Map<string, number>([[hub, 0]]);
  const queue = [hub];
  while (queue.length) {
    const c = queue.shift()!;
    for (const e of local) {
      // c points at e.to: e.to sits one column left of c.
      if (e.from === c && !col.has(e.to)) {
        col.set(e.to, col.get(c)! - 1);
        queue.push(e.to);
      }
      // e.from points at c: e.from sits one column right of c.
      if (e.to === c && !col.has(e.from)) {
        col.set(e.from, col.get(c)! + 1);
        queue.push(e.from);
      }
    }
  }
  // A few passes so a table that points at something sits right of it where possible.
  for (let pass = 0; pass < comp.length; pass++) {
    let moved = false;
    for (const e of local) {
      const f = col.get(e.from)!;
      const t = col.get(e.to)!;
      if (f === t) {
        col.set(e.from, f + 1);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return col;
}

/**
 * Orders each column to cross as few lines as possible. Links that skip columns get a
 * pass-through point in every column they cross, so they're ordered too (as in the Sugiyama
 * method). Barycentre sweeps up and down, then swapping neighbours while it helps; the best
 * order seen is kept.
 */
function orderColumns(byCol: Map<number, string[]>, edges: Edge[], col: Map<string, number>, min: number): void {
  const keys = [...byCol.keys()].sort((a, b) => a - b);
  if (keys.length < 2) return;
  const layers: string[][] = keys.map((k) => [...byCol.get(k)!]);
  const layerOf = (n: string) => col.get(n)! - min;
  // Links between neighbouring columns, with pass-through points for longer ones.
  const links: [string, string][] = [];
  let dummy = 0;
  for (const e of edges) {
    if (e.from === e.to || !col.has(e.from) || !col.has(e.to)) continue;
    let [a, b] = [e.from, e.to];
    let la = layerOf(a);
    let lb = layerOf(b);
    if (la === lb) continue;
    if (la > lb) {
      [a, b] = [b, a];
      [la, lb] = [lb, la];
    }
    let prev = a;
    for (let l = la + 1; l < lb; l++) {
      const d = `~pass~${dummy++}`;
      layers[l].push(d);
      links.push([prev, d]);
      prev = d;
    }
    links.push([prev, b]);
  }
  const layerIndex = new Map<string, number>();
  layers.forEach((ls, l) => ls.forEach((n) => layerIndex.set(n, l)));
  const up = new Map<string, string[]>(); // neighbours in the column to the left
  const down = new Map<string, string[]>(); // neighbours in the column to the right
  for (const [a, b] of links) {
    (down.get(a) ?? down.set(a, []).get(a)!).push(b);
    (up.get(b) ?? up.set(b, []).get(b)!).push(a);
  }

  const position = () => {
    const m = new Map<string, number>();
    for (const ls of layers) ls.forEach((n, i) => m.set(n, i));
    return m;
  };
  /** Crossings between column l and l+1. */
  const between = (l: number, pos: Map<string, number>) => {
    const es: [number, number][] = [];
    for (const n of layers[l]) for (const m of down.get(n) ?? []) es.push([pos.get(n)!, pos.get(m)!]);
    let c = 0;
    for (let i = 0; i < es.length; i++)
      for (let j = i + 1; j < es.length; j++) {
        const [a1, b1] = es[i];
        const [a2, b2] = es[j];
        if ((a1 - a2) * (b1 - b2) < 0) c++;
      }
    return c;
  };
  const total = () => {
    const pos = position();
    let c = 0;
    for (let l = 0; l + 1 < layers.length; l++) c += between(l, pos);
    return c;
  };

  let best = layers.map((ls) => [...ls]);
  let bestScore = total();
  for (let sweep = 0; sweep < 12 && bestScore > 0; sweep++) {
    const downward = sweep % 2 === 0;
    const order = downward
      ? layers.map((_, l) => l).slice(1)
      : layers
          .map((_, l) => l)
          .reverse()
          .slice(1);
    for (const l of order) {
      const pos = position();
      const ref = downward ? up : down;
      const bary = (n: string, i: number) => {
        const ns = ref.get(n) ?? [];
        return ns.length ? ns.reduce((a, m) => a + pos.get(m)!, 0) / ns.length : i;
      };
      layers[l] = layers[l]
        .map((n, i) => ({ n, b: bary(n, i), i }))
        .sort((x, y) => x.b - y.b || x.i - y.i)
        .map((x) => x.n);
    }
    // Swap neighbours in a column while that removes crossings.
    let improved = true;
    for (let round = 0; improved && round < 6; round++) {
      improved = false;
      for (let l = 0; l < layers.length; l++) {
        for (let i = 0; i + 1 < layers[l].length; i++) {
          const pos = position();
          const before = (l > 0 ? between(l - 1, pos) : 0) + (l + 1 < layers.length ? between(l, pos) : 0);
          [layers[l][i], layers[l][i + 1]] = [layers[l][i + 1], layers[l][i]];
          const pos2 = position();
          const after = (l > 0 ? between(l - 1, pos2) : 0) + (l + 1 < layers.length ? between(l, pos2) : 0);
          if (after < before) improved = true;
          else [layers[l][i], layers[l][i + 1]] = [layers[l][i + 1], layers[l][i]];
        }
      }
    }
    const score = total();
    if (score < bestScore) {
      bestScore = score;
      best = layers.map((ls) => [...ls]);
    }
  }
  keys.forEach((k, l) =>
    byCol.set(
      k,
      best[l].filter((n) => layerIndex.has(n) && !n.startsWith("~pass~")),
    ),
  );
}

/** The simpler ordering: barycentre sweeps on positions within each column. */
function orderSimple(byCol: Map<number, string[]>, edges: Edge[]): void {
  const keys = [...byCol.keys()].sort((a, b) => a - b);
  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    if (e.from === e.to) continue;
    (neighbours.get(e.from) ?? neighbours.set(e.from, []).get(e.from)!).push(e.to);
    (neighbours.get(e.to) ?? neighbours.set(e.to, []).get(e.to)!).push(e.from);
  }
  const indexOf = () => {
    const m = new Map<string, number>();
    for (const k of keys) byCol.get(k)!.forEach((n, i) => m.set(n, i / Math.max(1, byCol.get(k)!.length - 1)));
    return m;
  };
  for (let sweep = 0; sweep < 8; sweep++) {
    const order = sweep % 2 === 0 ? keys : [...keys].reverse();
    for (const k of order) {
      const idx = indexOf();
      const list = byCol.get(k)!;
      const score = (n: string) => {
        const ns = (neighbours.get(n) ?? []).filter((m) => idx.has(m) && !list.includes(m));
        return ns.length ? ns.reduce((a, m) => a + idx.get(m)!, 0) / ns.length : idx.get(n)!;
      };
      byCol.set(
        k,
        list
          .map((n, i) => ({ n, s: score(n), i }))
          .sort((a, b) => a.s - b.s || a.i - b.i)
          .map((x) => x.n),
      );
    }
  }
}

/** One arrangement of a group: columns around the chosen hub, ordered, then placed. */
function placeGroup(
  comp: string[],
  edges: Edge[],
  height: Map<string, number>,
  o: Options,
  top: number,
  hubRank: number,
  method: "layers" | "simple",
): Positions {
  const pos: Positions = {};
  const col = columns(comp, edges, hubRank);
  const min = Math.min(...col.values());
  const byCol = new Map<number, string[]>();
  for (const n of comp) {
    const c = col.get(n)! - min;
    (byCol.get(c) ?? byCol.set(c, []).get(c)!).push(n);
  }
  for (const list of byCol.values()) list.sort();
  if (method === "layers") orderColumns(byCol, edges, col, min);
  else orderSimple(byCol, edges);

  // Stack each column; then pull tables towards their partners' rows, keeping the order.
  const colHeight = (list: string[]) => list.reduce((a, n) => a + height.get(n)! + o.gapY, -o.gapY);
  const tallest = Math.max(...[...byCol.values()].map(colHeight));
  for (const [c, list] of byCol) {
    let y = top + (tallest - colHeight(list)) / 2;
    for (const n of list) {
      pos[n] = { x: 20 + c * (o.cardW + o.gapX), y };
      y += height.get(n)! + o.gapY;
    }
  }
  const partners = (n: string) =>
    edges.filter((e) => e.from !== e.to && (e.from === n || e.to === n)).map((e) => (e.from === n ? e.to : e.from));
  for (let pass = 0; pass < 6; pass++) {
    for (const list of byCol.values()) {
      // Where each table would like to be: level with the middle of its partners.
      const want = list.map((n) => {
        const ps = partners(n).filter((p) => pos[p]);
        const centre = ps.length
          ? ps.reduce((a, p) => a + pos[p].y + height.get(p)! / 2, 0) / ps.length
          : pos[n].y + height.get(n)! / 2;
        return centre - height.get(n)! / 2;
      });
      // Place top to bottom without overlapping, then nudge the column back up if it sank.
      let y = top;
      const placed = list.map((n, i) => {
        const at = Math.max(y, want[i]);
        y = at + height.get(n)! + o.gapY;
        return at;
      });
      const sink = placed.reduce((a, at, i) => a + (at - want[i]), 0) / list.length;
      const lift = Math.min(Math.max(0, sink), placed[0] - top);
      list.forEach((n, i) => (pos[n].y = placed[i] - lift));
    }
  }
  return pos;
}

/** Lays out every table. `boxes` must include all tables; `edges` are the foreign keys. */
export function organize(boxes: Box[], edges: Edge[], options: Partial<Options> = {}): Layout {
  const o = { ...DEFAULTS, ...options };
  const height = new Map(boxes.map((b) => [b.name, b.h]));
  const names = boxes.map((b) => b.name);
  const linked = new Set(edges.filter((e) => e.from !== e.to).flatMap((e) => [e.from, e.to]));
  const comps = groups(
    names.filter((n) => linked.has(n)),
    edges,
  );
  const lonely = names.filter((n) => !linked.has(n)).sort();
  const pos: Positions = {};

  let top = 20;
  let widest = 0;
  for (const comp of comps) {
    // Nex tries a few arrangements of this group and keeps the clearest one.
    let best: { at: Positions; score: number; tall: number } | null = null;
    const local = edges.filter((e) => comp.includes(e.from) && comp.includes(e.to));
    const localBoxes = comp.map((n) => ({ name: n, h: height.get(n)! }));
    for (const hubRank of [0, 1, 2].slice(0, Math.min(3, comp.length))) {
      for (const method of ["layers", "simple"] as const) {
        const at = placeGroup(comp, local, height, o, top, hubRank, method);
        const value = score(measure(localBoxes, local, at, o.cardW));
        const tall = Math.max(...comp.map((n) => at[n].y + height.get(n)!));
        if (!best || value < best.score || (value === best.score && tall < best.tall))
          best = { at, score: value, tall };
      }
    }
    Object.assign(pos, best!.at);
    const bottom = Math.max(...comp.map((n) => pos[n].y + height.get(n)!));
    widest = Math.max(widest, ...comp.map((n) => pos[n].x + o.cardW));
    top = bottom + o.groupGap;
  }

  // Tables with no links: a grid to the right of the groups (or from the top when there are none).
  if (lonely.length) {
    const startX = comps.length ? widest + o.gapX * 1.5 : 20;
    const perCol = Math.max(3, Math.ceil(Math.sqrt(lonely.length)));
    let x = startX;
    let y = 20;
    lonely.forEach((n, i) => {
      if (i > 0 && i % perCol === 0) {
        x += o.cardW + o.gapX / 2;
        y = 20;
      }
      pos[n] = { x, y };
      y += height.get(n)! + o.gapY;
    });
  }

  const m = measure(boxes, edges, pos, o.cardW);
  return { pos, crossings: m.crossings, through: m.through };
}

/** True when no two cards overlap (used by the tests and as a safety check). */
export function overlaps(boxes: Box[], pos: Positions, cardW = DEFAULTS.cardW): boolean {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = pos[boxes[i].name];
      const b = pos[boxes[j].name];
      if (!a || !b) continue;
      const apart = a.x + cardW <= b.x || b.x + cardW <= a.x || a.y + boxes[i].h <= b.y || b.y + boxes[j].h <= a.y;
      if (!apart) return true;
    }
  }
  return false;
}
