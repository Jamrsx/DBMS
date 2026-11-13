// #16b NexHost in six words — beat-step-list-theme-cycle (demos/BeatStepListThemeCycle.tsx). Every
// 2 beats the list moves up one row, the pill lands on the next word and changes colour, and the
// whole field changes colour with it. Kept: 150px rows, 92px/800 words, unselected 34% white,
// 6f snap (1−(1−x)^3.2), pill squash 1.12→0.97→1, 300px top/bottom feather, 900px pill.
// Changed: NexHost features as the words, NexDB palette per step, steps pinned to shot beats.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "../theme";
import { beatsIn } from "../timeline";

const ROW_H = 150;
const WORDS = ["Import", "Edit", "Deploy", "Go live", "Auto-fix", "Your own server"];
const THEMES = [
  { pill: "#d8dce4", bg: "#10141c", ink: "#10141c" },
  { pill: "#5ccb8b", bg: "#0e1d16", ink: "#08130d" },
  { pill: "#2f6ae0", bg: "#0d1426", ink: "#ffffff" },
  { pill: "#8e6fd8", bg: "#191430", ink: "#ffffff" },
  { pill: "#e0a43a", bg: "#211a0e", ink: "#1a1206" },
  { pill: "#5ccb8b", bg: "#0b1912", ink: "#08130d" },
];
const snap = (t: number) => interpolate(t, [0, 1], [0, 1], { easing: (x) => 1 - Math.pow(1 - x, 3.2), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
const mix = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
};

export const S16bBeatStep: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const steps = WORDS.slice(1).map((_, i) => beatsIn("s16bBeatStep", 2 + i * 2));
  let beat = 0;
  steps.forEach((s, i) => {
    if (f >= s) beat = i + 1;
  });
  const tIn = beat === 0 ? 1 : snap((f - steps[beat - 1]) / 6);
  const step = beat === 0 ? 0 : beat - 1 + tIn;
  const prev = THEMES[Math.max(0, beat - 1)];
  const now = THEMES[beat];
  const mt = beat === 0 ? 1 : tIn;
  const pill = mix(prev.pill, now.pill, mt);
  const bg = mix(prev.bg, now.bg, mt);
  const pop = beat === 0 ? 1 : interpolate(tIn, [0, 0.6, 1], [1.12, 0.97, 1]);
  const enter = interpolate(f, [0, 8], [0.92, 1], { extrapolateRight: "clamp" });
  const out = interpolate(f, [duration - 6, duration], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ background: bg, opacity: out }}>
      <AbsoluteFill style={{ transform: `scale(${enter})` }}>
        <div style={{ position: "absolute", left: "50%", top: 540 - ROW_H / 2 + 10, width: 900, height: ROW_H - 20, transform: `translateX(-50%) scale(${pop})`, background: pill, borderRadius: 999, boxShadow: "0 14px 40px rgba(0,0,0,0.35)" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 540 - ROW_H / 2, transform: `translateY(${-step * ROW_H}px)` }}>
          {WORDS.map((w, i) => (
            <div key={w} style={{ height: ROW_H, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ font: `800 92px ${F.display}`, letterSpacing: -1.5, color: i === beat ? now.ink : "rgba(255,255,255,0.34)", position: "relative", zIndex: 2 }}>{w}</span>
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 300, background: `linear-gradient(${bg}, transparent)`, zIndex: 3 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 300, background: `linear-gradient(transparent, ${bg})`, zIndex: 3 }} />
      <div style={{ position: "absolute", left: 90, top: 80, zIndex: 4, font: `700 28px ${F.mono}`, letterSpacing: 6, color: C.ok }}>NEXHOST</div>
    </AbsoluteFill>
  );
};
