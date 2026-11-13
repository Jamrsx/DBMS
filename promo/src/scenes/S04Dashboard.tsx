// #4 Real Dashboard. Part 1: the guide cursor (cursor-flyover) glides to "Start all" and clicks it
// (beat 26); each service turns green on its own beat (27…33), real captures crossfaded (rows grow
// when running, so whole screens fade, 4f). The signal line runs down the rows. Part 2 (from beat 44):
// before-after-slider-scrub (demos/BeforeAfterSliderScrub.tsx) — Stopped vs Running. Kept: rest at 8%
// for 14f, fling to 76% in 12f out-cubic, settle to 70% (12f), hold to f56, slow scrub to 40% by f104
// (≈1/5 of the fling speed), handle squish from speed. Changed: real screens (before = stopped
// capture in the demo's grey low-contrast treatment), NexDB dark handle, labels STOPPED / RUNNING.
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from "remotion";
import { PageCam } from "../lib/PageCam";
import { GuideCursor } from "../Cursor";
import { C, F } from "../theme";
import { beatIn } from "../timeline";

const ROWS = [
  { x: 266, y: 294, w: 998, h: 87 },
  { x: 266, y: 427, w: 998, h: 88 },
  { x: 266, y: 516, w: 998, h: 88 },
  { x: 266, y: 650, w: 998, h: 87 },
  { x: 266, y: 737, w: 998, h: 108 },
  { x: 266, y: 892, w: 998, h: 107 },
];
const STEPS = [1, 2, 3, 4, 5, 6, 7];
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const S04Dashboard: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const press = beatIn("s04Dashboard", 26);
  const rowAt = ROWS.map((_, i) => beatIn("s04Dashboard", 28 + i));
  const stepAt = STEPS.map((_, i) => beatIn("s04Dashboard", 27 + i));
  const lastRow = rowAt[ROWS.length - 1];
  const sliderAt = beatIn("s04Dashboard", 44);

  const keys = [
    { frame: 0, cx: 1640, cy: 150, zoom: 2.3, rotY: -9, rotX: 5, persp: 1600 },
    { frame: press + 4, cx: 1600, cy: 160, zoom: 2.15, rotY: -8, rotX: 5, persp: 1600 },
    { frame: rowAt[0] + 2, cx: 780, cy: 420, zoom: 1.62, rotY: -5, rotX: 7, persp: 1700 },
    { frame: lastRow + 20, cx: 770, cy: 660, zoom: 1.48, rotY: -4, rotX: 9, persp: 1800 },
    { frame: sliderAt, cx: 770, cy: 690, zoom: 1.42, rotY: -3, rotX: 9, persp: 1800 },
  ];
  const lineTop = 300;
  const lineBottom = ROWS[ROWS.length - 1].y + ROWS[ROWS.length - 1].h / 2;
  const reach = interpolate(f, [rowAt[0] - 6, lastRow], [lineTop, lineBottom], { ...CL, easing: Easing.inOut(Easing.cubic) });
  const ways = [
    { f: 0, x: 1500, y: 300 },
    { f: press - 2, x: 1836, y: 66, click: false },
    { f: press, x: 1836, y: 66, click: true },
    { f: press + 30, x: 1700, y: 200 },
  ];
  const cursorShow = interpolate(f, [press + 18, press + 30], [1, 0], CL);
  const toSlider = interpolate(f, [sliderAt - 6, sliderAt], [0, 1], CL);
  const fade = interpolate(f, [duration - 6, duration], [1, 0], CL);

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      {toSlider < 1 && (
        <AbsoluteFill style={{ opacity: 1 - toSlider }}>
          <PageCam src="textures/dash-stopped.png" pageH={1080} keys={keys} ease={Easing.bezier(0.33, 0, 0.15, 1)}>
            {STEPS.map((_, i) => (
              <Img key={i} src={staticFile(`textures/dash-step-${i + 1}.png`)} style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: interpolate(f, [stepAt[i], stepAt[i] + 4], [0, 1], CL) }} />
            ))}
            <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
              {f >= rowAt[0] - 6 && (
                <>
                  <line x1={248} y1={lineTop} x2={248} y2={reach} stroke={C.ok} strokeWidth={6} opacity={0.3} style={{ filter: "blur(4px)" }} />
                  <line x1={248} y1={lineTop} x2={248} y2={reach} stroke={C.ok} strokeWidth={2.5} strokeLinecap="round" />
                  <circle cx={248} cy={reach} r={5} fill={C.ok} style={{ filter: `drop-shadow(0 0 6px ${C.ok})` }} />
                </>
              )}
            </svg>
            <GuideCursor ways={ways} f={f} size={18} show={cursorShow} />
          </PageCam>
        </AbsoluteFill>
      )}
      {f >= sliderAt - 6 && <Slider f={f - sliderAt} opacity={toSlider} />}
    </AbsoluteFill>
  );
};

const T0 = 14;
const FLING = 26;
const BOUNCE = 38;
const HOLD = 56;
const SCRUB = 104;
const posAt = (f: number): number => {
  if (f < FLING) return interpolate(f, [T0, FLING], [8, 76], { easing: Easing.out(Easing.cubic), ...CL });
  if (f < BOUNCE) return interpolate(f, [FLING, BOUNCE], [76, 70], { easing: Easing.inOut(Easing.cubic), ...CL });
  if (f < HOLD) return 70;
  return interpolate(f, [HOLD, SCRUB], [70, 40], { easing: Easing.inOut(Easing.quad), ...CL });
};

/** Running (after, left of the bar) vs Stopped (before, right of it), on the real dashboard. */
const Slider: React.FC<{ f: number; opacity: number }> = ({ f, opacity }) => {
  const p = posAt(f);
  const x = (p / 100) * 1920;
  const v = Math.abs(posAt(f) - posAt(f - 1));
  const squish = 1 + Math.min(v / 8, 1) * 0.18;
  // Both screens framed the same: the service list, a little zoomed.
  const frame: React.CSSProperties = { position: "absolute", left: -330, top: -230, width: 1920 * 1.55, height: 1080 * 1.55 };
  return (
    <AbsoluteFill style={{ background: C.deep, opacity }}>
      <div style={{ position: "absolute", inset: 0, filter: "contrast(0.55) brightness(0.9) grayscale(1)" }}>
        <Img src={staticFile("textures/dash-stopped.png")} style={frame} />
      </div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(7,9,12,0.35)" }} />
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${1920 - x}px 0 0)` }}>
        <Img src={staticFile("textures/dash-running.png")} style={frame} />
      </div>
      <div style={{ position: "absolute", left: x - 3, top: 0, width: 6, height: 1080, background: "#ffffff", boxShadow: "0 0 18px rgba(143,179,255,.6)" }} />
      <div
        style={{
          position: "absolute",
          left: x - 44,
          top: 540 - 44,
          width: 88,
          height: 88,
          borderRadius: 44,
          background: C.surface,
          border: "3px solid #ffffff",
          boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
          transform: `scaleX(${squish})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          boxSizing: "border-box",
        }}
      >
        <div style={{ width: 0, height: 0, borderTop: "10px solid transparent", borderBottom: "10px solid transparent", borderRight: `14px solid ${C.text2}` }} />
        <div style={{ width: 0, height: 0, borderTop: "10px solid transparent", borderBottom: "10px solid transparent", borderLeft: `14px solid ${C.text2}` }} />
      </div>
      <div style={{ position: "absolute", left: 70, top: 70, padding: "12px 24px", borderRadius: 12, background: "rgba(22,41,31,.92)", border: `1px solid ${C.ok}`, font: `700 30px ${F.mono}`, letterSpacing: 4, color: C.ok }}>● RUNNING</div>
      <div style={{ position: "absolute", right: 70, top: 70, padding: "12px 24px", borderRadius: 12, background: "rgba(23,26,31,.92)", border: `1px solid ${C.borderStrong}`, font: `700 30px ${F.mono}`, letterSpacing: 4, color: C.text3 }}>STOPPED</div>
    </AbsoluteFill>
  );
};
