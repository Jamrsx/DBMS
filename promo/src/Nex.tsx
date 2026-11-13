// Nex, the NexDB mascot, for the video. The drawing's own mood animations (wave, cheer, magic…)
// are CSS; here they are paused and seeked to the current frame (negative delay), so every render
// shows the same pose on the same frame. Extra motion comes from the wrapper transform.
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import raw from "./assets/nexSvg";

export type Mood = "hello" | "idle" | "thinking" | "loading" | "success" | "error" | "sleeping" | "wizard" | "teacher";

const BASE = raw
  .replace(/\swidth="\d+"\s+height="\d+"/, "")
  .replace(/\srole="img"\s+aria-label="[^"]*"/, "")
  .replace(/<title>[\s\S]*?<\/title>/, "");

let uid = 0;

export const Nex: React.FC<{
  mood: Mood;
  size: number;
  /** Seconds of mood animation to show (defaults to the shot's own time). */
  time?: number;
  style?: React.CSSProperties;
}> = ({ mood, size, time, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const id = React.useMemo(() => `nexv${uid++}`, []);
  const t = time ?? frame / fps;
  const html = React.useMemo(() => BASE.replace('class="nex s-idle"', `class="nex s-${mood}"`), [mood]);
  return (
    <div className={id} style={{ width: size, height: size, ...style }}>
      <style>{`.${id} svg{width:100%;height:100%;overflow:visible}
.${id} svg *{animation-play-state:paused!important;animation-delay:-${t.toFixed(3)}s!important}`}</style>
      <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};
