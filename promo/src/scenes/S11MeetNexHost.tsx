// #11 Meet NexHost — icon-performance-moves · attention-bounce (demos/AttentionBounce.tsx) with Nex
// as the jumper (new Nex animation). Kept: 4 rising jumps (16/18/20/24f, peaks 0.5/0.75/0.95/1.2×
// icon), parabola, stretch |1−2t|·0.14, landing squash over 6f (1.2×/0.8×), pre-crouch 3f, dust 3 per
// landing over 12f, camera push 8% during the highest jump, panel back(1.8) after landing.
// Changed: all demo frames shifted +OFF so the 4th landing hits beat 153; panel = the real NexHost
// overview; label "NexHost"; dark tokens. Nex looks up while jumping, then waves.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { Nex } from "../Nex";
import { Shot } from "../Shot";
import { C, F, ROOM_BG } from "../theme";
import { beatIn } from "../timeline";

const ICON = 400;
const GROUND = 940;
const CX = 560;

export const S11MeetNexHost: React.FC<{ duration: number }> = ({ duration }) => {
  const OFF = beatIn("s11MeetNexHost", 153) - 96; // demo's 4th landing is f96
  const f = useCurrentFrame() - OFF;
  const JUMPS = [
    { start: 12, dur: 16, peak: 0.5 * ICON },
    { start: 30, dur: 18, peak: 0.75 * ICON },
    { start: 50, dur: 20, peak: 0.95 * ICON },
    { start: 72, dur: 24, peak: 1.2 * ICON },
  ];
  let y = 0;
  let squash = 0;
  let stretch = 0;
  JUMPS.forEach((j) => {
    const t = (f - j.start) / j.dur;
    if (t > 0 && t < 1) {
      y = j.peak * 4 * t * (1 - t);
      stretch = Math.abs(1 - 2 * t) * 0.14;
    }
    const land = j.start + j.dur;
    if (f >= land && f < land + 6) squash = Math.max(squash, 1 - (f - land) / 6);
  });
  if (f >= 9 && f < 12) squash = Math.max(squash, ((f - 9) / 3) * 0.7);
  const sx = 1 + squash * 0.2 - stretch * 0.5;
  const sy = 1 - squash * 0.2 + stretch;
  const zoom = 1 + 0.08 * interpolate(f, [72, 88], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  const dusts: { x: number; y: number; r: number; op: number }[] = [];
  JUMPS.forEach((j, ji) => {
    const life = (f - (j.start + j.dur)) / 12;
    if (life <= 0 || life >= 1) return;
    for (let k = 0; k < 3; k++) {
      const seed = ji * 3 + k;
      const dir = k === 1 ? 0 : k === 0 ? -1 : 1;
      const spread = (60 + 40 * Math.abs(Math.sin(seed * 5.7))) * (ji + 2) * 0.45;
      const e = Easing.out(Easing.cubic)(life);
      dusts.push({
        x: CX + dir * (ICON * 0.42 + spread * e) + (dir === 0 ? 30 * Math.sin(seed * 3.1) * e : 0),
        y: GROUND - 14 - 46 * e * (0.6 + 0.5 * Math.abs(Math.sin(seed * 2.3))),
        r: 12 + 6 * Math.abs(Math.sin(seed * 4.9)) - 8 * life,
        op: (1 - life) * 0.8,
      });
    }
  });
  const panelT = interpolate(f, [98, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.8)) });
  const landed = f >= 96;
  const enter = 1; // pushed in from below (Main PUSH)
  const out = interpolate(useCurrentFrame(), [duration - 6, duration], [1, 0], { extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ background: ROOM_BG, opacity: enter * out, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transformOrigin: `${CX}px ${GROUND - ICON / 2}px` }}>
        <div style={{ position: "absolute", left: 120, top: GROUND, width: 1680, height: 3, background: C.border, borderRadius: 2 }} />
        {dusts.map((d, i) => (
          <div key={i} style={{ position: "absolute", left: d.x - d.r, top: d.y - d.r, width: d.r * 2, height: d.r * 2, borderRadius: d.r, background: C.borderStrong, opacity: d.op }} />
        ))}
        <div
          style={{
            position: "absolute",
            left: CX - ICON * 0.42 * (1 - y / (ICON * 2.4)),
            top: GROUND + 8,
            width: ICON * 0.84 * (1 - y / (ICON * 2.4)),
            height: 26,
            borderRadius: "50%",
            background: "rgba(47,106,224,.35)",
            filter: "blur(8px)",
            opacity: 1 - (y / (ICON * 1.6)) * 0.5,
          }}
        />
        <div style={{ position: "absolute", left: CX - ICON / 2, top: GROUND - ICON - y + 20, transform: `scale(${sx},${sy})`, transformOrigin: "50% 100%" }}>
          <Nex mood={landed ? "hello" : "idle"} size={ICON} />
        </div>
        {panelT > 0 && (
          <div style={{ position: "absolute", left: CX + ICON / 2 + 50, top: GROUND - ICON - 120, transform: `scale(${panelT})`, transformOrigin: "left bottom", opacity: Math.min(1, panelT * 1.5) }}>
            <div style={{ position: "relative", width: 900, height: 470, borderRadius: 18, overflow: "hidden", border: `1px solid ${C.borderStrong}`, boxShadow: "0 40px 90px -30px rgba(0,0,0,.9), 0 0 60px -20px rgba(47,106,224,.6)" }}>
              <Shot src="textures/nh-overview.png" region={{ x: 0, y: 0, w: 1350, h: 705 }} />
            </div>
            <div style={{ position: "absolute", top: -30, left: 26, padding: "10px 24px", borderRadius: 24, background: C.accent, color: "#fff", font: `800 26px ${F.display}` }}>NexHost</div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
