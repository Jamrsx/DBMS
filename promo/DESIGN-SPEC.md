# NexDB + NexHost promo: design spec (co-creation, user-approved)

## Product brief (approved)
- **Product:** NexDB, a Windows app that installs and runs the whole PHP stack (Apache/nginx, PHP, MySQL, Node) in one click, with database tools, a terminal and Laravel project setup. **NexHost** (4-year plan) turns your PC into a small hosting panel: import, editor, Deploy, database, SSH, Go live via the user's own ngrok/Cloudflare.
- **Audience:** Filipino students, freelancers and small dev teams (Laravel/PHP).
- **Use:** website home page + Facebook/YouTube.
- **Length/format/language:** ~2:31 (150.7s), 1920×1080, 30fps, **English** captions.
- **Audio:** beat-synced BGM `bgm-tech-house.mp3` (Mixkit free license, Tech House) + SFX, no voiceover. Deliver **with BGM** and **without BGM (SFX only)**.
- **Pricing shown:** 6 mo ₱299 · 1 yr ₱540 · 2 yr ₱960 · 3 yr ₱1,260 · 4 yr ₱4,900 + NexHost.
- **Free launch license:** shown at the end (7 days free, NexHost included).
- **Ending credit:** **NEXIO DEVS**. **No website address.**
- **Data:** practice-mode sample data only (shop, my-shop, nh_shop, Sample Student). No real keys, ngrok domains, emails or passwords.

## Needs → decisions (approved)
| Need | Decision |
|---|---|
| Home page + social | Ends on "Get your free launch key" + NEXIO DEVS |
| Students/freelancers | Easy first (one-click stack) → power (DB, terminal) → NexHost upgrade |
| Must show | stack, versions, projects, database, terminal, Check my setup/Nex, NexHost (import, editor, deploy, map, go live), plans, free key |
| Captions | ≤7 words, each held ≥1.5s |
| Music | tech-house 124 BPM, cuts on beats; music edit on a bar line |

## Visual direction (approved: blend of all three)
- **Night Console** base: app dark tokens, real screens floating in 2.5D, soft blue light.
- **Signal Path** thread: a line that travels blue (#2f6ae0→#5b8ff0) and turns green (#5ccb8b) where something works.
- **Nex** as host, with new animations made for the video (wave, 4-jump attention bounce, success/teacher/wizard).
- Styleframes: `out/styleframes/frame-1..3.png` (approved).

### Tokens (from app/src/styles.css, dark theme)
- bg `#0f1114`, surface `#171a1f`, surface-2 `#1e2228`, border `#272c34`, border-strong `#363c46`
- text `#e4e7ec`, text-2 `#b3b9c4`, text-3 `#8e95a2`
- accent `#2f6ae0`, accent-text `#8fb3ff`, ok `#5ccb8b`, warn `#f0b552`, bad `#f47b7b`
- Fonts: display "Segoe UI Variable Display"; text "Segoe UI Variable Text"; code "Cascadia Mono"
- Radius 8–16px; glows only on the hero element of a shot.

### Motion tokens (pro tool, mid energy: between "Professional trust" and "Energetic")
- main move ~21f, entrance bezier(0.16,1,0.3,1); overshoot 1.04 only where something lands; no squash except Nex.
- Holds: wordmark ≥30f; batch animations end with ≥15f stillness.
- ≤3 frame-level slams: beat 12 (15.26s), the drop (113.96s), the final wordmark.

## Music structure (analysis/beat_data.json)
- 124.00 BPM, T=0.48387s, t0=9.458s (beat 0). Grid winner 1x (match 93.6%: the beatless intro lowers it).
- Video uses music 0.00–108.16s (to bar 51), then music 156.56s (bar 76) onward; both cuts on bar lines, so video beat n = 9.458 + n·T throughout. Video ends at 150.74s (music 199.14s), last 1.5s fade.
- Energy (video time): 0–9.46 intro (no beat) · 9.46–15.26 low · 15.26 high · 17.2–30.75 mid · 30.75–73.33 high/mid alternating · **73.33–108.16 low breakdown** · 108.16–113.96 build · **113.96 drop (high)** to the end.

## Shot mapping (approved; each chosen card is hero exactly once)
| Card (default style) | Used for |
|---|---|
| assemble-then-type-flyin | #1 opening: dashboard frame assembles, headline types |
| bezier-source-converge-merge | #3 Apache/PHP/MySQL/Node merge into NexDB |
| avatar-bracket-carousel | #5 "Run PHP [8.4·8.3·8.2·7.4] per project" |
| card-stack | #6 new-project starters |
| basic-3d-scene | #7 Projects → Database → Terminal → overview |
| icon-performance-moves · pop-burst-confirm | #8 Check my setup Fix → check burst |
| gradient-transition | #10 breakdown title "Now… host it." |
| icon-performance-moves · attention-bounce | #11 Nex jumps, NexHost panel pops |
| line-carry-transition | #13 Deploy progress line → frames the connection map (only signature transition) |
| chip-grid-single-select-blackout | #17 plans, 4-year selected |

## Storyboard (approved)
| # | Time | Content | Shot | Caption |
|---|---|---|---|---|
| 1 | 0:00–0:09.46 | dashboard skeleton flies together, headline types | assemble-then-type-flyin | Your whole PHP stack. |
| 2 | 0:09.46–0:15.26 | new Nex: pop up, blink, wave; wordmark NexDB + One app. hold | new Nex | One app. |
| 3 | 0:15.26–0:21 | 4 sources merge into NexDB badge (slam #1 at beat 12) | bezier-source-converge-merge | Four tools. One app. |
| 4 | 0:21–0:30.75 | real Dashboard: Start all, services go green per beat, signal line | real screen | One click. Everything runs. |
| 5 | 0:30.75–0:36.55 | PHP versions rotate in focus frame on the beat | avatar-bracket-carousel | Run PHP [x] per project |
| 6 | 0:36.55–0:44.3 | starters stack and fan | card-stack | A Laravel app in minutes. |
| 7 | 0:44.3–0:57.84 | 3D tour Projects → Database → Terminal → overview | basic-3d-scene | Projects. / A real database tool. / Every tool, one terminal. |
| 8 | 0:57.84–1:05.59 | Check my setup, Nex teacher, Fix → check burst | pop-burst-confirm | Something broke? Nex fixes it. |
| 9 | 1:05.59–1:13.33 | beat cuts: Mail catcher, PostgreSQL, Share on Wi-Fi, backups | real screens | — |
| 10 | 1:13.33–1:20 | gradient field, calm title | gradient-transition | Now… host it. |
| 11 | 1:20–1:28 | Nex 4 escalating jumps, camera push, NexHost panel pops | attention-bounce | Meet NexHost. |
| 12 | 1:28–1:35 | Files → Import project → .env in editor → Saved | real screens | Import. Edit. Right here. |
| 13 | 1:35–1:42 | Deploy output; progress line extends, camera follows, frames next card | line-carry-transition | One click to update. |
| 14 | 1:42–1:48.16 | connection map lights stop by stop | real screen | Your PC is the server. |
| 15 | 1:48.16–1:53.96 | Go live: tunnel connects, Live at https://… | real screen | Live on the internet. |
| 16 | 1:53.96–2:06 | DROP slam #2: Build it. Host it. From your own PC. + chips on beat | text + chips | (title) |
| 17 | 2:06–2:18 | plans; 4-yr selected → "₱102/month · NexHost included" | chip-grid-single-select-blackout | (plans) |
| 18 | 2:18–2:30.74 | free launch key card, 7 days free + NexHost; Nex wizard; NexDB wordmark slam #3 + NEXIO DEVS, hold, fade | ending | Get your free launch key. |

## Data safety
Capture only from the app's practice mode (`?view=...`) at localhost:1420. Giveaway key strings are fictional (generated for the video), never real keys.

## v2 (approved: "add it to the current shots", "make it a little longer if necessary")

Length 346 beats ≈ 2:57. New shots 9b Terminal (beats 144–156) and 16b Beat-step (272–284); ending grown to 38 beats.
Added cards: cursor swarm (S01), guide cursors (S04, S08, S12, S15, S17), before-after slider (S04),
bullet-time orbit (S08), terminal-3d (S09b), bottom-push wipes (S10, S11), graze-face-tour (S12),
exploded-view (S14), beat-step list (S16b), timeline-travel + icon-flip-bloom (S18).
Big hit #3 moved to beat 336 (the logo bloom). Shot table: src/timeline.ts. Review: out/final/v2/REVIEW.md.
