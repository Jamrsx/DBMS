---
version: 1
slug: "app-src-app-tsx"
primary_target: "app/src/App.tsx"
related_targets: ["app/src/styles.css","app/src/steps"]
---

# Setup wizard surface

Mode: Operate. The first-run wizard of the desktop app (Welcome, System scan, Components, MySQL, Review, Install). Users: students and professionals equally; task: get a working local stack with no surprises. Constraints: light and dark themes with a Light / Dark / System toggle; Windows WebView2 at 1120x740 (min 900x600); code-led build.

## Direction contract

THESIS: The category standard done at the level of Herd, Docker Desktop, GitHub Desktop and Linear: a calm sidebar wizard where every number lines up and every state is honest. It refuses decoration standing in for clarity: no eyebrows, no glyph icons, no gray-on-gray.

OWN-WORLD: Windows-native system type (Segoe UI Variable) with tabular figures; cool neutral ground, white work panel, a slightly tinted sidebar; one confident blue for selection and the primary action; green, amber and red reserved for done, warning and failure. Hairline borders, 6-8px radii, soft offset shadows only on floating layers. Drawn line icons from one library.

STORY: The user sees where they are, what was found, what will be installed and why, and exactly what will ask for permission, then watches it happen with real progress.

FIRST VIEWPORT: Left 240px sidebar: product name, six steps with done/current/upcoming states, theme toggle pinned at the bottom. Right: page title and one-line purpose, the step's content in bordered lists, and a footer bar with Back on the left and the primary action on the right, step count beside it.

FORM: Category standard (canon), chosen by the user over the rolled hand. seed:32c691f76e61b9a4

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
