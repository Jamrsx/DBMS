// #15 Build-up into the drop: the real Go live tab. The public address reveals left to right
// (wipe) and a green live dot pulses on the beats; the camera pushes in toward the drop.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { PageCam } from "../lib/PageCam";
import { C } from "../theme";
import { beatIn } from "../timeline";
import { GuideCursor } from "../Cursor";

const ADDR = { x: 293, y: 255, w: 1040, h: 30 };

export const S15GoLive: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const cl = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const wipeFrom = beatIn("s15GoLive", 206);
  const wipe = interpolate(f, [wipeFrom, wipeFrom + 22], [0, 1], { ...cl, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const beat = (n: number) => beatIn("s15GoLive", n);
  const pulse = [208, 209, 210, 211, 212, 213, 214, 215].reduce((m, n) => Math.max(m, interpolate(f, [beat(n), beat(n) + 2, beat(n) + 10], [0, 1, 0], cl)), 0);
  const keys = [
    { frame: 0, cx: 700, cy: 230, zoom: 1.7, rotY: -7, rotX: 5, persp: 1600 },
    { frame: duration, cx: 640, cy: 270, zoom: 2.35, rotY: -2, rotX: 3, persp: 1600 },
  ];
  return (
    <AbsoluteFill>
      <PageCam src="textures/nh-golive.png" pageH={1080} keys={keys} ease={Easing.in(Easing.quad)}>
        {/* address hidden until it "connects", then wiped in */}
        <div style={{ position: "absolute", left: ADDR.x + ADDR.w * wipe, top: ADDR.y - 2, width: ADDR.w * (1 - wipe), height: ADDR.h + 4, background: C.bg }} />
        <div
          style={{
            position: "absolute",
            left: ADDR.x - 26,
            top: ADDR.y + ADDR.h / 2 - 7,
            width: 14,
            height: 14,
            borderRadius: 7,
            background: C.ok,
            opacity: wipe,
            boxShadow: `0 0 ${8 + pulse * 22}px ${C.ok}`,
            transform: `scale(${1 + pulse * 0.5})`,
          }}
        />
        <GuideCursor
          ways={[
            { f: 0, x: 900, y: 520 },
            { f: wipeFrom - 2, x: ADDR.x + 70, y: ADDR.y + 16 },
            { f: wipeFrom, x: ADDR.x + 70, y: ADDR.y + 16, click: true },
            { f: wipeFrom + 40, x: ADDR.x + 150, y: ADDR.y + 120 },
          ]}
          f={f}
          size={15}
          show={interpolate(f, [wipeFrom + 26, wipeFrom + 40], [1, 0], cl)}
        />
      </PageCam>
    </AbsoluteFill>
  );
};
