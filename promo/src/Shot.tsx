// A region of a captured screen (CSS px of the 1920x1080 page), filling its box.
import React from "react";
import { staticFile } from "remotion";

export const Shot: React.FC<{ src: string; region: { x: number; y: number; w: number; h: number }; style?: React.CSSProperties }> = ({ src, region, style }) => {
  const sx = 1920 / region.w;
  const sy = 1080 / region.h;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url(${staticFile(src)})`,
        backgroundSize: `${sx * 100}% ${sy * 100}%`,
        backgroundPosition: `${(region.x / (1920 - region.w || 1)) * 100}% ${(region.y / (1080 - region.h || 1)) * 100}%`,
        ...style,
      }}
    />
  );
};
