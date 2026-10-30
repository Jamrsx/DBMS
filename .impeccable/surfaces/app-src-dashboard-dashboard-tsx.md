---
version: 1
slug: "app-src-dashboard-dashboard-tsx"
primary_target: "app/src/dashboard/Dashboard.tsx"
related_targets: ["app/src/lib/services.ts"]
---

# Dashboard surface

Mode: Operate. The daily home screen of the desktop app after setup. Users: students and professionals equally; tasks: start/stop the stack, see each service's live state (port, PID, uptime, version), read logs, and understand failures such as a busy port. An existing MySQL chosen at setup is only watched. Constraints: established world (DESIGN.md); light/dark/system toggle; 1120x740 window (min 900x600); navigation leaves room for Sites, Versions and Database; code-led build matching the chosen sketch .impeccable/mocks/decision/dash-path.html.

## Direction contract

THESIS: The stack drawn as the path a request takes (Browser, web server, PHP, MySQL), so a failure shows exactly where requests stop. It refuses the generic grid of same-size service cards and the status-dot table with no story.

OWN-WORLD: DESIGN.md unchanged: tinted rail, white work panel, hairline-bordered stations, Segoe UI Variable with tabular figures, Cascadia Mono for versions, ports and PIDs, one blue for the selected station and primary action, green/amber/red only for running/attention/failed, lucide icons.

STORY: The user sees at a glance whether localhost works and, if not, which link is broken and why, then fixes it with one button and confirms in that service's log.

FIRST VIEWPORT: Left 232px rail with Dashboard (current), Sites, Versions, Database (marked Soon) and the theme toggle. Panel head: "Your stack", a one-line plain summary, Stop all and Start all on the right. Below, one horizontal path: Browser, link, Apache, link, PHP, link, MySQL; each station shows status dot, name, mono version, state line, port/PID/uptime facts and Start/Stop. A broken link is a dashed red line; the failing station's error sits under the path. The selected station's log fills the rest in a tabbed panel.

FORM: Request path, structure 3 of 6 on the ordered list, locked by the user on the decision page. seed:fcb0f898a1b69ebd

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
