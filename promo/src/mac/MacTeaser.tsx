// "Coming soon to Mac" teaser. NexDB for Mac is NOT released: the port is only planned
// (docs/macos-port.md), so every claim says "coming soon". The Mac window frame is a mock drawn
// around real Windows captures and is labelled as a preview. Voice: the user's recordings
// (public/mac/vo/01-06.wav; the Kokoro take from mac/narrate.py is kept in public/mac/vo-kokoro).
//
// Style: the soft blue room-light background (ROOM_BG), white/grey type, no colored pills or caption boxes. Motion is
// keynote-like: masked slide-up text, slow push-ins, a 3D settle on the Mac window, and every
// scene cut lands on the music's half-beat grid (123 BPM). Music: an original track made for this
// video by mac/compose.py (public/mac/music.wav), with its drop on the Mac reveal.
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, F, ROOM_BG } from "../theme";
import { Nex } from "../Nex";
import vo from "../../mac/vo.json";

export const FPS = 30;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const outExpo = Easing.bezier(0.16, 1, 0.3, 1);
const inOut = Easing.bezier(0.65, 0, 0.35, 1);
const k01 = (f: number, at: number, len: number, e = outExpo) => interpolate(f, [at, at + len], [0, 1], { ...clamp, easing: e });

// ---------- music grid ----------
const BPM = 123;
const BEAT = (FPS * 60) / BPM; // 14.63 frames
const HALF = BEAT / 2;

type Scene = "title" | "stack" | "macwin" | "building" | "windows" | "end";
const LINES: { text: string; scene: Scene; caption: boolean }[] = [
  { text: "Hey, I'm Nex! And guess what? NexDB is coming to Mac!", scene: "title", caption: false },
  { text: "Apache, PHP, MySQL and Node, all in one app, with zero setup headaches!", scene: "stack", caption: true },
  { text: "Your projects, your databases and NexHost, right on your Mac, really soon!", scene: "macwin", caption: true },
  { text: "We're building it right now! It's not out yet, so stay tuned.", scene: "building", caption: true },
  { text: "Can't wait? NexDB is on Windows today, with a 14-day free trial!", scene: "windows", caption: true },
  { text: "NexDB. Coming soon to Mac!", scene: "end", caption: false },
];

/** Each line starts on the first half-beat after the previous line ends (plus a breath). */
const snap = (fr: number) => Math.ceil(fr / HALF - 1e-6) * HALF;
export const BEATS = (() => {
  let exact = snap(16);
  return LINES.map((l, i) => {
    const say = Math.ceil(vo[i].sec * FPS);
    const b = { ...l, n: i + 1, exact, at: Math.round(exact), say };
    exact = snap(exact + say + 4);
    return b;
  });
})();
const last = BEATS[BEATS.length - 1];
export const TOTAL = Math.round(snap(last.exact + last.say + 66));
const endOf = (i: number) => (i === BEATS.length - 1 ? TOTAL : BEATS[i + 1].at);

// ---------- motion pieces ----------
/** Text that slides up out of a mask, with a little blur that clears. */
const Reveal: React.FC<{ f: number; at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ f, at, children, style }) => {
  const k = k01(f, at, 18);
  return (
    <div style={{ overflow: "hidden", paddingBottom: "0.12em", marginBottom: "-0.12em", ...style }}>
      <div style={{ transform: `translateY(${(1 - k) * 105}%)`, filter: `blur(${(1 - k) * 6}px)`, opacity: Math.min(1, k * 1.6) }}>{children}</div>
    </div>
  );
};
const Fade: React.FC<{ f: number; at: number; children: React.ReactNode; y?: number }> = ({ f, at, children, y = 16 }) => {
  const k = k01(f, at, 20);
  return <div style={{ opacity: k, transform: `translateY(${(1 - k) * y}px)` }}>{children}</div>;
};

const Label: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ font: `600 26px ${F.text}`, color: C.text3, letterSpacing: 4, textTransform: "uppercase", ...style }}>{children}</div>
);
const H: React.FC<{ size: number; children: React.ReactNode; color?: string }> = ({ size, children, color = C.text }) => (
  <div style={{ font: `700 ${size}px/1.05 ${F.display}`, color, letterSpacing: -size * 0.025, whiteSpace: "nowrap" }}>{children}</div>
);

const Caption: React.FC<{ text: string; duration: number }> = ({ text, duration }) => {
  const f = useCurrentFrame();
  const o = Math.min(k01(f, 0, 10), interpolate(f, [duration - 8, duration], [1, 0], clamp));
  return <div style={{ position: "absolute", bottom: 70, left: 0, right: 0, textAlign: "center", opacity: o, font: `500 34px/1.3 ${F.text}`, color: C.text2 }}>{text}</div>;
};

const Logo: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.28 }}>
    <Img src={staticFile("nexdb-logo.png")} style={{ width: size, height: size }} />
    <H size={size * 0.78}>NexDB</H>
  </div>
);

const center: React.CSSProperties = { alignItems: "center", justifyContent: "center", flexDirection: "column" };

/** Mock macOS window (drawn), real NexDB captures inside; screens change on the beat. */
const MacWindow: React.FC<{ f: number; len: number }> = ({ f, len }) => {
  const shots = ["mac/dashboard.png", "mac/projects.png", "mac/nexhost-overview.png"];
  const per = Math.round(BEAT * 4); // one bar per screen
  const idx = Math.min(shots.length - 1, Math.floor(Math.max(0, f - 6) / per));
  const local = f - 6 - idx * per;
  const slide = idx === 0 ? 0 : (1 - k01(local, 0, 12)) * 40;
  const W = 1180, H = 708;
  const enter = k01(f, 0, 28);
  const push = interpolate(f, [0, len], [0, 0.04], clamp);
  return (
    <AbsoluteFill style={{ ...center, perspective: 1800 }}>
      <div
        style={{
          transform: `translateY(${(1 - enter) * 120 - 40}px) rotateX(${(1 - enter) * 22}deg) scale(${0.86 + 0.14 * enter + push})`,
          filter: `blur(${(1 - enter) * 10}px)`, opacity: Math.min(1, enter * 1.5),
          borderRadius: 12, overflow: "hidden", border: "1px solid #2b2e33", transformOrigin: "50% 100%",
        }}
      >
        <div style={{ height: 52, background: "#24272c", display: "flex", alignItems: "center", padding: "0 20px", gap: 10, position: "relative", borderBottom: "1px solid #1b1d21" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
          ))}
          <div style={{ position: "absolute", left: 0, right: 0, textAlign: "center", font: `600 22px ${F.text}`, color: C.text2 }}>NexDB</div>
        </div>
        <div style={{ width: W, height: H, position: "relative", background: C.bg, overflow: "hidden" }}>
          <Img src={staticFile(shots[idx])} style={{ position: "absolute", width: W, height: H, objectFit: "cover", objectPosition: "top left", transform: `translateX(${slide}px)` }} />
        </div>
      </div>
      <div style={{ position: "absolute", top: 40, right: 56 }}>
        <Fade f={f} at={20} y={0}><Label style={{ font: `600 20px ${F.text}`, letterSpacing: 3 }}>Preview · Windows screens shown</Label></Fade>
      </div>
    </AbsoluteFill>
  );
};

const SceneView: React.FC<{ scene: Scene; len: number }> = ({ scene, len }) => {
  const f = useCurrentFrame();
  const b = Math.round(BEAT);
  if (scene === "title")
    return (
      <AbsoluteFill style={{ ...center, gap: 34 }}>
        <Fade f={f} at={0} y={30}><Nex mood="hello" size={280} /></Fade>
        <Reveal f={f} at={b}><Logo size={110} /></Reveal>
        <Reveal f={f} at={b * 3}><Label style={{ font: `600 32px ${F.text}`, color: C.text2, letterSpacing: 10 }}>Coming soon to Mac</Label></Reveal>
      </AbsoluteFill>
    );
  if (scene === "stack") {
    const items = ["Apache", "PHP", "MySQL", "Node"];
    return (
      <AbsoluteFill style={{ ...center, gap: 40, paddingBottom: 110 }}>
        <div style={{ display: "flex", gap: 64 }}>
          {items.map((t, i) => (
            <Reveal key={t} f={f} at={i * b}><H size={96}>{t}</H></Reveal>
          ))}
        </div>
        <Reveal f={f} at={b * 5}><div style={{ font: `500 40px ${F.text}`, color: C.text3 }}>All in one app.</div></Reveal>
      </AbsoluteFill>
    );
  }
  if (scene === "macwin") return <MacWindow f={f} len={len} />;
  if (scene === "building")
    return (
      <AbsoluteFill style={{ ...center, gap: 30, paddingBottom: 110 }}>
        <Fade f={f} at={0} y={24}><Nex mood="thinking" size={240} /></Fade>
        <Reveal f={f} at={Math.round(HALF)}><H size={88}>In development</H></Reveal>
        <Reveal f={f} at={b * 2}><Label>Mac version</Label></Reveal>
      </AbsoluteFill>
    );
  if (scene === "windows")
    return (
      <AbsoluteFill style={{ ...center, gap: 34, paddingBottom: 110 }}>
        <Reveal f={f} at={0}><Logo size={96} /></Reveal>
        <Reveal f={f} at={b * 2}><H size={80}>Available now on Windows</H></Reveal>
        <Reveal f={f} at={b * 4}><Label>14-day free trial</Label></Reveal>
      </AbsoluteFill>
    );
  return (
    <AbsoluteFill style={{ ...center, gap: 36 }}>
      <Fade f={f} at={0} y={30}><Nex mood="success" size={220} /></Fade>
      <Reveal f={f} at={Math.round(HALF)}><Logo size={130} /></Reveal>
      <Reveal f={f} at={b * 2}><H size={84}>Coming soon to Mac</H></Reveal>
      <Fade f={f} at={b * 4} y={0}><div style={{ font: `500 26px ${F.text}`, color: C.text3 }}>Windows version available now · Mac release date to be announced</div></Fade>
    </AbsoluteFill>
  );
};

/** Scene wrapper: slow push-in, and a quick scale-and-fade exit into the next cut. */
const Shot: React.FC<{ len: number; first: boolean; lastShot: boolean; children: React.ReactNode }> = ({ len, first, lastShot, children }) => {
  const f = useCurrentFrame();
  const inK = first ? 1 : k01(f, 0, 8);
  const outK = lastShot ? 0 : interpolate(f, [len - 7, len], [0, 1], { ...clamp, easing: inOut });
  const push = interpolate(f, [0, len], [1, 1.035], clamp);
  return <AbsoluteFill style={{ opacity: inK * (1 - outK), transform: `scale(${push * (1 + outK * 0.04)})`, filter: outK > 0 ? `blur(${outK * 8}px)` : undefined }}>{children}</AbsoluteFill>;
};

// ---------- audio ----------
const MUSIC_BED = 0.42;
const MUSIC_UNDER_VOICE = 0.2;
/** The track's build is about 14 dB quieter than its drop; lift it so it carries under the opening lines. */
const BUILD_LIFT = 1.9;
/** Music volume at frame f: ducks under each voice line, fades in at the start and out at the end. */
const musicVolume = (f: number) => {
  let duck = 0;
  for (const b of BEATS) duck = Math.max(duck, interpolate(f, [b.at - 6, b.at, b.at + b.say, b.at + b.say + 10], [0, 1, 1, 0], clamp));
  const vol = MUSIC_BED + (MUSIC_UNDER_VOICE - MUSIC_BED) * duck;
  const lift = interpolate(f, [BEATS[2].at - 4, BEATS[2].at], [BUILD_LIFT, 1], clamp);
  return Math.min(1, vol * lift) * interpolate(f, [0, 6, TOTAL - 30, TOTAL], [0, 1, 1, 0], clamp);
};
const SFX: { at: number; src: string; vol: number }[] = [
  { at: BEATS[1].at - 4, src: "swoosh-quick", vol: 0.22 },
  { at: BEATS[3].at - 4, src: "swoosh-quick", vol: 0.2 },
  { at: BEATS[4].at - 4, src: "swoosh-quick", vol: 0.2 },
];

export const MacTeaser: React.FC = () => (
  <AbsoluteFill style={{ background: ROOM_BG }}>
    <Audio src={staticFile("mac/music.wav")} volume={musicVolume} />
    {SFX.map((s, i) => (
      <Sequence key={`s${i}`} from={s.at} durationInFrames={150}>
        <Audio src={staticFile(`audio/sfx/${s.src}.mp3`)} volume={s.vol} />
      </Sequence>
    ))}
    {BEATS.map((b, i) => {
      const from = i === 0 ? 0 : b.at;
      const len = endOf(i) - from;
      return (
        <Sequence key={b.n} from={from} durationInFrames={len}>
          <Shot len={len} first={i === 0} lastShot={i === BEATS.length - 1}>
            <SceneView scene={b.scene} len={len} />
          </Shot>
        </Sequence>
      );
    })}
    {BEATS.map((b) => (
      <Sequence key={`a${b.n}`} from={b.at} durationInFrames={endOf(b.n - 1) - b.at}>
        <Audio src={staticFile(`mac/vo/${String(b.n).padStart(2, "0")}.wav`)} />
        {b.caption && <Caption text={b.text} duration={b.say + 10} />}
      </Sequence>
    ))}
  </AbsoluteFill>
);
