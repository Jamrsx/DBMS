// Styleframes for the NexDB promo: 3 still 1920x1080 frames in the blended direction
// (Night Console base, Signal Path line, Nex as host). Real screens from practice mode.
// Usage: node styleframes/build.mjs  ->  out/styleframes/frame-1..3.png + compare.png
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const OUT = here("../out/styleframes/");
mkdirSync(OUT, { recursive: true });
const svg = readFileSync(here("../../app/src/assets/nex.svg"), "utf8")
  .replace(/\swidth="\d+"\s+height="\d+"/, "")
  .replace(/<title>[\s\S]*?<\/title>/, "");
const nex = (mood, size) => `<div class="nex-box" style="width:${size}px;height:${size}px">${svg.replace('class="nex s-idle"', `class="nex s-${mood} paused"`)}</div>`;
const img = (name) => "data:image/png;base64," + readFileSync(here(`../out/shots/${name}.png`)).toString("base64");

// The app's own dark tokens (app/src/styles.css).
const css = `
:root{--bg:#0f1114;--surface:#171a1f;--surface-2:#1e2228;--text:#e4e7ec;--text-2:#b3b9c4;--text-3:#8e95a2;
--border:#272c34;--accent:#2f6ae0;--accent-text:#8fb3ff;--ok:#5ccb8b;
--font:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;--display:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;--mono:"Cascadia Mono","Cascadia Code",Consolas,monospace}
*{box-sizing:border-box;margin:0}
body{background:#05070a;font-family:var(--font);color:var(--text)}
.frame{position:relative;width:1920px;height:1080px;overflow:hidden;background:
 radial-gradient(1200px 700px at 70% 30%, rgba(47,106,224,.16), transparent 60%),
 radial-gradient(900px 600px at 15% 90%, rgba(92,203,139,.07), transparent 60%), var(--bg)}
.grain{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.035) 1px,transparent 1px);background-size:4px 4px;opacity:.5}
.nex-box svg{width:100%;height:100%}
.kicker{font:600 22px/1 var(--mono);letter-spacing:.14em;color:var(--accent-text);text-transform:uppercase}
.h1{font:700 112px/1.02 var(--display);letter-spacing:-.035em}
.h2{font:700 76px/1.05 var(--display);letter-spacing:-.03em}
.sub{font:400 30px/1.45 var(--font);color:var(--text-2)}
.green{color:var(--ok)} .blue{color:var(--accent-text)}
.screen{position:absolute;border-radius:14px;overflow:hidden;border:1px solid #2a303a;
 box-shadow:0 60px 120px -40px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.03),0 0 80px -20px rgba(47,106,224,.35)}
.screen img{display:block;width:100%}
.sig{position:absolute;overflow:visible}
.cap{position:absolute;left:120px;bottom:90px;font:600 34px/1.3 var(--font);padding:14px 22px;border-radius:12px;
 background:rgba(23,26,31,.78);border:1px solid var(--border);backdrop-filter:blur(8px)}
.chip{display:inline-flex;align-items:center;gap:10px;padding:10px 18px;border-radius:999px;border:1px solid var(--border);
 background:var(--surface);font:600 22px/1 var(--font);color:var(--text-2)}
.dot{width:10px;height:10px;border-radius:50%;background:var(--ok);box-shadow:0 0 14px var(--ok)}
.price{border:1px solid var(--border);background:var(--surface);border-radius:16px;padding:22px 24px;width:220px}
.price b{display:block;font:700 40px/1 var(--display)} .price span{font:500 18px/1.4 var(--font);color:var(--text-3)}
.price.hot{border-color:var(--accent);box-shadow:0 0 40px -10px rgba(47,106,224,.6)}
.cta{display:inline-flex;align-items:center;gap:14px;padding:22px 34px;border-radius:16px;background:var(--accent);
 font:700 34px/1 var(--display);color:#fff;box-shadow:0 20px 60px -20px rgba(47,106,224,.9)}
`;

// A signal line: blue where it travels, green from the point where something works.
const signal = (d, w, h, x, y, greenFrom = 0.62) => `
<svg class="sig" style="left:${x}px;top:${y}px" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
 <defs><linearGradient id="g${x}" x1="0" x2="1"><stop offset="0" stop-color="#2f6ae0" stop-opacity=".15"/>
 <stop offset="${greenFrom - 0.05}" stop-color="#5b8ff0"/><stop offset="${greenFrom}" stop-color="#5ccb8b"/>
 <stop offset="1" stop-color="#5ccb8b"/></linearGradient>
 <filter id="f${x}"><feGaussianBlur stdDeviation="6"/></filter></defs>
 <path d="${d}" stroke="url(#g${x})" stroke-width="10" fill="none" filter="url(#f${x})" opacity=".55"/>
 <path d="${d}" stroke="url(#g${x})" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg>`;

const frames = [
  // 1. Opening: Nex says hello, the line draws the wordmark's underline.
  `<section class="frame" id="f1"><div class="grain"></div>
    <div style="position:absolute;left:200px;top:250px">${nex("hello", 420)}</div>
    <div style="position:absolute;left:720px;top:330px">
      <div class="kicker">For PHP &amp; Laravel developers</div>
      <div class="h1" style="margin-top:26px">Your whole PHP stack.<br/><span class="blue">One app.</span></div>
      <div class="sub" style="margin-top:28px;max-width:860px">Apache, PHP, MySQL and Node, set up and running in one click.</div>
    </div>
    ${signal("M0 40 C 300 40, 420 10, 760 20 S 1180 40, 1180 40", 1200, 80, 720, 760, 0.7)}
    <div style="position:absolute;left:1640px;top:800px" class="chip"><span class="dot"></span>Working</div>
  </section>`,
  // 2. Feature: the real Dashboard floats in 2.5D; the line runs into Start all and turns green.
  `<section class="frame" id="f2"><div class="grain"></div>
    <div style="position:absolute;left:120px;top:150px;width:620px">
      <div class="kicker">One click</div>
      <div class="h2" style="margin-top:22px">Start all.<br/><span class="green">Everything runs.</span></div>
      <div class="sub" style="margin-top:24px">Web server, PHP versions, databases and mail, with live status and logs.</div>
    </div>
    <div class="screen" style="left:820px;top:150px;width:1240px;transform:perspective(2400px) rotateY(-14deg) rotateX(4deg);transform-origin:left center">
      <img src="${img("dashboard")}"/></div>
    ${signal("M0 300 C 200 300, 260 120, 520 120 S 900 60, 1180 60", 1200, 340, 560, 120, 0.82)}
    <div style="position:absolute;left:1500px;top:820px">${nex("success", 200)}</div>
    <div class="cap">Your stack, running in seconds.</div>
  </section>`,
  // 3. Ending: NexHost map + plans + free launch key.
  `<section class="frame" id="f3"><div class="grain"></div>
    <div class="screen" style="left:110px;top:120px;width:1060px;transform:perspective(2400px) rotateY(10deg);transform-origin:right center">
      <img src="${img("nexhost-overview")}"/></div>
    <div style="position:absolute;left:1260px;top:130px;width:560px">
      <div class="kicker">NexHost · 4-year plan</div>
      <div class="h2" style="margin-top:20px;font-size:64px">Build it. Host it.<br/><span class="green">From your own PC.</span></div>
      <div style="display:flex;gap:16px;margin-top:40px;flex-wrap:wrap">
        <div class="price"><b>₱299</b><span>6 months</span></div>
        <div class="price"><b>₱540</b><span>1 year · ₱45/mo</span></div>
        <div class="price hot"><b>₱4,900</b><span>4 years + NexHost</span></div>
      </div>
      <div style="margin-top:44px" class="cta">Get your free launch key →</div>
      <div class="sub" style="margin-top:18px;font-size:22px">7 days free, NexHost included · nexdb.app</div>
    </div>
    ${signal("M0 20 C 260 20, 380 60, 700 60", 720, 100, 560, 940, 0.55)}
    <div style="position:absolute;left:60px;top:780px">${nex("wizard", 260)}</div>
  </section>`,
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${frames.join("")}</body></html>`;
writeFileSync(`${OUT}styleframes.html`, html);

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
await page.goto("file:///" + `${OUT}styleframes.html`.replace(/\\/g, "/"), { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 800));
for (const id of ["f1", "f2", "f3"]) {
  const el = await page.$(`#${id}`);
  await el.screenshot({ path: `${OUT}frame-${id.slice(1)}.png` });
  console.log("saved frame", id);
}
await browser.close();
