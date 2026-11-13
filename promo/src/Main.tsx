// The film: one Sequence per storyboard shot (timeline.ts), captions on top, audio last.
import React from "react";
import { AbsoluteFill, Easing, Freeze, Sequence, interpolate, useCurrentFrame } from "remotion";
import { C, F } from "./theme";
import { SHOTS, type ShotKey, dur } from "./timeline";
import { Caption } from "./Caption";
import { Sound } from "./Sound";
import { NARRATION } from "./narration";
import { S01Assemble } from "./scenes/S01Assemble";
import { S02Nex } from "./scenes/S02Nex";
import { S03Converge } from "./scenes/S03Converge";
import { S04Dashboard } from "./scenes/S04Dashboard";
import { S05Versions } from "./scenes/S05Versions";
import { S06Starters } from "./scenes/S06Starters";
import { S07Tour } from "./scenes/S07Tour";
import { S08Fix } from "./scenes/S08Fix";
import { S09Cuts } from "./scenes/S09Cuts";
import { S09bTerminal } from "./scenes/S09bTerminal";
import { S10Gradient } from "./scenes/S10Gradient";
import { S11MeetNexHost } from "./scenes/S11MeetNexHost";
import { S12ImportEdit } from "./scenes/S12ImportEdit";
import { S13LineCarry } from "./scenes/S13LineCarry";
import { S14Map } from "./scenes/S14Map";
import { S15GoLive } from "./scenes/S15GoLive";
import { S16Drop } from "./scenes/S16Drop";
import { S16bBeatStep } from "./scenes/S16bBeatStep";
import { S17Plans } from "./scenes/S17Plans";
import { S18Ending } from "./scenes/S18Ending";

/** Placeholder for shots not built yet (never shipped). */
const Todo: React.FC<{ name: string }> = ({ name }) => (
  <AbsoluteFill style={{ background: C.bg, color: C.text3, font: `600 48px ${F.mono}`, alignItems: "center", justifyContent: "center" }}>{name}</AbsoluteFill>
);

const SCENES: Partial<Record<ShotKey, React.FC<{ duration: number }>>> = {
  s01Assemble: S01Assemble,
  s02Nex: S02Nex,
  s03Converge: S03Converge,
  s04Dashboard: S04Dashboard,
  s05Versions: S05Versions,
  s06Starters: S06Starters,
  s07Tour: S07Tour,
  s08Fix: S08Fix,
  s09Cuts: S09Cuts,
  s09bTerminal: S09bTerminal,
  s10Gradient: S10Gradient,
  s11MeetNexHost: S11MeetNexHost,
  s12ImportEdit: S12ImportEdit,
  s13LineCarry: S13LineCarry,
  s14Map: S14Map,
  s15GoLive: S15GoLive,
  s16Drop: S16Drop,
  s16bBeatStep: S16bBeatStep,
  s17Plans: S17Plans,
  s18Ending: S18Ending,
};

/** Captions follow the narration (src/narration.ts): same words, same time. */
export const CAPTIONS = NARRATION.filter((n) => n.caption !== false).map((n) => ({ from: n.from, len: n.len + 14, text: n.text }));

// bottom-push-stack-wipe (demos/BottomPushStackWipe.tsx): the new chapter pushes up from below and
// shoves the last one out the top. Kept: 30f, heavy ease-out bezier(0.12, 0.9, 0.2, 1), 40px seam
// shadow (rgba 0,0,0,.30). Changed: the outgoing shot is held on a still frame; a chapter-colour
// leading edge (blue = NexDB part ends, green = NexHost begins).
const PUSH_DUR = 30;
const PUSH: Partial<Record<ShotKey, { prev: ShotKey; color: string }>> = {
  s10Gradient: { prev: "s09bTerminal", color: C.accent },
  s11MeetNexHost: { prev: "s10Gradient", color: C.ok },
};
const PushIn: React.FC<{ k: ShotKey; children: React.ReactNode }> = ({ k, children }) => {
  const f = useCurrentFrame();
  const push = PUSH[k];
  if (!push || f >= PUSH_DUR) return <>{children}</>;
  const Prev = SCENES[push.prev];
  const t = interpolate(f, [0, PUSH_DUR], [0, 1], { extrapolateRight: "clamp", easing: Easing.bezier(0.12, 0.9, 0.2, 1) });
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: C.deep }}>
      <AbsoluteFill style={{ transform: `translateY(${-t * 1080}px)` }}>
        {Prev && (
          <Freeze frame={dur(push.prev) - 12}>
            <Prev duration={dur(push.prev)} />
          </Freeze>
        )}
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateY(${(1 - t) * 1080}px)` }}>
        {children}
        <div style={{ position: "absolute", left: 0, right: 0, top: -40, height: 40, background: "linear-gradient(to top, rgba(0,0,0,.30), rgba(0,0,0,0))" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 6, background: push.color, boxShadow: `0 0 24px ${push.color}`, opacity: 1 - t * 0.6 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Main: React.FC<{ bgm?: boolean }> = ({ bgm = true }) => (
  <AbsoluteFill style={{ background: C.deep }}>
    <Sound bgm={bgm} />
    {(Object.keys(SHOTS) as ShotKey[]).map((k) => {
      const Scene = SCENES[k];
      return (
        <Sequence key={k} from={SHOTS[k].from} durationInFrames={dur(k)} name={k}>
          <PushIn k={k}>{Scene ? <Scene duration={dur(k)} /> : <Todo name={k} />}</PushIn>
        </Sequence>
      );
    })}
    {CAPTIONS.map((c, i) => (
      <Sequence key={`cap${i}`} from={c.from - 4} durationInFrames={c.len} name={`caption ${c.text}`}>
        <Caption text={c.text} duration={c.len} align="center" />
      </Sequence>
    ))}
  </AbsoluteFill>
);
