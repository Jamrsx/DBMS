// #6 New-project starters — card-stack (demos/CardStack.tsx). Kept: 8 cards, spring(·,0.3) entrance
// from y 300 with stagger 0.033 over a 0.3 window, opacity min(1, inT·4), fan 0.55→0.8 inOutCubic,
// rot k·8°, tx k·34px, tz −10|k|, perspective 900, transform-origin 50% 130%, zIndex 20−|2k|.
// Changed: one colour family (NexDB surfaces + blue), card faces = the app's real starters,
// DEMO=160 (a little slower), and the fanned deck holds for the caption.
import React from "react";
import { useCurrentFrame } from "remotion";
import { DesignStage, E, lerp, seg } from "../demos/_fixtures/Motion";
import { C, F } from "../theme";

const DEMO = 160;
const N = 8;
const CARDS = [
  { t: "Laravel", s: "with a database", g: "L" },
  { t: "Laravel + React", s: "Inertia kit", g: "⚛" },
  { t: "Laravel + Vue", s: "Inertia kit", g: "V" },
  { t: "Livewire", s: "Laravel kit", g: "⚡" },
  { t: "WordPress", s: "database ready", g: "W" },
  { t: "Next.js", s: "pages & routing", g: "N" },
  { t: "React (Vite)", s: "TypeScript", g: "⚛" },
  { t: "PHP page", s: "index.php", g: "</>" },
];

export const S06Starters: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const t = Math.min(1, f / (DEMO - 1));
  const out = Math.min(1, Math.max(0, (duration - f) / 6));
  return (
    <DesignStage bg={C.deep} raster="zoom">
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(220px 140px at 50% 60%, rgba(47,106,224,.14), transparent 70%), ${C.deep}`, perspective: "900px", overflow: "hidden", opacity: out }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 22, textAlign: "center", font: `600 7px ${F.mono}`, letterSpacing: 2, color: C.accentText, opacity: seg(t, 0.05, 0.15) }}>
          NEW PROJECT
        </div>
        {CARDS.map((c, i) => {
          const inT = seg(t, 0.02 + i * 0.033, 0.02 + i * 0.033 + 0.3);
          const y = lerp(E.spring(inT, 0.3), 300, 0);
          const fan = seg(t, 0.55, 0.8, E.inOutCubic);
          const k = i - (N - 1) / 2;
          const rot = k * 8 * fan;
          const tx = k * 34 * fan;
          const tz = -10 * Math.abs(k) * fan;
          const hero = i === 0 || i === 1;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 110,
                height: 150,
                boxSizing: "content-box",
                margin: "-85px 0 0 -55px",
                borderRadius: 12,
                transformOrigin: "50% 130%",
                background: `linear-gradient(165deg, ${hero ? "#1d2a45" : C.surface2}, ${C.surface})`,
                border: `1px solid ${hero ? "rgba(91,143,240,.55)" : C.borderStrong}`,
                boxShadow: "0 12px 34px rgba(0,0,0,.6)",
                transform: `translate3d(${tx}px,${y}px,${tz}px) rotate(${rot}deg)`,
                opacity: Math.min(1, inT * 4),
                zIndex: 20 - Math.abs(k * 2),
              }}
            >
              <div style={{ position: "absolute", left: 11, top: 12, right: 8, font: `700 10px/1.15 ${F.display}`, color: C.text, letterSpacing: -0.2 }}>{c.t}</div>
              <div style={{ position: "absolute", left: 11, top: 28, font: `500 6px ${F.text}`, color: C.text3 }}>{c.s}</div>
              <div style={{ position: "absolute", left: "50%", top: "60%", transform: "translate(-50%,-50%)", font: `700 30px ${F.display}`, color: hero ? C.accentText : C.text3 }}>{c.g}</div>
              <div style={{ position: "absolute", left: 11, bottom: 10, display: "flex", alignItems: "center", gap: 3, font: `600 5px ${F.mono}`, color: C.ok, letterSpacing: 0.6 }}>
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: C.ok }} /> READY IN MINUTES
              </div>
            </div>
          );
        })}
      </div>
    </DesignStage>
  );
};
