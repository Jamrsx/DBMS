import { findShown, folded, guideObstacles } from "./Tour";
import { WHATS_NEW } from "./whatsNew";

/*
 * A check for Nex's walkthroughs, for development builds only. It plays every step the way a
 * user would (clicking what Nex asks for) and reports each step where Nex, his bubble or the
 * practice banner covers what the step is about. Run it from the dev tools console:
 *
 *   await nexdbAuditGuide()          // the whole tutorial and every "What's new"
 *   await nexdbAuditGuide("New in 0.5.0")
 */

export interface GuideProblem {
  chapter: string;
  step: string;
  problem: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const box = (r: DOMRect): Box => ({ x: r.x, y: r.y, w: r.width, h: r.height });
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Inside a box of its own that scrolls or clips (a long SQL line), so it can't spill. */
function clipped(el: Element, stop: Element): boolean {
  for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX !== "visible" || s.overflowY !== "visible") return true;
  }
  return false;
}

/** What's wrong with the step on screen now; nothing when it's clear. */
function checkStep(): string[] {
  const guide = document.querySelector<HTMLElement>(".guide");
  if (!guide) return [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out: string[] = [];
  const target = guide.dataset.target ? findShown(guide.dataset.target) : null;
  const waitOn = guide.dataset.waitOn ? document.querySelector(guide.dataset.waitOn) : null;
  const nexEl = guide.querySelector(".guide-nex");
  if (!nexEl) return out;
  // The bubble and Nex himself, not the empty space beside the avatar.
  const nex = [guide.querySelector(".guide-bubble"), guide.querySelector(".guide-avatar")]
    .filter((e): e is Element => !!e)
    .map((e) => box(e.getBoundingClientRect()));
  const all = box(nexEl.getBoundingClientRect());
  if (all.x < 0 || all.y < 0 || all.x + all.w > vw + 1 || all.y + all.h > vh + 1)
    out.push("Nex is partly off the window");

  if (guide.dataset.target && !target) out.push("what Nex points at isn't on the screen");
  // The button the step asks you to click has to be in view, even before it's enabled.
  const button = guide.dataset.waitOn ? findShown(guide.dataset.waitOn.replace(/:not\(\[disabled\]\)/g, "")) : null;
  if (button) {
    const b = button.getBoundingClientRect();
    if (b.bottom > vh || b.top < 0) out.push("the button to click is out of view");
  }
  if (target) {
    const t = box(target.getBoundingClientRect());
    if (t.y + t.h <= 0 || t.y >= vh) out.push("what Nex points at is scrolled out of view");
    const { controls, text } = guideObstacles(target, [waitOn], vw, vh);
    if (controls.some((c) => nex.some((n) => overlap(n, c) > 4)))
      out.push("Nex covers a button or field he's explaining");
    if (text.some((c) => nex.some((n) => overlap(n, c) > 4))) out.push("Nex covers text he's explaining");
    // A box that doesn't scroll must hold all it shows: nothing poking out, no button cut off.
    const style = getComputedStyle(target);
    if (style.overflowX === "visible" && style.overflowY === "visible") {
      const spills = [...target.querySelectorAll("*")].some((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || folded(el) || clipped(el, target)) return false;
        return r.right > t.x + t.w + 2 || r.bottom > t.y + t.h + 2 || r.left < t.x - 2;
      });
      if (spills) out.push("something spills outside the highlighted box");
    }
    // The banner covers something only when it's what you'd hit there.
    const banner = document.querySelector(".practice-banner");
    if (banner) {
      const b = box(banner.getBoundingClientRect());
      const hidden = [t, ...controls].some((c) => {
        if (overlap(b, c) <= 4) return false;
        const x = Math.max(c.x, b.x) + 2;
        const y = Math.max(c.y, b.y) + 2;
        return !!document.elementFromPoint(x, y)?.closest(".practice-banner");
      });
      if (hidden) out.push("the practice banner covers it");
    }
  }
  return out;
}

/** Does what the step waits for, like a user would; skips when it can't. */
function advance(guide: HTMLElement) {
  const waiting = guide.querySelector(".guide-waiting")?.textContent;
  if (!waiting) {
    guide.querySelector<HTMLElement>(".guide-bubble .btn-primary")?.click();
    return;
  }
  if (waiting === "Press Ctrl+K") {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    return;
  }
  if (waiting === "Press Esc") {
    const field = document.querySelector(".palette input") ?? document.activeElement ?? document.body;
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return;
  }
  const sel = guide.dataset.waitOn ?? guide.dataset.target;
  const el = sel ? document.querySelector<HTMLElement>(sel) : null;
  if (el && !(el as HTMLButtonElement).disabled) el.click();
  else [...guide.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Skip this step")?.click();
}

/** Picks other choices in the step's lists, like a user trying it out (a warning may appear). */
async function tryChoices(): Promise<boolean> {
  const guide = document.querySelector<HTMLElement>(".guide");
  const target = guide?.dataset.target ? findShown(guide.dataset.target) : null;
  const selects = target ? [...target.querySelectorAll("select")] : [];
  if (!selects.length) return false;
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
  for (const sel of selects) {
    const options = [...sel.options].filter((o) => !o.disabled && o.value);
    const other = options.find((o) => o.value !== sel.value && o.index > 0) ?? options[options.length - 1];
    if (!other || other.value === sel.value) continue;
    set.call(sel, other.value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(150);
  }
  return true;
}

async function playChapter(chapter: string | null, problems: GuideProblem[], stopAt?: string) {
  window.dispatchEvent(new CustomEvent("nexdb:guide", { detail: chapter }));
  let last = "";
  let same = 0;
  for (let i = 0; i < 80; i++) {
    // Nex walks for about half a second; give pages time to open too.
    await sleep(1300);
    const guide = document.querySelector<HTMLElement>(".guide");
    if (!guide) return;
    const step = guide.querySelector("#guide-title")?.textContent ?? "?";
    const name = guide.querySelector(".guide-count")?.textContent?.split(" · ")[0] ?? chapter ?? "Tutorial";
    if (step === last && ++same > 2) {
      problems.push({ chapter: name, step, problem: "the step doesn't go on after doing what it asks" });
      [...guide.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Skip this step")?.click();
      continue;
    }
    if (step !== last) {
      same = 0;
      // Some steps settle a little later (a page loading, a service starting): look twice.
      let found = checkStep();
      if (found.length) {
        await sleep(2000);
        found = checkStep();
      }
      // Then again after changing its choices, since some text only shows up then.
      if (await tryChoices()) {
        await sleep(1300);
        let after = checkStep();
        if (after.length) {
          await sleep(2000);
          after = checkStep();
        }
        for (const p of after) if (!found.includes(p)) found.push(`${p} (after changing its choices)`);
      }
      for (const problem of found) problems.push({ chapter: name, step, problem });
    }
    if (stopAt && step === stopAt) return;
    last = step;
    advance(guide);
  }
  window.dispatchEvent(new Event("nexdb:guide-stop"));
}

/** `stopAt`: leave the walkthrough open on the step with this title, to look at it. */
export async function auditGuide(chapter?: string, stopAt?: string): Promise<GuideProblem[]> {
  const problems: GuideProblem[] = [];
  // Measure where things end up, not mid-animation (a hidden window doesn't animate at all).
  const still = document.createElement("style");
  still.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.head.append(still);
  const chapters = chapter ? [chapter] : [null, ...WHATS_NEW.map((w) => w.chapter)];
  try {
    for (const c of chapters) await playChapter(c, problems, stopAt);
  } finally {
    if (!stopAt) still.remove();
  }
  return problems;
}

declare global {
  interface Window {
    nexdbAuditGuide?: typeof auditGuide;
  }
}
window.nexdbAuditGuide = auditGuide;
