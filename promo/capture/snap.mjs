// Captures NexDB screens from the app's browser preview (practice data only) for the promo.
// Usage: node capture/snap.mjs [scale]   (dev server: http://localhost:1420)
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:1420";
import { fileURLToPath } from "node:url";
const OUT = fileURLToPath(new URL("../out/shots/", import.meta.url));
const scale = Number(process.argv[2] ?? 1);
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  defaultViewport: { width: 1600, height: 960, deviceScaleFactor: scale },
});
const page = await browser.newPage();
await page.emulateMediaFeatures([
  { name: "prefers-color-scheme", value: "dark" },
  { name: "prefers-reduced-motion", value: "reduce" },
]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("button,a,[role=tab]")].find((x) => x.innerText.trim().startsWith(t));
    el?.click();
    return !!el;
  }, text);
// The first-run tour and "what's new" bubbles stay out of the shots.
const quiet = () => page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Stop tutorial|Skip|Not now|Close/.test(b.innerText))?.click());
const shot = async (name) => {
  await wait(700);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log("saved", name);
};

await page.goto(`${BASE}/?view=dashboard`, { waitUntil: "networkidle0" });
await wait(1500);
await quiet();
await shot("dashboard");

await page.goto(`${BASE}/?view=nexhost&license=nexhost`, { waitUntil: "networkidle0" });
await wait(1500);
await click("shop");
await shot("nexhost-overview");
await click("Deploy");
await wait(500);
await click("Update site");
await wait(6500);
await shot("nexhost-deploy");

await browser.close();
