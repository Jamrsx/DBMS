// Cursors for the film. Arrow path + white outline from demos/CursorCastEnsemble (named actors) and
// the click ripple from demos/CursorFlyover (0.3→1.9× ring over ~10f, opacity 0.85→0, fill flash).
import React from "react";
import { Easing, interpolate } from "remotion";
import { F } from "./theme";

export const ARROW = "M0.5 0.5 L0.5 17.2 L4.7 13.4 L7.3 19.5 L10 18.3 L7.4 12.3 L13 12.3 Z";

/** A named, coloured cursor (collab style). `size` is the arrow height in the parent's px. */
export const NamedCursor: React.FC<{ x: number; y: number; name: string; color: string; badge: number; size: number; pressed?: number }> = ({ x, y, name, color, badge, size, pressed = 0 }) => {
  const k = size / 20;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, zIndex: 20, transform: `scale(${1 - pressed * 0.12})`, transformOrigin: "0 0" }}>
      <svg width={13.5 * k} height={20 * k} viewBox="0 0 13.5 20" style={{ display: "block", overflow: "visible", filter: `drop-shadow(0 ${0.6 * k}px ${1.2 * k}px rgba(0,0,0,.55))` }}>
        <path d={ARROW} fill={color} stroke="#ffffff" strokeWidth={1.1} strokeLinejoin="round" />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 11 * k,
          top: 17 * k,
          whiteSpace: "nowrap",
          background: color,
          color: "#fff",
          borderRadius: 2.2 * k,
          padding: `${1.2 * k}px ${3.4 * k}px`,
          font: `700 ${5.6 * k}px ${F.text}`,
          opacity: badge,
          transform: `translateY(${(1 - badge) * 3 * k}px)`,
        }}
      >
        {name}
      </div>
    </div>
  );
};

export type Way = { f: number; x: number; y: number; click?: boolean };

/** The guide cursor's position at frame f along waypoints (in-out-cubic between them). */
export const along = (ways: Way[], f: number) => {
  if (f <= ways[0].f) return { x: ways[0].x, y: ways[0].y };
  for (let i = 0; i < ways.length - 1; i++) {
    const a = ways[i];
    const b = ways[i + 1];
    if (f <= b.f) {
      const t = interpolate(f, [a.f, b.f], [0, 1], { easing: Easing.inOut(Easing.cubic) });
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  const z = ways[ways.length - 1];
  return { x: z.x, y: z.y };
};

/** The single white guide cursor with click ripples, drawn in the parent's coordinate space. */
export const GuideCursor: React.FC<{ ways: Way[]; f: number; size?: number; show?: number }> = ({ ways, f, size = 26, show = 1 }) => {
  const p = along(ways, f);
  const k = size / 20;
  let ripple = -1;
  let ripX = 0;
  let ripY = 0;
  let pressed = 0;
  for (const w of ways) {
    if (!w.click) continue;
    const c = (f - w.f) / 10;
    if (c >= 0 && c < 1) {
      ripple = Easing.out(Easing.cubic)(c);
      ripX = w.x;
      ripY = w.y;
    }
    pressed = Math.max(pressed, interpolate(f, [w.f - 3, w.f, w.f + 4], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  }
  return (
    <>
      {ripple >= 0 && (
        <div
          style={{
            position: "absolute",
            left: ripX,
            top: ripY,
            width: 26 * k,
            height: 26 * k,
            borderRadius: "50%",
            border: `${2 * k}px solid #8fb3ff`,
            transform: `translate(-50%,-50%) scale(${0.3 + ripple * 1.6})`,
            opacity: (1 - ripple) * 0.85 * show,
            zIndex: 39,
          }}
        />
      )}
      <svg
        viewBox="0 0 13.5 20"
        width={13.5 * k}
        height={20 * k}
        style={{ position: "absolute", left: p.x, top: p.y, overflow: "visible", zIndex: 40, opacity: show, transform: `scale(${1 - pressed * 0.12})`, transformOrigin: "0 0", filter: `drop-shadow(0 ${1.5 * k}px ${2.5 * k}px rgba(0,0,0,.7))` }}
      >
        <path d={ARROW} fill={pressed > 0.3 ? "#dfe6ff" : "#ffffff"} stroke="#101320" strokeWidth={1.1} strokeLinejoin="round" />
      </svg>
    </>
  );
};
