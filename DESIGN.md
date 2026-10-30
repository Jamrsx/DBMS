---
name: NexDB
description: Local development stack manager for Windows; the category standard, calm and exact, in light and dark.
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
  bg: "#f4f5f7"
  rail: "#eceef2"
  surface: "#ffffff"
  surface-2: "#f6f7f9"
  text: "#16181d"
  text-2: "#464d5a"
  text-3: "#636a77"
  border: "#e1e4e9"
  border-strong: "#c9ced6"
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
  bg-dark: "#111317"
  rail-dark: "#15181d"
  surface-dark: "#1a1d23"
  surface-2-dark: "#21252c"
  text-dark: "#e8eaef"
  text-2-dark: "#b5bbc6"
  text-3-dark: "#8f96a3"
  border-dark: "#2b3038"
  border-strong-dark: "#3c424d"
  scrollbar-dark: "#3c424d"
typography:
  headline:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  brand:
    fontFamily: "Segoe UI Variable Display, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  body-sm:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tnum"
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "tnum"
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
  sm: "6px"
  md: "8px"
  full: "50%"
spacing:
  hairline: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  row-y: "10px"
  lg: "12px"
  row-x: "14px"
  xl: "18px"
  section: "32px"
  gutter: "32px"
  gutter-narrow: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-on}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "32px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-disabled:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-3}"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "32px"
  button-default-hover:
    backgroundColor: "{colors.surface-2}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "32px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
    typography: "{typography.mono-input}"
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
  tag-latest:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-2}"
  tag-lts:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
  tag-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
  pill-found:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.tag}"
    height: "20px"
  step:
    textColor: "{colors.text-3}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
  step-current:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
  option:
    rounded: "{rounded.sm}"
    padding: "4px 10px"
    height: "32px"
    typography: "{typography.body-sm}"
  option-selected:
    backgroundColor: "{colors.accent-soft}"
  list-container:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  notice:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
    typography: "{typography.body-sm}"
  theme-option-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    height: "28px"
---

# Design System: NexDB

## Overview

**Creative North Star: "The Quiet Instrument Panel"**

A Windows-native setup tool built to the category standard of Laravel Herd, Docker Desktop, GitHub Desktop and Linear. The window is a calm sidebar wizard: a slightly tinted rail on the left, a white (or near-black) work panel on the right, hairline-bordered lists in the middle and a footer bar at the bottom. Every number lines up, every state is honest, and nothing decorative stands in for clarity.

Colour is spent on meaning only. One confident blue marks selection, the current position, the focus ring and the primary action; green, amber and red appear only for done, warning and failure. Everything else is cool neutral greys arranged as tonal layers. Data (versions, paths) speaks in a monospace voice, all figures are tabular, and icons come from one line-icon library.

Both themes are first-class. Light and dark are full token sets switched by `data-theme` on the root element, chosen with a Light / Dark / System toggle and applied before first paint.

**Key Characteristics:**
- Two-column shell: 232px tinted rail, flexible work panel, content capped at a 780px column.
- Flat tonal layering with hairline borders; one soft shadow, used only to lift a selected item in a segmented set.
- Segoe UI Variable (Display for headings, Text for body) with tabular figures; Cascadia Mono for data.
- Blue only for selection, current, focus and primary action; status colours only for status.
- Lucide line icons only; no glyph characters as icons, no eyebrow labels.
- One entrance motion per step, removed under reduced motion.

## Colors

Cool neutral ground with a single working blue and three reserved status hues, defined twice (light and dark) under identical token names.

### Primary
- **Confident Windows Blue** (`accent` / `accent-dark`): the primary button fill, the current-step number, the selected radio and checkbox (`accent-color`), the text caret, the spinner head and the progress bar fill. Hover deepens in light (`accent-hover`) and brightens in dark (`accent-hover-dark`). Text on it is always `accent-on` (white).
- **Readable Blue** (`accent-text` / `accent-text-dark`): blue used as text or icon on neutral or soft-blue ground (running install icon, found-count pill). It is darker than `accent` in light and much lighter in dark so it holds contrast.
- **Selection Wash** (`accent-soft` / `accent-soft-dark`): background of the chosen version row and of text selection. A selected row also gets a border of `accent` mixed 35% with transparent.

### Status (reserved)
- **Done Green** (`ok`, `ok-soft`): finished steps, completed install icons, healthy dots, LTS tag, "ok" hints.
- **Caution Amber** (`warn`, `warn-soft`, `warn-border`): warning lists, "Ends soon", "Admin" and "Windows asks" tags, ports in use, uncertain checks.
- **Failure Red** (`bad`, `bad-soft`, `bad-border`): error boxes, failed install steps, validation errors, bad dots.

### Neutral
- **Cool Ground** (`bg`): the window background behind the shell.
- **Rail Tint** (`rail`): the sidebar, one step darker than the ground in light and one step lighter in dark.
- **Work Surface** (`surface`): the main panel, lists, inputs, default buttons and the lifted current step.
- **Recessed Surface** (`surface-2`): hover fill, notices, the theme toggle track, latest tag, disabled primary button.
- **Ink** (`text`), **Secondary Ink** (`text-2`), **Tertiary Ink** (`text-3`): primary copy; ledes, quiet buttons and data values; meta, hints, placeholders, upcoming steps and every disabled state.
- **Hairline** (`border`) and **Firm Hairline** (`border-strong`): list and section dividers; control outlines, step-number rings and the scrollbar thumb.

### Named Rules
**The One Blue Rule.** Blue means "this is chosen, this is where you are, this has focus, or this is the next action." It never decorates, never labels a category and never marks a recommendation.

**The Earned Status Rule.** Green, amber and red appear only when something is done, needs attention or has failed. A neutral fact is never coloured to look good.

**The Inverted Recommendation Rule.** "Recommended" is a neutral inverted tag (`text` background, `surface` text) so it stands out without borrowing blue or green.

## Typography

**Display Font:** Segoe UI Variable Display (with Segoe UI, system-ui)
**Body Font:** Segoe UI Variable Text (with Segoe UI, system-ui)
**Label/Mono Font:** Cascadia Mono (with Cascadia Code, Consolas, ui-monospace)

**Character:** The native Windows voice, set tight and plain so the window feels like part of the OS; a monospace data voice sits beside it for anything a developer would copy or compare.

### Hierarchy
- **Headline** (600, 22px, 1.25, -0.01em): the one page title per step in the panel head. Balanced wrapping.
- **Title** (600, 16px, 1.3): section headings inside a step (Review sections, scan groups).
- **Brand** (600, 15px): product name in the rail.
- **Body** (400, 14px, 1.5): all running copy, list rows, buttons (500, or 600 for primary). Ledes are `text-2`, capped at 64ch.
- **Body small** (13px): option rows, notices, warning lists, check statuses, install rows.
- **Label** (12px): hints, field hints, picker legends, step count, paths, install state.
- **Tag** (600, 11px): tags and pills.
- **Mono data** (12.5px; 600 in version pickers): versions, paths and code values. Path inputs use mono at 13px.

### Named Rules
**The Data Voice Rule.** Versions and filesystem paths are always set in the mono family; prose never is.

**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on the body so every count, size and version column aligns.

**The No-Eyebrow Rule.** Headings stand alone. There is no small label, kicker or category line above a page or section title.

## Layout

A fixed two-column grid: a 232px rail and a flexible panel (`grid-template-columns: 232px 1fr`) filling the window height. The rail stacks brand, the six-step list (2px gap, 34px rows) and the theme toggle pinned to its foot. The panel has three bands: head (26px top, 32px sides), a scrolling body (6px top, 32px sides, 28px bottom) and a footer bar with a top hairline.

Every direct child of the panel body is capped at 780px. The footer's right padding is computed (`max(32px, 100% - 32px - 780px)`) so the primary action's right edge lines up with that content column instead of the window edge; Back sits at the left, the step count and primary action at the right. Quiet buttons at a row's start or end pull outward by 14px so their label, not their box, aligns with the column.

Content is grouped in bordered lists with 10-14px row insets; steps separate major groups with a 32px gap; form fields sit in a 520px column with 18px gaps. Data rows use fixed grid tracks (for example 100px / 200px / 1fr, or 160px label columns in Review) so values line up across rows.

Spacing is a reused set rather than a formal scale: 2, 4, 6, 8, 10, 12, 14, 18 and 32px.

**Narrow (max-width 760px):** the rail becomes a top bar, the step list is hidden, the theme toggle moves to the right at 220px, panel gutters drop to 16px, and data grids collapse to two columns with paths wrapping onto their own full-width line. The desktop window itself targets 1120x740 with a 900x600 minimum.

## Elevation & Depth

Flat by default. Depth comes from tonal layers (ground, rail tint, work surface, recessed surface) and hairline borders, not shadows. The one shadow token is a soft, small lift used to raise the selected item out of a set: the current step in the rail and the active segment of the theme toggle. No floating layers (menus, dialogs, popovers) exist yet.

### Shadow Vocabulary
- **Selected lift** (`--shadow-sm`; light `0 1px 2px rgb(16 24 40 / 0.06), 0 1px 1px rgb(16 24 40 / 0.04)`, dark `0 1px 2px rgb(0 0 0 / 0.4)`): current step, active theme segment.
- **Focus ring** (`--ring`; light `0 0 0 3px rgb(37 99 235 / 0.28)`, dark `0 0 0 3px rgb(96 145 245 / 0.4)`): every `:focus-visible`, replacing the outline.

### Named Rules
**The Flat Panel Rule.** Lists, cards and panels carry a hairline, never a shadow. A shadow means "selected in a set," and the ring means focus.

## Shapes

Gently rounded, small and consistent. Containers (lists, review boxes, theme toggle track) use 8px; controls, rows, notices, warning and error boxes use 6px; tags and pills use a tighter 4px; the progress bar uses 2px. Round elements are full circles: step numbers and install icons (20px), status dots (8px), the spinner (16px). Borders are 1px hairlines throughout; list rows are divided by a top hairline with the first row's removed.

## Components

### Buttons
Quiet and exact; one primary per view.
- **Shape:** gently rounded (6px), 32px tall, 1px border, 14px label at weight 500.
- **Primary:** blue fill and border, white label at 600, 18px side padding. Hover moves to `accent-hover`.
- **Default:** surface fill, `border-strong` outline, ink label; hover fills `surface-2`.
- **Quiet:** transparent fill and border, `text-2` label; used for Back, Rescan and Edit.
- **Disabled:** label drops to `text-3`; the primary loses its blue for `surface-2` fill and a hairline. Opacity is never used.
- **Focus:** the 3px blue ring. Transitions are 0.15s on background and border colour.

### Tags and Pills
- **Style:** 20px tall, 4px radius, 7px side padding, 11px weight 600, hairline border, `text-2` label. An icon may lead (the shield on "Security fix", 12px).
- **Variants:** Recommended is inverted (ink fill, surface text). Latest is `surface-2`. LTS is green soft. Ends soon, Admin and Windows asks are amber soft with an amber border. The found-count pill on the scan is blue soft; "none" is a hairline outline in `text-3`.

### Lists / Containers
- **Corner Style:** 8px.
- **Background:** `surface`, 1px hairline border, rows divided by hairlines.
- **Shadow Strategy:** none (see Elevation).
- **Internal Padding:** rows 10-12px vertical, 14px horizontal.

### Inputs / Fields
- **Style:** 34px tall, 10px padding, `border-strong` outline, 6px radius, surface fill. Path and number fields use mono 13px; password fields use body type. Placeholders are `text-3`. Labels sit above at weight 600; hints below at 12px `text-3`.
- **Focus:** border turns blue plus the 3px ring.
- **Error:** a 600-weight red message below the step content; inline hints turn green or red for port checks.
- **Checks and radios:** native 16px controls tinted with `accent-color`.

### Navigation (step rail)
- 34px rows, 6px radius, 10px gap between a 20px circular number and the step title.
- **Upcoming:** `text-3`, number in a `border-strong` ring.
- **Done:** `text-2`, number replaced by a lucide check on a green disc.
- **Current:** lifted onto `surface` with the selected-lift shadow, ink at 600, number on a blue disc. `aria-current="step"`.

### Theme Toggle
A three-way segmented radio group (Light / Dark / System, with lucide Sun, Moon, Monitor at 14px) pinned to the rail foot. Track: `surface-2`, hairline, 8px radius, 2px padding. Active segment: `surface` with the selected lift, ink at 600. The choice is stored in `localStorage` under `devmanager.theme` (default `system`); an inline script in `index.html` applies `data-theme` and `color-scheme` before first paint, and System follows Windows live.

### Version Picker
Inside each component row, radio options laid out on a fixed grid (radio, 76px mono version, tags, note) with an optional mono path line underneath. Hover fills `surface-2`; the checked row takes the blue selection wash and a 35% blue border. Undownloadable versions are shown in `text-3` and cannot be picked.

### Install Progress
Rows with a 20px status icon, title, right-aligned state and a 4px progress bar across the title column. Pending and cancelled rows are `text-3` with a lucide circle; running shows a spinning lucide loader in `accent-text` and the blue bar; done is a check on a green disc; failed is an X on a red disc with a red 600 state label.

### Status Blocks
- **Notice:** `surface-2` fill, hairline, 6px radius, 13px `text-2`.
- **Warning list:** amber soft fill and border, amber bullets, ink text.
- **Error box:** red soft fill and border.
- **Status dots:** 8px green, amber or red beside scan checks.

### Motion
Each step's body enters once with a 0.28s fade-and-rise (from 35% opacity, 6px down) on `cubic-bezier(0.16, 1, 0.3, 1)`. Control state changes use 0.15s colour transitions; the progress fill eases its width over 0.2s linear. Under `prefers-reduced-motion: reduce` the entrance is removed and spinners slow to 2.4s.

## Do's and Don'ts

### Do:
- **Do** reserve blue (`accent`) for selection, the current step, the focus ring and the single primary action.
- **Do** use green, amber and red only for done, warning and failure states.
- **Do** show "Recommended" as the neutral inverted tag (ink fill, surface text).
- **Do** set versions and paths in Cascadia Mono at 12.5px, and keep tabular figures on.
- **Do** use lucide line icons at 12-14px for every icon.
- **Do** keep content within the 780px column and align the footer's primary action to its right edge.
- **Do** show disabled states with `text-3` (and `surface-2` for a disabled primary).
- **Do** define every colour for both themes under the same token name, and keep the Light / Dark / System toggle stored in `devmanager.theme` and applied before first paint.
- **Do** give each step one entrance motion and remove it under reduced motion.

### Don't:
- **Don't** put eyebrow or kicker labels above headings.
- **Don't** use text glyphs (check marks, arrows, bullets, stars) as icons.
- **Don't** use opacity to show a disabled control.
- **Don't** colour recommendations, categories or neutral facts with blue or a status hue.
- **Don't** add shadows to lists, cards or panels; depth is tonal and hairline.
- **Don't** set prose in the mono family.
