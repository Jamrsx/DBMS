// #14 The connection map lights up stop by stop on beats 192–200 (Visitors → tunnel → This PC →
// Site files → Database). Base = the real live overview; stops not lit yet are dimmed in place.
// A green pulse travels each link as it connects (Signal Path).
// + space-camera-moves · exploded-view (demos/ExplodedView.tsx) once the map is lit: the page tilts and
// its parts burst apart along Z — the five stops and the side bar float at their own depths, then
// click back together in reverse with a 2f screen shake. Kept: per-layer 14f ease-out-back(1.7)
// out, 3f stagger, 12f ease-in-cubic back in reverse order, depth 60–320 with far layers dimmer,
// fake shadows on the base that drift and blur with height, base darkens by 22%, shake 13·e^(−t/1.3).
// Changed: layers are crops of the real overview capture; tilt rotateX 18 / rotateY −12 around the map.
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from "remotion";
import { PageCam } from "../lib/PageCam";
import { C } from "../theme";
import { beatIn } from "../timeline";

const NODES = [
  [293, 162, 208, 126],
  [523, 162, 186, 126],
  [731, 162, 186, 126],
  [939, 162, 186, 126],
  [1147, 162, 186, 126],
];

export const S14Map: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const cl = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const lit = NODES.map((_, i) => beatIn("s14Map", 192 + i * 2));
  const keys = [
    { frame: 0, cx: 520, cy: 225, zoom: 2.2, rotY: 8, rotX: 6, persp: 1600 },
    { frame: lit[4] + 10, cx: 815, cy: 230, zoom: 1.75, rotY: 3, rotX: 6, persp: 1700 },
    { frame: duration, cx: 815, cy: 236, zoom: 1.68, rotY: 2, rotX: 6, persp: 1700 },
  ];
  const fade = interpolate(f, [duration - 6, duration], [1, 0], cl);
  const boomAt = lit[4] + 16;
  const toBoom = interpolate(f, [boomAt - 6, boomAt], [0, 1], cl);
  return (
    <AbsoluteFill style={{ opacity: fade, background: C.deep }}>
      {f >= boomAt - 6 && <Exploded f={f - boomAt} opacity={toBoom} />}
      <AbsoluteFill style={{ opacity: 1 - toBoom }}>
      <PageCam src="textures/nh-overview.png" pageH={1080} keys={keys} ease={Easing.bezier(0.33, 0, 0.15, 1)}>
        {/* the practice site's sample "problem" card stays out of this shot */}
        <div style={{ position: "absolute", left: 280, top: 300, width: 1070, height: 200, background: C.bg }} />
        {NODES.map(([x, y, w, h], i) => {
          const on = interpolate(f, [lit[i], lit[i] + 5], [0, 1], cl);
          const flash = interpolate(f, [lit[i], lit[i] + 3, lit[i] + 14], [0, 1, 0], cl);
          return (
            <React.Fragment key={i}>
              {/* not lit yet: a dark veil with a grey "Off" look */}
              <div style={{ position: "absolute", left: x - 2, top: y - 2, width: w + 4, height: h + 4, borderRadius: 10, background: "rgba(15,17,20,.82)", opacity: 1 - on }} />
              <div style={{ position: "absolute", left: x - 2, top: y - 2, width: w + 4, height: h + 4, borderRadius: 10, boxShadow: `0 0 0 2px rgba(92,203,139,${flash}), 0 0 30px rgba(92,203,139,${flash * 0.6})` }} />
              {/* link pulse into this stop */}
              {i > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: NODES[i - 1][0] + NODES[i - 1][2] + interpolate(f, [lit[i] - 6, lit[i]], [0, x - (NODES[i - 1][0] + NODES[i - 1][2])], cl) - 4,
                    top: y + h / 2 - 4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: C.ok,
                    boxShadow: `0 0 10px ${C.ok}`,
                    opacity: interpolate(f, [lit[i] - 6, lit[i] - 4, lit[i], lit[i] + 2], [0, 1, 1, 0], cl),
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </PageCam>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const LAYERS = [
  { x: 0, y: 0, w: 262, h: 1080, z: 120 }, // side bar
  ...NODES.map(([x, y, w, h], i) => ({ x: x - 2, y: y - 2, w: w + 4, h: h + 4, z: [260, 190, 320, 150, 230][i] })),
];
const N = LAYERS.length;
const EXPLODE = 6;
const STAGGER = 3;
const Exploded: React.FC<{ f: number; opacity: number }> = ({ f, opacity }) => {
  const ASSEMBLE = 66;
  const CLOSE = ASSEMBLE + (N - 1) * STAGGER + 12;
  const cl = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const layerP = (order: number) =>
    interpolate(f, [EXPLODE + order * STAGGER, EXPLODE + order * STAGGER + 14], [0, 1], { ...cl, easing: Easing.out(Easing.back(1.7)) }) *
    (1 - interpolate(f, [ASSEMBLE + (N - 1 - order) * STAGGER, ASSEMBLE + (N - 1 - order) * STAGGER + 12], [0, 1], { ...cl, easing: Easing.in(Easing.cubic) }));
  const g =
    interpolate(f, [EXPLODE, EXPLODE + 24], [0, 1], { ...cl, easing: Easing.out(Easing.cubic) }) *
    (1 - interpolate(f, [ASSEMBLE, CLOSE], [0, 1], { ...cl, easing: Easing.in(Easing.cubic) }));
  const since = f - CLOSE;
  const env = since >= 0 ? 13 * Math.exp(-since / 1.3) : 0;
  const tilt = interpolate(f, [-6, 20], [0, 1], { ...cl, easing: Easing.inOut(Easing.cubic) });
  const CX = 815;
  const CY = 300;
  const crop = (x: number, y: number) => (
    <Img src={staticFile("textures/nh-overview.png")} style={{ position: "absolute", left: -x, top: -y, width: 1920, height: 1080 }} />
  );
  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden", perspective: 1600, transform: `translate(${env * Math.sin(since * 3.3)}px, ${env * 0.7 * Math.sin(since * 4.7 + 1.1)}px)` }}>
      <div
        style={{
          position: "absolute",
          left: 960 - CX,
          top: 540 - CY,
          width: 1920,
          height: 1080,
          transformOrigin: `${CX}px ${CY}px`,
          transform: `scale(${1.75 - 0.55 * tilt}) rotateX(${18 * tilt}deg) rotateY(${-12 * tilt}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", filter: `brightness(${1 - g * 0.22})` }}>
          {crop(0, 0)}
          <div style={{ position: "absolute", left: 280, top: 300, width: 1070, height: 200, background: C.bg }} />
        </div>
        {LAYERS.map((L, i) => {
          const p = Math.min(1, Math.max(0, layerP(i)));
          if (p <= 0.01) return null;
          return (
            <div key={`sh${i}`} style={{ position: "absolute", left: L.x + L.z * 0.16 * p, top: L.y + L.z * 0.26 * p, width: L.w, height: L.h, borderRadius: 10, background: "rgba(0,0,0,0.30)", filter: `blur(${8 + L.z * 0.09 * p}px)`, opacity: 0.5 * p, transform: "translateZ(2px)" }} />
          );
        })}
        {LAYERS.map((L, i) => {
          const p = layerP(i);
          const pc = Math.min(1, Math.max(0, p));
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: L.x,
                top: L.y,
                width: L.w,
                height: L.h,
                overflow: "hidden",
                borderRadius: i === 0 ? 0 : 10,
                transform: `translateZ(${L.z * p}px)`,
                filter: `brightness(${1 - (1 - L.z / 320) * 0.28 * pc})`,
                boxShadow: pc > 0.02 ? `0 ${10 + L.z * 0.1 * pc}px ${16 + L.z * 0.14 * pc}px rgba(0,0,0,${0.3 + 0.2 * pc}), 0 0 0 ${pc}px rgba(92,203,139,.6)` : "none",
              }}
            >
              {crop(L.x, L.y)}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
