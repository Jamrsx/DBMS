// #13 Deploy → the connection map — line-carry-transition (demos/LineCarryTransition.tsx), the film's
// one signature transition. Kept exactly: world 3840, the one path (progress 560 + run 1640 + right-angle
// frame 560×330, total 3980), progress 0–24 out-cubic, run 24–34, camera 1920px over 34–94 inOut-cubic,
// drawn = 1100 + cam while panning (pen tip pinned ≈x1500), frame 94–112, content fade 112–124, tip
// unmounted from 118, ≥36f stillness. Changed: the demo clock starts OFF frames in (A shows the real
// Deploy output first), 6px line in the signal colours (blue on A, green once it frames B), A = real
// Deploy output, B = real NexHost overview with the live map.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Shot } from "../Shot";
import { C, F, ROOM_BG } from "../theme";

const PATH = "M 400 705 L 2600 705 L 2600 375 L 3160 375 L 3160 705 L 2600 705";
const SEGS: [number, number, number, number, number][] = [
  [400, 705, 2600, 705, 2200],
  [2600, 705, 2600, 375, 330],
  [2600, 375, 3160, 375, 560],
  [3160, 375, 3160, 705, 330],
  [3160, 705, 2600, 705, 560],
];
const TOTAL = 3980;
const OFF = 22;

const tipAt = (drawn: number): [number, number] => {
  let d = Math.max(0, Math.min(drawn, TOTAL));
  for (const [x1, y1, x2, y2, len] of SEGS) {
    if (d <= len) {
      const t = d / len;
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    }
    d -= len;
  }
  return [2600, 705];
};

export const S13LineCarry: React.FC<{ duration: number }> = ({ duration }) => {
  const raw = useCurrentFrame();
  const frame = raw - OFF;
  const cam = interpolate(frame, [34, 94], [0, 1920], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  let drawn: number;
  if (frame < 24) drawn = interpolate(frame, [0, 24], [0, 560], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  else if (frame < 34) drawn = interpolate(frame, [24, 34], [560, 1100], { extrapolateRight: "clamp" });
  else if (frame < 94) drawn = 1100 + cam;
  else drawn = interpolate(frame, [94, 112], [3020, TOTAL], { easing: Easing.out(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const content = interpolate(frame, [112, 124], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tipOn = frame < 118;
  const tipO = interpolate(frame, [112, 118], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const [tx, ty] = tipAt(drawn);
  const green = drawn > 2200; // turns green as it starts to frame the live site
  const enter = interpolate(raw, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const out = interpolate(raw, [duration - 6, duration], [1, 0], { extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ background: ROOM_BG, overflow: "hidden", opacity: enter * out }}>
      <div style={{ position: "absolute", width: 3840, height: 1080, transform: `translateX(${-cam}px)` }}>
        <div style={{ position: "absolute", left: 1920, top: 0, width: 1920, height: 1080, background: "radial-gradient(900px 600px at 60% 50%, rgba(92,203,139,.08), transparent 70%)" }} />
        {/* A: the real Deploy output */}
        <div style={{ position: "absolute", left: 400, top: 262, font: `700 52px ${F.display}`, color: C.text, letterSpacing: -1.5 }}>Update site</div>
        <div style={{ position: "absolute", left: 400, top: 350, width: 560, height: 330, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.borderStrong}`, boxShadow: "0 30px 70px -30px rgba(0,0,0,.9)" }}>
          <Shot src="textures/nh-deploy-done.png" region={{ x: 285, y: 400, w: 1040, h: 612 }} />
        </div>
        <div style={{ position: "absolute", left: 400, top: 702, width: 560, height: 6, borderRadius: 3, background: C.border }} />
        <svg width={3840} height={1080} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="s13g" x1="400" x2="3160" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={C.accent} />
              <stop offset="0.7" stopColor={C.accentHi} />
              <stop offset="0.8" stopColor={C.ok} />
              <stop offset="1" stopColor={C.ok} />
            </linearGradient>
          </defs>
          <path d={PATH} fill="none" stroke="url(#s13g)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={TOTAL} strokeDashoffset={TOTAL - drawn} />
          {tipOn && <circle cx={tx} cy={ty} r={11} fill={green ? C.ok : C.accentHi} opacity={tipO} style={{ filter: `drop-shadow(0 0 8px ${green ? C.ok : C.accentHi})` }} />}
        </svg>
        {/* B: the live site, framed by the line */}
        <div style={{ position: "absolute", left: 2603, top: 378, width: 554, height: 324, borderRadius: 4, overflow: "hidden", opacity: content }}>
          <Shot src="textures/nh-overview.png" region={{ x: 285, y: 20, w: 520, h: 304 }} />
        </div>
        <div style={{ position: "absolute", left: 2600, top: 287, font: `700 52px ${F.display}`, color: C.ok, letterSpacing: -1.5, opacity: content }}>Live, updated.</div>
      </div>
    </AbsoluteFill>
  );
};
