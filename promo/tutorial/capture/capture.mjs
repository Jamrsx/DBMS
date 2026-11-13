// Captures the Tailscale tutorial screens from the app's browser preview (practice data; nothing on the PC changes).
// Usage: node tutorial/capture/capture.mjs   (dev server: http://localhost:1420)
// Writes public/tut/NN-name.png (3840x2160) and public/tut/rects.json (targets in 1920x1080 page px).
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const OUT = fileURLToPath(new URL("../../public/tut/", import.meta.url));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 } });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }, { name: "prefers-reduced-motion", value: "reduce" }]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SEL = "button,a,[role=tab],[role=switch],summary";
const find = (t, sel = SEL) => page.evaluateHandle((t, sel) => [...document.querySelectorAll(sel)].find((x) => x.offsetParent && (x.innerText || x.getAttribute("aria-label") || "").trim().startsWith(t)) || null, t, sel);
const click = async (t, sel) => { const h = await find(t, sel); const ok = await h.evaluate((e) => { if (!e) return false; e.click(); return true; }); if (!ok) console.log("MISSING", t); await wait(900); return ok; };
const rect = async (t, sel) => { const h = await find(t, sel); return h.evaluate((e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }); };
const scrollTo = async (t, sel) => { const h = await find(t, sel); await h.evaluate((e) => e?.scrollIntoView({ block: "center" })); await wait(500); };
// Hide Nex's speech bubbles and the first-run tutorial so the shots stay clean.
const quiet = () => page.evaluate(() => { for (const b of document.querySelectorAll("button")) if (/^(Stop tutorial|Not now)$/.test(b.innerText.trim()) || b.classList.contains("nex-bubble-close") || b.classList.contains("update-close")) b.click(); });
const rects = {};
let n = 0;
const shot = async (name, targets = {}) => {
  await quiet(); await wait(500);
  const key = `${String(++n).padStart(2, "0")}-${name}`;
  rects[key] = {};
  for (const [k, [t, sel]] of Object.entries(targets)) { rects[key][k] = await rect(t, sel); if (!rects[key][k]) console.log("no rect", key, k); }
  await page.screenshot({ path: `${OUT}${key}.png` });
  console.log("saved", key, JSON.stringify(rects[key]));
};

await page.goto("http://localhost:1420/?view=dashboard&license=nexhost", { waitUntil: "networkidle0" });
await wait(1500); await quiet();
await click("Projects");
await shot("projects", { project: ["my-shop", "button.project-name"], nav: ["Projects"] });
await click("my-shop", "button.project-name");
await shot("details", { tab: ["Share", "[role=tab],button"] });
await click("Share", "[role=tab],button");
await scrollTo("Share on my Wi-Fi");
await shot("sharetab", { wifi: ["Share on my Wi-Fi"] });
await click("Share on my Wi-Fi");
await wait(800);
await scrollTo("Allow my Tailscale devices");
await shot("shared", { allow: ["Allow my Tailscale devices"], tslink: ["http://my-pc.tail", "code"], wifi: ["", "section.share-option"] });
await click("Allow my Tailscale devices");
await wait(1500);
await scrollTo("Tailscale", "section[aria-label=Tailscale]");
await shot("allowed", { card: ["Tailscale", "section[aria-label=Tailscale]"], invite: ["Share this PC"] });
console.log(await page.evaluate(() => document.querySelector("section[aria-label=Tailscale]")?.innerText));
console.log(await page.evaluate(() => [...document.querySelectorAll(".share code, .share a")].map((e) => e.innerText).join(" | ")));

await click("NexHost");
await wait(800);
await shot("nh-sites", { site: ["shop"], nav: ["NexHost"] });
await click("shop");
await wait(800);
await click("Overview", "[role=tab],button");
await scrollTo("Open to my Tailscale network", "[role=switch]");
await shot("nh-overview", { sw: ["Open to my Tailscale network", "[role=switch]"], row: ["", "[data-guide=nexhost-tailscale]"] });
await click("Open to my Tailscale network", "[role=switch]");
await wait(1500);
await shot("nh-on", { allow: ["Allow my Tailscale devices"], row: ["", "[data-guide=nexhost-tailscale]"] });
await click("Allow my Tailscale devices");
await wait(1500);
await shot("nh-allowed", { link: ["", "[data-guide=nexhost-tailscale-link]"], row: ["", "[data-guide=nexhost-tailscale]"] });
console.log(await page.evaluate(() => document.querySelector("[data-guide=nexhost-tailscale]")?.innerText));
writeFileSync(`${OUT}rects.json`, JSON.stringify(rects, null, 1));
await browser.close();
