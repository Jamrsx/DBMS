# Builds the "NexDB Glass look" ad (0.5.9) in two shapes from one template:
#   glass/index.html         (9:16, 1080x1920)
#   ../glass-wide/index.html (16:9, 1920x1080)
# Layers, back to front: Three.js world (bgglass.js) -> NexDB window in HTML whose glass skin uses a real
# backdrop blur over the 3D world -> 2D cartoon developer and switch (SVG) -> captions.
# Timing is the 124 BPM music grid; the music drop (track beat 316) lands on the switch to glass.
# Run: python glass/build.py   (from promo-hyperframes)
import html, os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
WIDE = os.path.join(os.path.dirname(HERE), "glass-wide")

B = 0.48387
at = lambda n: round(n * B, 3)
DROP = at(8)          # glass turns on
TOTAL = at(50)        # 24.19 s
T0 = 9.458
MUSIC_START = round(T0 + 316 * B - DROP, 3)

CAPS = [
    (0.3, at(7.7), "NexDB has a new look."),
    (at(8.1), at(15.8), "The Glass look."),
    (at(16.1), at(23.6), "Light or dark."),
    (at(24.1), at(27.8), "Acrylic on Windows."),
    (at(28.1), at(31.6), "Liquid Glass on Mac."),
    (at(32.1), at(35.8), "One button: Start all."),
    (at(36.1), at(39.7), "phpMyAdmin, one click away."),
]

SFX = [  # (file, time, volume)
    ("sfx/click", at(7.6), 0.6), ("swoosh-quick", at(7.8), 0.35), ("impact-deep-whoosh", at(8) - 0.03, 0.4), ("sfx/chime", at(8.6), 0.35),
    ("sfx/click", at(17), 0.5), ("sfx/click", at(20.7), 0.5),
    ("swoosh-quick", at(24), 0.3), ("sfx/pop", at(28), 0.45),
    ("sfx/click", at(34), 0.6), ("sfx/chime", at(34.25), 0.4),
    ("sfx/click", at(37.6), 0.55), ("sfx/pop", at(37.7), 0.4),
    ("swoosh-quick", at(39.8), 0.35), ("sfx/chime", at(40.4), 0.4), ("sfx/pop", at(41.5), 0.45),
]

OUT, SKIN, HOOD, HAIR, SW = "#1b1f27", "#f2c9a0", "#2f6ae0", "#2a1d14", 7


def dev(pid, x, y, s=1.0):
    """Same cartoon developer as the Mac ad. Origin = head centre."""
    return f'''<g transform="translate({x},{y}) scale({s})"><g id="{pid}">
  <g transform="translate(-95,118)"><g id="{pid}-armL"><path d="M0,0 L-18,150" stroke="{OUT}" stroke-width="58" stroke-linecap="round"/><path d="M0,0 L-18,150" stroke="{HOOD}" stroke-width="44" stroke-linecap="round"/><circle cx="-18" cy="168" r="26" fill="{SKIN}" stroke="{OUT}" stroke-width="{SW}"/></g></g>
  <path d="M-125,260 Q-130,112 -62,84 L62,84 Q130,112 125,260 Z" fill="{HOOD}" stroke="{OUT}" stroke-width="{SW}"/>
  <path d="M-30,92 L-24,150 M30,92 L24,150" stroke="#dfe8ff" stroke-width="6" stroke-linecap="round"/>
  <g transform="translate(95,118)"><g id="{pid}-armR"><path d="M0,0 L18,150" stroke="{OUT}" stroke-width="58" stroke-linecap="round"/><path d="M0,0 L18,150" stroke="{HOOD}" stroke-width="44" stroke-linecap="round"/><circle cx="18" cy="168" r="26" fill="{SKIN}" stroke="{OUT}" stroke-width="{SW}"/></g></g>
  <g id="{pid}-head">
    <circle cx="-80" cy="8" r="16" fill="{SKIN}" stroke="{OUT}" stroke-width="{SW}"/>
    <circle cx="80" cy="8" r="16" fill="{SKIN}" stroke="{OUT}" stroke-width="{SW}"/>
    <ellipse cx="0" cy="0" rx="80" ry="90" fill="{SKIN}" stroke="{OUT}" stroke-width="{SW}"/>
    <path d="M-80,-14 Q-86,-100 0,-96 Q86,-100 80,-14 Q62,-62 4,-56 Q-52,-64 -80,-14 Z" fill="{HAIR}" stroke="{OUT}" stroke-width="{SW}"/>
    <ellipse cx="-40" cy="34" rx="13" ry="8" fill="#f2a08e" opacity=".55"/><ellipse cx="40" cy="34" rx="13" ry="8" fill="#f2a08e" opacity=".55"/>
    <g id="{pid}-eyes"><ellipse cx="-28" cy="2" rx="9" ry="13" fill="{OUT}"/><ellipse cx="28" cy="2" rx="9" ry="13" fill="{OUT}"/></g>
    <g id="{pid}-eyesW" opacity="0"><circle cx="-29" cy="0" r="21" fill="#fff" stroke="{OUT}" stroke-width="5"/><circle cx="29" cy="0" r="21" fill="#fff" stroke="{OUT}" stroke-width="5"/><circle cx="-29" cy="2" r="9" fill="{OUT}"/><circle cx="29" cy="2" r="9" fill="{OUT}"/></g>
    <path id="{pid}-smile" d="M-26,40 Q0,62 26,40" fill="none" stroke="{OUT}" stroke-width="7" stroke-linecap="round"/>
    <path id="{pid}-grin" opacity="0" d="M-36,34 Q0,84 36,34 Z" fill="#fff" stroke="{OUT}" stroke-width="6" stroke-linejoin="round"/>
  </g>
</g></g>'''


# The user picked the modern flat character (characters.py) on 2026-11-18.
import sys as _sys
_sys.path.insert(0, os.path.dirname(HERE))
from characters import flat as dev  # noqa: E402


LAYOUT = {
    "tall": dict(W=1080, H=1920, FOV=50, dev=(230, 1430, 0.7), sw=(430, 1385), nex=(860, 1470, 0.75)),
    "wide": dict(W=1920, H=1080, FOV=32, dev=(300, 650, 0.75), sw=(500, 610), nex=(1640, 900, 0.6)),
}

ROWS = [("Apache", "2.4", "Web server"), ("PHP", "8.5", "Runs your PHP"), ("MySQL", "9.7", "Database"), ("Node.js", "24", "JavaScript")]
SIDE = ["Dashboard", "Projects", "Database", "NexHost", "Versions", "Settings"]

window_html = f'''
<div id="win">
  <div class="skin" id="sk-solid"></div><div class="skin glass" id="sk-dark"></div><div class="skin glass light" id="sk-light"></div>
  <div class="sheen" id="sheen"></div>
  <div class="bar">
    <span class="dots" id="macdots"><i></i><i></i><i></i></span>
    <span class="wtitle"><img src="assets/nexdb-logo.png" alt="" />NexDB</span>
    <span class="winctl" id="winctl"><b>&#8212;</b><b>&#9633;</b><b>&#10005;</b></span>
  </div>
  <div class="body">
    <div class="side">{"".join(f'<div class="si{" on" if i == 0 else ""}"><i></i>{n}</div>' for i, n in enumerate(SIDE))}</div>
    <div class="main">
      <div class="h2">Your stack</div>
      <div class="btns">
        <div class="btn primary" id="b-start"><span id="t-start">Start all</span><span id="t-stop">Stop all</span></div>
        <div class="btn ghost" id="b-pma">phpMyAdmin</div>
      </div>
      {"".join(f'<div class="row"><div><b>{n}</b> <em>{v}</em><span>{d}</span></div><i class="dot" id="dot{i}"></i></div>' for i, (n, v, d) in enumerate(ROWS))}
    </div>
  </div>
  <svg class="cursor" id="cursor" viewBox="0 0 80 120" width="56" height="84"><path d="M4,4 L4,96 L28,74 L46,114 L64,106 L46,66 L78,64 Z" fill="#fff" stroke="#1b1f27" stroke-width="6" stroke-linejoin="round"/></svg>
</div>
<div class="oslabel" id="os-win">Windows &middot; Acrylic</div>
<div class="oslabel" id="os-mac">Mac &middot; Liquid Glass on macOS 26</div>
'''

end_html = '''
<div id="endcard">
  <img src="assets/nexdb-logo.png" alt="" id="e-logo" />
  <div id="e-title">The Glass look</div>
  <div id="e-sub">New in NexDB 0.5.9</div>
  <div id="e-url">db.nexiodev.site</div>
</div>
'''


def overlay(mode):
    L = LAYOUT[mode]
    dx, dy, ds = L["dev"]
    sx, sy = L["sw"]
    nx, ny, ns = L["nex"]
    return f'''<svg id="ovl" viewBox="0 0 {L["W"]} {L["H"]}" xmlns="http://www.w3.org/2000/svg">
<g transform="translate({sx},{sy})"><g id="switch" opacity="0">
  <text x="0" y="-62" text-anchor="middle" font-size="34" font-weight="800" fill="#fff" font-family="Segoe UI, sans-serif" stroke="#0b0f17" stroke-width="8" paint-order="stroke">Glass look</text>
  <rect id="sw-track" x="-80" y="-40" width="160" height="80" rx="40" fill="#3a4150" stroke="{OUT}" stroke-width="6"/>
  <circle id="sw-knob" cx="-40" cy="0" r="30" fill="#fff" stroke="{OUT}" stroke-width="5"/>
</g></g>
{dev("dv", dx, dy, ds)}
<g transform="translate({nx},{ny}) scale({ns})"><image id="nexbot" opacity="0" href="assets/nex.svg" x="-130" y="-130" width="260" height="260"/></g>
</svg>'''


JS = r"""
const tl = gsap.timeline({ paused: true });
tl.to(window.__bg.clock, { t: TOTAL, duration: TOTAL, ease: "none", onUpdate: () => window.__bg.render && window.__bg.render(window.__bg.clock.t) }, 0);
const C = { transformOrigin: "50% 50%" };
const ARM = { transformOrigin: "50% 8%" };
const pop = (sel, t, d = 0.4) => tl.fromTo(sel, { opacity: 0, scale: 0.4, ...C }, { opacity: 1, scale: 1, duration: d, ease: "back.out(2.2)", ...C }, t);

// captions
CAPS.forEach(([a, b], i) => {
  tl.fromTo("#cap" + i, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.15, ease: "back.out(2)" }, a);
  tl.set("#cap" + i, { opacity: 0 }, b);
});

// cursor targets, in window coordinates
const win = document.getElementById("win");
const wr = win.getBoundingClientRect();
const ctr = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left - wr.left + r.width * 0.55, r.top - wr.top + r.height * 0.55]; };
const [sx, sy] = ctr("b-start"), [px, py] = ctr("b-pma");

// 1: solid window, developer, switch
tl.fromTo("#win", { opacity: 0, y: 80, scale: 0.94, ...C }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out", ...C }, 0);
tl.set("#sk-dark, #sk-light", { opacity: 0 }, 0);
pop("#dv", 0.5, 0.5);
pop("#switch", at(4), 0.4);
tl.to("#dv-armR", { rotation: -150, duration: 0.5, ease: "power2.out", ...ARM }, at(6));
tl.to("#dv-armR", { rotation: -138, duration: 0.12, yoyo: true, repeat: 1, ...ARM }, at(7.5));
// 2: the drop - glass on
tl.to("#sw-knob", { attr: { cx: 40 }, duration: 0.18, ease: "power2.out" }, at(7.6));
tl.to("#sw-track", { attr: { fill: "#2f6ae0" }, duration: 0.18 }, at(7.6));
tl.to("#sk-solid", { opacity: 0, duration: 0.45, ease: "power2.out" }, DROP);
tl.to("#sk-dark", { opacity: 1, duration: 0.45, ease: "power2.out" }, DROP);
tl.fromTo("#sheen", { xPercent: -120 }, { xPercent: 120, duration: 0.9, ease: "power2.inOut" }, DROP + 0.05);
tl.fromTo("#win", { scale: 1.04, ...C }, { scale: 1, duration: 0.5, ease: "back.out(2)", ...C }, DROP);
tl.set("#dv-eyes", { opacity: 0 }, DROP + 0.1); tl.set("#dv-eyesW", { opacity: 1 }, DROP + 0.1);
tl.set("#dv-smile", { opacity: 0 }, DROP + 0.1); tl.set("#dv-grin", { opacity: 1 }, DROP + 0.1);
tl.to("#dv-armR", { rotation: 0, duration: 0.5, ease: "power2.inOut", ...ARM }, at(10));
tl.to("#switch", { opacity: 0, scale: 0.6, duration: 0.3, ...C }, at(15));
// 3: light, then dark again
const toLight = at(17), toDark = at(20.7);
tl.to("#sk-dark", { opacity: 0, duration: 0.35 }, toLight);
tl.to("#sk-light", { opacity: 1, duration: 0.35 }, toLight);
tl.to("#win", { "--ink": "#141821", "--muted": "#363f52", "--line": "rgba(20,24,33,.14)", duration: 0.35 }, toLight);
tl.to("#sk-light", { opacity: 0, duration: 0.35 }, toDark);
tl.to("#sk-dark", { opacity: 1, duration: 0.35 }, toDark);
tl.to("#win", { "--ink": "#ffffff", "--muted": "#b7c0d1", "--line": "rgba(255,255,255,.14)", duration: 0.35 }, toDark);
// 4: Windows Acrylic, then Mac Liquid Glass
tl.set("#macdots", { opacity: 0 }, at(24)); tl.set("#winctl", { opacity: 1 }, at(24));
tl.to("#win", { "--radius": "10px", duration: 0.3 }, at(24));
tl.fromTo("#os-win", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, at(24));
tl.to("#os-win", { opacity: 0, duration: 0.2 }, at(27.8));
tl.set("#winctl", { opacity: 0 }, at(28)); tl.set("#macdots", { opacity: 1 }, at(28));
tl.to("#win", { "--radius": "38px", duration: 0.4, ease: "back.out(2)" }, at(28));
tl.fromTo("#os-mac", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, at(28));
tl.fromTo("#sheen", { xPercent: -120 }, { xPercent: 120, duration: 1.0, ease: "power2.inOut", immediateRender: false }, at(28.2));
tl.to("#os-mac", { opacity: 0, duration: 0.2 }, at(31.8));
// 5: Start all, then phpMyAdmin
tl.fromTo("#cursor", { opacity: 0, x: sx + 140, y: sy + 220 }, { opacity: 1, x: sx + 120, y: sy + 200, duration: 0.2 }, at(32.3));
tl.to("#cursor", { x: sx, y: sy, duration: 0.8, ease: "power2.inOut" }, at(32.6));
tl.to("#b-start", { scale: 0.92, duration: 0.08, yoyo: true, repeat: 1, ...C }, at(34));
tl.to("#t-start", { opacity: 0, duration: 0.1 }, at(34.1)); tl.to("#t-stop", { opacity: 1, duration: 0.1 }, at(34.1));
tl.to("#b-start", { backgroundColor: "rgba(255,255,255,0.16)", duration: 0.2 }, at(34.1));
for (let i = 0; i < 4; i++) tl.to("#dot" + i, { backgroundColor: "#5ccb8b", boxShadow: "0 0 0 6px rgba(92,203,139,.25)", duration: 0.12 }, at(34.2) + i * 0.12);
tl.to("#cursor", { x: px, y: py, duration: 0.7, ease: "power2.inOut" }, at(36.2));
tl.to("#b-pma", { scale: 0.92, duration: 0.08, yoyo: true, repeat: 1, ...C }, at(37.6));
tl.fromTo("#b-pma", { boxShadow: "0 0 0 0 rgba(255,255,255,.5)" }, { boxShadow: "0 0 0 18px rgba(255,255,255,0)", duration: 0.6 }, at(37.7));
tl.to("#cursor", { opacity: 0, duration: 0.2 }, at(39.4));
// 6: end card
tl.to("#win", { opacity: 0, scale: 0.9, y: -40, duration: 0.45, ease: "power2.in", ...C }, at(39.8));
tl.fromTo("#endcard", { opacity: 0, scale: 0.94, ...C }, { opacity: 1, scale: 1, duration: 0.45, ease: "power3.out", ...C }, at(39.9));
pop("#e-logo", at(40.2), 0.45);
tl.fromTo("#e-title", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, at(40.6));
tl.fromTo("#e-sub", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, at(41.2));
tl.fromTo("#e-url", { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, at(42));
tl.to("#dv-armR", { rotation: -150, duration: 0.4, ease: "power2.out", ...ARM }, at(40.4));
tl.to("#dv-armR", { rotation: -120, duration: 0.3, yoyo: true, repeat: 11, ease: "sine.inOut", ...ARM }, at(41.3));
pop("#nexbot", at(41.5), 0.5);
tl.to("#nexbot", { y: -12, duration: 0.6, yoyo: true, repeat: 3, ease: "sine.inOut" }, at(42.5));

window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
tl.seek(0);
"""


def page(mode):
    L = LAYOUT[mode]
    W, H = L["W"], L["H"]
    res = "portrait" if mode == "tall" else "landscape"
    audio = "\n".join(
        [f'<audio id="music" src="assets/bgm-tech-house.mp3" data-start="0" data-duration="{TOTAL}" data-media-start="{MUSIC_START}" data-volume="0.5" data-fade-in="0.3" data-fade-out="1.5" data-track-index="10"></audio>']
        + [f'<audio id="fx{k}" src="assets/{n}.mp3" data-start="{t}" data-duration="1.4" data-volume="{v}" data-track-index="{20 + k}"></audio>' for k, (n, t, v) in enumerate(SFX)]
    )
    caps = "\n".join(f'<div class="cap" id="cap{i}">{html.escape(c)}</div>' for i, (_, _, c) in enumerate(CAPS))
    js = (f"const B = {B};\nconst at = (n) => n * B;\nconst DROP = {DROP};\nconst TOTAL = {TOTAL};\nconst CAPS = {[[a, b] for a, b, _ in CAPS]};\n"
          f"window.__bg = {{ W: {W}, H: {H}, FOV: {L['FOV']}, DROP, clock: {{ t: 0 }}, render: null }};\n"
          "window.__hf = window.__hf || {};\nwindow.__hf.buildReady = window.__hf.buildReady || {};\n"
          "window.__hf.buildReady['main'] = new Promise((r) => { window.__bg.ready = r; });\n" + JS)
    return f'''<!doctype html>
<html lang="en" data-resolution="{res}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      /* "NexDB Glass look" ad. Generated by glass/build.py - edit there, not here. */
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: {W}px; height: {H}px; overflow: hidden; background: #070a14; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Segoe UI", "Inter", Arial, sans-serif; color: #fff; background: #070a14; }}
      .clip {{ position: absolute; inset: 0; }}
      #bg3d {{ position: absolute; inset: 0; width: 100%; height: 100%; display: block; }}

      /* NexDB window */
      #win {{ --ink: #ffffff; --muted: #b7c0d1; --line: rgba(255,255,255,.14); --radius: 26px;
        position: absolute; border-radius: var(--radius); overflow: hidden; color: var(--ink); box-shadow: 0 40px 120px rgba(0,0,0,.55); }}
      .skin {{ position: absolute; inset: 0; border-radius: var(--radius); }}
      #sk-solid {{ background: #12161d; border: 1px solid #262c38; }}
      .skin.glass {{ background: rgba(18,24,38,.34); backdrop-filter: blur(34px) saturate(180%); -webkit-backdrop-filter: blur(34px) saturate(180%);
        border: 1.5px solid rgba(255,255,255,.28); box-shadow: inset 0 1px 0 rgba(255,255,255,.35), inset 0 -1px 0 rgba(255,255,255,.08); }}
      .skin.glass.light {{ background: rgba(255,255,255,.5); border-color: rgba(255,255,255,.7); }}
      .sheen {{ position: absolute; inset: -10%; pointer-events: none; transform: translateX(-120%);
        background: linear-gradient(110deg, transparent 38%, rgba(255,255,255,.28) 48%, rgba(255,255,255,.05) 56%, transparent 62%); }}
      .bar {{ position: relative; height: 64px; display: flex; align-items: center; padding: 0 24px; border-bottom: 1px solid var(--line); }}
      .dots {{ display: flex; gap: 12px; width: 120px; }}
      .dots i {{ width: 18px; height: 18px; border-radius: 50%; background: #ff5f57; display: block; }}
      .dots i:nth-child(2) {{ background: #febc2e; }} .dots i:nth-child(3) {{ background: #28c840; }}
      .wtitle {{ flex: 1; display: flex; justify-content: center; align-items: center; gap: 12px; font-size: 26px; font-weight: 700; }}
      .wtitle img {{ width: 34px; height: 34px; border-radius: 9px; }}
      .winctl {{ width: 120px; display: flex; justify-content: flex-end; gap: 26px; font-size: 24px; color: var(--muted); opacity: 0; }}
      .winctl b {{ font-weight: 400; }}
      .body {{ position: relative; display: flex; height: calc(100% - 64px); }}
      .side {{ padding: 28px 18px; border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }}
      .si {{ display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 12px; color: var(--muted); font-weight: 600; }}
      .si i {{ width: 16px; height: 16px; border-radius: 5px; border: 2.5px solid currentColor; display: block; }}
      .si.on {{ background: rgba(127,160,255,.18); color: var(--ink); }}
      .main {{ flex: 1; padding: 34px 36px; display: flex; flex-direction: column; gap: 18px; }}
      .h2 {{ font-weight: 800; letter-spacing: -0.02em; }}
      .btns {{ display: flex; gap: 16px; margin: 6px 0 10px; }}
      .btn {{ position: relative; border-radius: 16px; font-weight: 800; display: flex; align-items: center; justify-content: center; }}
      .btn.primary {{ background: #2f6ae0; color: #fff; }}
      .btn.primary span {{ position: absolute; }} #t-stop {{ opacity: 0; }}
      .btn.ghost {{ border: 2px solid var(--line); background: rgba(255,255,255,.08); color: var(--ink); }}
      .row {{ display: flex; align-items: center; justify-content: space-between; padding: 0 22px; border-radius: 16px; border: 1px solid var(--line); background: rgba(255,255,255,.04); }}
      .row b {{ font-weight: 800; }} .row em {{ font-style: normal; color: var(--muted); font-family: "JetBrains Mono", monospace; }}
      .row span {{ display: block; color: var(--muted); }}
      .dot {{ width: 22px; height: 22px; border-radius: 50%; background: #5d6577; display: block; }}
      .cursor {{ position: absolute; left: 0; top: 0; opacity: 0; filter: drop-shadow(0 6px 10px rgba(0,0,0,.4)); }}
      .oslabel {{ position: absolute; text-align: center; color: #cfd6e2; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; opacity: 0;
        text-shadow: 0 2px 12px rgba(0,0,0,.6); }}

      /* end card */
      #endcard {{ position: absolute; opacity: 0; padding: 50px 70px; border-radius: 44px; background: rgba(18,24,38,.36); backdrop-filter: blur(34px) saturate(180%); -webkit-backdrop-filter: blur(34px) saturate(180%); border: 1.5px solid rgba(255,255,255,.28); box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 40px 120px rgba(0,0,0,.5); display: flex; flex-direction: column; align-items: center; text-align: center; }}
      #e-logo {{ border-radius: 22%; box-shadow: 0 30px 80px rgba(0,0,0,.5); opacity: 0; }}
      #e-title {{ font-weight: 800; letter-spacing: -0.03em; opacity: 0; text-shadow: 0 6px 30px rgba(0,0,0,.5); }}
      #e-sub {{ color: #cfd6e2; font-weight: 600; opacity: 0; }}
      #e-url {{ font-weight: 800; border-bottom: 6px solid rgba(255,255,255,.85); padding-bottom: 8px; opacity: 0; }}

      #ovl {{ position: absolute; inset: 0; width: 100%; height: 100%; }}
      .cap {{ position: absolute; left: 50px; right: 50px; text-align: center; font-weight: 900; color: #fff; opacity: 0; line-height: 1.04;
        text-shadow: 0 0 2px #000, 4px 4px 0 #0b0f17, -4px 4px 0 #0b0f17, 4px -4px 0 #0b0f17, -4px -4px 0 #0b0f17, 0 6px 0 #0b0f17, 0 8px 22px rgba(0,0,0,.6); }}

      /* tall */
      .tall #win {{ left: 80px; top: 300px; width: 920px; height: 800px; }}
      .tall .side {{ width: 250px; font-size: 26px; }} .tall .h2 {{ font-size: 46px; }}
      .tall .btn {{ height: 76px; font-size: 30px; }} .tall #b-start {{ width: 230px; }} .tall #b-pma {{ width: 250px; }}
      .tall .row {{ height: 108px; font-size: 32px; }} .tall .row span {{ font-size: 24px; }}
      .tall .oslabel {{ left: 0; right: 0; top: 170px; font-size: 32px; }}
      .tall #endcard {{ left: 90px; right: 90px; top: 300px; }}
      .tall #e-logo {{ width: 220px; height: 220px; }} .tall #e-title {{ font-size: 120px; margin-top: 40px; }}
      .tall #e-sub {{ font-size: 50px; margin-top: 14px; }} .tall #e-url {{ font-size: 80px; margin-top: 50px; }}
      .tall .cap {{ top: 1660px; font-size: 84px; }}
      /* wide */
      .wide #win {{ left: 640px; top: 110px; width: 1160px; height: 700px; }}
      .wide .side {{ width: 250px; font-size: 24px; }} .wide .h2 {{ font-size: 40px; }}
      .wide .btn {{ height: 64px; font-size: 26px; }} .wide #b-start {{ width: 200px; }} .wide #b-pma {{ width: 220px; }}
      .wide .main {{ gap: 12px; padding: 26px 32px; }}
      .wide .row {{ height: 84px; font-size: 28px; }} .wide .row span {{ font-size: 21px; }}
      .wide .oslabel {{ left: 640px; width: 1160px; top: 48px; font-size: 28px; }}
      .wide #endcard {{ left: 700px; width: 1040px; top: 110px; }}
      .wide #e-logo {{ width: 170px; height: 170px; }} .wide #e-title {{ font-size: 110px; margin-top: 26px; }}
      .wide #e-sub {{ font-size: 44px; margin-top: 10px; }} .wide #e-url {{ font-size: 70px; margin-top: 34px; }}
      .wide .cap {{ top: 880px; font-size: 72px; }}
    </style>
  </head>
  <body>
    <div id="root" class="{mode}" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
<canvas id="bg3d"></canvas>
{audio}
      <div class="clip" id="stage" data-start="0" data-duration="{TOTAL}" data-track-index="0">
{window_html}
{end_html}
{overlay(mode)}
      </div>
      <div class="clip" id="captions" data-start="0" data-duration="{TOTAL}" data-track-index="1">
{caps}
      </div>
    </div>
    <script>
{js}
    </script>
    <script type="module" src="bgglass.js"></script>
  </body>
</html>
'''


with open(os.path.join(HERE, "index.html"), "w", encoding="utf-8") as f:
    f.write(page("tall"))
os.makedirs(WIDE, exist_ok=True)
for name in ("hyperframes.json", "package.json", "CLAUDE.md", "bgglass.js"):
    shutil.copy(os.path.join(HERE, name), os.path.join(WIDE, name))
with open(os.path.join(WIDE, "meta.json"), "w") as f:
    f.write('{"id":"glass-wide","name":"glass-wide"}')
shutil.copytree(os.path.join(HERE, "assets"), os.path.join(WIDE, "assets"), dirs_exist_ok=True)
with open(os.path.join(WIDE, "index.html"), "w", encoding="utf-8") as f:
    f.write(page("wide"))
print("total", TOTAL, "drop", DROP, "music_start", MUSIC_START)
