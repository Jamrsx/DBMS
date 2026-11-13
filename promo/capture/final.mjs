// Final screen capture for the promo (storyboard-approved states), practice mode only.
// 1920x1080 @2x -> public/textures/<name>.png ; layout boxes -> public/textures/layout.json
// Usage: node capture/final.mjs [only-name ...]
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:1420";
const OUT = fileURLToPath(new URL("../public/textures/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const layoutPath = `${OUT}layout.json`;
const layout = existsSync(layoutPath) ? JSON.parse(readFileSync(layoutPath, "utf8")) : {};

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.emulateMediaFeatures([
  { name: "prefers-color-scheme", value: "dark" },
]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (text, sel = "button,a,[role=tab],li") =>
  page.evaluate(
    (t, s) => {
      const el = [...document.querySelectorAll(s)].find((x) => x.innerText && x.innerText.trim().startsWith(t));
      el?.click();
      return !!el;
    },
    text,
    sel,
  );
// Preview-only notices and first-run bubbles are not part of the product's normal look.
const tidy = () =>
  page.evaluate(() => {
    // Only small boxes are hidden, never a container that also holds the page's content.
    const short = (el) => (el.innerText ?? "").trim().length < 260;
    const hide = (pred) => document.querySelectorAll("p,div,section,aside").forEach((el) => short(el) && pred(el) && (el.style.display = "none"));
    // The note itself only (a leaf), never the layout box around it.
    document.querySelectorAll(".notice").forEach((el) => /^Browser preview/.test(el.textContent.trim()) && (el.style.display = "none"));
    hide((el) => /are missing\./.test(el.innerText) && /banner|notice|alert/.test(el.className));
    hide((el) => /is ready/.test(el.innerText) && /Update now/.test(el.innerText) && el.querySelector("button"));
    document.querySelectorAll(".nex-corner, .nexcorner, [class*='nex-bubble'], [class*='tour'], [class*='guide-pop']").forEach((el) => (el.style.display = "none"));
    // (No clicking here: a "Not now"/"Skip" on the page is real UI and changes what is shown.)
    document.querySelectorAll(".nex-bubble, .nex-corner, .guide, .guide-card, [class*='update-card'], [class*='whats-new']").forEach((el) => (el.style.display = "none"));
  });
const boxes = (name, sels) =>
  page.evaluate((sels) => {
    const out = {};
    for (const [k, s] of Object.entries(sels)) {
      const el = typeof s === "string" ? document.querySelector(s) : null;
      if (el) {
        const r = el.getBoundingClientRect();
        out[k] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }
    }
    return out;
  }, sels).then((b) => (layout[name] = b));
const shot = async (name, sels = {}) => {
  if (only.length && !only.includes(name)) return;
  await tidy();
  await page.evaluate(() => document.fonts.ready);
  await wait(1200);
  await tidy();
  await wait(150);
  await boxes(name, sels);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log("saved", name);
};
const go = async (q) => {
  await page.goto(`${BASE}/?${q}`, { waitUntil: "networkidle0" });
  await wait(1400);
  await tidy();
};
const nav = async (label) => {
  await click(label, "nav a, nav button, aside a, aside button, a, button");
  // Lists in the preview load after a short pretend delay.
  await wait(2600);
};

// --- NexDB main window ---
await go("view=dashboard&license=nexhost&demo=allgreen");
await shot("dash-stopped", { startAll: "button.btn-primary" });
// One service at a time (rows grow when running, so each state is its own real screen).
if (!only.length || only.includes("dash-steps")) {
  for (let i = 0; i < 7; i++) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && x.innerText.trim() === "Start");
      b?.click();
    });
    await wait(1700);
    await tidy();
    await wait(300);
    await page.screenshot({ path: `${OUT}dash-step-${i + 1}.png` });
    console.log("saved dash-step", i + 1);
  }
}
await click("Start all");
await wait(3500);
await shot("dash-running");

await nav("Projects");
await shot("projects");
await nav("Database");
await shot("database");
// Open shop -> customers -> Browse: a real table full of rows.
await page.evaluate(() => document.querySelector("button.db-item")?.click());
await wait(1500);
await page.evaluate(() => document.querySelector("button.db-table")?.click());
await wait(1500);
await click("Browse");
await wait(2000);
await shot("database-table");
await nav("Versions");
await shot("versions");
await nav("Mail");
await shot("mail");
await nav("Check my setup");
await wait(1500);
await shot("health");
await nav("Settings");
await shot("settings");

// --- NexHost (hosting panel window) ---
await go("view=nexhost&license=nexhost&demo=allgreen");
await click("shop");
await wait(900);
await shot("nh-overview");
await click("Files");
await wait(700);
await shot("nh-files");
await click("Import project");
await wait(900);
await shot("nh-import");
await click("Import", "button.btn-primary");
await wait(900);
await shot("nh-imported");
await click("index.php");
await wait(900);
await shot("nh-editor");
await click("Deploy");
await wait(700);
await shot("nh-deploy");
await click("Update site");
await wait(6500);
await shot("nh-deploy-done");
await click("Go live");
await wait(900);
await shot("nh-golive");
await click("SSH");
await wait(900);
await shot("nh-ssh");
await click("portfolio");
await wait(900);
await click("Overview");
await wait(700);
await shot("nh-overview-offline");

writeFileSync(layoutPath, JSON.stringify(layout, null, 1));
await browser.close();
