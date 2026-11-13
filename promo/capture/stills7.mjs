import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
const bf = (n) => Math.round((9.458 + n * 0.48387) * 30);
const frames = { cap01: 120, cap04: bf(24) + 90, cap12: bf(128) + 60, cap22: bf(292) + 40 };
const root = process.cwd();
const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });
const composition = await selectComposition({ serveUrl, id: "NexdbPromo" });
for (const [name, frame] of Object.entries(frames)) {
  await renderStill({ serveUrl, composition, frame, output: path.join(root, `out/qa9/${name}.png`), scale: 0.5 });
  console.log(name, frame);
}
