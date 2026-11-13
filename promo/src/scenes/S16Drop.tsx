// #16 The drop (big hit #2 on beat 216): "Build it. Host it. From your own PC." — one phrase per
// beat (216/218/220), then five NexHost feature chips pop in on beats 228–236 and the frame holds.
// The only frame-level hit here is the drop itself: a 4f light flash + the first words landing.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { C, F, ROOM_BG } from "../theme";
import { beatIn } from "../timeline";

const CHIPS = ["A database per site", "Deploy in one click", "Code editor", "SSH access", "HTTPS link"];
const land = Easing.bezier(0.34, 1.56, 0.64, 1);

export const S16Drop: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const cl = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const word = (n: number) => interpolate(f, [beatIn("s16Drop", n), beatIn("s16Drop", n) + 12], [0, 1], { ...cl, easing: land });
  const w1 = word(216);
  const w2 = word(218);
  const w3 = word(220);
  const flash = interpolate(f, [0, 1, 5], [0.55, 0.55, 0], cl);
  const out = interpolate(f, [duration - 8, duration], [1, 0], cl);
  return (
    <AbsoluteFill style={{ background: ROOM_BG, opacity: out }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, marginTop: -110 }}>
        <div style={{ display: "flex", gap: 34, font: `700 132px/1.02 ${F.display}`, letterSpacing: -4.5 }}>
          <span style={{ color: C.text, opacity: w1, transform: `translateY(${(1 - w1) * 50}px) scale(${0.9 + w1 * 0.1})` }}>Build it.</span>
          <span style={{ color: C.text, opacity: w2, transform: `translateY(${(1 - w2) * 50}px) scale(${0.9 + w2 * 0.1})` }}>Host it.</span>
        </div>
        <div style={{ font: `700 132px/1.02 ${F.display}`, letterSpacing: -4.5, color: C.ok, opacity: w3, transform: `translateY(${(1 - w3) * 50}px) scale(${0.9 + w3 * 0.1})` }}>From your own PC.</div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 740, display: "flex", justifyContent: "center", gap: 18 }}>
        {CHIPS.map((c, i) => {
          const at = beatIn("s16Drop", 228 + i * 2);
          const p = interpolate(f, [at, at + 10], [0, 1], { ...cl, easing: land });
          return (
            <div
              key={c}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "16px 24px",
                borderRadius: 999,
                border: `1px solid ${C.borderStrong}`,
                background: C.surface,
                font: `600 30px ${F.text}`,
                color: C.text,
                opacity: p,
                transform: `translateY(${(1 - p) * 24}px) scale(${0.85 + p * 0.15})`,
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 6, background: C.ok, boxShadow: `0 0 10px ${C.ok}` }} />
              {c}
            </div>
          );
        })}
      </div>
      <AbsoluteFill style={{ background: "#dfe8ff", opacity: flash, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
