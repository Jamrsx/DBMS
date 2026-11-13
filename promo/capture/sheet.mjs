// Contact sheet of captured textures (or any folder of PNGs): out/contact.png
import puppeteer from "puppeteer-core";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = process.argv[2] ?? fileURLToPath(new URL("../public/textures/", import.meta.url));
const out = process.argv[3] ?? fileURLToPath(new URL("../out/contact.png", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
const tile = (f) => {
  const src = "data:image/png;base64," + readFileSync(`${dir}/${f}`).toString("base64");
  return `<div><img src="${src}" style="width:480px;display:block"/>${f}</div>`;
};
const html = `<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(4,480px);gap:6px;color:#fff;font:14px sans-serif">${files.map(tile).join("")}</body>`;
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1944, height: 300 });
await p.setContent(html, { waitUntil: "load" });
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log("sheet", out, files.length);
