// #10 Breakdown title "Now… host it." over gradient-transition (demos/GradientTransition.tsx).
// Kept: linear phase (angle 40→230, HSL per-channel lerp) → radial (centre (28,66)→(72,32), radius
// 45→85%) → conic (from 0→300, not a full turn), cross-fades 0.30–0.38 / 0.63–0.71, inOutQuad phases.
// Changed per the card's brand notes: NexDB blue/teal/green instead of the rainbow, conic as a
// three-colour loop (A→B→C→A), the label pill removed, and a dark scrim (0.62) under the title.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { E, lerp, seg } from "../demos/_fixtures/Motion";
import { C, F } from "../theme";
import { beatIn } from "../timeline";

const hsl = (h: number, s: number, l: number) => `hsl(${h},${s}%,${l}%)`;
type H3 = [number, number, number];
const mixH = (a: H3, b: H3, k: number): H3 => [lerp(k, a[0], b[0]), lerp(k, a[1], b[1]), lerp(k, a[2], b[2])];
const layer = (background: string, opacity: number): React.CSSProperties => ({ position: "absolute", inset: 0, background, opacity });

export const S10Gradient: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const t = Math.min(1, f / (duration - 1));
  const p1 = seg(t, 0, 0.4, E.inOutQuad);
  const bg1 = `linear-gradient(${lerp(p1, 40, 230)}deg, ${hsl(...mixH([221, 74, 30], [200, 70, 26], p1))}, ${hsl(...mixH([228, 60, 12], [150, 45, 16], p1))})`;
  const p2 = seg(t, 0.33, 0.7, E.inOutQuad);
  const bg2 = `radial-gradient(circle ${lerp(p2, 45, 85)}% at ${lerp(p2, 28, 72)}% ${lerp(p2, 66, 32)}%, ${hsl(...mixH([221, 75, 46], [150, 50, 42], p2))}, ${hsl(...mixH([220, 55, 9], [225, 50, 7], p2))})`;
  const p3 = seg(t, 0.66, 1, E.inOutQuad);
  const bg3 = `conic-gradient(from ${p3 * 300}deg at 50% 50%, hsl(221,72%,40%), hsl(190,60%,34%), hsl(146,48%,38%), hsl(221,72%,40%))`;

  const cl = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const b134 = beatIn("s10Gradient", 134);
  const b138 = beatIn("s10Gradient", 138);
  const now = interpolate(f, [b134, b134 + 24], [0, 1], { ...cl, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const host = interpolate(f, [b138, b138 + 24], [0, 1], { ...cl, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const enter = 1; // pushed in from below (Main PUSH)
  const out = interpolate(f, [duration - 8, duration], [1, 0], cl);

  return (
    <AbsoluteFill style={{ background: C.deep, opacity: enter * out }}>
      <div style={layer(bg1, 1 - seg(t, 0.3, 0.38))} />
      <div style={layer(bg2, seg(t, 0.3, 0.38) - seg(t, 0.63, 0.71))} />
      <div style={layer(bg3, seg(t, 0.63, 0.71))} />
      <div style={layer(`rgba(7,9,12,.62)`, 1)} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 36 }}>
        <span style={{ font: `700 150px/1 ${F.display}`, letterSpacing: -5, color: C.text, opacity: now, transform: `translateY(${(1 - now) * 40}px)` }}>Now…</span>
        <span style={{ font: `700 150px/1 ${F.display}`, letterSpacing: -5, color: C.ok, opacity: host, transform: `translateY(${(1 - host) * 40}px)` }}>host it.</span>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
