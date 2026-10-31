---
name: NexDB
description: Local development stack manager for Windows; the category standard (Herd, Docker Desktop), calm and exact, in light and dark.
colors:
  # Light theme (:root, :root[data-theme="light"])
  accent: "#2563eb"
  accent-hover: "#1d4fd8"
  accent-on: "#ffffff"
  accent-text: "#1c4fd6"
  accent-soft: "#e8efff"
  ok: "#127436"
  ok-soft: "#e6f5ec"
  warn: "#a15c07"
  warn-soft: "#fff5e0"
  warn-border: "#f0cf8a"
  bad: "#c42b2b"
  bad-soft: "#fdeded"
  bad-border: "#f2b8b8"
  bg: "#e4e7ec"
  rail: "#e4e7ec"
  surface: "#f6f7f9"
  surface-2: "#eceef2"
  btn-bg: "#fafbfc"
  nav-hover: "rgb(22 24 29 / 0.05)"
  text: "#16181d"
  text-2: "#444b58"
  text-3: "#5f6673"
  border: "#e2e5ea"
  border-strong: "#cdd2d9"
  scrollbar: "#c9ced6"
  # Dark theme (:root[data-theme="dark"])
  accent-dark: "#2f6ae0"
  accent-hover-dark: "#3d77ea"
  accent-on-dark: "#ffffff"
  accent-text-dark: "#8fb3ff"
  accent-soft-dark: "#1d2a45"
  ok-dark: "#5ccb8b"
  ok-soft-dark: "#16291f"
  warn-dark: "#f0b552"
  warn-soft-dark: "#2c2312"
  warn-border-dark: "#5a4518"
  bad-dark: "#f47b7b"
  bad-soft-dark: "#321a1c"
  bad-border-dark: "#6a2c2f"
  bg-dark: "#0f1114"
  rail-dark: "#0f1114"
  surface-dark: "#171a1f"
  surface-2-dark: "#1e2228"
  btn-bg-dark: "#22262d"
  nav-hover-dark: "rgb(255 255 255 / 0.05)"
  text-dark: "#e4e7ec"
  text-2-dark: "#b3b9c4"
  text-3-dark: "#8e95a2"
  border-dark: "#272c34"
  border-strong-dark: "#363c46"
  scrollbar-dark: "#3c424d"
typography:
  headline:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  settings-title:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
  brand:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  row-name:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  body-ui:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.5
  section-title:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
  body-sm:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tnum"
  meta:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "tnum"
  pill:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  nav-group:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.05em"
  tag:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
  mono-data:
    fontFamily: "Cascadia Mono, Cascadia Code, Consolas, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
  mono-input:
    fontFamily: "Cascadia Mono, Cascadia Code, Consolas, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  tag: "4px"
  inner: "6px"
  small-control: "7px"
  control: "8px"
  track: "9px"
  container: "10px"
  surface: "12px"
  pill: "999px"
  full: "50%"
spacing:
  hairline: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  row-y: "12px"
  row-x: "14px"
  lg: "16px"
  xl: "18px"
  section: "24px"
  gutter: "32px"
  rail: "232px"
  rail-collapsed: "64px"
components:
  work-surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "28px 32px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-on}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "32px"
    typography: "{typography.body-ui}"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-disabled:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-3}"
  button-default:
    backgroundColor: "{colors.btn-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "32px"
    typography: "{typography.body-ui}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "32px"
  button-quiet-hover:
    backgroundColor: "{colors.nav-hover}"
  button-small:
    backgroundColor: "{colors.btn-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.small-control}"
    padding: "0 10px"
    height: "28px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "34px"
    typography: "{typography.mono-input}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "34px"
  nav-item-hover:
    backgroundColor: "{colors.nav-hover}"
  nav-item-current:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
  services-list:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.container}"
    padding: "12px 14px"
  status-pill:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "24px"
    typography: "{typography.pill}"
  status-pill-ok:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
  status-pill-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
  status-pill-bad:
    backgroundColor: "{colors.bad-soft}"
    textColor: "{colors.bad}"
  notice:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    typography: "{typography.body-sm}"
  banner-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.container}"
    padding: "12px 14px"
  error-box:
    backgroundColor: "{colors.bad-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.container}"
    padding: "12px 14px"
  trust-box:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.container}"
    padding: "12px 14px"
  trust-box-ok:
    backgroundColor: "{colors.ok-soft}"
  update-notice:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.container}"
    padding: "10px 10px 12px 12px"
  log-tab-selected:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.small-control}"
    height: "28px"
  theme-option-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.small-control}"
    height: "28px"
  tag:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.tag}"
    padding: "0 7px"
    height: "20px"
    typography: "{typography.tag}"
  tag-recommended:
    backgroundColor: "{colors.text}"
    textColor: "{colors.surface}"
  tag-lts:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
  tag-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
---

# Design System: NexDB

## Overview

**Creative North Star: "The Quiet Instrument Panel"**

A Windows-native local stack manager built to the category standard of Laravel Herd and Docker Desktop. The window is one cool, tinted ground shared by the rail and the window edge; on it floats a single rounded work surface, lifted by a soft shadow and a hairline. Inside that surface, content reads as lists and sections separated by space and hairlines, never as a grid of boxed cards. Every number lines up, every state is honest, and nothing decorative stands in for clarity.

Colour is spent on meaning only. One confident blue marks the current place, focus, selection, the next action and the one "update ready" dot; green, amber and red appear only for running, needs attention and failed, always as small tinted pills, dots or boxes. Everything else is cool neutral greys arranged as tonal layers, with no surface at pure white so long sessions stay easy on the eyes. Buttons carry a faint edge light and a 1px drop so they read as pressable. Versions, ports and paths speak in a monospace voice; all figures are tabular; icons come from one line-icon library.

Both themes are first-class. Light and dark are full token sets under the same names, switched by `data-theme` on the root, chosen with a Light / Dark / System toggle stored as `nexdb.theme` and applied before first paint.

**Key Characteristics:**
- Shared ground: window and rail are one colour; the rail has no border and no panel of its own.
- One floating work surface (12px radius, panel shadow, hairline) holding the page; everything inside it is flat.
- Lists, not cards: one bordered list per group, rows divided by hairlines; settings sections divided by a hairline, not boxed.
- Status as small tinted pills with a dot; neutral states stay grey.
- Buttons with depth tokens (`--btn-bg`, `--btn-edge`, `--btn-primary-edge`) that press down 1px.
- Segoe UI Variable with tabular figures; Cascadia Mono for versions, ports and paths.
- Lucide line icons only; no glyph characters as icons; no eyebrow labels above headings.

## Colors

Cool neutral ground with a single working blue and three reserved status hues, defined twice (light and dark) under identical token names.

### Primary
- **Confident Windows Blue** (`accent`): the primary button fill, the selected radio and checkbox (`accent-color`), the caret, the progress fill, the "update ready" dot beside Settings. Hover deepens in light (`accent-hover`) and brightens in dark. Text on it is always `accent-on`.
- **Readable Blue** (`accent-text`): blue as text or icon on neutral ground: the current nav item's icon, the selected service's icon, a pressed Logs button's label, the update notice icon, spinners in status pills.
- **Selection Wash** (`accent-soft`): text selection and the chosen version row in the wizard. The selected service row uses a lighter wash (accent mixed 7% into `surface`); a pressed small button mixes 12% accent into `btn-bg` with a 45% accent border.

### Status (reserved)
- **Done Green** (`ok`, `ok-soft`): Running pills (with a 3px 22% green halo on the dot), trusted HTTPS box, finished steps, ok log dots.
- **Caution Amber** (`warn`, `warn-soft`, `warn-border`): the missing-components banner, the untrusted HTTPS box, warning pills and log dots, wizard warnings.
- **Failure Red** (`bad`, `bad-soft`, `bad-border`): Couldn't start pills, error boxes, error log lines (red, 600), the clear-log button's hover wash.

### Neutral
- **Shared Ground** (`bg`, `rail`): window and rail, one colour (#e4e7ec light, #0f1114 dark).
- **Work Surface** (`surface`): the floating panel, lists inside it, inputs, the lifted current nav item, the active theme segment, the update notice.
- **Recessed Surface** (`surface-2`): notices, neutral status pills, the selected log tab, address banners, the new-project and connect forms, the disabled primary button.
- **Button Face** (`btn-bg`): default and small buttons, one step brighter than the surface in light and one step lighter in dark, so controls read as raised.
- **Ground Hover** (`nav-hover`, 5% ink or 5% white): hover on nav items, quiet buttons, log tabs, terminal tabs, the rail toggle, and the theme toggle track.
- **Ink** (`text`), **Secondary Ink** (`text-2`), **Tertiary Ink** (`text-3`): primary copy; summaries, section titles, ledes, data values; meta, hints, fact labels, idle icons and every disabled state.
- **Hairline** (`border`) and **Firm Hairline** (`border-strong`): surface edge, list and section dividers, the 1px ring around lifted items; control outlines and the step-number ring.

### Named Rules
**The One Blue Rule.** Blue means "this is where you are, this is chosen, this has focus, or this is your next action." It never decorates, never labels a category and never marks a recommendation.

**The Earned Status Rule.** Green, amber and red appear only when something is running, needs attention or has failed. Stopped, Starting and Not running are neutral grey pills.

**The Off-White Rule.** No surface is pure white. The brightest material is the button face, one step above the work surface; white is reserved for text on blue.

**The Shared Ground Rule.** The rail sits on the window ground with no fill and no border of its own; only the work surface is a separate material.

**The Inverted Recommendation Rule.** "Recommended" is a neutral inverted tag (`text` background, `surface` text) so it stands out without borrowing blue or green.

## Typography

**Display Font:** Segoe UI Variable Display (with Segoe UI, system-ui)
**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui)
**Label/Mono Font:** Cascadia Mono (with Cascadia Code, Consolas, ui-monospace)

**Character:** The native Windows voice, set tight and plain so the window feels like part of the OS; a monospace data voice sits beside it for anything a developer would copy or compare.

### Hierarchy
- **Headline** (650, 22px, 1.25, -0.015em): the one page title in the panel head ("Your stack"). Balanced wrapping.
- **Title** (600, 16px, 1.3): section headings in the setup wizard.
- **Settings title** (600, 15px, 1.3): section headings on Settings and component names on Versions.
- **Brand** (600, 15px): the product name in the rail.
- **Row name** (600, 14px, 1.3): a service's name in the Services list, with its version beside it in 12px `text-3`.
- **Body** (400, 14px, 1.5): running copy. Ledes are `text-2`, capped at 64ch.
- **Body UI** (13.5px): button labels (500; 600 on primary), the page summary, readable log lines, the update notice title, the missing-components banner.
- **Section title** (600, 13px, `text-2`): the "Services" and "Log" labels that head a list, 10px above it.
- **Body small** (13px): notices, Settings ledes, path labels, wizard option rows.
- **Meta** (12.5px): role lines under service names, small-button labels, update notice text.
- **Label** (12px): hints, field hints, theme toggle segments, log mode buttons.
- **Pill** (600, 12px): status pills.
- **Nav group** (600, 11px, 0.05em, uppercase, `text-3`): the "Workspace" and "App" groupings in the rail only.
- **Tag** (600, 11px): wizard tags.
- **Mono data** (12.5px): versions, ports, uptimes, paths; the raw log at 12.5px/1.6; log timestamps at 12px. Path inputs use mono at 13px.

### Named Rules
**The Data Voice Rule.** Versions, ports, uptimes and filesystem paths are always set in the mono family; prose never is.

**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on the body so every count, port and uptime aligns.

**The No-Eyebrow Rule.** Page and section headings stand alone. There is no small label, kicker or category line above a title. The uppercase nav-group style belongs to the rail's navigation and is not used above headings.

## Layout

A two-column grid filling the window: a 232px rail on the ground and a flexible column holding the work surface. The rail collapses to 64px (icons only, labels and group names replaced by a hairline divider, theme toggle stacked to one column) with a 0.2s `ease-out` transition on `grid-template-columns`; the choice is stored as `nexdb.rail`. Rail padding is 16px top, 10px right, 12px bottom and left; it stacks the brand and collapse toggle, the nav (1px gap between 34px items) and a foot holding the update notice above the theme toggle.

The work surface sits with an 8px margin on top, right and bottom and none on the rail side, so the rail reads as the window's own edge. The panel head has 28px top and 32px side padding. On the dashboard, content is capped at 1000px and the head's right padding is computed (`max(32px, 100% - 32px - 1000px)`) so Stop all and Start all line up with the list's right edge. Settings caps at 860px; the setup wizard keeps its 780px column and footer bar.

Rhythm inside the surface: 24px between sections and 24px from the head to the first section; 10px from a section title to its list; Settings sections take 24px above and below a hairline. Services rows are a fixed grid (20px icon, flexible name, 140px port and uptime, 120px status, 156px actions) with 16px gaps and 12px by 14px insets, so every column aligns down the list. The Log section takes whatever height is left (minimum 220px), and only its text scrolls.

Spacing is a reused set rather than a formal scale: 2, 4, 6, 8, 10, 12, 14, 16, 18, 24 and 32px.

**Narrow windows (dashboard content under 760px, a container query on the page body):** the port and uptime column leaves and its values join the role line under the service name ("Port 80 · Up 2h"), the row grid becomes 20px / flexible / 116px / 150px with 12px gaps, and the role line wraps instead of truncating. **Short windows (height 640px or less):** the head and body tighten (16px head top, 12px section gap) and the log keeps a 140px minimum. The desktop window targets 1120x740 with a 900x600 minimum; below a 760px viewport (browser preview only) the rail becomes a top bar, the nav hides and gutters drop to 16px.

## Elevation & Depth

A hybrid: the ground and everything inside the work surface are flat and tonal; one structural shadow floats the work surface; small items lifted out of a set take a soft lift with a 1px hairline ring; buttons carry their own edge depth.

### Shadow Vocabulary
- **Panel float** (`--shadow-panel`; light `0 1px 2px rgb(16 24 40 / 0.05), 0 4px 16px rgb(16 24 40 / 0.06)`, dark `0 1px 2px rgb(0 0 0 / 0.35), 0 6px 20px rgb(0 0 0 / 0.3)`): the work surface only.
- **Selected lift** (`0 0 0 1px var(--border), var(--shadow-sm)`; `--shadow-sm` light `0 1px 2px rgb(16 24 40 / 0.06), 0 1px 1px rgb(16 24 40 / 0.04)`, dark `0 1px 2px rgb(0 0 0 / 0.4)`): the current nav item and wizard step, the active theme segment, the active log mode. The terminal's selected tab and the update notice use `--shadow-sm` alone.
- **Button edge** (`--btn-edge`; light `inset 0 -1px 0 rgb(16 24 40 / 0.05), 0 1px 2px rgb(16 24 40 / 0.05)`, dark `inset 0 1px 0 rgb(255 255 255 / 0.04), 0 1px 2px rgb(0 0 0 / 0.3)`): default and small buttons.
- **Primary edge** (`--btn-primary-edge`; light `inset 0 1px 0 rgb(255 255 255 / 0.18), 0 1px 2px rgb(37 99 235 / 0.3)`, dark `inset 0 1px 0 rgb(255 255 255 / 0.14), 0 1px 2px rgb(0 0 0 / 0.35)`): primary buttons.
- **Status halo** (`0 0 0 3px` of the status or accent colour mixed 22% with transparent): the Running dot and the Settings update dot.
- **Focus ring** (`--ring`; light `0 0 0 3px rgb(37 99 235 / 0.28)`, dark `0 0 0 3px rgb(96 145 245 / 0.4)`): every `:focus-visible`, replacing the outline.

### Named Rules
**The One Floating Surface Rule.** Only the work surface floats. Lists, sections, banners and boxes inside it carry a hairline or a tint, never a shadow.

**The Pressable Rule.** Buttons have an edge light and a 1px drop; on press they move down 1px and lose the shadow; disabled and quiet buttons are flat.

## Shapes

Concentric, gently rounded corners that step down as elements nest: the work surface is 12px; containers inside it (Services list, Projects list, log panel, terminal, banners, error boxes, HTTPS trust box, update notice) are 10px; controls (buttons, inputs, nav items, notices) are 8px; the theme toggle track is 9px around 7px segments; small controls (small buttons, log tabs) are 7px; inner bits (log mode buttons, log lines, the update close button) are 6px; wizard tags are 4px; the progress bar is 2px. Status pills are full capsules (999px); status dots (7-8px), wizard step numbers and install icons (20px) are circles. Borders are 1px hairlines throughout; list rows are divided by a top hairline with the first row's removed.

## Components

### Buttons
Quiet, exact and pressable; one primary per view.
- **Shape:** 8px radius, 32px tall, 1px border, 13.5px label at 500, 14px side padding.
- **Primary:** blue fill, transparent border, white label at 600, 18px side padding, primary edge. Hover moves to `accent-hover`.
- **Default:** `btn-bg` face, `border-strong` outline, ink label, button edge. Hover mixes 7% ink into the face.
- **Quiet:** transparent and flat, `text-2` label; hover takes `nav-hover`. Used for Back, Later, Close.
- **Small:** 28px tall, 7px radius, 10px side padding, 12.5px label; icon-only small buttons are 28px square. Row actions (Start, Stop, Logs) lead with a 12-13px lucide icon and keep their text label. A pressed small button (`aria-pressed`) takes a 12% blue face, 45% blue border and `accent-text` label.
- **Press:** moves down 1px and drops its shadow (0.08s).
- **Disabled:** label drops to `text-3`, shadow removed; a disabled primary loses its blue for `surface-2`. Opacity is never used.
- **Focus:** the 3px blue ring. Transitions are 0.15s on background, border and shadow.

### Status Pills
- **Style:** 24px capsule, 10px side padding, 1px border, 600 12px label with a 7px dot (7px gap) or a 12px spinning lucide loader in `accent-text` while starting or stopping.
- **Running:** `ok-soft` fill, green border at 28%, green label, green dot with a 22% halo.
- **Needs attention / Couldn't start:** amber or red soft fill with the matching border and label.
- **Idle (Stopped, Starting, Not running):** `surface-2` fill, hairline, `text-2` label, `text-3` dot. The process ID appears as a title tooltip.

### Services List
One bordered list per stack, one row per service. Rows: a bare 18px lucide role icon in `text-3` (no tile behind it), the name in 600 14px with its mono version in `text-3`, a 12.5px role line that truncates; port and uptime as two small fact pairs (11.5px `text-3` label over 12.5px mono `text-2` value); the status pill; right-aligned small Start/Stop and Logs buttons. Hover mixes 3% ink into the surface; the selected row (the one whose log is shown) takes a 7% blue wash and a blue icon, and its Logs button is pressed. External services read "Managed outside NexDB" in the role line and show no Start/Stop.

### Log Section
Headed by the "Log" section title, it fills the remaining height of the surface. A 10px-radius bordered panel with a transparent tab strip (6px by 8px padding): 28px tabs per service, 7px radius, `nav-hover` on hover; the selected tab is `surface-2` with an inset hairline. To the right, a Readable / Raw segmented switch (`surface-2` track, active segment on `btn-bg` with the selected lift) and an icon-only clear button whose hover turns `bad-soft`. Readable lines are a grid of 64px mono time, an 8px level dot (`border-strong`, green, amber or red) and the message; error messages are red at 600; lines hover to `surface-2`. Raw mode is mono 12.5px/1.6 in `text-2`.
- **Empty state:** a centred, balanced 13.5px note in `text-2` (max 44ch) with 12px gap to the one action that fills it ("Start Apache" as a small button with a play icon) when the service is stopped; otherwise the note alone.

### Inputs / Fields
- **Style:** 34px tall, 10px padding, `border-strong` outline, 8px radius, surface fill. Path and number fields use mono 13px; password fields use body type. Placeholders are `text-3`. Labels sit above at 600; hints below at 12px `text-3`.
- **Focus:** border turns blue plus the 3px ring.
- **Checks and radios:** native 16px controls tinted with `accent-color`.

### Navigation (rail)
- **Items:** 34px, 8px radius, 10px gap between a 16px lucide icon and the label; `text-2` label, `text-3` icon. Hover fills `nav-hover` and lifts the icon to `text-2`.
- **Current:** lifted onto `surface` with the selected lift, ink at 600, icon in `accent-text`; `aria-current="page"`.
- **Groups:** "Workspace" and "App" labels in the nav-group style; in the collapsed rail they become 1px hairline dividers.
- **Collapse toggle:** a 28px icon button beside the brand; hover `nav-hover`.
- **Update dot:** when a new NexDB is ready, an 8px blue dot with a 22% halo sits at the right end of the Settings item (top-right corner of the icon when collapsed), with visually hidden text for screen readers.

### Update Notice
Docked in the rail foot above the theme toggle, never over the work. A 10px-radius card on `surface` with a hairline and `--shadow-sm`, 10px/12px padding and 6px gaps: a 16px `accent-text` lucide icon, a 600 13.5px title ("NexDB 0.2.0 is ready"), and a 24px close button; a 12.5px `text-2` line from the release notes; then two equal small buttons, Later (quiet) and Update now (primary). While downloading it shows a 4px progress bar; when installed, a single "Restart NexDB" primary. It enters once (0.32s fade and 8px rise, removed under reduced motion) and hides when the rail is collapsed, leaving the Settings dot.

### HTTPS Trust Box
On Settings: a 10px-radius row with 12px gap and 12px by 14px padding: an 18px lucide shield, a 600 title stating whether Windows trusts the certificate, a 12px `text-2` hint, and its action button on the right. Untrusted is amber (`warn-soft`, `warn-border`, amber icon); trusted is green (`ok-soft`, 28% green border, green icon).

### Status Blocks
- **Notice:** `surface-2` fill, no visible border, 8px radius, 13px `text-2`.
- **Missing-components banner:** amber soft fill and border, 10px radius, amber lucide icon, 13.5px text with the bold names, and the primary action on the right.
- **Error box:** red soft fill and border, 10px radius, 12px by 14px padding.

### Settings and Versions Sections
Sections are not boxed: each is separated by a 1px hairline with 24px above and below, the first without a rule. Titles are the settings title (600 15px Display) with an optional 13px `text-2` lede; contents start 14px below. Path lists use a two-column grid with mono values that wrap anywhere.

### Theme Toggle
A three-way segmented radio group (Light / Dark / System with lucide Sun, Moon, Monitor) in the rail foot. Track: `nav-hover` tint, no border, 9px radius, 2px padding. Segments: 28px, 7px radius, 12px `text-3` label; the active one is `surface` with the selected lift and ink at 600. Stored as `nexdb.theme` (default `system`); an inline script in `index.html` applies `data-theme` and `color-scheme` before first paint, and System follows Windows live.

### Setup Wizard
The wizard uses the same shell and floating surface: the six-step list in the rail (34px, 8px radius; upcoming `text-3` with a `border-strong` ring; done with a check on a green disc; current lifted with a blue number), bordered lists for scan results and install progress, the version picker (radio, 76px mono version, tags, note; checked rows take the selection wash and a 35% blue border), 20px wizard tags, and a footer bar whose primary action aligns to the 780px column.

### Motion
Each page body enters once with a 0.28s fade-and-rise (from 35% opacity, 6px down) on `cubic-bezier(0.16, 1, 0.3, 1)`; the update notice enters once (0.32s, 8px). The rail collapse animates its column width over 0.2s. Control state changes use 0.15s transitions; a button press takes 0.08s. Spinners turn at 0.9s. Under `prefers-reduced-motion: reduce` the entrances and rail transition are removed and spinners slow.

## Do's and Don'ts

### Do:
- **Do** keep the window and rail on one shared ground, and float only the work surface (12px radius, `--shadow-panel`, hairline, 8px margin).
- **Do** group things as one bordered list with hairline-divided rows (10px radius), and divide Settings sections with a hairline, not a box.
- **Do** show status as a tinted capsule pill with a dot; keep Stopped, Starting and Not running grey.
- **Do** reserve blue (`accent`) for the current place, selection, focus, the single primary action and the update-ready dot.
- **Do** give default buttons `--btn-bg` and `--btn-edge`, primaries `--btn-primary-edge`, and a 1px press.
- **Do** step radii down as elements nest: 12, 10, 8, 7, 6.
- **Do** set versions, ports, uptimes and paths in Cascadia Mono, and keep tabular figures on.
- **Do** use lucide line icons (12-18px) for every icon, bare, with a text label on row actions.
- **Do** dock app-level notices in the rail foot so they never cover the work.
- **Do** give an empty area a centred plain-language note and the one action that fills it.
- **Do** fold secondary columns into the line under the name when the content is narrower than 760px.
- **Do** define every colour for both themes under the same token name.

### Don't:
- **Don't** use pure white for any surface; white is only for text on blue.
- **Don't** add shadows to lists, banners or sections inside the work surface.
- **Don't** lay out a grid of boxed cards, one per thing, or put icons on tinted tiles.
- **Don't** put eyebrow or kicker labels above page or section headings.
- **Don't** use text glyphs (check marks, arrows, bullets, stars) as icons.
- **Don't** use opacity to show a disabled control.
- **Don't** colour recommendations, categories or neutral facts with blue or a status hue.
- **Don't** set prose in the mono family.
