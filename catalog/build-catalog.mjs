// Builds catalog/catalog.json from official release data.
// Run: node catalog/build-catalog.mjs
//
// Sources: endoflife.date (release lines, support and end-of-life dates),
// php.net releases API and nodejs.org/dist/index.json (security-release flags).
//
// Windows downloads and checksums, from each vendor's official files:
//   PHP      downloads.php.net/~windows releases.json  (SHA-256, NTS x64 builds for FastCGI)
//   Node.js  nodejs.org SHASUMS256.txt                  (SHA-256)
//   Apache   Apache Lounge .txt next to each zip        (SHA-256)
//   nginx    nginx.org zip                              (SHA-256 computed here; zips are small)
//   MySQL    cdn.mysql.com .md5 file                    (MD5; TODO: verify the .asc signature in CI)
//   Composer getcomposer.org versioned .sha256sum       (SHA-256)

import { createHash } from "node:crypto";
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

async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/** Size in bytes from a HEAD request, or null if the file isn't there. */
async function headSize(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) return null;
  return Number(res.headers.get("content-length")) || null;
}

const download = (url, size, algo, value, file_version = null) => ({
  url,
  size,
  checksum: { algo, value: value.toLowerCase() },
  file_version,
});

const phpReleases = await getJson("https://downloads.php.net/~windows/releases/releases.json");
const nodeShasums = new Map();
const apachePage = await getText("https://www.apachelounge.com/download/");

/** Download info for one version on Windows x64, or null when no build is published yet. */
async function windowsDownload(id, line, version) {
  switch (id) {
    case "php": {
      const release = phpReleases[line];
      // Windows builds can carry a rebuild suffix: 8.5.12-1.
      if (!release || !String(release.version).startsWith(version)) return null;
      const build = Object.entries(release).find(
        ([key, v]) => key.startsWith("nts-") && key.endsWith("-x64") && v?.zip,
      );
      if (!build) return null;
      const zip = build[1].zip;
      const url = `https://downloads.php.net/~windows/releases/${zip.path}`;
      return download(url, await headSize(url), "sha256", zip.sha256, String(release.version));
    }
    case "node": {
      if (!nodeShasums.has(version)) {
        const sums = await getText(`https://nodejs.org/dist/v${version}/SHASUMS256.txt`);
        nodeShasums.set(version, sums);
      }
      const file = `node-v${version}-win-x64.zip`;
      const line = nodeShasums.get(version).split("\n").find((l) => l.trim().endsWith(file));
      if (!line) return null;
      const url = `https://nodejs.org/dist/v${version}/${file}`;
      return download(url, await headSize(url), "sha256", line.split(/\s+/)[0]);
    }
    case "apache": {
      const re = new RegExp(`/download/[^"]*/httpd-${version.replace(/\./g, "\\.")}-\\d+-Win64-VS\\d+\\.zip`);
      const path = apachePage.match(re)?.[0];
      if (!path) return null;
      const url = `https://www.apachelounge.com${path}`;
      const txt = await getText(`${url}.txt`);
      const sha = txt.match(/SHA256-Checksum[^\n]*\n\s*([0-9A-Fa-f]{64})/)?.[1];
      return sha ? download(url, await headSize(url), "sha256", sha) : null;
    }
    case "nginx": {
      const url = `https://nginx.org/download/nginx-${version}.zip`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      const sha = createHash("sha256").update(bytes).digest("hex");
      return download(url, bytes.length, "sha256", sha);
    }
    case "mysql": {
      const url = `https://cdn.mysql.com/Downloads/MySQL-${line}/mysql-${version}-winx64.zip`;
      const res = await fetch(`${url}.md5`);
      if (!res.ok) return null;
      const md5 = (await res.text()).trim().split(/\s+/)[0];
      return /^[0-9a-f]{32}$/i.test(md5) ? download(url, await headSize(url), "md5", md5) : null;
    }
    default:
      return null;
  }
}

async function composerTool() {
  const versions = await getJson("https://getcomposer.org/versions");
  const version = versions.stable[0].version;
  const url = `https://getcomposer.org/download/${version}/composer.phar`;
  const sha = (await getText(`${url}.sha256sum`)).trim().split(/\s+/)[0];
  return { version, download: download(url, await headSize(url), "sha256", sha) };
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
  const supported = cycles
    .filter((cy) => cy.eol !== true && !(typeof cy.eol === "string" && cy.eol < today))
    .slice(0, MAX_LINES);
  const lines = [];
  for (const cy of supported) {
    lines.push({
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
      download: await windowsDownload(c.id, String(cy.cycle), cy.latest),
    });
  }
  components.push({ id: c.id, name: c.name, lines });
}

const catalog = {
  schema: 2,
  generated: today,
  sources: [
    "endoflife.date",
    "php.net/releases",
    "downloads.php.net/~windows",
    "nodejs.org/dist",
    "apachelounge.com",
    "nginx.org",
    "cdn.mysql.com",
    "getcomposer.org",
  ],
  components,
  tools: { composer: await composerTool() },
};

const out = new URL("./catalog.json", import.meta.url);
await writeFile(out, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Wrote ${out.pathname}`);
const mb = (n) => (n ? `${(n / 2 ** 20).toFixed(0)} MB` : "? MB");
for (const c of components) {
  const lines = c.lines.map(
    (l) => `${l.latest}${l.security ? "*" : ""} [${l.download ? `${l.download.checksum.algo}, ${mb(l.download.size)}` : "no Windows build"}]`,
  );
  console.log(`  ${c.name}: ${lines.join(", ")}`);
}
console.log(`  Composer: ${catalog.tools.composer.version} [${mb(catalog.tools.composer.download.size)}]`);
