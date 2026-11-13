# Builds the "How to install NexDB" video in two shapes from one template:
#   install/index.html         (9:16, 1080x1920)
#   ../install-wide/index.html (16:9, 1920x1080)
# Explains why Windows SmartScreen and macOS Gatekeeper warn (NexDB is not code-signed yet, certificates
# cost money), then shows the clicks: Windows "More info" -> "Run anyway"; Mac drag to Applications ->
# "Done" -> System Settings > Privacy & Security -> "Open Anyway" -> password -> "Open Anyway".
# Layers, back to front: Three.js world (bgcalm.js) -> HTML dialogs in a 960x720 #box -> captions.
# No character, no voice (voice-lines.txt holds lines that match the captions if the user records them).
# Run: python install/build.py   (from promo-hyperframes)
import html, os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
WIDE = os.path.join(os.path.dirname(HERE), "install-wide")

B = 0.48387
T0 = 9.458
WIN_AT = 17.2                       # music drop lands on the Windows part
TOTAL = 58.5
MUSIC_START = round(T0 + 316 * B - WIN_AT, 3)

CAPS = [
    (0.3, 3.4, "Installing NexDB? You might see a warning."),
    (3.7, 6.6, "NexDB isn't code-signed yet."),
    (6.7, 8.8, "Certificates cost money every year."),
    (8.9, 11.1, "We're a small team, so not yet."),
    (11.3, 14.3, "The warning means they don't know us yet."),
    (14.4, 17.0, "NexDB itself is safe to install."),
    (17.3, 19.8, "On Windows, open the installer."),
    (19.9, 22.6, "You'll see this blue screen."),
    (22.7, 25.0, "Click More info."),
    (25.1, 27.6, "Then click Run anyway."),
    (27.7, 31.0, "Done. It installs like any app."),
    (31.4, 34.2, "On Mac, drag NexDB to Applications."),
    (34.3, 37.4, "macOS blocks it the first time."),
    (37.5, 40.0, "Click Done. Not Move to Trash."),
    (40.1, 43.0, "Open System Settings, Privacy & Security."),
    (43.1, 45.8, "Scroll down. Click Open Anyway."),
    (45.9, 48.0, "Enter your Mac password."),
    (48.1, 50.4, "Click Open Anyway once more."),
    (50.5, 53.2, "Done! You only do this once."),
    (53.6, 57.9, "Only download NexDB from db.nexiodev.site"),
]

SFX = [  # (file, time, volume)
    ("swoosh-quick", 3.5, 0.3), ("sfx/pop", 3.9, 0.35), ("swoosh-quick", 11.1, 0.3), ("sfx/chime", 11.6, 0.3),
    ("impact-deep-whoosh", WIN_AT - 0.03, 0.35),
    ("sfx/click", 18.9, 0.5), ("sfx/click", 19.05, 0.5), ("sfx/buzz", 19.5, 0.25),
    ("sfx/click", 24.0, 0.55), ("sfx/pop", 24.2, 0.3),
    ("sfx/click", 26.8, 0.55), ("sfx/pop", 27.3, 0.3), ("sfx/chime", 29.9, 0.4),
    ("swoosh-quick", 31.1, 0.3), ("sfx/click", 32.4, 0.45), ("sfx/pop", 33.7, 0.35),
    ("sfx/click", 34.2, 0.45), ("sfx/click", 34.35, 0.45), ("sfx/thud", 34.6, 0.4),
    ("sfx/click", 39.2, 0.55), ("swoosh-quick", 39.8, 0.25),
    ("sfx/click", 41.0, 0.5), ("sfx/click", 45.0, 0.55), ("sfx/pop", 45.4, 0.3),
    ("sfx/typing", 46.0, 0.35), ("sfx/click", 47.2, 0.5), ("sfx/pop", 47.6, 0.3),
    ("sfx/click", 49.6, 0.55), ("sfx/chime", 50.1, 0.45),
    ("swoosh-quick", 53.3, 0.3), ("sfx/pop", 54.0, 0.4), ("sfx/ding", 55.0, 0.35),
]


# --- Voice-over (the user's ElevenLabs recordings, assets/vo/line01..12.mp3) -------------------------
# The scenes above were first timed without a voice. Every scene time is "old time"; warp() maps old time onto
# the voice: anchor k (start of the scene for line k) lands 0.2 s before line k starts, linear in between.
VO_TEXT = [
    "Installing NexDB? You might see a warning. Here's why.",
    "NexDB isn't code-signed yet. Those certificates cost money every year, and we're a small team.",
    "So Windows and macOS just don't know us yet. NexDB itself is safe to install.",
    "On Windows, open the installer. You'll see this blue screen.",
    "Click More info. Then click Run anyway.",
    "Done. It installs like any other app.",
    "On Mac, drag NexDB to Applications. The first time you open it, macOS blocks it.",
    "Click Done. Not Move to Trash.",
    "Open System Settings, then Privacy and Security. Scroll down and click Open Anyway.",
    "Enter your Mac password, then click Open Anyway once more.",
    "Done! You only do this once.",
    "Only download NexDB from db.nexiodev.site",
]
VO_DUR = [5.642, 7.967, 6.269, 4.833, 4.676, 3.082, 7.079, 3.553, 7.158, 5.146, 2.508, 4.754]
LEAD, GAP = 0.3, 0.25
VO_START = [LEAD]
for d in VO_DUR[:-1]:
    VO_START.append(round(VO_START[-1] + d + GAP, 3))
OLD = [0, 3.6, 11.2, 17.2, 22.7, 27.2, 31.2, 37.5, 39.9, 45.3, 50.0, 53.4, 58.5]
TOTAL = round(VO_START[-1] + VO_DUR[-1] + 2.2, 3)
NEW = [0] + [round(s - 0.2, 3) for s in VO_START[1:]] + [TOTAL]


def warp(t):
    for k in range(len(OLD) - 1):
        if t <= OLD[k + 1] or k == len(OLD) - 2:
            return round(NEW[k] + (t - OLD[k]) * (NEW[k + 1] - NEW[k]) / (OLD[k + 1] - OLD[k]), 3)


def chunks(text, start, dur):
    """Captions: at most 5 words, break at a sentence end or past 22 chars; time shared by character count."""
    out, cur = [], []
    for w in text.split():
        cur.append(w)
        if len(cur) >= 5 or w[-1] in ".?!," and len(" ".join(cur)) > 8 or len(" ".join(cur)) > 22:
            out.append(" ".join(cur)); cur = []
    if cur:
        out.append(" ".join(cur))
    total = sum(len(c) for c in out)
    res, t = [], start
    for c in out:
        d = dur * len(c) / total
        res.append((round(t, 3), round(t + d - 0.05, 3), c))
        t += d
    return res


CAPS = [c for s, d, x in zip(VO_START, VO_DUR, VO_TEXT) for c in chunks(x, s, d)]
SFX = [(n, warp(t), round(v * 0.5, 3)) for n, t, v in SFX]
MUSIC_START = round(T0 + 316 * B - warp(WIN_AT), 3)

DUR = {"sfx/click": 0.1, "sfx/pop": 0.25, "swoosh-quick": 0.78, "sfx/chime": 1.2, "sfx/buzz": 0.5}

LAYOUT = {
    "tall": dict(W=1080, H=1920, FOV=50, box=(31, 330, 1.06)),
    "wide": dict(W=1920, H=1080, FOV=32, box=(480, 120, 1.0)),
}

LOGO = '<img src="assets/nexdb-logo.png" alt="" />'
MACDOTS = '<span class="dots"><i></i><i></i><i></i></span>'
WINCTL = '<span class="winctl"><b>&#8212;</b><b>&#9633;</b><b>&#10005;</b></span>'

CERT = '''<svg viewBox="0 0 200 200" width="200" height="200"><rect x="22" y="20" width="156" height="128" rx="12" fill="#f4f1ea"/>
<rect x="44" y="44" width="112" height="10" rx="5" fill="#9aa3b5"/><rect x="44" y="66" width="86" height="10" rx="5" fill="#c4cad6"/><rect x="44" y="88" width="96" height="10" rx="5" fill="#c4cad6"/>
<circle cx="140" cy="136" r="30" fill="#2f6ae0"/><path d="M122,160 L116,192 L132,182 L140,196 L148,182 L164,192 L158,160 Z" fill="#2f6ae0"/>
<circle cx="140" cy="136" r="18" fill="none" stroke="#fff" stroke-width="5"/></svg>'''

SHIELD = '''<svg viewBox="0 0 200 220" width="190" height="210"><path d="M100,10 L180,40 V110 Q180,180 100,212 Q20,180 20,110 V40 Z" fill="#5ccb8b"/>
<path d="M100,10 L180,40 V110 Q180,180 100,212 Z" fill="#45b077"/><path d="M62,112 L90,140 L142,84" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/></svg>'''

FOLDER = '''<svg viewBox="0 0 200 160" width="170" height="136"><path d="M10,30 Q10,16 24,16 H78 L94,32 H176 Q190,32 190,46 V140 Q190,152 176,152 H24 Q10,152 10,140 Z" fill="#3d8bf2"/>
<path d="M10,54 H190 V140 Q190,152 176,152 H24 Q10,152 10,140 Z" fill="#62a8ff"/><path d="M78,74 L100,122 L122,74 M88,98 H112" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'''

ARROW = '<svg viewBox="0 0 160 60" width="160" height="60"><path d="M10,30 H130 M106,8 L136,30 L106,52" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 0"/></svg>'

SET_ROWS = [("Location Services", "On"), ("Contacts", ""), ("Calendars", ""), ("Full Disk Access", "")]
PSID = ' id="set-ps"'
SET_SIDE = ["Wi-Fi", "Bluetooth", "Network", "General", "Appearance", "Privacy &amp; Security", "Desktop &amp; Dock", "Displays"]

box_html = f'''
<div id="box">
  <div class="panel" id="hook">{LOGO}<div class="p-title">Installing NexDB?</div><div class="p-sub">You might see a warning. Here&#8217;s why, and what to click.</div></div>

  <div class="panel" id="why1">{CERT}<div class="p-title">Code signing</div><div class="p-sub">A paid certificate, renewed every year. NexDB doesn&#8217;t have one yet.</div></div>

  <div class="panel" id="why2">{SHIELD}<div class="p-title">Safe to install</div><div class="p-sub">Same app, same code. Windows and macOS just don&#8217;t know us yet.</div></div>

  <div class="gwin" id="exp" data-layout-allow-occlusion>
    <div class="bar"><span class="wt">Downloads</span>{WINCTL}</div>
    <div class="exp-row" id="exp-file">{LOGO}<div><b>NexDB_0.5.9_x64-setup.exe</b><span>Application</span></div></div>
  </div>

  <div id="ss" data-layout-allow-occlusion>
    <div class="ss-x">&#10005;</div>
    <div class="ss-h">Windows protected your PC</div>
    <div class="ss-p">Microsoft Defender SmartScreen prevented an unrecognized app from starting. Running this app might put your PC at risk.</div>
    <div class="ss-more" id="ss-more">More info</div>
    <div class="ss-det" id="ss-det"><div><span>App:</span>NexDB_0.5.9_x64-setup.exe</div><div><span>Publisher:</span>Unknown publisher</div></div>
    <div class="ss-btns"><div class="wbtn" id="ss-run">Run anyway</div><div class="wbtn" id="ss-dont">Don&#8217;t run</div></div>
  </div>

  <div class="gwin" id="inst">
    <div class="bar"><span class="wt">NexDB 0.5.9 Setup</span>{WINCTL}</div>
    <div class="in-body">{LOGO}
      <div class="in-txt" id="in-txt">Installing NexDB&#8230;</div>
      <div class="in-done" id="in-done"><i>&#10003;</i>Installed. Opening NexDB.</div>
      <div class="in-bar"><div id="in-fill"></div></div>
    </div>
  </div>

  <div class="gwin mac" id="dmg">
    <div class="bar">{MACDOTS}<span class="wt">NexDB 0.5.9</span><span class="dots-sp"></span></div>
    <div class="dm-app" id="dm-app">{LOGO}<span>NexDB</span></div>
    <div class="dm-arrow">{ARROW}</div>
    <div class="dm-fold" id="dm-fold">{FOLDER}<span>Applications</span></div>
    <div class="dm-ghost" id="dm-ghost">{LOGO}</div>
  </div>

  <div class="mdlg" id="gk" data-layout-allow-occlusion>{LOGO}
    <div class="m-h">&#8220;NexDB&#8221; Not Opened</div>
    <div class="m-p">Apple could not verify &#8220;NexDB&#8221; is free of malware that may harm your Mac or compromise your privacy.</div>
    <div class="m-btn blue" id="gk-done">Done</div><div class="m-btn" id="gk-trash">Move to Trash</div>
  </div>

  <div class="swin" id="set" data-layout-allow-occlusion>
    <div class="sbar">{MACDOTS}</div>
    <div class="s-side">{"".join(f'<div class="s-si"{PSID if "Privacy" in n else ""}>{n}</div>' for n in SET_SIDE)}</div>
    <div class="s-main">
      <div class="s-h">Privacy &amp; Security</div>
      <div id="set-scroll">
        {"".join(f'<div class="s-row"><span>{a}</span><em>{b}</em></div>' for a, b in SET_ROWS)}
        <div class="s-sec">Security</div>
        <div class="s-row"><span>Allow applications from</span><em>App Store &amp; Known Developers</em></div>
        <div class="s-blk" id="set-blk"><span>&#8220;NexDB&#8221; was blocked to protect your Mac.</span><div class="s-btn" id="set-open">Open Anyway</div></div>
      </div>
    </div>
  </div>

  <div class="mdlg" id="pw" data-layout-allow-occlusion>
    <div class="lock">&#128274;</div>
    <div class="m-h">Privacy &amp; Security</div>
    <div class="m-p">Enter your password to allow this.</div>
    <div class="field">You</div>
    <div class="field" id="pw-f">{"".join(f'<i id="pd{k}"></i>' for k in range(8))}</div>
    <div class="m-btn blue" id="pw-ok">Modify Settings</div><div class="m-btn">Cancel</div>
  </div>

  <div class="mdlg" id="oc" data-layout-allow-occlusion>{LOGO}
    <div class="m-h">Open &#8220;NexDB&#8221;?</div>
    <div class="m-p">Only open apps you trust.</div>
    <div class="m-btn blue" id="oc-open">Open Anyway</div><div class="m-btn">Cancel</div>
  </div>

  <div class="gwin mac" id="nxw">
    <div class="bar">{MACDOTS}<span class="wt">NexDB</span><span class="dots-sp"></span></div>
    <div class="nx-body">{LOGO}<div><div class="nx-h">Your stack</div><div class="nx-btn">Start all</div></div></div>
  </div>

  <div class="panel" id="endcard">
    <img src="assets/nexdb-logo.png" alt="" id="e-logo" />
    <div id="e-title">Safe to install</div>
    <div id="e-sub">Download only from</div>
    <div id="e-url">db.nexiodev.site</div>
    <div id="e-trial">14-day free trial</div>
  </div>

  <svg class="cursor" id="cursor" viewBox="0 0 80 120" width="48" height="72"><path d="M4,4 L4,96 L28,74 L46,114 L64,106 L46,66 L78,64 Z" fill="#fff" stroke="#1b1f27" stroke-width="6" stroke-linejoin="round"/></svg>
</div>
<div class="oslabel" id="os-win">Windows</div>
<div class="oslabel" id="os-mac">Mac</div>
'''

JS = r"""
const tl = gsap.timeline({ paused: true });
tl.to(window.__bg.clock, { t: TOTAL, duration: TOTAL, ease: "none", onUpdate: () => window.__bg.render && window.__bg.render(window.__bg.clock.t) }, 0);
const C = { transformOrigin: "50% 50%" };
const $ = (id) => document.getElementById(id);
const box = $("box");
// point inside an element, in #box coordinates (offsets ignore transforms, so tweens don't move targets)
const P = (id, fx = 0.5, fy = 0.55) => { let el = $(id), x = el.offsetWidth * fx, y = el.offsetHeight * fy; while (el && el !== box) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; } return [x, y]; };
const show = (id, t, d = 0.4) => tl.fromTo("#" + id, { opacity: 0, scale: 0.9, y: 30, ...C }, { opacity: 1, scale: 1, y: 0, duration: d, ease: "back.out(1.6)", ...C }, t);
const hide = (id, t) => tl.to("#" + id, { opacity: 0, scale: 0.95, duration: 0.25, ease: "power2.in", ...C }, t);
const move = (id, t, d = 0.6, dy = 0) => { const [x, y] = P(id); tl.to("#cursor", { x, y: y + dy, duration: d, ease: "power2.inOut" }, t); };
const press = (id, t) => { tl.to("#" + id, { scale: 0.93, duration: 0.07, yoyo: true, repeat: 1, ...C }, t); tl.to("#cursor", { scale: 0.85, duration: 0.07, yoyo: true, repeat: 1, transformOrigin: "5% 5%" }, t); };
const label = (id, a, b) => { tl.fromTo("#" + id, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, a); tl.to("#" + id, { opacity: 0, duration: 0.25 }, b); };

CAPS.forEach(([a, b], i) => {
  tl.fromTo("#cap" + i, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.15, ease: "back.out(2)" }, a);
  tl.set("#cap" + i, { opacity: 0 }, b);
});

// scene times below are "old time" (before the voice); map them onto the voice timeline
const WP = (t) => { for (let k = 0; k < OLD.length - 1; k++) if (t <= OLD[k + 1] || k === OLD.length - 2) return NEW[k] + (t - OLD[k]) * (NEW[k + 1] - NEW[k]) / (OLD[k + 1] - OLD[k]); };
const fixD = (v, p) => { if (v && typeof v.duration === "number" && v.duration > 0.5) v.duration = WP(p + v.duration) - WP(p); return v; };
const _to = tl.to.bind(tl), _from = tl.fromTo.bind(tl), _set = tl.set.bind(tl);
tl.to = (a, v, p) => _to(a, fixD(v, p), WP(p));
tl.fromTo = (a, f, v, p) => _from(a, f, fixD(v, p), WP(p));
tl.set = (a, v, p) => _set(a, v, WP(p));

// 1: hook, why
show("hook", 0.1, 0.6); hide("hook", 3.45);
show("why1", 3.7); hide("why1", 11.0);
tl.fromTo("#why1 svg", { rotation: -8, ...C }, { rotation: 4, duration: 7, ease: "sine.inOut", ...C }, 3.7);
show("why2", 11.3); hide("why2", 16.9);
tl.fromTo("#why2 svg", { scale: 0.6, ...C }, { scale: 1, duration: 0.6, ease: "back.out(2.4)", ...C }, 11.5);

// 2: Windows
label("os-win", WIN_AT, 30.9);
show("exp", WIN_AT + 0.05);
const [fx, fy] = P("exp-file");
tl.fromTo("#cursor", { opacity: 0, x: fx + 180, y: fy + 200 }, { opacity: 1, x: fx + 160, y: fy + 180, duration: 0.2 }, 17.8);
move("exp-file", 18.1, 0.7);
press("exp-file", 18.9); press("exp-file", 19.05);
tl.to("#exp-file", { backgroundColor: "rgba(127,160,255,.25)", duration: 0.1 }, 18.9);
show("ss", 19.4, 0.35);
tl.to("#exp", { opacity: 0.35, duration: 0.3 }, 19.4);
move("ss-more", 22.9, 0.8);
press("ss-more", 24.0);
tl.to("#ss-more", { opacity: 0, duration: 0.12 }, 24.15);
tl.to("#ss-det, #ss-run", { opacity: 1, duration: 0.2 }, 24.2);
move("ss-run", 25.3, 0.8);
press("ss-run", 26.8);
hide("ss", 27.05); hide("exp", 27.1);
show("inst", 27.3);
tl.fromTo("#in-fill", { width: "0%" }, { width: "100%", duration: 2.4, ease: "power1.inOut" }, 27.4);
tl.to("#in-txt", { opacity: 0, duration: 0.15 }, 29.8);
tl.fromTo("#in-done", { opacity: 0, scale: 0.8, ...C }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.4)", ...C }, 29.9);
tl.to("#in-fill", { backgroundColor: "#5ccb8b", duration: 0.2 }, 29.9);
tl.to("#cursor", { opacity: 0, duration: 0.2 }, 30.4);
hide("inst", 31.0);

// 3: Mac - drag to Applications, blocked
label("os-mac", 31.3, 53.1);
show("dmg", 31.3);
const [ax, ay] = P("dm-app", 0.5, 0.4), [gx, gy] = P("dm-fold", 0.5, 0.45);
tl.set("#cursor", { x: ax + 150, y: ay + 160 }, 31.4);
tl.to("#cursor", { opacity: 1, duration: 0.2 }, 31.5);
tl.to("#cursor", { x: ax, y: ay, duration: 0.6, ease: "power2.inOut" }, 31.7);
tl.set("#dm-ghost", { opacity: 0.85 }, 32.4);
tl.to("#cursor", { x: gx, y: gy, duration: 1.1, ease: "power2.inOut" }, 32.5);
tl.to("#dm-ghost", { x: gx - ax, y: gy - ay, duration: 1.1, ease: "power2.inOut" }, 32.5);
tl.to("#dm-ghost", { opacity: 0, scale: 0.4, duration: 0.2, ...C }, 33.6);
tl.to("#dm-fold", { scale: 1.12, duration: 0.12, yoyo: true, repeat: 1, ...C }, 33.65);
hide("dmg", 34.0);
tl.to("#cursor", { opacity: 0, duration: 0.15 }, 34.0);
show("gk", 34.5, 0.35);
tl.to("#gk", { x: -14, duration: 0.06, yoyo: true, repeat: 5, ease: "none" }, 34.9);
tl.set("#cursor", { x: P("gk-done")[0] + 120, y: P("gk-done")[1] + 160 }, 37.5);
tl.to("#cursor", { opacity: 1, duration: 0.2 }, 37.6);
move("gk-done", 37.7, 0.8);
press("gk-done", 39.2);
hide("gk", 39.5);

// 4: System Settings > Privacy & Security > Open Anyway
show("set", 39.9);
move("set-ps", 40.3, 0.6);
press("set-ps", 41.0);
tl.to("#set-ps", { backgroundColor: "#2f6ae0", color: "#ffffff", duration: 0.12 }, 41.05);
const SCROLL = 200;
tl.to("#set-scroll", { y: -SCROLL, duration: 0.9, ease: "power2.inOut" }, 42.1);
tl.to("#set-blk", { boxShadow: "0 0 0 4px #e5484d", duration: 0.25 }, 43.0);
const [ox, oy] = P("set-open");
tl.to("#cursor", { x: ox, y: oy - SCROLL, duration: 0.8, ease: "power2.inOut" }, 43.4);
press("set-open", 45.0);
show("pw", 45.35, 0.35);
tl.to("#set", { opacity: 0.4, duration: 0.3 }, 45.35);
for (let k = 0; k < 8; k++) tl.fromTo("#pd" + k, { opacity: 0 }, { opacity: 1, duration: 0.05 }, 46.0 + k * 0.1);
move("pw-ok", 46.3, 0.7);
press("pw-ok", 47.2);
hide("pw", 47.4);
show("oc", 47.6, 0.35);
move("oc-open", 48.3, 0.8);
press("oc-open", 49.6);
hide("oc", 49.85); hide("set", 49.9);
show("nxw", 50.05, 0.5);
tl.to("#cursor", { opacity: 0, duration: 0.2 }, 50.0);
hide("nxw", 53.2);

// 5: end card
tl.fromTo("#endcard", { opacity: 0, scale: 0.94, ...C }, { opacity: 1, scale: 1, duration: 0.45, ease: "power3.out", ...C }, 53.5);
tl.fromTo("#e-logo", { opacity: 0, scale: 0.4, ...C }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2.2)", ...C }, 53.8);
tl.fromTo("#e-title", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, 54.1);
tl.fromTo("#e-sub", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, 54.6);
tl.fromTo("#e-url", { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, 55.0);
tl.fromTo("#e-trial", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, 55.8);

window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
tl.seek(0);
"""

CSS = """
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: __W__px; height: __H__px; overflow: hidden; background: #070a14; }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Segoe UI", "Inter", Arial, sans-serif; color: #fff; background: #070a14; }
.clip { position: absolute; inset: 0; }
#bg3d { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#box { position: absolute; width: 960px; height: 720px; transform-origin: 0 0; }
#box > div, #box > svg { position: absolute; opacity: 0; }
.glass { background: rgba(18,24,38,.38); backdrop-filter: blur(34px) saturate(180%); -webkit-backdrop-filter: blur(34px) saturate(180%);
  border: 1.5px solid rgba(255,255,255,.28); box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 40px 120px rgba(0,0,0,.5); }

/* glass panels */
.panel { left: 70px; top: 90px; width: 820px; height: 540px; border-radius: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 60px; }
.panel > img { width: 150px; height: 150px; border-radius: 22%; box-shadow: 0 20px 60px rgba(0,0,0,.45); }
.p-title { font-size: 76px; font-weight: 800; letter-spacing: -0.03em; margin-top: 26px; line-height: 1.05; }
.p-sub { font-size: 34px; font-weight: 600; color: #d5dbe6; margin-top: 18px; line-height: 1.3; }

/* glass windows */
.gwin { border-radius: 18px; overflow: hidden; }
.gwin.mac { border-radius: 30px; }
.bar { height: 60px; display: flex; align-items: center; padding: 0 22px; border-bottom: 1px solid rgba(255,255,255,.14); }
.wt { flex: 1; font-size: 28px; font-weight: 700; }
.mac .wt { text-align: center; }
.winctl { display: flex; gap: 24px; font-size: 28px; color: #c4ccda; }
.winctl b { font-weight: 400; }
.dots { display: flex; gap: 11px; width: 100px; }
.dots i { width: 18px; height: 18px; border-radius: 50%; background: #ff5f57; display: block; }
.dots i:nth-child(2) { background: #febc2e; } .dots i:nth-child(3) { background: #28c840; }
.dots-sp { width: 100px; }

#exp { left: 60px; top: 70px; width: 840px; height: 400px; }
.exp-row { position: relative; margin: 40px 30px; padding: 20px 24px; border-radius: 16px; display: flex; align-items: center; gap: 24px; background: rgba(255,255,255,.06); }
.exp-row img { width: 84px; height: 84px; border-radius: 20px; }
.exp-row b { display: block; font-size: 32px; }
.exp-row span { font-size: 28px; color: #c4ccda; }

/* SmartScreen */
#ss { left: 130px; top: 70px; width: 700px; height: 580px; background: #1460b8; box-shadow: 0 40px 120px rgba(0,0,0,.55); padding: 34px 40px; }
.ss-x { position: absolute; right: 26px; top: 18px; font-size: 28px; }
.ss-h { font-size: 46px; font-weight: 300; margin-top: 20px; }
.ss-p { font-size: 28px; line-height: 1.4; margin-top: 22px; color: #eef3fb; }
.ss-more { position: absolute; left: 40px; top: 330px; font-size: 28px; text-decoration: underline; font-weight: 600; }
.ss-det { position: absolute; left: 40px; top: 330px; font-size: 28px; line-height: 1.6; opacity: 0; }
.ss-det span { display: inline-block; width: 150px; }
.ss-btns { position: absolute; right: 40px; bottom: 34px; display: flex; gap: 18px; }
.wbtn { position: relative; padding: 16px 30px; font-size: 28px; font-weight: 700; background: #fff; color: #1b1f27; }
#ss-run { opacity: 0; }

/* installer */
#inst { left: 150px; top: 170px; width: 660px; height: 380px; }
.in-body { position: relative; padding: 40px 44px; height: 320px; }
.in-body img { width: 96px; height: 96px; border-radius: 22px; }
.in-txt, .in-done { position: absolute; left: 170px; top: 64px; font-size: 34px; font-weight: 700; }
.in-done { opacity: 0; display: flex; align-items: center; gap: 14px; }
.in-done i { font-style: normal; width: 46px; height: 46px; border-radius: 50%; background: #5ccb8b; color: #0b1a12; display: flex; align-items: center; justify-content: center; font-size: 28px; }
.in-bar { margin-top: 56px; height: 18px; border-radius: 9px; background: rgba(255,255,255,.14); overflow: hidden; }
#in-fill { height: 100%; width: 0%; background: #2f6ae0; border-radius: 9px; }

/* Mac: disk image */
#dmg { left: 70px; top: 100px; width: 820px; height: 440px; }
.dm-app, .dm-fold { position: absolute; top: 130px; display: flex; flex-direction: column; align-items: center; gap: 12px; font-size: 28px; font-weight: 700; }
.dm-app { left: 110px; } .dm-app img { width: 150px; height: 150px; border-radius: 22%; }
.dm-fold { left: 540px; top: 136px; }
.dm-arrow { position: absolute; left: 330px; top: 190px; }
.dm-ghost { position: absolute; left: 110px; top: 130px; opacity: 0; }
.dm-ghost img { width: 150px; height: 150px; border-radius: 22%; }

/* Mac dialogs (light) */
.mdlg { width: 460px; padding: 34px 36px; border-radius: 30px; background: rgba(238,239,243,.94); color: #1b1f27; box-shadow: 0 40px 120px rgba(0,0,0,.55);
  display: flex; flex-direction: column; align-items: center; text-align: center; }
.mdlg > img { width: 104px; height: 104px; border-radius: 22%; }
.m-h { font-size: 30px; font-weight: 800; margin-top: 18px; }
.m-p { font-size: 28px; line-height: 1.35; color: #363f52; margin-top: 12px; }
.m-btn { position: relative; width: 100%; margin-top: 12px; padding: 12px; border-radius: 16px; background: #d9dbe2; font-size: 28px; font-weight: 700; }
.m-btn.blue { background: #2f6ae0; color: #fff; margin-top: 24px; }
#gk { left: 250px; top: 80px; }
#pw { left: 250px; top: 60px; }
#oc { left: 250px; top: 100px; }
.lock { font-size: 64px; }
.field { width: 100%; margin-top: 14px; padding: 12px 18px; border-radius: 12px; background: #fff; border: 1.5px solid #c4c8d2; text-align: left; font-size: 28px; height: 56px; display: flex; align-items: center; gap: 8px; }
.field i { width: 14px; height: 14px; border-radius: 50%; background: #1b1f27; display: block; opacity: 0; }

/* System Settings */
.swin { left: 20px; top: 30px; width: 920px; height: 660px; border-radius: 26px; overflow: hidden; background: rgba(246,246,249,.96); color: #1b1f27; box-shadow: 0 40px 120px rgba(0,0,0,.55); }
.sbar { position: absolute; left: 24px; top: 24px; }
.s-side { position: absolute; left: 0; top: 0; bottom: 0; width: 280px; padding: 76px 16px 0; background: rgba(226,228,234,.9); display: flex; flex-direction: column; gap: 6px; }
.s-si { position: relative; font-size: 28px; font-weight: 600; padding: 10px 16px; border-radius: 10px; color: #2a3140; }
.s-main { position: absolute; left: 280px; right: 0; top: 0; bottom: 0; padding: 0 34px 30px; overflow: hidden; }
.s-h { position: relative; z-index: 1; font-size: 34px; font-weight: 800; padding: 30px 0 18px; background: rgba(246,246,249,1); }
#set-scroll { position: relative; display: flex; flex-direction: column; gap: 12px; }
.s-row { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 14px 22px; border-radius: 14px; background: #fff; font-size: 28px; font-weight: 600; }
.s-row em { font-style: normal; color: #4a5366; font-weight: 500; }
.s-sec { font-size: 26px; font-weight: 800; margin-top: 24px; }
.s-blk { position: relative; display: flex; justify-content: space-between; align-items: center; gap: 18px; padding: 20px 22px; border-radius: 14px; background: #fff; font-size: 28px; font-weight: 600; }
.s-btn { position: relative; flex: none; padding: 12px 20px; border-radius: 12px; background: #e3e5eb; border: 1.5px solid #c4c8d2; font-size: 28px; font-weight: 700; }

/* NexDB opened */
#nxw { left: 160px; top: 150px; width: 640px; height: 380px; }
.nx-body { display: flex; align-items: center; gap: 40px; padding: 60px 56px; }
.nx-body img { width: 160px; height: 160px; border-radius: 22%; }
.nx-h { font-size: 46px; font-weight: 800; }
.nx-btn { display: inline-block; margin-top: 20px; padding: 16px 34px; border-radius: 16px; background: #2f6ae0; font-size: 30px; font-weight: 800; }

/* end card */
#endcard { padding: 30px 60px; }
#e-logo { width: 150px; height: 150px; border-radius: 22%; box-shadow: 0 20px 60px rgba(0,0,0,.45); opacity: 0; }
#e-title { font-size: 84px; font-weight: 800; letter-spacing: -0.03em; margin-top: 22px; opacity: 0; }
#e-sub { font-size: 34px; font-weight: 600; color: #d5dbe6; margin-top: 16px; opacity: 0; }
#e-url { font-size: 64px; font-weight: 800; margin-top: 8px; border-bottom: 6px solid rgba(255,255,255,.85); padding-bottom: 6px; opacity: 0; }
#e-trial { font-size: 32px; font-weight: 700; color: #d5dbe6; margin-top: 22px; opacity: 0; }

.cursor { left: 0; top: 0; z-index: 5; filter: drop-shadow(0 6px 10px rgba(0,0,0,.4)); }
.oslabel { position: absolute; left: 0; right: 0; text-align: center; color: #e3e8f1; font-weight: 800; letter-spacing: .3em; text-transform: uppercase; opacity: 0; text-shadow: 0 2px 12px rgba(0,0,0,.6); }
.cap { position: absolute; left: 50px; right: 50px; text-align: center; font-weight: 900; color: #fff; opacity: 0; line-height: 1.06;
  text-shadow: 0 0 2px #000, 4px 4px 0 #0b0f17, -4px 4px 0 #0b0f17, 4px -4px 0 #0b0f17, -4px -4px 0 #0b0f17, 0 6px 0 #0b0f17, 0 8px 22px rgba(0,0,0,.6); }
.tall .oslabel { top: 220px; font-size: 44px; }
.tall .cap { top: 1260px; font-size: 84px; }
.wide .oslabel { top: 46px; font-size: 38px; }
.wide .cap { top: 880px; font-size: 66px; }
"""


def page(mode):
    L = LAYOUT[mode]
    W, H = L["W"], L["H"]
    bx, by, bs = L["box"]
    res = "portrait" if mode == "tall" else "landscape"
    audio = "\n".join(
        [f'<audio id="music" src="assets/bgm-tech-house.mp3" data-start="0" data-duration="{TOTAL}" data-media-start="{MUSIC_START}" data-volume="0.06" data-fade-in="0.3" data-fade-out="1.5" data-track-index="10"></audio>']
        + [f'<audio id="vo{k}" src="assets/vo/line{k + 1:02d}.mp3" data-start="{t}" data-duration="{d}" data-volume="1" data-track-index="{40 + k}"></audio>' for k, (t, d) in enumerate(zip(VO_START, VO_DUR))]
        + [f'<audio id="fx{k}" src="assets/{n}.mp3" data-start="{t}" data-duration="{DUR.get(n, 1.4)}" data-volume="{v}" data-track-index="{20 + k}"></audio>' for k, (n, t, v) in enumerate(SFX)]
    )
    caps = "\n".join(f'<div class="cap" id="cap{i}">{html.escape(c)}</div>' for i, (_, _, c) in enumerate(CAPS))
    css = CSS.replace("__W__", str(W)).replace("__H__", str(H)) + f"#box {{ left: {bx}px; top: {by}px; transform: scale({bs}); }}\n"
    body = box_html.replace('class="panel"', 'class="panel glass"').replace('class="gwin', 'class="glass gwin')
    js = (f"const TOTAL = {TOTAL};\nconst WIN_AT = {WIN_AT};\nconst OLD = {OLD};\nconst NEW = {NEW};\nconst CAPS = {[[a, b] for a, b, _ in CAPS]};\n"
          f"window.__bg = {{ W: {W}, H: {H}, FOV: {L['FOV']}, DROP: 0, clock: {{ t: 0 }}, render: null }};\n"
          "window.__hf = window.__hf || {};\nwindow.__hf.buildReady = window.__hf.buildReady || {};\n"
          "window.__hf.buildReady['main'] = new Promise((r) => { window.__bg.ready = r; });\n" + JS)
    return f'''<!doctype html>
<html lang="en" data-resolution="{res}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      /* "How to install NexDB" video. Generated by install/build.py - edit there, not here. */
{css}
    </style>
  </head>
  <body>
    <div id="root" class="{mode}" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
<canvas id="bg3d"></canvas>
{audio}
      <div class="clip" id="stage" data-start="0" data-duration="{TOTAL}" data-track-index="0">
{body}
      </div>
      <div class="clip" id="captions" data-start="0" data-duration="{TOTAL}" data-track-index="1">
{caps}
      </div>
    </div>
    <script>
{js}
    </script>
    <script type="module" src="bgcalm.js"></script>
  </body>
</html>
'''


with open(os.path.join(HERE, "index.html"), "w", encoding="utf-8") as f:
    f.write(page("tall"))
os.makedirs(WIDE, exist_ok=True)
for name in ("hyperframes.json", "package.json", "CLAUDE.md", "bgcalm.js"):
    shutil.copy(os.path.join(HERE, name), os.path.join(WIDE, name))
with open(os.path.join(WIDE, "meta.json"), "w") as f:
    f.write('{"id":"install-wide","name":"install-wide"}')
shutil.copytree(os.path.join(HERE, "assets"), os.path.join(WIDE, "assets"), dirs_exist_ok=True)
with open(os.path.join(WIDE, "index.html"), "w", encoding="utf-8") as f:
    f.write(page("wide"))
print("total", TOTAL, "music_start", MUSIC_START)
