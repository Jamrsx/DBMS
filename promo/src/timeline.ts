// The single source of truth for timing. Music: bgm-tech-house, 124.00 BPM
// (analysis/beat_data.json). Video beat n sits at T0 + n*BEAT seconds for the whole film:
// the music edit (0 → beat 236, then music beat 304 onward) is cut on bar lines, so the grid stays
// continuous and the drop (music beat 316) lands on video beat 248.
export const FPS = 30;
export const T0 = 9.458; // beat 0 (s)
export const BEAT = 0.48387; // s per beat
export const beatS = (n: number) => T0 + n * BEAT;
/** Frame of beat n (rounded only here, at the last step). */
export const beatF = (n: number) => Math.round(beatS(n) * FPS);
export const secF = (s: number) => Math.round(s * FPS);

export const END_BEAT = 346;
export const TOTAL = beatF(END_BEAT); // ≈ 2:57

// Music edit: video 0..A_END plays music 0..A_END; after that, music from MUSIC_B_FROM (beat 304).
export const MUSIC_A_END = beatF(236);
export const MUSIC_B_FROM = beatS(304);
export const MUSIC_FADE_OUT = secF(1.6);

/** Shot start/end in video beats (revised storyboard v2). */
const B = {
  s01Assemble: [-1, 0],
  s02Nex: [0, 12],
  s03Converge: [12, 24],
  s04Dashboard: [24, 52],
  s05Versions: [52, 64],
  s06Starters: [64, 80],
  s07Tour: [80, 108],
  s08Fix: [108, 128],
  s09Cuts: [128, 144],
  s09bTerminal: [144, 156],
  s10Gradient: [156, 170],
  s11MeetNexHost: [170, 186],
  s12ImportEdit: [186, 204],
  s13LineCarry: [204, 218],
  s14Map: [218, 236],
  s15GoLive: [236, 248],
  s16Drop: [248, 272],
  s16bBeatStep: [272, 284],
  s17Plans: [284, 308],
  s18Ending: [308, END_BEAT],
} as const;

export type ShotKey = keyof typeof B;
export const SHOTS = Object.fromEntries(
  Object.entries(B).map(([k, [a, b]]) => [k, { from: a < 0 ? 0 : beatF(a), to: beatF(b), beat: a }]),
) as Record<ShotKey, { from: number; to: number; beat: number }>;

/** The beat each shot started on in the first cut: scenes still name beats by those numbers. */
const OLD_START: Partial<Record<ShotKey, number>> = {
  s02Nex: 0,
  s03Converge: 12,
  s04Dashboard: 24,
  s05Versions: 44,
  s06Starters: 56,
  s07Tour: 72,
  s08Fix: 100,
  s09Cuts: 116,
  s10Gradient: 132,
  s11MeetNexHost: 146,
  s12ImportEdit: 162,
  s13LineCarry: 176,
  s14Map: 190,
  s15GoLive: 204,
  s16Drop: 216,
  s17Plans: 240,
  s18Ending: 264,
};

export const dur = (k: ShotKey) => SHOTS[k].to - SHOTS[k].from;
/** Beat n (first-cut numbering) as a frame relative to a shot's start. */
export const beatIn = (k: ShotKey, n: number) => beatF(n - (OLD_START[k] ?? SHOTS[k].beat) + SHOTS[k].beat) - SHOTS[k].from;
/** i beats after a shot's start, relative to the shot. */
export const beatsIn = (k: ShotKey, i: number) => beatF(SHOTS[k].beat + i) - SHOTS[k].from;
/** Absolute frame of a first-cut beat number inside a shot. */
export const atBeat = (k: ShotKey, n: number) => SHOTS[k].from + beatIn(k, n);
