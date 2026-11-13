// #1 Opening — assemble-then-type-flyin + a cursor swarm (collab-cursor-moves · cast-ensemble).
// Shells fly in as in demos/AssembleThenTypeFlyin (ft 0.04→0.20, outBack 0.14, blur ≤2px cleared at
// a>0.97). The headline pieces are then CARRIED in by named cursors: each cursor springs from off-screen
// (CastEnsemble spring damping 15 / stiffness 90 / mass 0.9) holding its block, drops it, and drifts
// (sin 46/30 · 38/24 drift). Small mono labels keep the demo's per-char 3D landing. Then the swarm
// gathers on Start all (26f easeInOut, as in the demo's gather), "You" clicks it, the swarm scatters,
// and the signal line draws blue → green with "Working".
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { DesignStage, E, lerp, rand, seg } from "../demos/_fixtures/Motion";
import { NamedCursor } from "../Cursor";
import { C, F } from "../theme";

const DEMO = 180;
const MONO = F.mono;
const DISP = F.display;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Shell = { from: [number, number]; rot: number; ft: number };
const SH: Record<string, Shell> = {
  urlPill: { from: [0, -60], rot: 0, ft: 0.04 },
  topLine: { from: [80, -40], rot: 4, ft: 0.07 },
  mark: { from: [-140, -30], rot: -8, ft: 0.1 },
  card: { from: [220, 30], rot: 6, ft: 0.13 },
  cta: { from: [-70, 120], rot: -4, ft: 0.17 },
  social: { from: [130, 60], rot: 5, ft: 0.2 },
};

// Blocks carried by cursors: final x/y, where they come from, cursor grip (offset inside the block).
type Carried = { x: number; y: number; font: string; color: string; ls: number; text: string; from: [number, number]; grip: [number, number]; who: string; tint: string; delay: number };
const CARRIED: Carried[] = [
  { x: 22, y: 64, font: `700 29px ${DISP}`, color: C.text, ls: -0.6, text: "Your whole", from: [-150, 40], grip: [70, 18], who: "Apache", tint: "#d14b6a", delay: 34 },
  { x: 22, y: 100, font: `700 29px ${DISP}`, color: C.accentText, ls: -0.6, text: "PHP stack.", from: [-160, 230], grip: [62, 20], who: "PHP", tint: "#7a86ff", delay: 42 },
  { x: 41, y: 35, font: `700 12px ${DISP}`, color: C.text, ls: 0, text: "NexDB", from: [120, -60], grip: [20, 9], who: "Laravel", tint: "#f05340", delay: 50 },
  { x: 312, y: 92, font: `700 36px ${DISP}`, color: C.text, ls: -1, text: "8.4", from: [560, 60], grip: [26, 24], who: "MySQL", tint: "#3d8fd6", delay: 58 },
  { x: 33, y: 172, font: `700 7.5px ${MONO}`, color: "#ffffff", ls: 1.2, text: "START ALL", from: [60, 330], grip: [20, 6], who: "Node", tint: "#4fae4f", delay: 66 },
  { x: 22, y: 143, font: `600 6.5px ${MONO}`, color: C.accentText, ls: 1.5, text: "FOR PHP & LARAVEL DEVELOPERS", from: [-180, 150], grip: [60, 5], who: "Composer", tint: "#c9a35c", delay: 74 },
  { x: 366, y: 242, font: `600 7px ${MONO}`, color: C.text3, ls: 1.2, text: "WINDOWS 10/11", from: [560, 290], grip: [28, 6], who: "Git", tint: "#f0703a", delay: 82 },
];
// Extra swarm members (no block): they drift and join the gather.
const EXTRA = [
  { who: "Redis", tint: "#d8423a", from: [520, -40] as [number, number], home: [230, 205] as [number, number], delay: 100 },
  { who: "Vite", tint: "#a970ff", from: [-60, 300] as [number, number], home: [180, 30] as [number, number], delay: 106 },
  { who: "You", tint: C.accent, from: [260, 320] as [number, number], home: [140, 210] as [number, number], delay: 112 },
];

// Small labels keep the per-char 3D landing (demo params).
type Block = { x: number; y: number; font: string; color: string; ls: number; start: number; s: string };
const SMALL: Block[] = [
  { x: 122, y: 173, font: `500 7.5px ${MONO}`, color: C.text3, ls: 1.5, start: 0.62, s: "LOGS" },
  { x: 24, y: 14, font: `500 7px ${MONO}`, color: C.text3, ls: 1, start: 0.64, s: "localhost" },
  { x: 306, y: 61, font: `600 6.5px ${MONO}`, color: C.text2, ls: 1.5, start: 0.66, s: "PHP" },
  { x: 408, y: 61, font: `600 6.5px ${MONO}`, color: C.ok, ls: 1.2, start: 0.68, s: "RUNNING" },
  { x: 306, y: 164, font: `500 6px ${MONO}`, color: C.text3, ls: 1.5, start: 0.7, s: "APACHE · MYSQL · NODE" },
  { x: 18, y: 246, font: `500 6.5px ${MONO}`, color: "#4f5662", ls: 1.5, start: 0.74, s: "NEXDB · BY NEXIO DEVS" },
];
let seed = 0;
const CHARS = SMALL.map((b) =>
  Array.from(b.s, () => {
    const k = seed++;
    return { dx: (rand(k) - 0.5) * 340, dy: (rand(k + 50) - 0.5) * 260, dz: -120 - rand(k + 99) * 300, rx: (rand(k + 7) - 0.5) * 340, ry: (rand(k + 13) - 0.5) * 380, rz: (rand(k + 23) - 0.5) * 240 };
  }),
);

const GATHER_AT = 196;
const CLICK_AT = 226;
const SCATTER_AT = 238;
const BTN = { x: 22 + 37, y: 166 + 12 }; // Start all centre

export const S01Assemble: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = Math.min(1, frame / (DEMO - 1));
  const sp = (d: number) => spring({ frame: frame - d, fps, config: { damping: 15, stiffness: 90, mass: 0.9 } });
  // Carrying a word is heavier than flying in empty-handed: a slower spring (~1.6s) so the drag reads.
  const carry = (d: number, f = frame) => spring({ frame: f - d, fps, config: { damping: 18, stiffness: 34, mass: 1.15 } });
  const gather = easeInOut(clamp01((frame - GATHER_AT) / 26));
  const scatter = interpolate(frame, [SCATTER_AT, SCATTER_AT + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const press = interpolate(frame, [CLICK_AT - 3, CLICK_AT, CLICK_AT + 5], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const push = interpolate(frame, [CLICK_AT, duration], [1, 1.04], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const draw = interpolate(frame, [CLICK_AT + 2, CLICK_AT + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const green = interpolate(frame, [CLICK_AT + 26, CLICK_AT + 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outFade = interpolate(frame, [duration - 8, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const shell = ({ from, rot, ft }: Shell): React.CSSProperties => {
    const a = seg(t, ft, ft + 0.14, E.outBack);
    const s = a > 0 && a < 0.97 ? 1 - a : 0;
    return {
      position: "absolute",
      opacity: t >= ft ? Math.min(1, seg(t, ft, ft + 0.05) * 1.5) : 0,
      transform: `translate(${lerp(a, from[0], 0)}px,${lerp(a, from[1], 0)}px) rotate(${lerp(a, rot, 0)}deg)`,
      filter: s > 0.03 ? `blur(${s * 2}px)` : "none",
    };
  };

  // Cursor pose: spring in to its home, drift once settled, gather on Start all, scatter out.
  const cursorAt = (i: number, from: [number, number], home: [number, number], delay: number, phase: number, heavy = false) => {
    const s = heavy ? carry(delay) : sp(delay);
    let x = interpolate(s, [0, 1], [from[0], home[0]]);
    let y = interpolate(s, [0, 1], [from[1], home[1]]);
    const settled = clamp01((frame - delay - (heavy ? 52 : 26)) / 10);
    const dx = (Math.sin(frame * 0.055 + phase) * 46 + Math.sin(frame * 0.021 + phase * 2) * 30) / 4; // design px
    const dy = (Math.cos(frame * 0.047 + phase * 1.3) * 38 + Math.cos(frame * 0.017 + phase) * 24) / 4;
    x += dx * settled * (1 - gather * 0.55);
    y += dy * settled * (1 - gather * 0.55);
    const ang = (i / 10) * Math.PI * 2;
    const gx = BTN.x + Math.cos(ang) * 30;
    const gy = BTN.y + Math.sin(ang) * 18;
    x = interpolate(gather, [0, 1], [x, gx + dx * 0.25]);
    y = interpolate(gather, [0, 1], [y, gy + dy * 0.25]);
    x += Math.cos(ang) * 420 * scatter;
    y += Math.sin(ang) * 260 * scatter;
    return { x, y, s };
  };

  const LINE_LEN = 236;
  return (
    <DesignStage bg={C.deep} raster="zoom">
      <div style={{ position: "absolute", inset: 0, opacity: outFade, transform: `scale(${push})`, transformOrigin: "30% 45%" }}>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(260px 150px at 72% 30%, rgba(47,106,224,.16), transparent 70%), linear-gradient(180deg,#101318,${C.deep})` }}>
          <div style={{ position: "absolute", inset: 0, opacity: 0.5, background: "repeating-linear-gradient(0deg,transparent 0 23px,rgba(255,255,255,.025) 23px 24px),repeating-linear-gradient(90deg,transparent 0 23px,rgba(255,255,255,.025) 23px 24px)" }} />
          <div style={{ ...shell(SH.urlPill), left: 18, top: 11, width: 78, height: 14, border: `1px solid ${C.borderStrong}`, borderRadius: 9 }} />
          <div style={{ ...shell(SH.topLine), right: 18, top: 16, width: 52, height: 5, background: C.surface2, borderRadius: 2 }} />
          <div style={{ ...shell(SH.mark), left: 24, top: 37, width: 11, height: 11, borderRadius: 3, background: C.accent, boxShadow: "0 0 10px rgba(47,106,224,.6)" }} />
          <div style={{ ...shell(SH.card), left: 296, top: 52, width: 162, height: 150, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <div style={{ position: "absolute", left: 0, top: 24, width: "100%", height: 1, background: C.border }} />
            <div style={{ position: "absolute", left: 0, top: 104, width: "100%", height: 1, background: C.border }} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ position: "absolute", left: 10 + i * 30, top: 124, width: 24, height: 16, background: C.surface3, borderRadius: 3 }} />
            ))}
          </div>
          <div style={{ ...shell(SH.cta), left: 22, top: 166, width: 74, height: 24, background: C.accent, borderRadius: 7, boxShadow: `0 6px ${18 + press * 14}px -6px rgba(47,106,224,${0.8 + press * 0.2})`, transform: `${shell(SH.cta).transform} scale(${1 - press * 0.06})` }} />
          <div style={{ ...shell(SH.social), left: 352, top: 243, width: 8, height: 8, borderRadius: "50%", background: C.ok, boxShadow: `0 0 8px ${C.ok}` }} />

          {/* small labels: per-char 3D landing */}
          {SMALL.map((b, bi) => {
            const n = b.s.length;
            const step = Math.min(0.012, Math.max(0.002, (0.94 - b.start - 0.13) / n));
            return (
              <div key={bi} style={{ position: "absolute", left: b.x, top: b.y, font: b.font, color: b.color, letterSpacing: b.ls, whiteSpace: "nowrap" }}>
                {Array.from(b.s, (ch, k) => {
                  const c = CHARS[bi][k];
                  const ft = b.start + k * step;
                  const a = seg(t, ft, ft + 0.13, E.outCubic);
                  return (
                    <span
                      key={k}
                      style={{
                        display: "inline-block",
                        opacity: a > 0 ? Math.min(1, a * 1.8) : 0,
                        transform: a >= 1 ? "none" : `perspective(600px) translate3d(${lerp(a, c.dx, 0)}px,${lerp(a, c.dy, 0)}px,${lerp(a, c.dz, 0)}px) rotateX(${lerp(a, c.rx, 0)}deg) rotateY(${lerp(a, c.ry, 0)}deg) rotateZ(${lerp(a, c.rz, 0)}deg)`,
                      }}
                    >
                      {ch === " " ? " " : ch}
                    </span>
                  );
                })}
              </div>
            );
          })}

          {/* carried blocks: they ride with their cursor until it lands, with a little lag-tilt */}
          {CARRIED.map((b, i) => {
            const home: [number, number] = [b.x + b.grip[0], b.y + b.grip[1]];
            const carried = carry(b.delay);
            const bx = interpolate(carried, [0, 1], [b.from[0] - b.grip[0], b.x]);
            const by = interpolate(carried, [0, 1], [b.from[1] - b.grip[1], b.y]);
            const vel = carry(b.delay) - carry(b.delay, frame - 1);
            return (
              <div key={i} style={{ position: "absolute", left: bx, top: by, font: b.font, color: b.color, letterSpacing: b.ls, whiteSpace: "nowrap", opacity: frame >= b.delay ? 1 : 0, transform: `rotate(${clamp01(Math.abs(vel) * 6) * (i % 2 ? -4 : 4)}deg)`, textShadow: carried < 0.98 ? "0 6px 14px rgba(0,0,0,.6)" : "none" }}>
                {b.text}
              </div>
            );
          })}

          {/* signal line under the headline (after the click) */}
          <svg width={480} height={270} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            <defs>
              <linearGradient id="s01g" x1="22" x2="258" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={C.accent} stopOpacity=".2" />
                <stop offset={0.7 - green * 0.25} stopColor={C.accentHi} />
                <stop offset={0.72 - green * 0.25} stopColor={green > 0 ? C.ok : C.accentHi} />
                <stop offset="1" stopColor={green > 0 ? C.ok : C.accentHi} />
              </linearGradient>
            </defs>
            <path d="M22 136 C 90 136, 150 131, 258 133" stroke="url(#s01g)" strokeWidth={1.3} fill="none" strokeLinecap="round" strokeDasharray={LINE_LEN} strokeDashoffset={LINE_LEN * (1 - draw)} />
          </svg>
          <div style={{ position: "absolute", left: 214, top: 139, opacity: green, display: "flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 10, border: `0.5px solid ${C.border}`, background: C.surface, font: `600 6px ${F.text}`, color: C.text2 }}>
            <span style={{ width: 3.5, height: 3.5, borderRadius: "50%", background: C.ok, boxShadow: `0 0 4px ${C.ok}` }} />
            Working
          </div>

          {/* the swarm */}
          {CARRIED.map((b, i) => {
            const p = cursorAt(i, b.from, [b.x + b.grip[0], b.y + b.grip[1]], b.delay, i * 1.37, true);
            return <NamedCursor key={b.who} x={p.x} y={p.y} name={b.who} color={b.tint} size={15} badge={clamp01((frame - b.delay - 12) / 12)} />;
          })}
          {EXTRA.map((e, j) => {
            const i = CARRIED.length + j;
            const p = cursorAt(i, e.from, e.home, e.delay, i * 1.37);
            const isYou = e.who === "You";
            const pos = isYou ? { x: interpolate(gather, [0, 1], [p.x, BTN.x + 4]) + 0, y: interpolate(gather, [0, 1], [p.y, BTN.y - 2]) } : p;
            return <NamedCursor key={e.who} x={pos.x} y={pos.y} name={e.who} color={e.tint} size={15} badge={clamp01((frame - e.delay - 12) / 12)} pressed={isYou ? press : 0} />;
          })}
          {/* click ripple on Start all */}
          {frame >= CLICK_AT && frame < CLICK_AT + 10 && (
            <div style={{ position: "absolute", left: BTN.x + 4, top: BTN.y - 2, width: 7, height: 7, borderRadius: "50%", border: "0.6px solid #8fb3ff", transform: `translate(-50%,-50%) scale(${0.3 + Easing.out(Easing.cubic)((frame - CLICK_AT) / 10) * 1.6})`, opacity: (1 - (frame - CLICK_AT) / 10) * 0.85 }} />
          )}
        </div>
      </div>
    </DesignStage>
  );
};
