# Builds the "NexDB for Mac" ad in two shapes from one template:
#   mac/index.html       (9:16, 1080x1920)
#   ../mac-wide/index.html (16:9, 1920x1080)
# Timing comes from the user's ElevenLabs voice lines in assets/vo (line01..line12.mp3).
# Run: python mac/build.py   (from promo-hyperframes)
import html, os, re, shutil, subprocess

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


def chunks(text):
    """Split a line into caption chunks of up to 5 words, breaking at sentence ends."""
    words = text.split()
    out, cur = [], []
    for w in words:
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
    # weight = characters, plus a pause after punctuation
    ws = [len(c) + (6 if re.search(r"[.,:?!]$", c) else 0) for c in cs]
    span = durs[i] - 0.1
    a = starts[i]
    for c, w in zip(cs, ws):
        b = a + span * w / sum(ws)
        caps.append((round(a, 3), round(b, 3), c))
        a = b

S = starts  # scene i starts with line i (0-based)
scene_at = lambda li: round(S[li] - 0.1 if li else 0, 3)
SCENES = [  # id, first line, last line
    ("s-term", 0, 2), ("s-find", 3, 3), ("s-reveal", 4, 4), ("s-dash", 5, 5), ("s-fix", 6, 6),
    ("s-host", 7, 7), ("s-chips", 8, 8), ("s-os", 9, 9), ("s-cta", 10, 10), ("s-end", 11, 11),
]
sc = {}
for k, (sid, a, b) in enumerate(SCENES):
    st = scene_at(a)
    en = scene_at(SCENES[k + 1][1]) if k + 1 < len(SCENES) else TOTAL
    sc[sid] = (st, round(en - st, 3))


def clip(sid, cls=""):
    st, du = sc[sid]
    return f'class="clip {cls}" id="{sid}" data-start="{st}" data-duration="{du}"'


TERM = [
    ("cmd", "brew install php"),
    ("out", "==> Downloading php-8.4 ..."),
    ("err", "Error: php: Failed to download resource"),
    ("cmd", "brew services start httpd"),
    ("err", "Error: Permission denied @ rb_sysopen"),
    ("cmd", "sudo apachectl start"),
    ("err", "(48)Address already in use: could not bind to [::]:80"),
    ("cmd", "mysql -u root"),
    ("err", "ERROR 2002: Can't connect to local MySQL server"),
    ("cmd", "sudo apachectl start"),
    ("err", "(48)Address already in use: could not bind to [::]:80"),
]
term_html = "\n".join(
    f'<div class="tl {k}" id="tl{i}">{"<b>% </b>" if k == "cmd" else ""}{html.escape(s)}</div>'
    for i, (k, s) in enumerate(TERM)
)
QUERY = "php server for mac"
query_html = "".join(f'<span class="qc" id="q{i}">{html.escape(ch) if ch != " " else "&nbsp;"}</span>' for i, ch in enumerate(QUERY))
caps_html = "\n".join(f'<div class="cap" id="cap{i}">{html.escape(c)}</div>' for i, (_, _, c) in enumerate(caps))
vo_html = "\n".join(
    f'<audio id="vo{i + 1}" src="assets/vo/line{i + 1:02d}.mp3" data-start="{starts[i]}" data-duration="{durs[i]}" data-volume="1" data-track-index="{20 + i}"></audio>'
    for i in range(12)
)

# Music: track beat 316 is the drop. Put it on the "NexDB. Now on Mac." reveal.
BEAT, T0 = 0.48387, 9.458
drop = T0 + 316 * BEAT
music_start = round(drop - S[4], 3)

# [x, y, w] crop in source pixels, plus the source width and height
CROPS = {"shotDash": [360, 0, 2260, 3840, 2160], "shotFix": [250, 170, 1030, 1600, 960], "shotHost": [270, 20, 1080, 1600, 960]}


def win(wid, title, inner):
    return f'''<div class="win" id="{wid}"><div class="bar"><i></i><i></i><i></i><span data-layout-ignore>{title}</span></div><div class="body">{inner}</div></div>'''


def page(mode):
    W, H = (1080, 1920) if mode == "tall" else (1920, 1080)
    res = "portrait" if mode == "tall" else "landscape"
    t_click = round(S[5] + durs[5] * 0.82, 3)
    return f'''<!doctype html>
<html lang="en" data-resolution="{res}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      /* "NexDB for Mac" release ad. Generated by mac/build.py - edit there, not here.
         Flat promo style: blue room-light gradient, white/grey text, captions with no box. */
      :root {{
        --bg: #0f1114; --panel: #161a21; --line: #2a303b; --ink: #ffffff; --muted: #9aa3b2;
        --font: "Segoe UI", "Inter", Arial, sans-serif;
        --mono: "JetBrains Mono", monospace;
      }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: {W}px; height: {H}px; overflow: hidden; background: var(--bg); }}
      #root {{
        position: relative; width: 100%; height: 100%; overflow: hidden; font-family: var(--font); color: var(--ink);
        background: radial-gradient(1200px 700px at 70% 28%, rgba(47,106,224,.16), transparent 60%),
          radial-gradient(900px 600px at 12% 92%, rgba(92,203,139,.07), transparent 60%), var(--bg);
      }}
      .clip {{ position: absolute; inset: 0; }}
      .center {{ display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }}

      /* macOS-style window */
      .win {{ position: absolute; border-radius: 22px; overflow: hidden; background: var(--panel); border: 1px solid var(--line);
        box-shadow: 0 40px 120px rgba(0,0,0,.6); }}
      .bar {{ height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 22px; background: #1d222b; border-bottom: 1px solid var(--line); }}
      .bar i {{ width: 16px; height: 16px; border-radius: 50%; background: #ff5f57; display: block; }}
      .bar i:nth-child(2) {{ background: #febc2e; }}
      .bar i:nth-child(3) {{ background: #28c840; }}
      .bar span {{ flex: 1; text-align: center; margin-right: 76px; font-size: 22px; color: var(--muted); font-weight: 600; }}
      .body {{ position: relative; overflow: hidden; height: calc(100% - 52px); }}
      .body img.shot {{ position: absolute; left: 0; top: 0; transform-origin: 30% 20%; }}

      /* Terminal */
      .term {{ padding: 26px 30px; font-family: var(--mono); font-size: 27px; line-height: 1.55; }}
      .tl {{ white-space: nowrap; color: #c9d1d9; }}
      .tl b {{ color: var(--muted); font-weight: 400; }}
      .tl.out {{ color: var(--muted); }}
      .tl.err {{ color: #ff7b72; }}
      .later {{ position: absolute; left: 0; right: 0; text-align: center; font-size: 76px; font-weight: 800; letter-spacing: -0.02em; }}

      /* Search */
      .search {{ width: 860px; height: 120px; border-radius: 28px; background: rgba(30,35,44,.92); border: 1px solid var(--line);
        display: flex; align-items: center; gap: 26px; padding: 0 40px; font-size: 52px; box-shadow: 0 30px 90px rgba(0,0,0,.55); }}
      .search svg {{ flex: none; }}
      .result {{ margin-top: 26px; width: 860px; border-radius: 24px; background: rgba(30,35,44,.92); border: 1px solid var(--line);
        display: flex; align-items: center; gap: 28px; padding: 26px 34px; text-align: left; }}
      .result img {{ width: 92px; height: 92px; border-radius: 22px; }}
      .result b {{ display: block; font-size: 44px; }}
      .result span {{ font-size: 30px; color: var(--muted); }}

      /* Reveal, OS, CTA, end */
      .logo {{ border-radius: 22%; box-shadow: 0 30px 80px rgba(0,0,0,.55); }}
      .big {{ font-weight: 800; letter-spacing: -0.04em; line-height: 1; }}
      .sub {{ color: var(--muted); font-weight: 600; }}
      .label {{ color: var(--muted); font-weight: 700; letter-spacing: .3em; text-transform: uppercase; }}
      .url {{ font-weight: 800; letter-spacing: -0.02em; border-bottom: 6px solid rgba(255,255,255,.85); padding-bottom: 10px; }}

      /* Chips (neutral cards) */
      .chips {{ display: flex; gap: 40px; }}
      .chip {{ background: var(--panel); border: 1px solid var(--line); border-radius: 30px; padding: 44px 40px; text-align: left; }}
      .chip .k {{ font-size: 30px; }}
      .chip b {{ display: block; font-size: 60px; margin-top: 16px; letter-spacing: -0.02em; }}
      .chip span {{ display: block; font-size: 32px; color: var(--muted); margin-top: 14px; }}

      .nexbot {{ position: absolute; width: 240px; height: 240px; }}

      /* Captions: plain white text, no box */
      .cap {{ position: absolute; left: 60px; right: 60px; text-align: center; font-weight: 800; color: #fff; opacity: 0;
        text-shadow: 0 4px 24px rgba(0,0,0,.65), 0 2px 4px rgba(0,0,0,.5); letter-spacing: -0.01em; }}

      /* ---- Tall 1080x1920 ---- */
      .tall .cap {{ top: 1440px; font-size: 92px; line-height: 1.05; }}
      .tall #wTerm {{ left: 50px; width: 980px; top: 380px; height: 760px; }}
      .tall .later {{ top: 220px; }}
      .tall #s-find .center, .tall #s-reveal, .tall #s-os, .tall #s-cta, .tall #s-end {{ padding-bottom: 560px; }}
      .tall #wDash, .tall #wFix, .tall #wHost {{ left: 60px; width: 960px; }}
      .tall #wDash {{ top: 300px; height: 980px; }}
      .tall #wFix {{ top: 400px; height: 780px; }}
      .tall #wHost {{ top: 480px; height: 640px; }}
      .tall .nexbot {{ right: 40px; top: 1020px; }}
      .tall .chips {{ flex-direction: column; width: 900px; }}
      .tall .rlogo {{ width: 240px; height: 240px; }}
      .tall .rbig {{ font-size: 190px; margin-top: 50px; }}
      .tall .rsub {{ font-size: 72px; margin-top: 22px; }}
      .tall .osbig {{ font-size: 240px; }}
      .tall .ossub {{ font-size: 64px; margin-top: 20px; }}
      .tall .ctabig {{ font-size: 130px; margin-top: 40px; }}
      .tall .ctasub {{ font-size: 50px; margin-top: 22px; }}
      .tall .url {{ font-size: 92px; margin-top: 40px; }}
      .tall .label {{ font-size: 30px; margin-top: 44px; }}
      .tall .clogo {{ width: 170px; height: 170px; }}

      /* ---- Wide 1920x1080 ---- */
      .wide .cap {{ top: 880px; font-size: 76px; }}
      .wide #wTerm {{ left: 390px; width: 1140px; top: 150px; height: 680px; }}
      .wide .later {{ top: 40px; font-size: 64px; }}
      .wide #s-find .center, .wide #s-reveal, .wide #s-os, .wide #s-cta, .wide #s-end {{ padding-bottom: 220px; }}
      .wide #wDash, .wide #wFix, .wide #wHost {{ left: 410px; width: 1100px; top: 60px; height: 760px; }}
      .wide .nexbot {{ right: 240px; top: 560px; }}
      .wide .chips {{ width: 1500px; }}
      .wide .chip {{ flex: 1; }}
      .wide .rlogo {{ width: 170px; height: 170px; }}
      .wide .rbig {{ font-size: 150px; margin-top: 34px; }}
      .wide .rsub {{ font-size: 56px; margin-top: 16px; }}
      .wide .osbig {{ font-size: 200px; }}
      .wide .ossub {{ font-size: 54px; margin-top: 14px; }}
      .wide .ctabig {{ font-size: 110px; margin-top: 26px; }}
      .wide .ctasub {{ font-size: 44px; margin-top: 16px; }}
      .wide .url {{ font-size: 84px; margin-top: 10px; }}
      .wide .label {{ font-size: 30px; margin-top: 30px; }}
      .wide .clogo {{ width: 120px; height: 120px; }}
    </style>
  </head>
  <body>
    <div id="root" class="{mode}" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
      <!-- Music from {music_start}s so the drop (track beat 316) lands on "NexDB. Now on Mac." -->
      <audio id="music" src="assets/bgm-tech-house.mp3" data-start="0" data-duration="{TOTAL}" data-media-start="{music_start}" data-volume="0.06" data-fade-in="0.5" data-fade-out="2" data-track-index="10"></audio>
      <audio id="sfx1" src="assets/swoosh-quick.mp3" data-start="{round(S[4] - 0.08, 3)}" data-duration="0.78" data-volume="0.12" data-track-index="11"></audio>
      <audio id="sfx2" src="assets/impact-deep-whoosh.mp3" data-start="{round(S[4] - 0.03, 3)}" data-duration="2" data-volume="0.15" data-track-index="12"></audio>
      <audio id="sfx3" src="assets/switch-click-quick.mp3" data-start="{t_click}" data-duration="0.5" data-volume="0.25" data-track-index="13"></audio>
{vo_html}

      <section {clip("s-term")} data-track-index="0">
        <div class="later" id="later">3 hours later...</div>
        {win("wTerm", "Terminal &mdash; zsh", f'<div class="term" data-layout-ignore>{term_html}</div>')}
      </section>

      <section {clip("s-find")} data-track-index="1">
        <div class="clip center">
          <div class="search" id="search">
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#9aa3b2" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <div>{query_html}</div>
          </div>
          <div class="result" id="result"><img src="assets/nexdb-logo.png" alt="" /><div><b>NexDB</b><span>Your whole PHP stack, one app</span></div></div>
        </div>
      </section>

      <section {clip("s-reveal", "center")} data-track-index="2">
        <img class="logo rlogo" id="rlogo" src="assets/nexdb-logo.png" alt="" />
        <div class="big rbig" id="rbig">NexDB</div>
        <div class="sub rsub" id="rsub">Now on Mac.</div>
      </section>

      <section {clip("s-dash")} data-track-index="3">
        {win("wDash", "NexDB", '<img class="shot" id="shotDash" data-layout-allow-overflow src="assets/dash-running.png" alt="" />')}
      </section>

      <section {clip("s-fix")} data-track-index="4">
        {win("wFix", "NexDB &mdash; Check my setup", '<img class="shot" id="shotFix" data-layout-allow-overflow src="assets/mac-dashboard.png" alt="" />')}
        <img class="nexbot" id="nexbot" src="assets/nex.svg" alt="" />
      </section>

      <section {clip("s-host")} data-track-index="5">
        {win("wHost", "NexDB &mdash; NexHost", '<img class="shot" id="shotHost" data-layout-allow-overflow src="assets/mac-nexhost.png" alt="" />')}
      </section>

      <section {clip("s-chips", "center")} data-track-index="6">
        <div class="chips">
          <div class="chip" id="chipA"><div class="label k">Apple Silicon</div><b>M1 and newer</b><span>MacBook Air, Pro, iMac, Mac mini</span></div>
          <div class="chip" id="chipB"><div class="label k">Intel</div><b>Intel Macs too</b><span>Even a 2018 MacBook Air</span></div>
        </div>
      </section>

      <section {clip("s-os", "center")} data-track-index="7">
        <div class="big osbig" id="osbig">macOS 13</div>
        <div class="sub ossub" id="ossub">or newer</div>
      </section>

      <section {clip("s-cta", "center")} data-track-index="8">
        <img class="logo clogo" id="clogo" src="assets/nexdb-logo.png" alt="" />
        <div class="big ctabig" id="ctabig">Try it free</div>
        <div class="sub ctasub" id="ctasub1">14-day free trial</div>
        <div class="sub ctasub" id="ctasub2">Plans from ₱299</div>
      </section>

      <section {clip("s-end", "center")} data-track-index="9">
        <img class="logo clogo" id="elogo" src="assets/nexdb-logo.png" alt="" />
        <div class="url" id="eurl" style="margin-top:44px">db.nexiodev.site</div>
        <div class="sub ctasub" id="esub">NexDB for Mac and Windows</div>
        <div class="label" id="ecredit">Nexio Devs</div>
      </section>

      <div class="clip" id="captions" data-start="0" data-duration="{TOTAL}" data-track-index="15">
{caps_html}
      </div>
    </div>
    <script>
      const S = {starts};
      const D = {durs};
      const CAPS = {[[a, b] for a, b, _ in caps]};
      const CROPS = {CROPS};
      for (const [id, [x, y, w, sw, sh]] of Object.entries(CROPS)) {{
        const img = document.getElementById(id);
        const s = img.parentElement.offsetWidth / w;
        img.style.width = sw * s + "px";
        img.style.height = sh * s + "px";
        img.style.left = -x * s + "px";
        img.style.top = -y * s + "px";
      }}

      const tl = gsap.timeline({{ paused: true }});
      const pop = {{ opacity: 0, y: 40 }};
      const on = {{ opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }};

      // Captions: each chunk on at its start, off at the next chunk
      CAPS.forEach(([a, b], i) => {{
        tl.fromTo("#cap" + i, {{ opacity: 0, scale: 0.9 }}, {{ opacity: 1, scale: 1, duration: 0.12, ease: "power2.out" }}, a);
        tl.set("#cap" + i, {{ opacity: 0 }}, b);
      }});

      // Terminal: window on from frame 0, lines type in across lines 1-3
      tl.fromTo("#wTerm", {{ scale: 0.97 }}, {{ scale: 1, duration: 3, ease: "power1.out" }}, 0);
      const termEnd = S[2] + D[2] - 0.6;
      document.querySelectorAll(".tl").forEach((el, i, all) => {{
        if (i === 0) return; // first line on screen from frame 0 (thumbnail)
        tl.fromTo(el, {{ opacity: 0 }}, {{ opacity: 1, duration: 0.05 }}, 0.5 + i * (termEnd - 0.5) / all.length);
      }});
      tl.fromTo("#later", pop, on, S[2]);
      tl.to("#wTerm", {{ x: 6, duration: 0.05, repeat: 5, yoyo: true }}, S[2] + 1.5);

      // Search: type the query, then the result
      const q = document.querySelectorAll(".qc");
      tl.fromTo("#search", {{ opacity: 0, y: 30 }}, on, S[3] - 0.1);
      q.forEach((el, i) => tl.fromTo(el, {{ opacity: 0 }}, {{ opacity: 1, duration: 0.01 }}, S[3] + 0.1 + i * 0.045));
      tl.fromTo("#result", pop, on, S[3] + 0.1 + q.length * 0.045 + 0.15);

      // Reveal (music drop)
      tl.fromTo("#rlogo", {{ opacity: 0, scale: 0.6 }}, {{ opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }}, S[4] - 0.05);
      tl.fromTo("#rbig", {{ opacity: 0, scale: 1.25 }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: "power4.out" }}, S[4]);
      tl.fromTo("#rsub", pop, on, S[4] + 0.9);

      // App windows
      const winIn = (id, t) => tl.fromTo(id, {{ opacity: 0, y: 120 }}, {{ opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }}, t);
      winIn("#wDash", S[5] - 0.1);
      tl.fromTo("#shotDash", {{ scale: 1 }}, {{ scale: 1.06, duration: D[5] + 0.3, ease: "none" }}, S[5] - 0.1);
      winIn("#wFix", S[6] - 0.1);
      tl.fromTo("#shotFix", {{ scale: 1 }}, {{ scale: 1.05, duration: D[6] + 0.3, ease: "none" }}, S[6] - 0.1);
      tl.fromTo("#nexbot", {{ opacity: 0, scale: 0.5, y: 40 }}, {{ opacity: 1, scale: 1, y: 0, duration: 0.45, ease: "back.out(2)" }}, S[6] + 1.0);
      winIn("#wHost", S[7] - 0.1);
      tl.fromTo("#shotHost", {{ scale: 1 }}, {{ scale: 1.05, duration: D[7] + 0.3, ease: "none" }}, S[7] - 0.1);

      // Chips
      tl.fromTo("#chipA", pop, on, S[8] + 0.2);
      tl.fromTo("#chipB", pop, on, S[8] + D[8] * 0.42);

      // macOS 13
      tl.fromTo("#osbig", {{ opacity: 0, scale: 1.2 }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: "power4.out" }}, S[9] - 0.05);
      tl.fromTo("#ossub", pop, on, S[9] + 1.2);

      // CTA
      tl.fromTo("#clogo", {{ opacity: 0, scale: 0.6 }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }}, S[10] - 0.05);
      tl.fromTo("#ctabig", {{ opacity: 0, scale: 1.2 }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: "power4.out" }}, S[10]);
      tl.fromTo("#ctasub1", pop, on, S[10] + 0.6);
      tl.fromTo("#ctasub2", pop, on, S[10] + D[10] * 0.5);

      // End card
      tl.fromTo("#elogo", {{ opacity: 0, scale: 0.6 }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }}, S[11] - 0.05);
      tl.fromTo("#eurl", {{ opacity: 0, scale: 0.85 }}, {{ opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }}, S[11]);
      tl.fromTo("#esub", pop, on, S[11] + 1.2);
      tl.fromTo("#ecredit", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.5 }}, S[11] + 1.8);

      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
'''


with open(os.path.join(HERE, "index.html"), "w", encoding="utf-8") as f:
    f.write(page("tall"))

os.makedirs(WIDE, exist_ok=True)
for name in ("hyperframes.json", "package.json", "CLAUDE.md"):
    shutil.copy(os.path.join(HERE, name), os.path.join(WIDE, name))
with open(os.path.join(WIDE, "meta.json"), "w") as f:
    f.write('{"id":"mac-wide","name":"mac-wide"}')
if not os.path.exists(os.path.join(WIDE, "assets")):
    shutil.copytree(os.path.join(HERE, "assets"), os.path.join(WIDE, "assets"))
with open(os.path.join(WIDE, "index.html"), "w", encoding="utf-8") as f:
    f.write(page("wide"))

print("total", TOTAL, "music_start", music_start, "captions", len(caps))
print("starts", starts)
