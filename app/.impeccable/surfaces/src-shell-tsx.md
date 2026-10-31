---
version: 1
slug: "src-shell-tsx"
primary_target: "src/Shell.tsx"
related_targets: ["src/styles.css","src/dashboard/Dashboard.tsx"]
---

# Desktop app shell and pages (0.2.3 refresh)

Scope: every page of the NexDB desktop app after setup (Dashboard, Projects, Database, Terminal, Versions, Settings) plus the shared shell; the setup wizard inherits the shell. Mode: Operate.

User asks (2026-10-31): sleek, modern, clean; fix "too many boxes", "flat and plain", "spacing and size". Sit beside Laravel Herd and Docker Desktop (PRODUCT.md brand commitment: category standard at full craft). Eye comfort: no bright white, no harsh highlights, no dim grey body text.

Must stay: every feature, label and plain-language copy; light/dark/system toggle; collapsible rail; pages stay mounted.

## Direction contract

THESIS: One floating work surface on a tinted window ground, Herd/Docker style; inside it, content reads as lists and sections divided by space and hairlines, never a grid of boxed cards. Refuses the card-per-thing dashboard.

OWN-WORLD: Cool neutral ground shared by window and rail; a rounded 12px work surface lifted by a soft offset shadow and hairline; one blue for current, focus and primary action; status as small tinted pills; buttons with a faint top highlight and 1px depth; Segoe UI Variable with tabular figures, Cascadia Mono for versions, ports and paths.

STORY: The user opens NexDB, sees at a glance which services run, starts or stops them, reads a log in plain words, and moves on.

FIRST VIEWPORT: Title "Your stack" with summary left, Stop all / Start all right; one Services list (status dot, name and role, version, port, uptime, status pill, Start/Stop and Logs per row); below, the Log section filling the rest of the surface.

FORM: Category standard, position 1. The user took the standing exit on 2026-10-30 (recorded as a brand commitment in PRODUCT.md) and re-confirmed Herd/Docker on 2026-10-31; a user-pinned direction beats the roll. concept-seed was run on 2026-10-31 from app/ and refused with NO_PRODUCT_MD (PRODUCT.md lives at the repo root, one level up), so no reference was printed. seed: none (unavailable)

Review fixes (2026-10-31): bare service icons instead of tiles; "Logs" keeps its text label; port and uptime fold into the role line in narrow windows; the update notice docks in the rail foot; light surfaces moved off near-white (#f6f7f9); the empty log is a centred note with the Start action.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
