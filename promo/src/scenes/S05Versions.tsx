// #5 "Run PHP [8.4 · 8.3 · 8.2 · 7.4] per project" — avatar-bracket-carousel
// (demos/AvatarBracketCarousel.tsx). Kept: distance-driven scale 1−d·0.38 (min 0.5), opacity 1−d·0.62,
// blur min(3, d·2.4), STEP 76 in a 92px frame, spring(·,0.25) over 0.14, frame breath 7%, label fade
// 1−d·2.2. Changed: switches at 0.24/0.48/0.72 (interval 0.24, inside the card's 0.12–0.3) so they land
// on beats 47/50/53 with DEMO=182; version tiles instead of emoji avatars; NexDB tokens and fonts.
import React from "react";
import { useCurrentFrame } from "remotion";
import { DesignStage, E, seg } from "../demos/_fixtures/Motion";
import { C, F } from "../theme";

const DEMO = 182;
const AV = [
  { v: "8.4", role: "LARAVEL 12" },
  { v: "8.3", role: "LARAVEL 11" },
  { v: "8.2", role: "LARAVEL 10" },
  { v: "7.4", role: "OLDER APPS" },
];
const CORNERS = ["M4,26 L4,4 L26,4", "M66,4 L88,4 L88,26", "M88,66 L88,88 L66,88", "M26,88 L4,88 L4,66"];
const STEP = 76;
const SWITCHES = [0.24, 0.48, 0.72];

export const S05Versions: React.FC<{ duration: number }> = () => {
  const t = Math.min(1, useCurrentFrame() / (DEMO - 1));
  let pos = 0;
  SWITCHES.forEach((s0) => {
    pos += seg(t, s0, s0 + 0.14, (k) => E.spring(k, 0.25));
  });
  let breath = 0;
  SWITCHES.forEach((s0) => {
    breath += Math.sin(seg(t, s0, s0 + 0.1) * Math.PI);
  });
  const words = { color: C.text, fontWeight: 700, fontSize: 34, letterSpacing: -0.8, fontFamily: F.display } as const;
  const enter = seg(t, 0, 0.08, E.outCubic);

  return (
    <DesignStage bg={C.deep} raster="zoom">
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(180px 120px at 50% 50%, rgba(47,106,224,.14), transparent 70%), ${C.deep}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
          opacity: enter,
        }}
      >
        <div style={words}>Run PHP</div>
        <div style={{ position: "relative", width: 92, height: 92, flex: "none" }}>
          <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
            {AV.map((a, k) => {
              const d = Math.abs(k - pos);
              const sc = Math.max(0.5, 1 - d * 0.38);
              const op = Math.max(0, 1 - d * 0.62);
              return (
                <div
                  key={k}
                  style={{
                    position: "absolute",
                    left: -29,
                    top: -29,
                    width: 58,
                    height: 58,
                    borderRadius: 14,
                    background: `linear-gradient(160deg, ${C.surface3}, ${C.surface})`,
                    border: `1px solid ${C.borderStrong}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    font: `700 21px ${F.display}`,
                    color: C.text,
                    letterSpacing: -0.5,
                    boxShadow: "0 6px 18px rgba(0,0,0,.5)",
                    transform: `translateY(${(k - pos) * STEP}px) scale(${sc})`,
                    opacity: op * seg(t, 0.02 + k * 0.03, 0.12 + k * 0.03),
                    filter: `blur(${Math.min(3, d * 2.4)}px)`,
                  }}
                >
                  {a.v}
                </div>
              );
            })}
          </div>
          <div style={{ position: "absolute", inset: 0, zIndex: 3, transform: `scale(${1 + Math.min(1, breath) * 0.07})` }}>
            <svg width={92} height={92} viewBox="0 0 92 92">
              {CORNERS.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={C.accentHi} strokeWidth={4} strokeLinecap="round" />
              ))}
            </svg>
          </div>
          {AV.map((a, k) => (
            <div
              key={k}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%,64px)",
                color: C.accentText,
                font: `600 9px ${F.mono}`,
                letterSpacing: 1.2,
                whiteSpace: "nowrap",
                opacity: Math.max(0, 1 - Math.abs(k - pos) * 2.2),
              }}
            >
              {a.role}
            </div>
          ))}
        </div>
        <div style={words}>per project</div>
      </div>
    </DesignStage>
  );
};
