# Builds the cartoon "NexDB for Mac" ad in two shapes from one template:
#   mac/index.html         (9:16, 1080x1920)
#   ../mac-wide/index.html (16:9, 1920x1080)
# Every scene is one 1600x1600 SVG drawn with preserveAspectRatio "slice", so the tall video shows
# x 350..1250 and the wide one shows y 350..1250. Keep key art inside x 380..1220, y 380..1240.
# Timing comes from the user's ElevenLabs voice lines in assets/vo (line01..line12.mp3).
# Sound effects in assets/sfx were made with ffmpeg (see the vault note).
# The older screenshot version is kept in build-screens.py, the flat 2D cartoon in build-flat.py.
# The background is a Three.js world (bg3d.js): a room set and a studio stage set, rendered per frame from the timeline.
# Run: python mac/build.py   (from promo-hyperframes)
import html, math, os, re, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
WIDE = os.path.join(os.path.dirname(HERE), "mac-wide")

LINES = [
    "POV: you just switched to a Mac... and your PHP setup is gone.",
    "Homebrew errors. Config files everywhere.",
    "Three hours later, Apache still won't start.",
    "Then you find this.",
    "NexDB. Now on Mac.",
    "Apache, PHP, MySQL and Node. One app. One click: Start all.",
    "Something breaks? Nex tells you what's wrong, in plain words, and fixes it.",
    "Host your test site straight from your Mac with NexHost.",
    "It runs on Apple Silicon and on Intel Macs. Even a 2018 MacBook Air.",
    "All you need is macOS 13 or newer.",
    "Try it free for 14 days. Plans start at ₱299.",
    "db.nexiodev.site. Link in bio.",
]


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(out.strip())


LEAD, GAP, TAIL = 0.3, 0.2, 0.8
starts, durs = [], []
t = LEAD
for i in range(12):
    d = probe(os.path.join(HERE, "assets", "vo", f"line{i + 1:02d}.mp3"))
    starts.append(round(t, 3))
    durs.append(round(d, 3))
    t += d + GAP
TOTAL = round(starts[-1] + durs[-1] + TAIL, 3)
S, D = starts, durs


def chunks(text):
    """Split a line into caption chunks of up to 5 words, breaking at sentence ends."""
    out, cur = [], []
    for w in text.split():
        cur.append(w)
        if len(cur) == 5 or re.search(r"[.?!]$", w) or len(" ".join(cur)) > 22:
            out.append(" ".join(cur))
            cur = []
    if cur:
        out.append(" ".join(cur))
    return out


caps = []  # (start, end, text)
for i, text in enumerate(LINES):
    cs = chunks(text)
    ws = [len(c) + (6 if re.search(r"[.,:?!]$", c) else 0) for c in cs]
    span = D[i] - 0.1
    a = S[i]
    for c, w in zip(cs, ws):
        b = a + span * w / sum(ws)
        caps.append((round(a, 3), round(b, 3), c))
        a = b

# ---------------------------------------------------------------- drawing helpers
OUT = "#1b1f27"   # outline
SKIN = "#f2c9a0"
HOOD = "#2f6ae0"
HAIR = "#2a1d14"
SW = 7            # outline width
FONT = 'font-family="Segoe UI, sans-serif"'


def dev(pid, x, y, s=1.0):
    """Cartoon developer. Origin = head centre. Parts: -head, -eyes, -eyesW, -smile, -frown, -oh, -grin, -sweat, -armL, -armR."""
    return f'''<g transform="translate({x},{y}) scale({s})"><g id="{pid}">
  <g transform="translate(-95,118)"><g id="{pid}-armL"><path d="M0,0 L-18,150" stroke="{OUT}" stroke-width="58" stroke-linecap="round"/><path d="M0,0 L-18,150" stroke="{HOOD}" stroke-width="44" stroke-linecap="round"/><circle cx="-18" cy="168" r="26" fill="{SKIN}" stroke="{OUT}" stroke-width="{SW}"/></g></g>
  <g transform="translate(95,118)"><g id="{pid}-armR"><path d="M0,0 L18,150" stroke="{OUT}" stroke-width="58" stroke-linecap="round"/><path d="M0,0 L18,150" stroke="{HOOD}" stroke-width="44" stroke-linecap="round"/><circle cx="18" cy="168" r="26" fill="{SKIN}" stroke="{OUT}" stroke-width="{SW}"/></g></g>
  <path d="M-125,260 Q-130,112 -62,84 L62,84 Q130,112 125,260 Z" fill="{HOOD}" stroke="{OUT}" stroke-width="{SW}"/>
  <path d="M-30,92 L-24,150 M30,92 L24,150" stroke="#dfe8ff" stroke-width="6" stroke-linecap="round"/>
  <g id="{pid}-head">
    <circle cx="-80" cy="8" r="16" fill="{SKIN}" stroke="{OUT}" stroke-width="{SW}"/>
    <circle cx="80" cy="8" r="16" fill="{SKIN}" stroke="{OUT}" stroke-width="{SW}"/>
    <ellipse cx="0" cy="0" rx="80" ry="90" fill="{SKIN}" stroke="{OUT}" stroke-width="{SW}"/>
    <path d="M-80,-14 Q-86,-100 0,-96 Q86,-100 80,-14 Q62,-62 4,-56 Q-52,-64 -80,-14 Z" fill="{HAIR}" stroke="{OUT}" stroke-width="{SW}"/>
    <ellipse cx="-40" cy="34" rx="13" ry="8" fill="#f2a08e" opacity=".55"/><ellipse cx="40" cy="34" rx="13" ry="8" fill="#f2a08e" opacity=".55"/>
    <g id="{pid}-eyes"><ellipse cx="-28" cy="2" rx="9" ry="13" fill="{OUT}"/><ellipse cx="28" cy="2" rx="9" ry="13" fill="{OUT}"/></g>
    <g id="{pid}-eyesW" opacity="0"><circle cx="-29" cy="0" r="21" fill="#fff" stroke="{OUT}" stroke-width="5"/><circle cx="29" cy="0" r="21" fill="#fff" stroke="{OUT}" stroke-width="5"/><circle cx="-29" cy="2" r="9" fill="{OUT}"/><circle cx="29" cy="2" r="9" fill="{OUT}"/></g>
    <path id="{pid}-smile" d="M-26,40 Q0,62 26,40" fill="none" stroke="{OUT}" stroke-width="7" stroke-linecap="round"/>
    <path id="{pid}-frown" opacity="0" d="M-24,56 Q0,36 24,56" fill="none" stroke="{OUT}" stroke-width="7" stroke-linecap="round"/>
    <ellipse id="{pid}-oh" opacity="0" cx="0" cy="50" rx="13" ry="17" fill="#5a1f1f" stroke="{OUT}" stroke-width="6"/>
    <path id="{pid}-grin" opacity="0" d="M-36,34 Q0,84 36,34 Z" fill="#fff" stroke="{OUT}" stroke-width="6" stroke-linejoin="round"/>
    <path id="{pid}-sweat" opacity="0" d="M86,-58 Q104,-30 86,-20 Q68,-30 86,-58 Z" fill="#8fd3ff" stroke="{OUT}" stroke-width="4"/>
  </g>
</g></g>'''


# The user picked the modern flat character (characters.py) on 2026-11-18.
import sys as _sys
_sys.path.insert(0, os.path.dirname(HERE))
from characters import flat as dev  # noqa: E402


def nexbot(pid, x, y, s=1.0):
    return f'<g transform="translate({x},{y}) scale({s})"><image id="{pid}" opacity="0" href="assets/nex.svg" x="-130" y="-130" width="260" height="260"/></g>'


def popup(pid, x, y, w, h, title, lines, kind="ok"):
    bar = {"ok": "#1d222b", "err": "#5b1d24", "good": "#17432c"}[kind]
    tc = {"ok": "#cfd6e2", "err": "#ffb3ad", "good": "#9df0bf"}[kind]
    body = "".join(
        f'<text x="{-w / 2 + 28}" y="{-h / 2 + 96 + i * 44}" font-size="30" fill="#e6eaf1" font-family="JetBrains Mono, monospace">{html.escape(l)}</text>'
        for i, l in enumerate(lines)
    )
    return f'''<g transform="translate({x},{y})"><g id="{pid}" opacity="0">
  <rect x="{-w / 2}" y="{-h / 2}" width="{w}" height="{h}" rx="18" fill="#161a21" stroke="{OUT}" stroke-width="6"/>
  <rect x="{-w / 2 + 3}" y="{-h / 2 + 3}" width="{w - 6}" height="47" rx="15" fill="{bar}"/>
  <circle cx="{-w / 2 + 30}" cy="{-h / 2 + 26}" r="8" fill="#ff5f57"/><circle cx="{-w / 2 + 56}" cy="{-h / 2 + 26}" r="8" fill="#febc2e"/><circle cx="{-w / 2 + 82}" cy="{-h / 2 + 26}" r="8" fill="#28c840"/>
  <text x="0" y="{-h / 2 + 35}" font-size="26" font-weight="700" fill="{tc}" text-anchor="middle" {FONT}>{html.escape(title)}</text>
  {body}
</g></g>'''


def svg(sid, inner, bg):
    return f'''<svg class="scene-svg" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
<g id="{sid}-cam">{inner}</g>
</svg>'''


def room(pid, extra_front=""):
    papers = "".join(
        f'<g transform="translate(800,960)"><g id="{pid}-paper{i}" opacity="0"><rect x="-32" y="-42" width="64" height="84" rx="6" fill="#f4f1ea" stroke="{OUT}" stroke-width="5"/>'
        f'<path d="M-18,-22 H18 M-18,-6 H18 M-18,10 H10" stroke="#9aa3b2" stroke-width="5"/></g></g>'
        for i in range(8)
    )
    return f'''
<ellipse cx="800" cy="1330" rx="470" ry="34" fill="#000" opacity=".35"/>
{dev(pid + "-dev", 800, 790)}
<path id="{pid}-glow" opacity="0" d="M670,905 L930,905 L1150,520 L450,520 Z" fill="#bcd6ff"/>
<rect x="370" y="1030" width="860" height="44" rx="10" fill="#9b6a43" stroke="{OUT}" stroke-width="{SW}"/>
<rect x="400" y="1074" width="800" height="250" fill="#6e4a2f" stroke="{OUT}" stroke-width="{SW}"/>
<path d="M640,1034 L960,1034 L940,1012 L660,1012 Z" fill="#aeb4be" stroke="{OUT}" stroke-width="6" stroke-linejoin="round"/>
<rect x="650" y="880" width="300" height="140" rx="14" fill="#d5d9e0" stroke="{OUT}" stroke-width="{SW}"/>
<circle cx="800" cy="950" r="12" fill="#bfc5ce"/>
<g transform="translate(1110,990)"><rect x="-34" y="-44" width="68" height="84" rx="10" fill="#e8ecf2" stroke="{OUT}" stroke-width="6"/><path d="M34,-24 q30,0 30,22 q0,22 -30,22" fill="none" stroke="{OUT}" stroke-width="6"/></g>
<rect id="{pid}-night" x="0" y="0" width="1600" height="1600" fill="#050914" opacity="0"/>
{papers}
{extra_front}'''


def laptop_front(pid, x, y, s, screen_inner, label=""):
    """Open laptop seen from the front. Screen 360x226 above the hinge at y=0."""
    return f'''<g transform="translate({x},{y}) scale({s})"><g id="{pid}" opacity="0">
  <rect x="-200" y="-260" width="400" height="260" rx="18" fill="#2a2f38" stroke="{OUT}" stroke-width="{SW}"/>
  <rect x="-180" y="-243" width="360" height="226" rx="6" fill="#0f1114"/>
  <g>{screen_inner}</g>
  <path d="M-250,0 H250 L230,26 H-230 Z" fill="#c9ced6" stroke="{OUT}" stroke-width="{SW}" stroke-linejoin="round"/>
  {label}
</g></g>'''


def check(pid, x, y, r=38):
    return f'<g transform="translate({x},{y})"><g id="{pid}" opacity="0"><circle r="{r}" fill="#2fa865" stroke="{OUT}" stroke-width="6"/><path d="M{-r * .45},0 L{-r * .1},{r * .35} L{r * .5},{-r * .35}" fill="none" stroke="#fff" stroke-width="{r * .22}" stroke-linecap="round" stroke-linejoin="round"/></g></g>'


# ---------------------------------------------------------------- scenes
def scene_at(li):
    return round(S[li] - 0.1, 3) if li else 0


ORDER = [("sc-room", 0), ("sc-reveal", 4), ("sc-stack", 5), ("sc-nex", 6), ("sc-host", 7),
         ("sc-macs", 8), ("sc-os", 9), ("sc-price", 10), ("sc-end", 11)]
SC = {}
for k, (sid, li) in enumerate(ORDER):
    st = scene_at(li)
    en = scene_at(ORDER[k + 1][1]) if k + 1 < len(ORDER) else TOTAL
    SC[sid] = (st, round(en - st, 3))

DARK = ("#1e2b47", "#0b0f17")
BLUE = ("#26407a", "#0b0f17")

# 1-4: the room story
room_front = (
    popup("r-folder", 600, 560, 360, 200, "Finder", ["my-php-setup/", "  httpd.conf", "  php.ini"])
    + popup("r-e1", 600, 470, 400, 170, "Terminal", ["brew install php", "Error: failed"], "err")
    + popup("r-e2", 1010, 580, 380, 170, "Terminal", ["brew services", "Permission denied"], "err")
    + popup("r-e3", 800, 380, 440, 170, "Terminal", ["httpd.conf: line 52", "Syntax error"], "err")
    + popup("r-apache", 800, 520, 520, 170, "Apache", ["apachectl start", "(48) Address in use"], "err")
    + "".join(f'<g transform="translate({600 + (i - 2) * 80},560)"><circle id="r-puff{i}" r="44" fill="#e6eaf1" opacity="0"/></g>' for i in range(5))
)
sc_room = svg("sc-room", room("r", room_front), DARK)

# 5: reveal
rays = "".join(
    f'<path d="M800,800 L{800 + 1400 * math.cos(a * 0.2618):.0f},{800 + 1400 * math.sin(a * 0.2618):.0f} L{800 + 1400 * math.cos(a * 0.2618 + 0.13):.0f},{800 + 1400 * math.sin(a * 0.2618 + 0.13):.0f} Z" fill="#3a5fb0" opacity=".25"/>'
    for a in range(24)
)
sc_reveal = svg("sc-reveal", f'''
<g id="rv-rays" opacity="0">{rays}</g>
<g transform="translate(800,700)"><g id="rv-logo" opacity="0"><image href="assets/nexdb-logo.png" x="-170" y="-170" width="340" height="340"/></g></g>
<text id="rv-word" opacity="0" x="800" y="1010" text-anchor="middle" font-size="190" font-weight="800" fill="#fff" {FONT} letter-spacing="-6">NexDB</text>
''', BLUE)


# 6: the stack
def svc(pid, x, y, name, color, letter):
    return f'''<g transform="translate({x},{y})"><g id="{pid}" opacity="0">
  <rect x="-110" y="-110" width="220" height="220" rx="40" fill="{color}" stroke="{OUT}" stroke-width="8"/>
  <text y="34" text-anchor="middle" font-size="100" font-weight="800" fill="#fff" {FONT}>{letter}</text>
  <text y="164" text-anchor="middle" font-size="46" font-weight="700" fill="#fff" {FONT}>{name}</text>
</g></g>'''


lights = "".join(
    f'<g transform="translate(0,{-60 + i * 62})"><text x="-190" y="12" font-size="34" font-weight="600" fill="#e6eaf1" {FONT}>{n}</text>'
    f'<circle id="st-l{i}" cx="190" cy="0" r="16" fill="#3a4150"/></g>'
    for i, n in enumerate(["Apache", "PHP", "MySQL", "Node"])
)
sc_stack = svg("sc-stack", f'''
{svc("st-a", 540, 480, "Apache", "#c7462f", "A")}
{svc("st-p", 1060, 480, "PHP", "#6f7fd1", "P")}
{svc("st-m", 540, 900, "MySQL", "#2f7ea1", "M")}
{svc("st-n", 1060, 900, "Node", "#4f9a3c", "N")}
<g transform="translate(800,690)"><g id="st-win" opacity="0">
  <rect x="-280" y="-260" width="560" height="520" rx="30" fill="#161a21" stroke="{OUT}" stroke-width="8"/>
  <rect x="-276" y="-256" width="552" height="60" rx="26" fill="#1d222b"/>
  <circle cx="-240" cy="-226" r="10" fill="#ff5f57"/><circle cx="-208" cy="-226" r="10" fill="#febc2e"/><circle cx="-176" cy="-226" r="10" fill="#28c840"/>
  <image href="assets/nexdb-logo.png" x="-34" y="-250" width="48" height="48"/>
  <text x="26" y="-214" font-size="30" font-weight="700" fill="#cfd6e2" {FONT}>NexDB</text>
  <g transform="translate(0,-40)">{lights}</g>
  <g transform="translate(0,190)"><g id="st-btn"><rect x="-150" y="-46" width="300" height="92" rx="20" fill="#2f6ae0" stroke="{OUT}" stroke-width="6"/>
  <text y="16" text-anchor="middle" font-size="44" font-weight="800" fill="#fff" {FONT}>Start all</text></g></g>
</g></g>
<g transform="translate(1100,1090)"><g id="st-cursor" opacity="0"><path d="M0,0 L0,92 L24,70 L42,110 L60,102 L42,62 L74,60 Z" fill="#fff" stroke="{OUT}" stroke-width="6" stroke-linejoin="round"/></g></g>
''', DARK)

# 7: Nex fixes it (Nex pops out of the laptop)
nex_front = (
    popup("nx-warn", 800, 470, 500, 170, "Problem", ["Port 80 is busy", "Apache can't start"], "err")
    + popup("nx-ok", 800, 470, 500, 170, "Fixed", ["Port 80 is free", "Apache is running"], "good")
    + nexbot("nx-bot", 1050, 800, 1.0)
    + f'''<g transform="translate(1000,620)"><g id="nx-bubble" opacity="0"><path d="M-200,-80 H200 Q220,-80 220,-60 V40 Q220,60 200,60 H60 L30,100 L20,60 H-200 Q-220,60 -220,40 V-60 Q-220,-80 -200,-80 Z" fill="#fff" stroke="{OUT}" stroke-width="6"/>
<text y="-14" text-anchor="middle" font-size="34" font-weight="700" fill="{OUT}" {FONT}>Another app uses port 80.</text>
<text y="32" text-anchor="middle" font-size="34" font-weight="800" fill="{OUT}" {FONT}>Fix it for you?</text></g></g>'''
)
sc_nex = svg("sc-nex", room("n", nex_front), DARK)

# 8: NexHost: the laptop beams the site to phones and the world
site = f'''<rect x="-160" y="-230" width="320" height="34" rx="6" fill="#1d222b"/><circle cx="-140" cy="-213" r="7" fill="#5ccb8b"/><text x="-124" y="-205" font-size="20" fill="#e6eaf1" {FONT}>shop is live</text>
<rect x="-160" y="-186" width="320" height="76" rx="8" fill="#2f6ae0" opacity=".85"/><rect x="-160" y="-100" width="152" height="72" rx="8" fill="#3a4150"/><rect x="8" y="-100" width="152" height="72" rx="8" fill="#3a4150"/>'''


def device(pid, x, y, kind):
    if kind == "phone":
        body = f'<rect x="-52" y="-92" width="104" height="184" rx="18" fill="#2a2f38" stroke="{OUT}" stroke-width="6"/><rect x="-40" y="-74" width="80" height="140" rx="6" fill="#2f6ae0" opacity=".85"/>'
    else:
        body = f'<circle r="84" fill="#2f7ea1" stroke="{OUT}" stroke-width="6"/><path d="M-84,0 H84 M0,-84 Q-52,0 0,84 M0,-84 Q52,0 0,84 M-70,-42 H70 M-70,42 H70" fill="none" stroke="#bfe3f5" stroke-width="5"/>'
    return f'<g transform="translate({x},{y})"><g id="{pid}" opacity="0">{body}</g></g>'


DEV_AT = [(480, 520), (800, 430), (1120, 520)]
beams = "".join(
    f'<path id="hs-b{i}" d="M800,720 Q{(800 + x) / 2:.0f},{min(720, y) - 120} {x},{y + 90}" fill="none" stroke="#9df0bf" stroke-width="9" stroke-linecap="round" stroke-dasharray="22 18" opacity="0"/>'
    for i, (x, y) in enumerate(DEV_AT)
)
sc_host = svg("sc-host", f'''
{beams}
{"".join(device(f"hs-d{i}", x, y, "globe" if i == 1 else "phone") for i, (x, y) in enumerate(DEV_AT))}
{laptop_front("hs-lap", 800, 1060, 1.3, site)}
''', DARK)

# 9: Apple Silicon and Intel
chip = lambda txt, color: f'<rect x="-70" y="-200" width="140" height="140" rx="18" fill="{color}" stroke="{OUT}" stroke-width="6"/><text y="-108" text-anchor="middle" font-size="60" font-weight="800" fill="#fff" {FONT}>{txt}</text>'
lab = lambda txt: f'<text y="100" text-anchor="middle" font-size="48" font-weight="800" fill="#fff" {FONT}>{txt}</text>'
sc_macs = svg("sc-macs", f'''
{laptop_front("mc-l", 590, 900, 0.78, chip("M1", "#3a4150"), lab("Apple Silicon"))}
{laptop_front("mc-r", 1010, 900, 0.78, chip("i5", "#2f6ae0"), lab("Intel"))}
<g transform="translate(1110,690) rotate(-10)"><g id="mc-2018" opacity="0"><rect x="-90" y="-40" width="180" height="80" rx="12" fill="#f5e6c8" stroke="{OUT}" stroke-width="6"/><text y="20" text-anchor="middle" font-size="54" font-weight="800" fill="{OUT}" {FONT}>2018</text></g></g>
<g id="mc-web" opacity="0"><path d="M1150,700 L1196,700 L1196,746 M1150,700 L1196,746 M1168,700 Q1182,716 1196,716 M1182,700 Q1190,712 1196,734" fill="none" stroke="#e6eaf1" stroke-width="3"/></g>
{check("mc-c1", 735, 700)}{check("mc-c2", 870, 700)}
''', DARK)

# 10: macOS 13 stamp
sc_os = svg("sc-os", f'''
<g transform="translate(800,760) rotate(-6) scale(0.74)"><g id="os-stamp" opacity="0">
  <rect x="-390" y="-170" width="780" height="340" rx="40" fill="none" stroke="#fff" stroke-width="18"/>
  <text y="-20" text-anchor="middle" font-size="150" font-weight="800" fill="#fff" {FONT} letter-spacing="-4">macOS 13</text>
  <text y="110" text-anchor="middle" font-size="76" font-weight="700" fill="#cfd6e2" {FONT}>or newer</text>
</g></g>
''', BLUE)

# 11: price: calendar + tag
pages = "".join(
    f'<g id="pr-page{i}"><rect x="-200" y="-150" width="400" height="330" rx="20" fill="#f4f1ea" stroke="{OUT}" stroke-width="7"/>'
    f'<rect x="-200" y="-150" width="400" height="80" rx="20" fill="#d64545" stroke="{OUT}" stroke-width="7"/>'
    f'<text y="-92" text-anchor="middle" font-size="40" font-weight="800" fill="#fff" {FONT}>DAYS FREE</text>'
    f'<text y="110" text-anchor="middle" font-size="170" font-weight="800" fill="{OUT}" {FONT}>{n}</text></g>'
    for i, n in reversed(list(enumerate(["1", "7", "14"])))
)
sc_price = svg("sc-price", f'''
<g transform="translate(800,560)"><g id="pr-cal" opacity="0">{pages}</g></g>
<g transform="translate(800,870)"><g id="pr-tag" opacity="0">
  <path d="M-20,-70 V0" stroke="#e6eaf1" stroke-width="5"/>
  <path d="M-190,0 H130 L190,90 L130,180 H-190 Z" fill="#f5e6c8" stroke="{OUT}" stroke-width="8" stroke-linejoin="round"/>
  <circle cx="140" cy="90" r="14" fill="#141925" stroke="{OUT}" stroke-width="5"/>
  <text x="-30" y="124" text-anchor="middle" font-size="104" font-weight="800" fill="{OUT}" {FONT}>₱299</text>
</g></g>
''', DARK)

# 12: end card: logo, URL, the developer waving next to Nex
sc_end = svg("sc-end", f'''
<g transform="translate(800,520)"><g id="en-logo" opacity="0"><image href="assets/nexdb-logo.png" x="-110" y="-110" width="220" height="220"/></g></g>
<text id="en-url" opacity="0" x="800" y="760" text-anchor="middle" font-size="100" font-weight="800" fill="#fff" {FONT}>db.nexiodev.site</text>
<text id="en-sub" opacity="0" x="800" y="840" text-anchor="middle" font-size="44" font-weight="600" fill="#9aa3b2" {FONT}>NexDB for Mac and Windows</text>
{dev("en-dev", 650, 950, 0.72)}
{nexbot("en-bot", 960, 1010, 0.85)}
''', BLUE)

SCENE_SVGS = {"sc-room": sc_room, "sc-reveal": sc_reveal, "sc-stack": sc_stack, "sc-nex": sc_nex, "sc-host": sc_host,
              "sc-macs": sc_macs, "sc-os": sc_os, "sc-price": sc_price, "sc-end": sc_end}

# ---------------------------------------------------------------- audio
BEAT, T0 = 0.48387, 9.458
drop = T0 + 316 * BEAT
music_start = round(drop - S[4], 3)

SFX = []  # (file, time, volume)


def sfx(name, t, v=0.5):
    SFX.append((name, round(t, 3), v))


sfx("sfx/typing", S[0] + 0.2, 0.35)
sfx("sfx/pop", S[0] + 4.2, 0.6)
sfx("sfx/sweat", S[0] + 4.4, 0.4)
for k in range(3):
    sfx("sfx/buzz", S[1] + 0.1 + k * 0.55, 0.45)
sfx("swoosh-quick", S[1] + 2.5, 0.35)
sfx("sfx/tick", S[2] + 0.1, 0.45)
sfx("sfx/buzz", S[2] + 2.6, 0.5)
sfx("sfx/thud", S[2] + 3.6, 0.5)
sfx("sfx/ding", S[3] + 0.5, 0.55)
sfx("swoosh-quick", S[4] - 0.1, 0.3)
sfx("impact-deep-whoosh", S[4] - 0.03, 0.3)
for off in (0.05, 0.8, 1.3, 2.3):
    sfx("sfx/pop", S[5] + off, 0.55)
sfx("swoosh-quick", S[5] + 3.0, 0.35)
sfx("sfx/click", S[5] + 6.0, 0.7)
sfx("sfx/chime", S[5] + 6.15, 0.5)
sfx("sfx/buzz", S[6] + 0.15, 0.45)
sfx("sfx/pop", S[6] + 1.2, 0.6)
sfx("sfx/click", S[6] + D[6] - 1.6, 0.6)
sfx("sfx/chime", S[6] + D[6] - 1.45, 0.5)
sfx("swoosh-quick", S[7] + 0.5, 0.3)
for k in range(3):
    sfx("sfx/pop", S[7] + 1.0 + k * 0.35, 0.5)
sfx("sfx/pop", S[8] + 0.2, 0.45)
sfx("sfx/ding", S[8] + 1.0, 0.4)
sfx("sfx/pop", S[8] + 1.8, 0.45)
sfx("sfx/ding", S[8] + 2.6, 0.4)
sfx("sfx/thud", S[8] + 3.7, 0.5)
sfx("sfx/thud", S[9] + 0.9, 0.65)
for k in range(2):
    sfx("sfx/pop", S[10] + 0.3 + k * 0.45, 0.35)
sfx("sfx/thud", S[10] + D[10] * 0.55, 0.55)
sfx("sfx/chime", S[11] + 0.05, 0.45)

audio_html = "\n".join(
    [f'<audio id="music" src="assets/bgm-tech-house.mp3" data-start="0" data-duration="{TOTAL}" data-media-start="{music_start}" data-volume="0.06" data-fade-in="0.5" data-fade-out="2" data-track-index="10"></audio>']
    + [f'<audio id="vo{i + 1}" src="assets/vo/line{i + 1:02d}.mp3" data-start="{S[i]}" data-duration="{D[i]}" data-volume="1" data-track-index="{20 + i}"></audio>' for i in range(12)]
    + [f'<audio id="fx{k}" src="assets/{n}.mp3" data-start="{t}" data-duration="{2.0 if "tick" in n else 1.4}" data-volume="{v}" data-track-index="{40 + k}"></audio>' for k, (n, t, v) in enumerate(SFX)]
)

# ---------------------------------------------------------------- animation (plain JS; S, D, CAPS are injected)
JS = r"""
const tl = gsap.timeline({ paused: true });
// 3D background clock: bg3d.js renders one frame per update
tl.to(window.__bg.clock, { t: TOTAL, duration: TOTAL, ease: "none", onUpdate: () => window.__bg.render && window.__bg.render(window.__bg.clock.t) }, 0);
const C ={ transformOrigin: "50% 50%" };
const pop = (sel, t, dur = 0.4) => tl.fromTo(sel, { opacity: 0, scale: 0.3, ...C }, { opacity: 1, scale: 1, duration: dur, ease: "back.out(2.2)", ...C }, t);
const out = (sel, t, dur = 0.25) => tl.to(sel, { opacity: 0, scale: 0.6, duration: dur, ease: "power2.in", ...C }, t);
const face = (p, t, eyes, mouth) => {
  tl.set(`#${p}-eyes`, { opacity: eyes === "n" ? 1 : 0 }, t);
  tl.set(`#${p}-eyesW`, { opacity: eyes === "w" ? 1 : 0 }, t);
  for (const m of ["smile", "frown", "oh", "grin"]) tl.set(`#${p}-${m}`, { opacity: m === mouth ? 1 : 0 }, t);
};
const HEAD = { transformOrigin: "50% 100%" };
const ARM = { transformOrigin: "50% 8%" };

// captions
CAPS.forEach(([a, b], i) => {
  tl.fromTo("#cap" + i, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.14, ease: "back.out(2)" }, a);
  tl.set("#cap" + i, { opacity: 0 }, b);
});

// ---- 1-4 the room
const P = "r-dev";
tl.fromTo("#sc-room-cam", { scale: 1, svgOrigin: "800 800" }, { scale: 1.05, svgOrigin: "800 800", duration: S[4], ease: "sine.inOut" }, 0);
tl.set("#r-folder", { opacity: 1 }, 0);
tl.to(`#${P}-head`, { rotation: 4, duration: 0.5, yoyo: true, repeat: 7, ease: "sine.inOut", ...HEAD }, 0.3);
tl.to(`#${P}-armL`, { rotation: 7, duration: 0.12, yoyo: true, repeat: 11, ...ARM }, 0.3);
tl.to(`#${P}-armR`, { rotation: -7, duration: 0.12, yoyo: true, repeat: 11, ...ARM }, 0.36);
// "...and your PHP setup is gone"
const tg = S[0] + 4.2;
out("#r-folder", tg, 0.2);
for (let i = 0; i < 5; i++) tl.fromTo("#r-puff" + i, { opacity: 0.9, scale: 0.2, ...C }, { immediateRender: false, opacity: 0, scale: 1.6, duration: 0.6, ease: "power2.out", ...C }, tg + i * 0.03);
face(P, tg + 0.15, "w", "oh");
tl.fromTo(`#${P}-head`, { y: 0 }, { y: -18, duration: 0.15, yoyo: true, repeat: 1 }, tg + 0.15);
// Homebrew errors
pop("#r-e1", S[1] + 0.1); pop("#r-e2", S[1] + 0.65); pop("#r-e3", S[1] + 1.2);
face(P, S[1] + 0.5, "n", "frown");
tl.to(`#${P}-sweat`, { opacity: 1, duration: 0.2 }, S[1] + 0.5);
tl.fromTo(`#${P}-sweat`, { y: 0 }, { y: 26, duration: 0.9, repeat: 4, ease: "power1.in" }, S[1] + 0.5);
// config files everywhere
const papers = [[-330, -330, -40], [330, -360, 30], [-200, -520, 15], [300, -120, -25], [-360, -60, 50], [160, -560, -60], [380, 40, 20], [-380, 60, -35]];
papers.forEach(([x, y, r], i) => tl.fromTo("#r-paper" + i, { opacity: 1, x: 0, y: 0, rotation: 0, scale: 0.3, ...C }, { immediateRender: false, x, y, rotation: r * 4, scale: 1.2, duration: 0.8, ease: "power3.out", ...C }, S[1] + 2.5 + i * 0.06));
// three hours later
out("#r-e1, #r-e2, #r-e3", S[2] - 0.1, 0.2);
tl.to("#r-night", { opacity: 0.3, duration: 2.0 }, S[2] + 0.2);
pop("#r-apache", S[2] + 2.6);
tl.to(`#${P}-head`, { rotation: 14, y: 34, duration: 0.5, ease: "power2.in", ...HEAD }, S[2] + 3.2);
// then you find this
out("#r-apache", S[3] - 0.05, 0.2);
tl.to("#r-night", { opacity: 0.1, duration: 0.6 }, S[3]);
tl.fromTo("#r-glow", { opacity: 0 }, { opacity: 0.42, duration: 0.6, ease: "power2.out" }, S[3] + 0.4);
tl.to(`#${P}-head`, { rotation: 0, y: -10, duration: 0.35, ease: "back.out(2)", ...HEAD }, S[3] + 0.5);
face(P, S[3] + 0.55, "w", "grin");
tl.to(`#${P}-sweat`, { opacity: 0, duration: 0.2 }, S[3] + 0.5);

// ---- 5 reveal
tl.fromTo("#rv-rays", { opacity: 0, rotation: 0, svgOrigin: "800 800" }, { opacity: 1, rotation: 25, svgOrigin: "800 800", duration: D[4] + 0.4, ease: "none" }, S[4] - 0.1);
pop("#rv-logo", S[4] - 0.05, 0.5);
tl.fromTo("#rv-word", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, S[4] + 0.3);

// ---- 6 the stack
[["#st-a", 0.05, -260, -200], ["#st-p", 0.8, 260, -200], ["#st-m", 1.3, -260, 200], ["#st-n", 2.3, 260, 200]].forEach(([s, o, x, y]) =>
  tl.fromTo(s, { opacity: 0, x, y, scale: 0.4, rotation: x > 0 ? 25 : -25, ...C }, { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, duration: 0.45, ease: "back.out(1.8)", ...C }, S[5] + o));
const t1 = S[5] + 3.0;
[["#st-a", 260, 220], ["#st-p", -260, 220], ["#st-m", 260, -220], ["#st-n", -260, -220]].forEach(([s, x, y]) =>
  tl.to(s, { x, y, scale: 0, opacity: 0, duration: 0.45, ease: "power3.in", ...C }, t1));
pop("#st-win", t1 + 0.35, 0.5);
tl.fromTo("#st-cursor", { opacity: 0, x: 120, y: 160 }, { opacity: 1, x: 0, y: 0, duration: 0.25 }, S[5] + 4.6);
tl.to("#st-cursor", { x: -260, y: -200, duration: 1.0, ease: "power2.inOut" }, S[5] + 4.9);
tl.to("#st-btn", { scale: 0.9, duration: 0.08, yoyo: true, repeat: 1, ...C }, S[5] + 6.0);
for (let i = 0; i < 4; i++) tl.to("#st-l" + i, { attr: { fill: "#5ccb8b" }, duration: 0.1 }, S[5] + 6.1 + i * 0.12);

// ---- 7 Nex fixes it
const N = "n-dev";
pop("#nx-warn", S[6] + 0.15);
tl.to("#nx-warn", { x: 8, duration: 0.05, yoyo: true, repeat: 7 }, S[6] + 0.55);
face(N, S[6] + 0.3, "w", "oh");
tl.to(`#${N}-sweat`, { opacity: 1, duration: 0.2 }, S[6] + 0.3);
tl.fromTo("#nx-bot", { opacity: 0, y: 260, scale: 0.4, ...C }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(2)", ...C }, S[6] + 1.2);
tl.to("#nx-bot", { y: -14, duration: 0.6, yoyo: true, repeat: 5, ease: "sine.inOut" }, S[6] + 1.8);
pop("#nx-bubble", S[6] + 1.7);
const tf = S[6] + D[6] - 1.6;
out("#nx-bubble", tf - 0.1, 0.2);
out("#nx-warn", tf, 0.15);
pop("#nx-ok", tf + 0.15);
face(N, tf + 0.2, "w", "grin");
tl.to(`#${N}-sweat`, { opacity: 0, duration: 0.2 }, tf + 0.2);

// ---- 8 NexHost
pop("#hs-lap", S[7] - 0.05, 0.5);
for (let i = 0; i < 3; i++) {
  tl.fromTo("#hs-b" + i, { opacity: 0 }, { opacity: 1, duration: 0.2 }, S[7] + 0.6 + i * 0.35);
  tl.fromTo("#hs-b" + i, { attr: { "stroke-dashoffset": 0 } }, { attr: { "stroke-dashoffset": -400 }, duration: D[7], ease: "none" }, S[7] + 0.6);
  pop("#hs-d" + i, S[7] + 1.0 + i * 0.35);
}

// ---- 9 Macs
pop("#mc-l", S[8] + 0.2);
pop("#mc-c1", S[8] + 1.0, 0.35);
pop("#mc-r", S[8] + 1.8);
pop("#mc-c2", S[8] + 2.6, 0.35);
tl.fromTo("#mc-2018", { opacity: 0, scale: 2.2, ...C }, { opacity: 1, scale: 1, duration: 0.3, ease: "power4.in", ...C }, S[8] + 3.4);
tl.to("#mc-web", { opacity: 1, duration: 0.4 }, S[8] + 3.8);

// ---- 10 macOS 13
tl.fromTo("#os-stamp", { opacity: 0, scale: 2.4, ...C }, { opacity: 1, scale: 1, duration: 0.3, ease: "power4.in", ...C }, S[9] + 0.6);
tl.fromTo("#sc-os-cam", { x: -12 }, { x: 12, duration: 0.05, yoyo: true, repeat: 5 }, S[9] + 0.9);
tl.set("#sc-os-cam", { x: 0 }, S[9] + 1.2);

// ---- 11 price
pop("#pr-cal", S[10] - 0.05, 0.4);
tl.set("#pr-page0, #pr-page1", { transformOrigin: "50% 50%" }, 0);
for (let i = 0; i < 2; i++) tl.to("#pr-page" + i, { y: -500, rotation: i ? 30 : -30, opacity: 0, duration: 0.4, ease: "power2.in" }, S[10] + 0.3 + i * 0.45);
const tt = S[10] + D[10] * 0.55;
tl.fromTo("#pr-tag", { opacity: 0, y: -300 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.in" }, tt - 0.35);
tl.fromTo("#pr-tag", { rotation: 14, svgOrigin: "-20 -70" }, { rotation: 0, svgOrigin: "-20 -70", duration: 1.6, ease: "elastic.out(1, 0.3)" }, tt);

// ---- 12 end
pop("#en-logo", S[11] - 0.05, 0.45);
tl.fromTo("#en-url", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, S[11] + 0.2);
tl.fromTo("#en-sub", { opacity: 0 }, { opacity: 1, duration: 0.5 }, S[11] + 1.2);
face("en-dev", S[11] - 0.1, "n", "grin");
tl.fromTo("#en-dev-armR", { rotation: 0, ...ARM }, { rotation: -150, duration: 0.4, ease: "power2.out", ...ARM }, S[11] + 0.4);
tl.to("#en-dev-armR", { rotation: -120, duration: 0.3, yoyo: true, repeat: 13, ease: "sine.inOut", ...ARM }, S[11] + 0.8);
pop("#en-bot", S[11] + 0.6, 0.5);
tl.to("#en-bot", { y: -14, duration: 0.6, yoyo: true, repeat: 11, ease: "sine.inOut" }, S[11] + 1.2);

window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
tl.seek(0);
"""

caps_html = "\n".join(f'<div class="cap" id="cap{i}">{html.escape(c)}</div>' for i, (_, _, c) in enumerate(caps))


def page(mode):
    W, H = (1080, 1920) if mode == "tall" else (1920, 1080)
    res = "portrait" if mode == "tall" else "landscape"
    scenes = "\n".join(
        f'<section class="clip" id="{sid}" data-start="{SC[sid][0]}" data-duration="{SC[sid][1]}" data-track-index="{k}">{SCENE_SVGS[sid]}</section>'
        for k, (sid, _) in enumerate(ORDER)
    )
    fov = 50 if mode == "tall" else 32
    sc_js = "{" + ", ".join(f'"{k}": [{v[0]}, {v[1]}]' for k, v in SC.items()) + "}"
    js = (
        f"const S = {S};\nconst D = {D};\nconst TOTAL = {TOTAL};\nconst CAPS = {[[a, b] for a, b, _ in caps]};\n"
        f"window.__bg = {{ S, D, W: {W}, H: {H}, FOV: {fov}, SC: {sc_js}, clock: {{ t: 0 }}, render: null }};\n"
        "window.__hf = window.__hf || {};\nwindow.__hf.buildReady = window.__hf.buildReady || {};\n"
        "window.__hf.buildReady['main'] = new Promise((r) => { window.__bg.ready = r; });\n" + JS
    )
    return f'''<!doctype html>
<html lang="en" data-resolution="{res}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      /* Cartoon "NexDB for Mac" ad. Generated by mac/build.py - edit there, not here. */
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: {W}px; height: {H}px; overflow: hidden; background: #0b0f17; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Segoe UI", "Inter", Arial, sans-serif; color: #fff; background: #0b0f17; }}
      .clip {{ position: absolute; inset: 0; }}
      .scene-svg {{ position: absolute; inset: 0; width: 100%; height: 100%; display: block; }}
      /* Captions: plain white text with a dark outline, no box */
      .cap {{ position: absolute; left: 50px; right: 50px; text-align: center; font-weight: 900; color: #fff; opacity: 0; line-height: 1.04;
        text-shadow: 0 0 2px #000, 4px 4px 0 #0b0f17, -4px 4px 0 #0b0f17, 4px -4px 0 #0b0f17, -4px -4px 0 #0b0f17, 0 6px 0 #0b0f17, 0 8px 22px rgba(0,0,0,.6); }}
      .tall .cap {{ top: 1420px; font-size: 96px; }}
      .wide .cap {{ top: 890px; font-size: 76px; }}
    </style>
  </head>
  <body>
    <div id="root" class="{mode}" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
<canvas id="bg3d" style="position:absolute;inset:0;width:100%;height:100%;display:block"></canvas>
{audio_html}
{scenes}
      <div class="clip" id="captions" data-start="0" data-duration="{TOTAL}" data-track-index="15">
{caps_html}
      </div>
    </div>
    <script>
{js}
    </script>
    <script type="module" src="bg3d.js"></script>
  </body>
</html>
'''


with open(os.path.join(HERE, "index.html"), "w", encoding="utf-8") as f:
    f.write(page("tall"))

os.makedirs(WIDE, exist_ok=True)
for name in ("hyperframes.json", "package.json", "CLAUDE.md", "bg3d.js"):
    shutil.copy(os.path.join(HERE, name), os.path.join(WIDE, name))
with open(os.path.join(WIDE, "meta.json"), "w") as f:
    f.write('{"id":"mac-wide","name":"mac-wide"}')
shutil.copytree(os.path.join(HERE, "assets"), os.path.join(WIDE, "assets"), dirs_exist_ok=True)
with open(os.path.join(WIDE, "index.html"), "w", encoding="utf-8") as f:
    f.write(page("wide"))

print("total", TOTAL, "music_start", music_start, "captions", len(caps), "sfx", len(SFX))
