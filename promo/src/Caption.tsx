// Bottom caption: a dark glass pill in the app's tokens. Fades/slides in, holds, fades out.
import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { C, F } from "./theme";

export const Caption: React.FC<{ text: string; duration: number; align?: "left" | "center" }> = ({ text, duration, align = "left" }) => {
  const f = useCurrentFrame();
  const inn = interpolate(f, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const out = interpolate(f, [duration - 10, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 84,
        left: align === "left" ? 120 : "50%",
        transform: `${align === "center" ? "translateX(-50%) " : ""}translateY(${(1 - inn) * 18}px)`,
        opacity: inn * out,
        padding: "16px 26px",
        borderRadius: 14,
        background: "rgba(23,26,31,.82)",
        border: `1px solid ${C.border}`,
        boxShadow: "0 20px 50px -20px rgba(0,0,0,.8)",
        backdropFilter: "blur(10px)",
        font: `600 36px/1.25 ${F.text}`,
        color: C.text,
        maxWidth: 1400,
        width: "max-content",
        boxSizing: "border-box",
        textAlign: align === "center" ? "center" : "left",
        letterSpacing: -0.3,
      }}
    >
      {text}
    </div>
  );
};
