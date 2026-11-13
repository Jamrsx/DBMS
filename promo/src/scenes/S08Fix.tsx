// #8 Check my setup -> Fix -> the check bursts. First the real Check my setup page (PageCam) with
// Nex as teacher, the "Set up addresses" fix gets pressed; then pop-burst-confirm
// (demos/PopBurstConfirm.tsx) full frame. Kept from the demo: anticipation 20→23 to 0.6x, hold to
// POP, 0.6→1.35 out-cubic, back(2) settle to 1, check drawn in 8f, 10 radial strokes over 14f
// (210→400px), ring 200→500px over 20f fading 0.85→0, label back(2.6) at +13f, then real stillness.
// Changed: green "it works" palette on dark, label "Fixed", POP lands on beat 108.
// + tension-camera-moves · bullet-time-freeze-orbit (demos/BulletTimeFreezeOrbit.tsx): the burst's own
// clock freezes FREEZE frames after POP for 60f while the camera orbits (rotateY 0→55° over 27f
// in-out-cubic, 10f hold, back over 23f; scale 1→1.12; sway −170·sin−60; perspective 1600), then resumes.
// + the guide cursor (cursor-flyover) clicks the Fix button.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing, Sequence } from "remotion";
import { PageCam } from "../lib/PageCam";
import { GuideCursor } from "../Cursor";
import { Nex } from "../Nex";
import { C, F, ROOM_BG } from "../theme";
import { beatIn } from "../timeline";

const FIX_BTN = { x: 1029, y: 404, w: 117, h: 28 };

export const S08Fix: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const pop = beatIn("s08Fix", 108); // the burst frame
  const burstFrom = pop - 27; // demo POP=27
  const press = burstFrom - 10;
  const cl = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const pressed = interpolate(f, [press - 3, press, press + 6], [0, 1, 0], cl);
  const toBurst = interpolate(f, [burstFrom - 4, burstFrom + 4], [0, 1], cl);
  const nexIn = interpolate(f, [8, 24], [0, 1], { ...cl, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - toBurst }}>
        <PageCam
          src="textures/health.png"
          pageH={1080}
          keys={[
            { frame: 0, cx: 760, cy: 300, zoom: 1.5, rotY: 6, rotX: 4, persp: 1700 },
            { frame: press, cx: 980, cy: 400, zoom: 1.9, rotY: 4, rotX: 3, persp: 1700 },
            { frame: burstFrom, cx: 1060, cy: 418, zoom: 2.3, rotY: 3, rotX: 2, persp: 1700 },
          ]}
        >
          <GuideCursor
            ways={[
              { f: 0, x: 760, y: 560 },
              { f: press - 2, x: FIX_BTN.x + 60, y: FIX_BTN.y + 16 },
              { f: press, x: FIX_BTN.x + 60, y: FIX_BTN.y + 16, click: true },
            ]}
            f={f}
            size={16}
          />
        </PageCam>
        <div style={{ position: "absolute", right: 90, bottom: 40, opacity: nexIn, transform: `translateY(${(1 - nexIn) * 200}px)` }}>
          <Nex mood="teacher" size={300} />
        </div>
      </AbsoluteFill>
      {f >= burstFrom - 4 && (
        <Sequence from={burstFrom}>
          <Burst opacity={toBurst} hold={duration - burstFrom} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

const POP = 27;
const FREEZE = POP + 6; // particles and ring mid-flight
const FREEZE_LEN = 60;
const Burst: React.FC<{ opacity: number; hold: number }> = ({ opacity, hold }) => {
  const real = useCurrentFrame();
  // bullet time: the burst's clock stops while the camera orbits, then carries on
  const f = real < FREEZE ? real : real < FREEZE + FREEZE_LEN ? FREEZE : real - FREEZE_LEN;
  const o = real - FREEZE; // orbit clock (demo frames 45→105 mapped to 0→60)
  const rotY =
    o < 27
      ? interpolate(o, [0, 27], [0, 55], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) })
      : o < 37
        ? 55
        : interpolate(o, [37, 60], [55, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const orbitT = rotY / 55;
  const camScale = 1 + 0.12 * orbitT;
  const camTx = -170 * Math.sin(orbitT * Math.PI * 0.5) - 60 * orbitT;
  const camTy = -24 * orbitT;
  const scale = (() => {
    if (f <= 20) return 1;
    if (f <= 23) return interpolate(f, [20, 23], [1, 0.6], { easing: Easing.in(Easing.quad) });
    if (f <= POP) return 0.6;
    if (f <= 33) return interpolate(f, [POP, 33], [0.6, 1.35], { easing: Easing.out(Easing.cubic) });
    return interpolate(f, [33, 44], [1.35, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) });
  })();
  const checkT = interpolate(f, [POP, POP + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const pt = interpolate(f, [POP, POP + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pDist = 210 + 190 * Easing.out(Easing.cubic)(pt);
  const pLen = 46 * (1 - pt);
  const rt = interpolate(f, [POP, POP + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ringR = 200 + 300 * Easing.out(Easing.cubic)(rt);
  const ringO = 0.85 * (1 - rt);
  const ringW = 16 - 12 * rt;
  const tagT = interpolate(f, [40, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(2.6)) });
  const out = interpolate(real, [hold - 6, hold], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const CX = 960;
  const CY = 470;
  return (
    <AbsoluteFill style={{ background: ROOM_BG, opacity: opacity * out, perspective: 1600 }}>
      <AbsoluteFill style={{ transform: `translateX(${camTx}px) translateY(${camTy}px) rotateY(${rotY}deg) scale(${camScale})`, transformStyle: "preserve-3d" }}>
      {rt > 0 && rt < 1 && (
        <svg width={1400} height={1400} style={{ position: "absolute", left: CX - 700, top: CY - 700 }}>
          <circle cx={700} cy={700} r={ringR} fill="none" stroke={C.ok} strokeWidth={ringW} opacity={ringO} />
        </svg>
      )}
      {pt > 0 && pt < 1 && (
        <svg width={1400} height={1400} style={{ position: "absolute", left: CX - 700, top: CY - 700 }}>
          {Array.from({ length: 10 }).map((_, i) => {
            const ang = ((i * 36 + 9 * Math.sin(i * 7.31)) * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={700 + Math.cos(ang) * pDist}
                y1={700 + Math.sin(ang) * pDist}
                x2={700 + Math.cos(ang) * (pDist + pLen)}
                y2={700 + Math.sin(ang) * (pDist + pLen)}
                stroke={i % 5 < 2 ? C.ok : C.text}
                strokeWidth={12}
                strokeLinecap="round"
                opacity={1 - pt}
              />
            );
          })}
        </svg>
      )}
      <svg width={480} height={480} viewBox="0 0 480 480" style={{ position: "absolute", left: CX - 240, top: CY - 240, transform: `scale(${scale})`, transformOrigin: "50% 50%" }}>
        <circle cx={240} cy={240} r={190} fill={C.surface} stroke={checkT > 0 ? C.ok : C.borderStrong} strokeWidth={22} />
        {checkT > 0 && (
          <path d="M 150 245 L 215 310 L 340 175" fill="none" stroke={C.ok} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - checkT} />
        )}
      </svg>
      {tagT > 0 && (
        <div
          style={{
            position: "absolute",
            left: CX - 130,
            top: CY + 300,
            width: 260,
            transform: `scale(${tagT})`,
            transformOrigin: "50% 0%",
            padding: "16px 0",
            borderRadius: 40,
            background: C.ok,
            color: "#08130d",
            textAlign: "center",
            font: `800 40px ${F.display}`,
            letterSpacing: 0.5,
          }}
        >
          Fixed
        </div>
      )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
