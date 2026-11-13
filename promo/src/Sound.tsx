// Audio: the music (edited on a bar line) and every sound effect, pinned to beats / shot offsets.
// Sequence.from = target peak frame − the file's own peak lag − output track offset (sound-design §4.6).
// The `bgm` prop turns the music off for the SFX-only version; effects always play.
import React from "react";
import { Audio, Sequence, interpolate, staticFile } from "remotion";
import { MUSIC_A_END, MUSIC_B_FROM, MUSIC_FADE_OUT, SHOTS, TOTAL, atBeat, beatIn, beatsIn } from "./timeline";
import { END_BEATS } from "./scenes/S18Ending";
import peaks from "../analysis/sfx_peaks.json";
import { NARRATION, duckAt } from "./narration";

// AAC priming on this pipeline (Remotion 4 + AAC 48k mp4); re-measured after the first render.
const OUTPUT_AUDIO_OFFSET_F = 1.28;
const BGM_VOL = 0.34;
const VO_VOL = 1.0;

type Fx = { at: number; src: string; volume: number; dur?: number };
const P = peaks as Record<string, { peakF: number }>;
const from = (fx: Fx) => Math.max(0, Math.round(fx.at - (P[fx.src]?.peakF ?? 0) - OUTPUT_AUDIO_OFFSET_F));
const S = (k: keyof typeof SHOTS, off: number) => SHOTS[k].from + off;

/** Each entry: the frame its PEAK should hit, and what it is for. */
const FX: Fx[] = [
  // #1 opening: shells fly in, letters land, the signal line draws
  { at: 10, src: "swoosh-quick.mp3", volume: 0.3 },
  { at: 62, src: "swoosh-quick.mp3", volume: 0.24 },
  { at: 186, src: "sweep-digital.mp3", volume: 0.28 },
  { at: S("s01Assemble", 226), src: "switch-click-quick.mp3", volume: 0.5 }, // "You" clicks Start all
  // #2 Nex pops up on beat 0, wordmark beat 4, "One app." beat 8
  { at: atBeat("s02Nex", 0) + 14, src: "pop.mp3", volume: 0.45 },
  { at: atBeat("s02Nex", 4), src: "swoosh-quick.mp3", volume: 0.3 },
  { at: atBeat("s02Nex", 8), src: "sparkle-poof-hit.mp3", volume: 0.25 },
  // #3 big hit #1 on beat 12, the merge pulse on beat 21
  { at: atBeat("s03Converge", 12), src: "impact-deep-whoosh.mp3", volume: 0.5 },
  { at: atBeat("s03Converge", 21), src: "bass-hit-short.mp3", volume: 0.45 },
  // #4 Start all click (beat 26), services turn green beats 27–33 (receding volume, no machine-gun)
  { at: atBeat("s04Dashboard", 26), src: "switch-click-quick.mp3", volume: 0.6 },
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ at: atBeat("s04Dashboard", 27 + i), src: "pop.mp3", volume: 0.4 - i * 0.025 })),
  // #4b the before/after slider flings across
  { at: atBeat("s04Dashboard", 44) + 22, src: "swoosh-quick.mp3", volume: 0.3 },
  // #5 version switches (beats 47/50/53)
  ...[47, 50, 53].map((b) => ({ at: atBeat("s05Versions", b), src: "switch-tap.mp3", volume: 0.35 })),
  // #6 cards deal in, fan out
  { at: S("s06Starters", 8), src: "swoosh-quick.mp3", volume: 0.3 },
  { at: S("s06Starters", 100), src: "air-woosh-deep.mp3", volume: 0.3 },
  // #7 three camera flights
  ...[78, 85, 93].map((b) => ({ at: atBeat("s07Tour", b) + 18, src: "air-woosh-deep.mp3", volume: 0.32 })),
  // #8 Fix press, then the check bursts on beat 108
  { at: atBeat("s08Fix", 108) - 37, src: "switch-click-quick.mp3", volume: 0.55 },
  { at: atBeat("s08Fix", 108), src: "sparkle-poof-hit.mp3", volume: 0.5 },
  { at: atBeat("s08Fix", 108), src: "bass-hit-short.mp3", volume: 0.35 },
  { at: atBeat("s08Fix", 108) + 6 + 14, src: "air-woosh-deep.mp3", volume: 0.3 }, // bullet-time orbit
  // #9 beat cuts
  ...[120, 124, 128].map((b) => ({ at: atBeat("s09Cuts", b), src: "swoosh-quick.mp3", volume: 0.25 })),
  // #9b terminal: three commands run
  { at: S("s09bTerminal", 6), src: "swoosh-quick.mp3", volume: 0.25 },
  // chapter push wipes (NexDB part out, NexHost in)
  { at: S("s10Gradient", 10), src: "transition-tech-slide.mp3", volume: 1.1 },
  { at: S("s11MeetNexHost", 10), src: "transition-tech-slide.mp3", volume: 1.1 },
  // #10 breakdown title
  { at: atBeat("s10Gradient", 134), src: "shimmer-sparkle-sweep.mp3", volume: 0.3 },
  // #11 Nex's four jumps (landings), then the panel
  ...[28, 48, 70, 96].map((land, i) => ({ at: SHOTS.s11MeetNexHost.from + beatIn("s11MeetNexHost", 153) - 96 + land, src: "pop.mp3", volume: 0.28 + i * 0.06 })),
  { at: SHOTS.s11MeetNexHost.from + beatIn("s11MeetNexHost", 153) - 96 + 104, src: "swoosh-quick.mp3", volume: 0.35 },
  // #12 three clicks (Import project, Import, the file)
  ...[165, 169, 172].map((b) => ({ at: atBeat("s12ImportEdit", b) - 4, src: "switch-click-quick.mp3", volume: 0.45 })),
  { at: atBeat("s12ImportEdit", 172) + 16 + 10, src: "air-woosh-deep.mp3", volume: 0.28 }, // graze tour
  // #13 the line runs (pen), then closes the frame
  { at: S("s13LineCarry", 22 + 30), src: "sweep-digital.mp3", volume: 0.35 },
  { at: S("s13LineCarry", 22 + 70), src: "transition-tech-slide.mp3", volume: 1.4 },
  { at: S("s13LineCarry", 22 + 112), src: "switch-tap.mp3", volume: 0.4 },
  // #14 the map lights up, stop by stop
  ...[0, 1, 2, 3, 4].map((i) => ({ at: atBeat("s14Map", 192 + i * 2), src: "pop.mp3", volume: 0.3 + i * 0.03 })),
  // #14b exploded view: burst apart, click back together
  { at: atBeat("s14Map", 200) + 16 + 12, src: "bass-hit-short.mp3", volume: 0.4 },
  { at: atBeat("s14Map", 200) + 16 + 93, src: "switch-click-quick.mp3", volume: 0.5 },
  // #15 build-up: the address connects; the riser climbs into the drop
  { at: atBeat("s15GoLive", 206), src: "switch-click-quick.mp3", volume: 0.45 },
  { at: atBeat("s15GoLive", 206) + 6, src: "power-up-static.mp3", volume: 0.3 },
  { at: atBeat("s16Drop", 216) - 4, src: "riser-cine.mp3", volume: 0.45, dur: 140 },
  // #16 big hit #2: the drop; feature chips
  { at: atBeat("s16Drop", 216), src: "impact-cine-big.mp3", volume: 0.55 },
  ...[0, 1, 2, 3, 4].map((i) => ({ at: atBeat("s16Drop", 228 + i * 2), src: "pop.mp3", volume: 0.36 - i * 0.02 })),
  // #16b one word per 2 beats
  ...[2, 4, 6, 8, 10].map((b) => ({ at: S("s16bBeatStep", beatsIn("s16bBeatStep", b)), src: "switch-tap.mp3", volume: 0.4 })),
  // #17 the 4-year plan gets pressed (beat 248)
  { at: atBeat("s17Plans", 248), src: "switch-click-quick.mp3", volume: 0.6 },
  // #18 timeline travel, Nex casts the key card, the icon flips and blooms (big hit #3)
  { at: S("s18Ending", 50), src: "air-woosh-deep.mp3", volume: 0.32 },
  { at: S("s18Ending", beatsIn("s18Ending", END_BEATS.cast)), src: "sparkle-wand.mp3", volume: 0.6 },
  { at: S("s18Ending", beatsIn("s18Ending", END_BEATS.cast)) + 6, src: "shimmer-sparkle-sweep.mp3", volume: 0.3 },
  { at: S("s18Ending", beatsIn("s18Ending", END_BEATS.bloom)) - 10, src: "swoosh-quick.mp3", volume: 0.3 },
  { at: S("s18Ending", beatsIn("s18Ending", END_BEATS.bloom)), src: "impact-deep-whoosh.mp3", volume: 0.55 },
  { at: S("s18Ending", beatsIn("s18Ending", END_BEATS.bloom)) + 24, src: "shimmer-sparkle-sweep.mp3", volume: 0.25 },
];

export const Sound: React.FC<{ bgm: boolean }> = ({ bgm }) => (
  <>
    {bgm && (
      <>
        <Sequence from={0} durationInFrames={MUSIC_A_END} name="music A (0:00–1:48)">
          <Audio src={staticFile("audio/bgm-tech-house.mp3")} volume={(f) => BGM_VOL * duckAt(f) * interpolate(f, [0, 12, MUSIC_A_END - 2, MUSIC_A_END], [0, 1, 1, 0.6], { extrapolateRight: "clamp" })} />
        </Sequence>
        <Sequence from={MUSIC_A_END} durationInFrames={TOTAL - MUSIC_A_END} name="music B (2:36 on)">
          <Audio
            src={staticFile("audio/bgm-tech-house.mp3")}
            trimBefore={Math.round(MUSIC_B_FROM * 30)}
            volume={(f) => BGM_VOL * duckAt(f + MUSIC_A_END) * interpolate(f, [0, 2, TOTAL - MUSIC_A_END - MUSIC_FADE_OUT, TOTAL - MUSIC_A_END], [0.6, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
          />
        </Sequence>
      </>
    )}
    {NARRATION.map((n, i) => (
      <Sequence key={`vo${i}`} from={Math.max(0, Math.round(n.from - OUTPUT_AUDIO_OFFSET_F))} durationInFrames={n.len + 6} name={`voice ${i + 1}`}>
        <Audio src={staticFile(n.src)} volume={VO_VOL} />
      </Sequence>
    ))}
    {FX.map((fx, i) => (
      <Sequence key={i} from={from(fx)} durationInFrames={fx.dur ?? 150} name={`sfx ${fx.src}`}>
        <Audio src={staticFile(`audio/sfx/${fx.src}`)} volume={fx.volume} />
      </Sequence>
    ))}
  </>
);
