import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Nex, type NexState } from "./Nex";

/**
 * The guided tutorial. Nex walks to whatever it's explaining, the rest of the window dims, and
 * some steps wait for you to do the thing (click a page, press Ctrl+K) before going on.
 */

const DONE_KEY = "nexdb.guideDone";

type Page = "dashboard" | "projects" | "database" | "terminal" | "versions" | "health" | "settings" | "help";

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
export type Chapter = (typeof CHAPTERS)[number];

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
  wait?: "click" | "palette-open" | "palette-close";
}

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
    body: "Every page lives here. Ctrl+1 to Ctrl+8 jump straight to them.",
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
    target: '[data-guide="services"]',
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
    target: here(".panel-body"),
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
    body: "Ports, folders, HTTPS, automatic backups and updates.",
    target: here(".panel-body"),
    page: "settings",
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
    target: ".palette",
    wait: "palette-close",
  },
  {
    chapter: "Search",
    title: "You're all set!",
    body: "That's NexDB from start to finish. I'll be in the corner with news while you work. Have fun building!",
    mood: "success",
  },
];

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
const BUBBLE_W = 320;
const NEX = 72;

/** Where Nex and its bubble stand: beside the target, on whichever side has room. */
function placeGuide(t: Box | null, vw: number, vh: number, bubbleH: number) {
  const w = NEX + 10 + BUBBLE_W;
  const h = Math.max(NEX, bubbleH);
  if (!t) return { x: (vw - w) / 2, y: (vh - h) / 2, side: "center" as const };
  const clampY = (y: number) => Math.min(Math.max(12, y), vh - h - 12);
  const clampX = (x: number) => Math.min(Math.max(12, x), vw - w - 12);
  if (t.x + t.w + PAD + 16 + w < vw) return { x: t.x + t.w + PAD + 16, y: clampY(t.y), side: "right" as const };
  if (t.x - PAD - 16 - w > 0) return { x: t.x - PAD - 16 - w, y: clampY(t.y), side: "left" as const };
  if (t.y + t.h + PAD + 16 + h < vh) return { x: clampX(t.x), y: t.y + t.h + PAD + 16, side: "below" as const };
  // A target as big as the window: stand inside it, at the bottom.
  return { x: clampX(t.x + t.w - w - 24), y: Math.max(12, Math.min(t.y + t.h, vh) - h - 24), side: "inside" as const };
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
  const [bubbleH, setBubbleH] = useState(140);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const bubble = useRef<HTMLDivElement>(null);
  const before = useRef<Element | null>(null);

  const step = STEPS[index];
  const lastIndex = only ? STEPS.map((s) => s.chapter).lastIndexOf(only) : STEPS.length - 1;
  const firstIndex = only ? STEPS.findIndex((s) => s.chapter === only) : 0;
  const last = index === lastIndex;

  const finish = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      // It shows again next launch; harmless.
    }
    (before.current as HTMLElement | null)?.focus?.();
    before.current = null;
  }, []);

  const next = useCallback(() => {
    if (index >= lastIndex) finish();
    else setIndex(index + 1);
  }, [index, lastIndex, finish]);

  // Settings → replay, or the whole thing.
  useEffect(() => {
    const start = (e: Event) => {
      const chapter = (e as CustomEvent<Chapter | null>).detail;
      before.current = document.activeElement;
      setOnly(chapter);
      setIndex(chapter ? STEPS.findIndex((s) => s.chapter === chapter) : 0);
      setOpen(true);
    };
    window.addEventListener("nexdb:guide", start);
    return () => window.removeEventListener("nexdb:guide", start);
  }, []);

  // Hide the corner Nex while this one is walking around.
  useEffect(() => {
    document.body.classList.toggle("guiding", open);
  }, [open]);

  // Open the step's page when it isn't showing.
  useEffect(() => {
    if (open && step.page) onPage(step.page);
  }, [open, step, onPage]);

  // Follow the target as the page lays out, scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      const r = el?.getBoundingClientRect();
      const box = r && r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      setRect((old) =>
        old && box && old.x === box.x && old.y === box.y && old.w === box.w && old.h === box.h ? old : box,
      );
      setSize((s) =>
        s.w === window.innerWidth && s.h === window.innerHeight ? s : { w: window.innerWidth, h: window.innerHeight },
      );
      if (bubble.current) setBubbleH(bubble.current.offsetHeight);
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
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      if (!el) return;
      const go = () => window.setTimeout(next, 250);
      el.addEventListener("click", go, { once: true });
      return () => el.removeEventListener("click", go);
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
      if (step.wait === "click" && step.target) document.querySelector<HTMLElement>(step.target)?.focus();
      else if (!step.wait) bubble.current?.querySelector<HTMLButtonElement>(".btn-primary")?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [open, step]);

  if (!open) return null;

  const pos = placeGuide(rect, size.w, size.h, bubbleH);
  const hole = rect
    ? { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + PAD * 2, h: rect.h + PAD * 2 }
    : { x: size.w / 2, y: size.h / 2, w: 0, h: 0 };
  // Clicks outside the lit spot are caught; inside it they reach the app.
  const clip = `path(evenodd, "M0 0 H${size.w} V${size.h} H0 Z M${hole.x} ${hole.y} h${hole.w} v${hole.h} h${-hole.w} Z")`;
  const chapterNo = CHAPTERS.indexOf(step.chapter) + 1;

  return (
    <div className="guide" data-side={pos.side}>
      <div className="guide-block" style={{ clipPath: clip }} aria-hidden="true" />
      <div
        className={rect ? "guide-hole" : "guide-hole guide-hole-none"}
        style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
        aria-hidden="true"
      />
      <div
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
              <span className="guide-waiting">
                {step.wait === "click" ? "Your turn" : step.wait === "palette-open" ? "Press Ctrl+K" : "Press Esc"}
              </span>
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
