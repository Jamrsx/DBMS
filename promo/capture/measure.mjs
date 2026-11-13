// Measures button/element boxes (CSS px) on the captured states, for camera targets.
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, defaultViewport: { width: 1920, height: 1080 } });
const p = await b.newPage();
await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const box = (texts) =>
  p.evaluate((texts) => {
    const out = {};
    for (const t of texts) {
      const el = [...document.querySelectorAll("button,a,h2,h3,strong,p,[role=tab]")].find((x) => x.offsetParent && x.innerText && x.innerText.trim().startsWith(t));
      if (el) { const r = el.getBoundingClientRect(); out[t] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }
    }
    return out;
  }, texts);
const click = (t) => p.evaluate((t) => [...document.querySelectorAll("button,a,[role=tab]")].find((x) => x.offsetParent && x.innerText.trim().startsWith(t))?.click(), t);
await p.goto("http://localhost:1420/?view=dashboard&license=nexhost&demo=allgreen", { waitUntil: "networkidle0" });
await wait(1500); await click("Check my setup"); await wait(3000);
console.log("health", JSON.stringify(await box(["Set up addresses", "3 project addresses", "Check again", "Port 80"])));
await p.goto("http://localhost:1420/?view=nexhost&license=nexhost&demo=allgreen", { waitUntil: "networkidle0" });
await wait(1500); await click("shop"); await wait(900);
console.log("overview", JSON.stringify(await box(["Visitors", "Database", "Fix"])));
await click("Files"); await wait(800);
console.log("files", JSON.stringify(await box(["Import project", "index.php", "New folder"])));
await click("Import project"); await wait(900);
console.log("import", JSON.stringify(await box(["Import", "Cancel", "Copy a project"])));
await click("Deploy"); await wait(800);
console.log("deploy", JSON.stringify(await box(["Update site", "Output", "Pull updates", "Terminal"])));
await click("Go live"); await wait(800);
console.log("golive", JSON.stringify(await box(["Go offline", "Go live", "https://"])));
await b.close();
