// #12 Files -> Import project -> the project lands -> edit a file right here. Four real states of the
// NexHost panel, crossfaded on beats 165/169/172 under one PageCam move; the guide cursor
// (cursor-flyover) clicks each one. (The practice site has no .env, so the editor shows index.php.)
// + graze-face-tour (demos/GrazeFaceTour.tsx) once the editor is open: the camera skims the editor
// surface at a steep angle in two relay legs. Kept: perspective 1050 at 50% 46%, leg tilts
// (rx 12 / ry 30 / rz −6, then rx 14 / ry 28 / rz −5 — legs 1 and 3 of the demo), easeIO
// bezier(0.45,0,0.25,1) pan per leg, 7f crossfade, screen-space DOF (blur 16 outside the focus
// ellipse), cool vignette. Changed: real editor capture instead of the drawn grey UI; two legs.
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from "remotion";
import { PageCam } from "../lib/PageCam";
import { GuideCursor } from "../Cursor";
import { beatIn } from "../timeline";

const STATES = ["nh-files", "nh-import", "nh-imported", "nh-editor"];
const CLICKS = [
  { x: 1209 + 62, y: 185 + 16 }, // Import project
  { x: 1209 + 62, y: 185 + 16 }, // Import (picker)
  { x: 301 + 56, y: 382 + 22 }, // index.php row
];
const easeIO = Easing.bezier(0.45, 0, 0.25, 1);
type Leg = { rx: number; ry: number; rz: number; zoom: number; x: [number, number]; y: [number, number] };
// page-space points the camera skims over (code lines 350–760 × 205–290, tabs y≈130)
const LEGS: Leg[] = [
  { rx: 12, ry: 30, rz: -6, zoom: 2.1, x: [380, 700], y: [200, 290] }, // along the code lines
  { rx: 14, ry: -26, rz: 5, zoom: 2.0, x: [330, 760], y: [70, 150] }, // the site name, then the tabs
];

export const S12ImportEdit: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const cl = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const at = [0, beatIn("s12ImportEdit", 165), beatIn("s12ImportEdit", 169), beatIn("s12ImportEdit", 172)];
  const keys = [
    { frame: 0, cx: 1000, cy: 260, zoom: 1.7, rotY: -6, rotX: 4, persp: 1700 },
    { frame: at[1], cx: 820, cy: 300, zoom: 1.75, rotY: -4, rotX: 4, persp: 1700 },
    { frame: at[2], cx: 760, cy: 400, zoom: 1.8, rotY: -3, rotX: 4, persp: 1700 },
    { frame: at[3], cx: 760, cy: 360, zoom: 1.5, rotY: -3, rotX: 5, persp: 1700 },
    { frame: duration, cx: 760, cy: 380, zoom: 1.46, rotY: -2, rotX: 5, persp: 1700 },
  ];
  const fade = interpolate(f, [duration - 6, duration], [1, 0], cl);
  const grazeAt = at[3] + 16;
  const legLen = Math.round((duration - grazeAt) / 2);
  const toGraze = interpolate(f, [grazeAt - 7, grazeAt], [0, 1], cl);
  const press = CLICKS.map((_, i) => at[i + 1] - 4);
  const ways = [
    { f: 0, x: 980, y: 520 },
    { f: press[0] - 2, x: CLICKS[0].x, y: CLICKS[0].y },
    { f: press[0], x: CLICKS[0].x, y: CLICKS[0].y, click: true },
    { f: press[1] - 3, x: CLICKS[1].x, y: CLICKS[1].y },
    { f: press[1], x: CLICKS[1].x, y: CLICKS[1].y, click: true },
    { f: press[2] - 2, x: CLICKS[2].x, y: CLICKS[2].y },
    { f: press[2], x: CLICKS[2].x, y: CLICKS[2].y, click: true },
    { f: press[2] + 26, x: 520, y: 560 },
  ];
  const cursorShow = interpolate(f, [press[2] + 14, press[2] + 26], [1, 0], cl);
  return (
    <AbsoluteFill style={{ opacity: fade, background: "#060608" }}>
      {toGraze < 1 && (
        <AbsoluteFill style={{ opacity: 1 - toGraze }}>
          <PageCam src="textures/nh-files.png" pageH={1080} keys={keys} ease={Easing.bezier(0.33, 0, 0.15, 1)}>
            {STATES.slice(1).map((s, i) => (
              <Img key={s} src={staticFile(`textures/${s}.png`)} style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: interpolate(f, [at[i + 1], at[i + 1] + 4], [0, 1], cl) }} />
            ))}
            <GuideCursor ways={ways} f={f} size={17} show={cursorShow} />
          </PageCam>
        </AbsoluteFill>
      )}
      {f >= grazeAt - 7 && <Graze f={f - grazeAt} legLen={legLen} opacity={toGraze} />}
    </AbsoluteFill>
  );
};

const GrazeStage: React.FC<{ f: number; legLen: number }> = ({ f, legLen }) => (
  <AbsoluteFill style={{ background: "#060608" }}>
    {LEGS.map((leg, i) => {
      const local = f - i * legLen;
      if (local < -7 || local > legLen + 7) return null;
      const t = Math.min(1, Math.max(0, local / legLen));
      const o = interpolate(local, [-7, 0, legLen - 7, legLen], [i === 0 ? 1 : 0, 1, 1, i === LEGS.length - 1 ? 1 : 0]);
      const cx = interpolate(t, [0, 1], leg.x, { easing: easeIO });
      const cy = interpolate(t, [0, 1], leg.y, { easing: easeIO });
      return (
        <AbsoluteFill key={i} style={{ opacity: o, perspective: 1050, perspectiveOrigin: "50% 46%" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "50% 50%", transform: `scale(${leg.zoom}) rotateX(${leg.rx}deg) rotateY(${leg.ry}deg) rotateZ(${leg.rz}deg) translate(${960 - cx}px, ${540 - cy}px)` }}>
            <Img src={staticFile("textures/nh-editor.png")} style={{ width: 1920, height: 1080 }} />
          </div>
        </AbsoluteFill>
      );
    })}
  </AbsoluteFill>
);

const Graze: React.FC<{ f: number; legLen: number; opacity: number }> = ({ f, legLen, opacity }) => {
  const seg = f < legLen ? 0 : 1;
  const fx = [44, 46][seg];
  const fy = [46, 44][seg];
  const mask = `radial-gradient(ellipse 58% 52% at ${fx}% ${fy}%, transparent 34%, rgba(0,0,0,0.85) 72%, black 92%)`;
  return (
    <AbsoluteFill style={{ opacity }}>
      <GrazeStage f={f} legLen={legLen} />
      <AbsoluteFill style={{ filter: "blur(16px) brightness(0.92)", WebkitMaskImage: mask, maskImage: mask }}>
        <GrazeStage f={f} legLen={legLen} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 80% at 50% 45%, transparent 40%, rgba(2,2,6,0.55) 78%, rgba(1,1,4,0.9) 100%)" }} />
    </AbsoluteFill>
  );
};
