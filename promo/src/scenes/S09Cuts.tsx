// #9 Beat cuts: four more things NexDB does, one per 4 beats (cuts on beats 116/120/124/128),
// each a real screen with a slow PageCam drift and a small label chip. 3f crossfades on the cut.
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { PageCam, type CamKey } from "../lib/PageCam";
import { C, F } from "../theme";
import { beatIn } from "../timeline";

const CUTS: { src: string; label: string; a: Omit<CamKey, "frame">; b: Omit<CamKey, "frame"> }[] = [
  { src: "textures/mail.png", label: "Catch every email your app sends", a: { cx: 640, cy: 330, zoom: 1.75, rotY: 5 }, b: { cx: 700, cy: 360, zoom: 1.9, rotY: 3 } },
  { src: "textures/dash-running.png", label: "PostgreSQL and Redis too", a: { cx: 760, cy: 640, zoom: 1.7, rotY: -5 }, b: { cx: 780, cy: 700, zoom: 1.85, rotY: -3 } },
  { src: "textures/versions.png", label: "Every version, one click", a: { cx: 760, cy: 300, zoom: 1.55, rotX: 6 }, b: { cx: 760, cy: 360, zoom: 1.7, rotX: 4 } },
  { src: "textures/settings.png", label: "Starts with Windows, your way", a: { cx: 600, cy: 300, zoom: 1.8, rotY: 6 }, b: { cx: 640, cy: 320, zoom: 1.95, rotY: 4 } },
];

export const S09Cuts: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const at = [0, beatIn("s09Cuts", 120), beatIn("s09Cuts", 124), beatIn("s09Cuts", 128), duration];
  return (
    <AbsoluteFill style={{ background: C.deep }}>
      {CUTS.map((c, i) => {
        const from = at[i];
        const to = at[i + 1];
        if (f < from - 3 || f >= to) return null;
        const fadeIn = interpolate(f, [from - 3, from], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const chip = interpolate(f, [from + 2, from + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
        return (
          <AbsoluteFill key={i} style={{ opacity: i === 0 ? 1 : fadeIn }}>
            <PageCam src={c.src} pageH={1080} keys={[{ frame: from, persp: 1700, ...c.a }, { frame: to, persp: 1700, ...c.b }]} />
            <div
              style={{
                position: "absolute",
                left: 120,
                bottom: 84,
                opacity: chip,
                transform: `translateY(${(1 - chip) * 16}px)`,
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 26px",
                borderRadius: 14,
                background: "rgba(23,26,31,.85)",
                border: `1px solid ${C.border}`,
                font: `600 36px ${F.text}`,
                color: C.text,
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: C.ok, boxShadow: `0 0 10px ${C.ok}` }} />
              {c.label}
            </div>
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};
