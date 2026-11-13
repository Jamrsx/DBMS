// #7 Projects -> Database -> Terminal -> overview — basic-3d-scene (demos/Basic3DScene.tsx).
// Kept: the four poses (x/y/z/ry/rz/s, incl. the rz90 stop and OVERVIEW s=3.1 with content ÷2.2),
// camera = inverse transform in Z→Y→X order, perspective 1000, focus opacity 0.28 floor + blur 3.5.
// Changed: flights start on beats 78/85/93 (FLY_AT from the shot length), FLY 0.12 (the card's floor
// for rotating moves), cards hold real screens; the terminal card is drawn (the browser preview has
// no terminal), styled like NexDB's terminal; NexDB tokens.
import React from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { DesignStage, E, lerp, seg } from "../demos/_fixtures/Motion";
import { Shot } from "../Shot";
import { C, F } from "../theme";
import { beatIn } from "../timeline";

const POSES = [
  { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, tt: "PROJECTS", sub: "Every project, ready" },
  { x: 520, y: -60, z: -180, rx: 0, ry: -40, rz: 0, s: 1, tt: "DATABASE", sub: "Browse and edit data" },
  { x: 160, y: 300, z: -520, rx: 0, ry: 0, rz: 90, s: 1, tt: "TERMINAL", sub: "PHP · Composer · Node · Git" },
  { x: 220, y: 90, z: -260, rx: 0, ry: 0, rz: 0, s: 3.1, tt: "NEXDB", sub: "Everything a PHP dev needs" },
];

const TERM = [
  { c: C.text3, s: "PS C:\\NexDB\\www\\my-shop>" },
  { c: C.text, s: "composer install" },
  { c: C.ok, s: "  Installing dependencies… done" },
  { c: C.text, s: "php artisan migrate" },
  { c: C.ok, s: "  INFO  Ran 12 migrations." },
  { c: C.text, s: "npm run dev" },
  { c: C.accentText, s: "  VITE ready in 412 ms" },
];

export const S07Tour: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const D = duration - 1;
  const t = Math.min(1, f / D);
  const FLY_AT = [beatIn("s07Tour", 78) / D, beatIn("s07Tour", 85) / D, beatIn("s07Tour", 93) / D];
  const FLY = 0.12;

  let af = 0;
  const cam = { ...POSES[0] };
  for (let i = 0; i < FLY_AT.length; i++) {
    const fl = seg(t, FLY_AT[i], FLY_AT[i] + FLY, E.inOutCubic);
    af += fl;
    const p = POSES[i + 1];
    cam.x = lerp(fl, cam.x, p.x);
    cam.y = lerp(fl, cam.y, p.y);
    cam.z = lerp(fl, cam.z, p.z);
    cam.rx = lerp(fl, cam.rx, p.rx);
    cam.ry = lerp(fl, cam.ry, p.ry);
    cam.rz = lerp(fl, cam.rz, p.rz);
    cam.s = lerp(fl, cam.s, p.s);
  }
  const over = seg(t, FLY_AT[2], FLY_AT[2] + FLY);
  const enter = seg(t, 0, 0.04, E.outCubic);

  return (
    <DesignStage bg={C.deep} raster="zoom">
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: `radial-gradient(ellipse at 50% 40%, #121a2b 0%, ${C.deep} 70%)`, perspective: "1000px", opacity: enter }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 0,
            height: 0,
            transformStyle: "preserve-3d",
            transform: `scale(${1.3 / cam.s}) rotateZ(${-cam.rz}deg) rotateY(${-cam.ry}deg) rotateX(${-cam.rx}deg) translate3d(${-cam.x}px,${-cam.y}px,${-cam.z}px)`,
          }}
        >
          {POSES.map((p, i) => {
            const last = i === POSES.length - 1;
            const d = Math.min(1, Math.abs(af - i));
            const focus = Math.max(1 - d, over);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: last ? -160 : -110,
                  top: last ? -100 : -70,
                  width: last ? 320 : 220,
                  height: last ? 200 : 140,
                  boxSizing: "border-box",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: C.surface,
                  border: `1px solid ${i === Math.round(af) && !last ? "rgba(91,143,240,.6)" : C.borderStrong}`,
                  boxShadow: "0 18px 50px rgba(0,0,0,.6)",
                  transform: `translate3d(${p.x}px,${p.y}px,${p.z}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg) scale(${p.s / (last ? 2.2 : 1)})`,
                  color: C.text,
                  opacity: 0.28 + focus * 0.72,
                  filter: `blur(${(1 - focus) * 3.5}px)`,
                }}
              >
                {i === 0 && <Shot src="textures/projects.png" region={{ x: 262, y: 28, w: 1060, h: 675 }} />}
                {i === 1 && <Shot src="textures/database-table.png" region={{ x: 262, y: 70, w: 1010, h: 643 }} />}
                {i === 2 && (
                  <div style={{ position: "absolute", inset: 0, background: "#0c0e12", padding: "22px 10px 8px", font: `500 7px/1.55 ${F.mono}` }}>
                    {TERM.map((l, k) => (
                      <div key={k} style={{ color: l.c, opacity: seg(t, FLY_AT[1] + FLY + k * 0.012, FLY_AT[1] + FLY + k * 0.012 + 0.02) || (af < 1.5 ? 1 : 0) }}>
                        {l.s}
                      </div>
                    ))}
                  </div>
                )}
                {last && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: `radial-gradient(circle at 50% 40%, #1d2a45, ${C.surface})` }}>
                    <Img src={staticFile("nexdb-logo.png")} style={{ width: 54, height: 54, borderRadius: 12 }} />
                    <div style={{ font: `700 26px ${F.display}`, letterSpacing: -0.8 }}>NexDB</div>
                  </div>
                )}
                {/* label strip */}
                <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 16, display: "flex", alignItems: "center", gap: 6, padding: "0 8px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ font: `700 6px ${F.mono}`, letterSpacing: 1.6, color: C.accentText }}>{p.tt}</span>
                  <span style={{ font: `500 6px ${F.text}`, color: C.text3 }}>{p.sub}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DesignStage>
  );
};
