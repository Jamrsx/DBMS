// #2 Nex says hello (new Nex animation) + NexDB wordmark. Nex pops up on beat 0 with a squash
// (lands with overshoot 1.04), waves (the drawing's hello mood, seeked per frame) and blinks; the
// wordmark lands on beat 4, "One app." on beat 8, both hold ≥1s before the next shot.
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from "remotion";
import { Nex } from "../Nex";
import { C, F, ROOM_BG } from "../theme";
import { beatIn } from "../timeline";

const out = Easing.bezier(0.16, 1, 0.3, 1);
const land = Easing.bezier(0.34, 1.56, 0.64, 1); // y1 > 1: things that land overshoot a little

export const S02Nex: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const b4 = beatIn("s02Nex", 4);
  const b8 = beatIn("s02Nex", 8);
  const cl = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

  // Nex: rises from below with a squash on landing, then idles with a gentle float.
  const rise = interpolate(f, [0, 16], [0, 1], { ...cl, easing: land });
  const squash = interpolate(f, [14, 18, 24], [0, 1, 0], cl);
  const float = Math.sin((f / 30) * Math.PI * 0.9) * 6;
  const nexY = (1 - rise) * 420 + float;
  const sx = 1 + squash * 0.12;
  const sy = 1 - squash * 0.1;

  const wm = interpolate(f, [b4, b4 + 21], [0, 1], { ...cl, easing: out });
  const one = interpolate(f, [b8, b8 + 21], [0, 1], { ...cl, easing: out });
  const fade = interpolate(f, [duration - 6, duration], [1, 0], cl);
  const glow = interpolate(f, [b8, b8 + 30], [0, 1], cl);

  return (
    <AbsoluteFill style={{ background: ROOM_BG, opacity: fade }}>
      {/* soft floor light where Nex lands */}
      <div style={{ position: "absolute", left: 300, top: 760, width: 520, height: 90, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(47,106,224,.35), transparent)", opacity: rise }} />
      <div style={{ position: "absolute", left: 340, top: 300, transform: `translateY(${nexY}px) scale(${sx},${sy})`, transformOrigin: "50% 100%" }}>
        <Nex mood="hello" size={460} />
      </div>
      <div style={{ position: "absolute", left: 900, top: 352 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: wm, transform: `translateX(${(1 - wm) * 60}px)` }}>
          <Img src={staticFile("nexdb-logo.png")} style={{ width: 120, height: 120, borderRadius: 26, boxShadow: `0 0 ${40 + glow * 40}px rgba(47,106,224,${0.35 + glow * 0.25})` }} />
          <div style={{ font: `700 150px/1 ${F.display}`, letterSpacing: -5, color: C.text }}>NexDB</div>
        </div>
        <div style={{ marginTop: 34, font: `700 92px/1 ${F.display}`, letterSpacing: -3, color: C.accentText, opacity: one, transform: `translateY(${(1 - one) * 30}px)` }}>One app.</div>
      </div>
    </AbsoluteFill>
  );
};
