import { useMemo } from "react";
import nexSvg from "../assets/nex.svg?raw";

/** Nex's moods. One drawing holds them all; the state is a class on its root. */
export type NexState = "hello" | "idle" | "thinking" | "loading" | "success" | "error" | "sleeping";

// The drawing without its fixed size, title and label, so CSS sizes it and each use labels it.
const BASE = nexSvg
  .replace(/\swidth="\d+"\s+height="\d+"/, "")
  .replace(/\srole="img"\s+aria-label="[^"]*"/, "")
  .replace(/<title>[\s\S]*?<\/title>/, "");

/**
 * Nex, the NexDB mascot. Decorative by default; pass `label` when Nex carries meaning on its own.
 * Its animations stop when Windows is set to reduce motion.
 */
export function Nex({ state, size = 96, label }: { state: NexState; size?: number; label?: string }) {
  const html = useMemo(() => BASE.replace('class="nex s-idle"', `class="nex s-${state}"`), [state]);
  return (
    <span
      className="nex-wrap"
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
