// Narration (Kokoro af_heart, offline; analysis/narrate.py). Each line: the shot, where it starts in
// the shot (frames), the caption text, and whether a caption shows (off where the words are already
// on screen). Clip lengths come from analysis/vo.json.
import vo from "../analysis/vo.json";
import { SHOTS, type ShotKey, beatIn, beatsIn } from "./timeline";

type Line = { shot: ShotKey; at: number; text: string; caption?: boolean };

const LINES: Line[] = [
  { shot: "s01Assemble", at: 15, text: "Apache. PHP. MySQL. Node. Every project needs them… and setting them up can eat your whole day." },
  { shot: "s02Nex", at: 6, text: "Meet NexDB. Your whole local stack, in one app." },
  { shot: "s03Converge", at: 4, text: "No more juggling tools. Everything lives in one place." },
  { shot: "s04Dashboard", at: 14, text: "Press Start all… and everything comes to life. Web server, PHP, databases, running in seconds." },
  { shot: "s04Dashboard", at: beatsIn("s04Dashboard", 20) + 20, text: "Stopped, or running. One click." },
  { shot: "s05Versions", at: 8, text: "Need a different PHP version? Switch it in a click." },
  { shot: "s06Starters", at: 20, text: "Start a fresh Laravel app in minutes, not hours." },
  { shot: "s07Tour", at: 14, text: "Open your projects in one click." },
  { shot: "s07Tour", at: 128, text: "Explore your database." },
  { shot: "s07Tour", at: 232, text: "And run every tool from one terminal." },
  { shot: "s08Fix", at: 6, text: "Something broke? Nex, your built-in helper, finds it… and fixes it." },
  { shot: "s09Cuts", at: 10, text: "Catch every email your app sends. Run PostgreSQL and Redis too." },
  { shot: "s09bTerminal", at: 8, text: "Composer, Artisan, npm… all ready to go." },
  { shot: "s10Gradient", at: 34, text: "And when your site is ready to share…" },
  { shot: "s11MeetNexHost", at: 112, text: "…meet NexHost." },
  { shot: "s12ImportEdit", at: 8, text: "Import your project. Edit your files, right here." },
  { shot: "s13LineCarry", at: 6, text: "Then update your live site with one click." },
  { shot: "s14Map", at: 60, text: "Your own PC becomes the server. No complicated setup." },
  { shot: "s15GoLive", at: 20, text: "Go live… and anyone can open your site." },
  { shot: "s16Drop", at: 0, text: "Build it. Host it. From your own PC.", caption: false },
  { shot: "s17Plans", at: 6, text: "Pick the plan that fits you." },
  { shot: "s17Plans", at: beatIn("s17Plans", 248) + 18, text: "Four years, with NexHost included." },
  { shot: "s18Ending", at: 30, text: "And we keep making it better.", caption: false },
  { shot: "s18Ending", at: beatsIn("s18Ending", 12) + 40, text: "Get your free launch key. Seven days, every feature, NexHost included.", caption: false },
  { shot: "s18Ending", at: beatsIn("s18Ending", 28) + 50, text: "NexDB. By Nexio Devs.", caption: false },
];

const SECS = vo as { n: number; sec: number }[];

/** Absolute start frame, clip length (frames), file and caption for each line. */
export const NARRATION = LINES.map((l, i) => ({
  ...l,
  from: SHOTS[l.shot].from + l.at,
  len: Math.ceil(SECS[i].sec * 30),
  src: `audio/vo/${String(i + 1).padStart(2, "0")}.wav`,
}));

/** Music level under the voice: 1 when nobody speaks, DUCK while a line plays (8f ramps). */
const DUCK = 0.3;
export const duckAt = (f: number) => {
  let d = 1;
  for (const n of NARRATION) {
    const a = n.from - 8;
    const b = n.from + n.len + 10;
    if (f < a - 0 || f > b + 8) continue;
    const t = f < n.from ? (f - a) / 8 : f > b ? 1 - (f - b) / 8 : 1;
    d = Math.min(d, 1 - (1 - DUCK) * Math.max(0, Math.min(1, t)));
  }
  return d;
};
