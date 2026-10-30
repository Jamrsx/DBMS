// Builds catalog/catalog.json from official release data.
// Run: node catalog/build-catalog.mjs
//
// Sources: endoflife.date (release lines, support and end-of-life dates),
// php.net releases API and nodejs.org/dist/index.json (security-release flags).
// Download URLs and checksums are added in a later milestone.

import { writeFile } from "node:fs/promises";

const MAX_LINES = 4;

const COMPONENTS = [
  { id: "apache", name: "Apache", eol: "apache-http-server" },
  { id: "nginx", name: "nginx", eol: "nginx" },
  { id: "php", name: "PHP", eol: "php" },
  { id: "mysql", name: "MySQL", eol: "mysql" },
  { id: "node", name: "Node.js", eol: "nodejs" },
];

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/** endoflife.date fields are either a date string or a boolean. */
const dateOrNull = (v) => (typeof v === "string" ? v : null);

async function phpSecurityVersions() {
  const releases = await getJson("https://www.php.net/releases/index.php?json&version=8&max=200");
  return new Set(
    Object.entries(releases)
      .filter(([, r]) => r.tags?.includes("security"))
      .map(([version]) => version),
  );
}

async function nodeSecurityVersions() {
  const index = await getJson("https://nodejs.org/dist/index.json");
  return new Set(index.filter((r) => r.security).map((r) => r.version.replace(/^v/, "")));
}

const today = new Date().toISOString().slice(0, 10);
const security = { php: await phpSecurityVersions(), node: await nodeSecurityVersions() };

const components = [];
for (const c of COMPONENTS) {
  const cycles = await getJson(`https://endoflife.date/api/${c.eol}.json`);
  const lines = cycles
    .filter((cy) => cy.eol !== true && !(typeof cy.eol === "string" && cy.eol < today))
    .slice(0, MAX_LINES)
    .map((cy) => ({
      line: String(cy.cycle),
      latest: cy.latest,
      latest_date: cy.latestReleaseDate ?? null,
      line_released: cy.releaseDate,
      // `lts` is `true`, `false` or the date the line became LTS.
      lts: cy.lts === true,
      lts_from: dateOrNull(cy.lts),
      support_end: dateOrNull(cy.support),
      eol: dateOrNull(cy.eol),
      security: security[c.id]?.has(cy.latest) ?? false,
    }));
  components.push({ id: c.id, name: c.name, lines });
}

const catalog = {
  schema: 1,
  generated: today,
  sources: ["endoflife.date", "php.net/releases", "nodejs.org/dist/index.json"],
  components,
};

const out = new URL("./catalog.json", import.meta.url);
await writeFile(out, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Wrote ${out.pathname}`);
for (const c of components) {
  console.log(`  ${c.name}: ${c.lines.map((l) => l.latest + (l.security ? "*" : "")).join(", ")}`);
}
