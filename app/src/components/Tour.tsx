import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Nex, type NexState } from "./Nex";
import { isPractice, setPractice } from "../lib/practice";
import { WHATS_NEW_STEPS, type WhatsNewChapter } from "./whatsNew";
import { showSettingsSection } from "../lib/settingsNav";

/**
 * The guided tutorial. Nex walks to whatever it's explaining, the rest of the window dims, and
 * some steps wait for you to do the thing (click a page, press Ctrl+K) before going on.
 */

const DONE_KEY = "nexdb.guideDone";

type Page = "dashboard" | "projects" | "database" | "terminal" | "mail" | "versions" | "health" | "settings" | "help";

export const CHAPTERS = [
  "Welcome",
  "Dashboard",
  "Projects",
  "Database",
  "Terminal",
  "Versions",
  "Check my setup",
  "Settings",
  "Search",
] as const;
export type Chapter = (typeof CHAPTERS)[number] | WhatsNewChapter;

interface Step {
  chapter: Chapter;
  title: string;
  body: string;
  /** CSS selector of what Nex points at; none means Nex stands in the middle. */
  target?: string;
  /** The page this step is on; NexDB opens it if you're elsewhere. */
  page?: Page;
  mood?: NexState;
  /** "click": waits for a click on the target. "palette-open"/"palette-close": waits for Ctrl+K / Esc. */
  /** "appear": goes on by itself once `waitOn` shows up (after you type something, say). */
  wait?: "click" | "appear" | "palette-open" | "palette-close";
  /** For "click": what to click, when it isn't the lit target (a button inside it). */
  waitOn?: string;
  /** Done when the step starts, like opening a sample project. */
  run?: () => void;
}

export type GuideStep = Step;

const nav = (page: Page) => `.nav-item[data-page="${page}"]`;
const here = (sel: string) => `.page:not([hidden]) ${sel}`;

const STEPS: Step[] = [
  {
    chapter: "Welcome",
    title: "Hi, I'm Nex!",
    body: "I'll show you how NexDB works, from start to finish. It takes about two minutes. Press Esc to stop any time; Settings can replay any part.",
    mood: "hello",
  },
  {
    chapter: "Welcome",
    title: "The sidebar",
    body: "Every page lives here. Ctrl+1 to Ctrl+9 jump straight to them.",
    target: '[data-guide="rail"]',
  },
  {
    chapter: "Dashboard",
    title: "Your stack",
    body: "Click Dashboard. This is where NexDB opens.",
    target: nav("dashboard"),
    wait: "click",
  },
  {
    chapter: "Dashboard",
    title: "Services",
    body: "Your web server, PHP and databases. Green means running. If one is stopped, its row says why, like another program using its port.",
    target: '[data-guide="services"] .svc-group-block',
    page: "dashboard",
  },
  {
    chapter: "Dashboard",
    title: "Start all",
    body: "Starts everything your sites need. You can also start or stop one service from its own row, and read its log.",
    target: '[data-guide="start-all"]',
    page: "dashboard",
  },
  {
    chapter: "Projects",
    title: "Projects",
    body: "Click Projects.",
    target: nav("projects"),
    wait: "click",
  },
  {
    chapter: "Projects",
    title: "Make a project",
    body: "New project makes a ready-to-run Laravel, WordPress or React app. Next to it, Clone brings one from GitHub and Import copies them from Laragon or XAMPP.",
    target: '[data-guide="project-new"]',
    page: "projects",
  },
  {
    chapter: "Projects",
    title: "Your projects",
    body: "Each one is a site at its own address, like shop.test. Open shows it in the browser; its ⋯ menu has the terminal, your editor and sharing.",
    target: here(".project-list"),
    page: "projects",
    // Back to the list, if a project was open.
    run: () => window.dispatchEvent(new CustomEvent("nexdb:open-project", { detail: "" })),
  },
  {
    chapter: "Database",
    title: "Database",
    body: "Click Database.",
    target: nav("database"),
    wait: "click",
  },
  {
    chapter: "Database",
    title: "MySQL or PostgreSQL",
    body: "Pick which server you're looking at. NexDB remembers your choice.",
    target: '[data-guide="db-engine"]',
    page: "database",
  },
  {
    chapter: "Database",
    title: "New database",
    body: "Makes a database. Then I'll ask which project uses it, and write its .env for you. That part is optional.",
    target: '[data-guide="db-new"]',
    page: "database",
  },
  {
    chapter: "Database",
    title: "Your databases",
    body: "Pick one to see its tables, edit rows, run SQL, back it up, or connect it to a project.",
    target: '[data-guide="db-tree"]',
    page: "database",
  },
  {
    chapter: "Terminal",
    title: "Terminal",
    body: "Click Terminal.",
    target: nav("terminal"),
    wait: "click",
  },
  {
    chapter: "Terminal",
    title: "PowerShell, ready to go",
    body: "NexDB's PHP, Composer and Node work here straight away. + opens another tab; double-click a tab to rename it. NexDB remembers them.",
    target: '[data-guide="term-tabs"]',
    page: "terminal",
  },
  {
    chapter: "Versions",
    title: "Versions",
    body: "Click Versions.",
    target: nav("versions"),
    wait: "click",
  },
  {
    chapter: "Versions",
    title: "Add or switch versions",
    body: "Install another PHP, Node or MySQL, pick the default, or add extras like Redis and Mailpit. Each project can keep its own PHP.",
    target: here(".ver-card"),
    page: "versions",
  },
  {
    chapter: "Check my setup",
    title: "Something wrong?",
    body: "Click Check my setup.",
    target: nav("health"),
    wait: "click",
  },
  {
    chapter: "Check my setup",
    title: "Checks and fixes",
    body: "NexDB looks at ports, services, files and your projects, and offers a fix for each problem. It can also save a report to send for help.",
    target: here(".panel-body"),
    page: "health",
  },
  {
    chapter: "Settings",
    title: "Settings",
    body: "Click Settings.",
    target: nav("settings"),
    wait: "click",
  },
  {
    chapter: "Settings",
    title: "Make it yours",
    body: "Settings comes in parts: how NexDB starts, the web server and ports, sharing, backups, updates, and this tutorial. Pick one on the left.",
    target: here('[data-guide="settings-nav"]'),
    page: "settings",
    run: () => showSettingsSection("general"),
  },
  {
    chapter: "Settings",
    title: "Help, any time",
    body: "Step-by-step help for everything, with a Show me button that brings me back to show you that part.",
    target: nav("help"),
  },
  {
    chapter: "Search",
    title: "One last trick",
    body: "Press Ctrl+K, or click Search. Try it now.",
    target: '[data-guide="search"]',
    wait: "palette-open",
  },
  {
    chapter: "Search",
    title: "Search everything",
    body: "Type a page, project or database and press Enter, or start and stop services. Press Esc to close it.",
    target: ".palette-input",
    wait: "palette-close",
  },
  {
    chapter: "Search",
    title: "You're all set!",
    body: "That's NexDB from start to finish. I'll be in the corner with news while you work. Have fun building!",
    mood: "success",
  },
];

const ALL: Step[] = [...STEPS, ...WHATS_NEW_STEPS];

/** Starts the tutorial, from the beginning or at one chapter. */
export function showGuide(chapter?: Chapter) {
  window.dispatchEvent(new CustomEvent("nexdb:guide", { detail: chapter ?? null }));
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 6;
const GAP = 16;
const EDGE = 12;
const NEX = 72;

const area = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** How far apart two boxes are; 0 when they touch or overlap. */
const apart = (a: Box, b: Box) =>
  Math.hypot(Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w)), Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h)));

const toBox = (r: DOMRect): Box => ({ x: r.x, y: r.y, w: r.width, h: r.height });

const CONTROLS =
  'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="radio"], [tabindex]:not([tabindex="-1"])';
const TEXT = "h1, h2, h3, h4, p, label, li, dt, dd, th, td, code, legend, pre";

/** What Nex must keep clear of, around the lit target: its buttons and fields, and its words. */
export function guideObstacles(target: Element | null, also: (Element | null)[], vw: number, vh: number) {
  const visible = (b: Box) => b.w > 0 && b.h > 0 && b.x < vw && b.y < vh && b.x + b.w > 0 && b.y + b.h > 0;
  const controls: Box[] = [];
  const text: Box[] = [];
  if (target) {
    const own = toBox(target.getBoundingClientRect());
    // A small target (a button, a sidebar item) stays clear as a whole.
    if (own.w * own.h < 40000 || target.matches(CONTROLS)) controls.push(own);
    for (const el of target.querySelectorAll(CONTROLS)) {
      const b = toBox(el.getBoundingClientRect());
      if (visible(b)) controls.push(b);
      if (controls.length > 200) break;
    }
    // The words themselves, line by line: a paragraph's box is often much wider than its text.
    const range = document.createRange();
    for (const el of target.querySelectorAll(TEXT)) {
      if (!visible(toBox(el.getBoundingClientRect()))) continue;
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        const b = toBox(r);
        if (visible(b)) text.push(b);
      }
      if (text.length > 400) break;
    }
  }
  for (const el of also) if (el) controls.push(toBox(el.getBoundingClientRect()));
  return { controls, text };
}

/**
 * Where Nex and his bubble stand: the spot nearest the target that covers none of its buttons,
 * fields or text, and never the practice banner. Beside the target is best; inside a big one (a
 * whole page, a dialog), the emptiest corner of it.
 */
export function placeGuide(
  t: Box | null,
  size: { w: number; h: number },
  vw: number,
  vh: number,
  top: number,
  obstacles: { controls: Box[]; text: Box[] },
) {
  const { w, h } = size;
  const minY = top + EDGE;
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), vw - w - EDGE);
  const clampY = (y: number) => Math.min(Math.max(minY, y), Math.max(minY, vh - h - EDGE));
  if (!t) return { x: clampX((vw - w) / 2), y: clampY((vh - h) / 2), side: "center" as const, clear: true };

  const spots: { x: number; y: number }[] = [
    { x: t.x + t.w + PAD + GAP, y: clampY(t.y) },
    { x: t.x - PAD - GAP - w, y: clampY(t.y) },
    { x: clampX(t.x), y: t.y + t.h + PAD + GAP },
    { x: clampX(t.x), y: t.y - PAD - GAP - h },
    { x: clampX(t.x + t.w - w), y: t.y + t.h + PAD + GAP },
    { x: clampX(t.x + t.w - w), y: t.y - PAD - GAP - h },
  ];
  const coarse = 24;
  for (let y = minY; y <= vh - h - EDGE; y += coarse)
    for (let x = EDGE; x <= vw - w - EDGE; x += coarse) spots.push({ x, y });

  const lit = { x: t.x - PAD, y: t.y - PAD, w: t.w + PAD * 2, h: t.h + PAD * 2 };
  const fits = (s: { x: number; y: number }) =>
    s.x >= EDGE - 0.5 && s.y >= minY - 0.5 && s.x + w <= vw - EDGE + 0.5 && s.y + h <= vh - EDGE + 0.5;
  // What a spot costs: far from the target, on top of it, and above all on its buttons and words.
  const cost = (s: { x: number; y: number }, limit: number) => {
    const box = { x: s.x, y: s.y, w, h };
    let c = apart(box, lit) * 12 + area(box, lit) * 0.12;
    for (const o of obstacles.controls) if (c < limit) c += area(box, o) * 60;
    for (const o of obstacles.text) if (c < limit) c += area(box, o) * 3;
    return c;
  };
  // A quick look everywhere, then a closer look around the few best spots (gaps can be narrow).
  const ranked: { x: number; y: number; cost: number }[] = [];
  for (const s of spots) {
    if (!fits(s)) continue;
    const worst = ranked.length < 8 ? Infinity : ranked[ranked.length - 1].cost;
    const c = cost(s, worst);
    if (c >= worst) continue;
    ranked.push({ ...s, cost: c });
    ranked.sort((a, b) => a.cost - b.cost);
    if (ranked.length > 8) ranked.pop();
  }
  let best = ranked[0] ?? { x: clampX(t.x + t.w - w), y: clampY(t.y + t.h - h), cost: Infinity };
  for (const r of ranked) {
    if (best.cost === 0) break;
    for (let dy = -18; dy <= 18; dy += 6)
      for (let dx = -18; dx <= 18; dx += 6) {
        const s = { x: r.x + dx, y: r.y + dy };
        if (!fits(s)) continue;
        const c = cost(s, best.cost);
        if (c < best.cost) best = { ...s, cost: c };
      }
  }
  // Nex faces the target: on its left he stands on the right of his bubble.
  const side = best.x + w / 2 < t.x + t.w / 2 ? ("left" as const) : ("right" as const);
  const spot = { x: best.x, y: best.y, w, h };
  const clear = [...obstacles.controls, ...obstacles.text].every((o) => area(spot, o) <= 4);
  return { x: best.x, y: best.y, side, clear };
}

/** The first match that's on show: a page can have one copy for wide windows and one for narrow. */
export function findShown(sel: string): HTMLElement | null {
  let first: HTMLElement | null = null;
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    first ??= el;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return first;
}

/** The dim layer catches clicks, but the wheel should still scroll whatever is under it. */
function scrollUnder(e: React.WheelEvent) {
  const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => !el.closest(".guide"));
  for (let el: Element | null = under ?? null; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
      el.scrollBy({ top: e.deltaY, left: e.deltaX });
      return;
    }
  }
  document.scrollingElement?.scrollBy({ top: e.deltaY });
}

export function Tour({ onPage }: { onPage: (page: Page) => void }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(DONE_KEY) !== "1";
    } catch {
      return false;
    }
  });
  const [index, setIndex] = useState(0);
  // Only this chapter, when replayed from Settings.
  const [only, setOnly] = useState<Chapter | null>(null);
  const [rect, setRect] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; side: "left" | "right" | "center" }>({
    x: 0,
    y: 0,
    side: "center",
  });
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const bubble = useRef<HTMLDivElement>(null);
  const guy = useRef<HTMLDivElement>(null);
  const placed = useRef({ key: "", at: 0 });
  // A narrower bubble, for a step where the usual one can't sit clear of what it explains.
  const [compact, setCompact] = useState(false);
  useEffect(() => setCompact(false), [index]);
  const before = useRef<Element | null>(null);

  const step = ALL[index];
  const lastIndex = only ? ALL.map((s) => s.chapter).lastIndexOf(only) : STEPS.length - 1;
  const firstIndex = only ? ALL.findIndex((s) => s.chapter === only) : 0;
  const last = index === lastIndex;
  // The page open before a practice chapter, to come back to.
  const returnTo = useRef<Page | null>(null);

  const finish = useCallback(() => {
    setOpen(false);
    if (isPractice()) {
      setPractice(false);
      if (returnTo.current) onPage(returnTo.current);
      returnTo.current = null;
    }
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      // It shows again next launch; harmless.
    }
    (before.current as HTMLElement | null)?.focus?.();
    before.current = null;
  }, [onPage]);

  const next = useCallback(() => {
    if (index >= lastIndex) finish();
    else setIndex(index + 1);
  }, [index, lastIndex, finish]);

  // Settings → replay, or the whole thing.
  useEffect(() => {
    const start = (e: Event) => {
      const chapter = (e as CustomEvent<Chapter | null>).detail;
      before.current = document.activeElement;
      // What's-new chapters run on sample data, so trying things changes nothing.
      if (chapter && WHATS_NEW_STEPS.some((s) => s.chapter === chapter)) {
        try {
          returnTo.current = (localStorage.getItem("nexdb.page") as Page | null) ?? "dashboard";
        } catch {
          returnTo.current = "dashboard";
        }
        setPractice(true);
      }
      setOnly(chapter);
      setIndex(chapter ? ALL.findIndex((s) => s.chapter === chapter) : 0);
      setOpen(true);
    };
    window.addEventListener("nexdb:guide", start);
    // The practice banner's Leave practice button.
    const stop = () => finish();
    window.addEventListener("nexdb:guide-stop", stop);
    return () => {
      window.removeEventListener("nexdb:guide", start);
      window.removeEventListener("nexdb:guide-stop", stop);
    };
  }, [finish]);

  // Hide the corner Nex while this one is walking around.
  useEffect(() => {
    document.body.classList.toggle("guiding", open);
  }, [open]);

  // Open the step's page when it isn't showing, and do what the step sets up.
  useEffect(() => {
    if (!open) return;
    if (step.page) onPage(step.page);
    step.run?.();
    // Bring what Nex points at into view; it may appear a moment later, after a page opens.
    const sel = step.waitOn ?? step.target;
    if (!sel) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tries = 0;
    let check = 0;
    const inView = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    };
    const timer = window.setInterval(() => {
      const el = findShown(sel);
      // Some targets appear a few seconds in (a service starting), so keep looking for a while.
      if (el || ++tries > 40) window.clearInterval(timer);
      if (!el || inView(el)) return;
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
      // If the smooth scroll didn't get there (a busy or background window), jump.
      check = window.setTimeout(() => {
        if (!inView(el)) el.scrollIntoView({ block: "center", inline: "nearest" });
      }, 700);
    }, 150);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(check);
    };
  }, [open, step, onPage]);

  // Follow the target as the page lays out, scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const el = step.target ? findShown(step.target) : null;
      const r = el?.getBoundingClientRect();
      const box = r && r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      setRect((old) =>
        old && box && old.x === box.x && old.y === box.y && old.w === box.w && old.h === box.h ? old : box,
      );
      setSize((s) =>
        s.w === window.innerWidth && s.h === window.innerHeight ? s : { w: window.innerWidth, h: window.innerHeight },
      );
      // Nex's own size (it changes with the text and the window), and where he fits.
      const me = guy.current;
      const size = { w: me?.offsetWidth ?? 402, h: me?.offsetHeight ?? 140 };
      const banner = document.querySelector(".practice-banner");
      const top = banner ? banner.getBoundingClientRect().bottom : 0;
      // Work out the spot again only when something moved, or once a second for changes inside.
      const key = JSON.stringify([box, size, top, window.innerWidth, window.innerHeight]);
      if (key === placed.current.key && Date.now() - placed.current.at < 1000) return;
      placed.current = { key, at: Date.now() };
      const waitOn = step.waitOn ? document.querySelector(step.waitOn) : null;
      const obstacles = guideObstacles(el ?? null, [waitOn], window.innerWidth, window.innerHeight);
      const next = placeGuide(box, size, window.innerWidth, window.innerHeight, top, obstacles);
      if (!next.clear) setCompact(true);
      setPos((old) =>
        Math.abs(old.x - next.x) < 1 && Math.abs(old.y - next.y) < 1 && old.side === next.side ? old : next,
      );
    };
    measure();
    const timer = window.setInterval(measure, 200);
    window.addEventListener("resize", measure);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [open, step]);

  // Steps that wait for you: a click on the target, or the Ctrl+K palette opening or closing.
  useEffect(() => {
    if (!open || !step.wait) return;
    if (step.wait === "click") {
      // The target may appear a moment later (after a page or tab opens), so keep looking.
      let el: HTMLElement | null = null;
      const go = () => window.setTimeout(next, 250);
      const timer = window.setInterval(() => {
        const sel = step.waitOn ?? step.target;
        const found = sel ? findShown(sel) : null;
        if (found && found !== el) {
          el?.removeEventListener("click", go);
          el = found;
          el.addEventListener("click", go, { once: true });
        }
      }, 150);
      return () => {
        window.clearInterval(timer);
        el?.removeEventListener("click", go);
      };
    }
    if (step.wait === "appear") {
      const sel = step.waitOn ?? step.target;
      const timer = window.setInterval(() => {
        if (sel && document.querySelector(sel)) next();
      }, 200);
      return () => window.clearInterval(timer);
    }
    const want = step.wait === "palette-open";
    const timer = window.setInterval(() => {
      if (!!document.querySelector(".palette") === want) next();
    }, 150);
    return () => window.clearInterval(timer);
  }, [open, step, next]);

  // Keyboard: Esc stops (unless it's closing the palette); ← goes back from the bubble.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".palette")) {
        e.preventDefault();
        finish();
      }
      if (
        e.key === "ArrowLeft" &&
        index > firstIndex &&
        !step.wait &&
        bubble.current?.contains(document.activeElement)
      ) {
        setIndex(index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, firstIndex, step, finish]);

  // Keyboard users land on what to do next: the button to click, or Next.
  useEffect(() => {
    if (!open) return;
    if (!before.current) before.current = document.activeElement;
    const t = window.setTimeout(() => {
      if (step.wait === "click" && step.target) findShown(step.target)?.focus();
      else if (!step.wait) bubble.current?.querySelector<HTMLButtonElement>(".btn-primary")?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [open, step]);

  if (!open) return null;

  const hole = rect
    ? { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + PAD * 2, h: rect.h + PAD * 2 }
    : { x: size.w / 2, y: size.h / 2, w: 0, h: 0 };
  // Clicks outside the lit spot are caught; inside it they reach the app.
  const clip = `path(evenodd, "M0 0 H${size.w} V${size.h} H0 Z M${hole.x} ${hole.y} h${hole.w} v${hole.h} h${-hole.w} Z")`;
  const chapterNo = (CHAPTERS as readonly string[]).indexOf(step.chapter) + 1;

  return (
    <div
      className="guide"
      data-side={pos.side}
      data-compact={compact || undefined}
      data-target={step.target}
      data-wait-on={step.waitOn}
    >
      <div className="guide-block" style={{ clipPath: clip }} aria-hidden="true" onWheel={scrollUnder} />
      <div
        className={rect ? "guide-hole" : "guide-hole guide-hole-none"}
        style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
        aria-hidden="true"
      />
      <div
        ref={guy}
        className="guide-nex"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        role="dialog"
        aria-modal="false"
        aria-labelledby="guide-title"
        aria-describedby="guide-body"
      >
        <span className="guide-avatar" key={`nex-${index}`}>
          <Nex state={step.mood ?? (step.wait ? "thinking" : "idle")} size={NEX} />
        </span>
        <div className="guide-bubble" ref={bubble} key={index}>
          <p className="guide-count">
            {step.chapter}
            {!only && ` · ${chapterNo} of ${CHAPTERS.length}`}
          </p>
          <h2 id="guide-title">{step.title}</h2>
          <p id="guide-body" aria-live="polite">
            {step.body}
          </p>
          <div className="guide-actions">
            <button className="btn btn-small btn-quiet guide-skip" onClick={finish}>
              {last ? "Close" : "Stop tutorial"}
            </button>
            {index > firstIndex && !step.wait && (
              <button className="btn btn-small" onClick={() => setIndex(index - 1)}>
                Back
              </button>
            )}
            {step.wait ? (
              <>
                {/* A way on if the thing to click isn't there (it was done already, say). */}
                <button className="btn btn-small btn-quiet" onClick={next}>
                  Skip this step
                </button>
                <span className="guide-waiting">
                  {step.wait === "click" ? "Your turn" : step.wait === "palette-open" ? "Press Ctrl+K" : "Press Esc"}
                </span>
              </>
            ) : (
              <button className="btn btn-small btn-primary" onClick={next}>
                {last ? "Finish" : "Next"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
