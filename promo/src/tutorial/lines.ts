// Tailscale tutorial: one entry per narration line (tutorial/narrate.py reads the same order).
// `vis` says what is on screen while the line plays; captions show `text`.
import vo from "../../tutorial/vo.json";
import rects from "../../public/tut/rects.json";

export const FPS = 30;
export type Rect = { x: number; y: number; w: number; h: number };
const R = rects as Record<string, Record<string, Rect | null>>;
const r = (img: string, key: string): Rect => R[img][key]!;

/** One look at a captured screen: ring the target, optionally click it. `at` = frames into the line. */
export type Sub = { img: string; target: Rect; at: number; zoom?: number; click?: boolean };
export type Vis =
  | { k: "title" }
  | { k: "club" }
  | { k: "price" }
  | { k: "step"; n: number; title: string }
  | { k: "browser" }
  | { k: "signin" }
  | { k: "tray" }
  | { k: "screen"; subs: Sub[]; uacAt?: number }
  | { k: "phone"; mode: "install" | "signin" | "open" }
  | { k: "checklist" }
  | { k: "end" };

export const STEPS = ["Put Tailscale on this PC", "Share a project", "Open a NexHost site", "Open it on another device"];

type Line = { text: string; vis: Vis; caption?: boolean };
const L: Line[] = [
  { text: "Hi! I'm Nex. Let's open your NexDB projects on your phone, or any other device, from anywhere. We'll use a free app called Tailscale.", vis: { k: "title" } },
  { text: "Think of Tailscale as a private club for your devices. Only devices in your club can open your links. Nobody else on the internet can.", vis: { k: "club" } },
  { text: "It's free for personal projects. For client or company work, Tailscale asks for a paid plan.", vis: { k: "price" } },
  { text: "Step 1. Put Tailscale on this PC.", vis: { k: "step", n: 1, title: STEPS[0] }, caption: false },
  { text: "Open your browser and go to tailscale.com/download. Download the Windows version and install it like any other app.", vis: { k: "browser" } },
  { text: "When it opens, sign in. Google, Microsoft or Apple all work. Remember which one you used.", vis: { k: "signin" } },
  { text: "When the Tailscale icon by the clock says Connected, step 1 is done.", vis: { k: "tray" } },
  { text: "Step 2. Share a project from NexDB.", vis: { k: "step", n: 2, title: STEPS[1] }, caption: false },
  { text: "Go to Projects, and click your project's name.", vis: { k: "screen", subs: [{ img: "01-projects", target: r("01-projects", "nav"), at: 0, zoom: 1.25, click: true }, { img: "01-projects", target: r("01-projects", "project"), at: 40, zoom: 1.5, click: true }] } },
  { text: "Open the Share tab, and click \"Share on my Wi-Fi\".", vis: { k: "screen", subs: [{ img: "02-details", target: r("02-details", "tab"), at: 0, zoom: 1.5, click: true }, { img: "03-sharetab", target: r("03-sharetab", "wifi"), at: 40, zoom: 1.5, click: true }] } },
  { text: "See these new links? They end in ts.net, or start with 100. Those are your Tailscale links.", vis: { k: "screen", subs: [{ img: "04-shared", target: r("04-shared", "wifi"), at: 0, zoom: 1.2 }, { img: "04-shared", target: r("04-shared", "tslink"), at: 60, zoom: 1.9 }] } },
  { text: "Windows Firewall still blocks them. So click \"Allow my Tailscale devices\". Windows asks for permission: choose Yes.", vis: { k: "screen", subs: [{ img: "04-shared", target: r("04-shared", "allow"), at: 0, zoom: 1.6, click: true }], uacAt: 110 } },
  { text: "Don't worry: this only lets in your Tailscale devices. Nobody else.", vis: { k: "screen", subs: [{ img: "05-allowed", target: r("05-allowed", "card"), at: 0, zoom: 1.35 }] } },
  { text: "Step 3. Is your site in NexHost? Open it to Tailscale too.", vis: { k: "step", n: 3, title: STEPS[2] }, caption: false },
  { text: "Go to NexHost, and click your site.", vis: { k: "screen", subs: [{ img: "06-nh-sites", target: r("06-nh-sites", "nav"), at: 0, zoom: 1.25, click: true }, { img: "06-nh-sites", target: r("06-nh-sites", "site"), at: 34, zoom: 1.4, click: true }] } },
  { text: "On the Overview, find \"Who can open it\". Then turn on the Tailscale switch.", vis: { k: "screen", subs: [{ img: "07-nh-overview", target: r("07-nh-overview", "row"), at: 0, zoom: 1.45 }, { img: "07-nh-overview", target: r("07-nh-overview", "sw"), at: 70, zoom: 1.6, click: true }] } },
  { text: "The first time, click \"Allow my Tailscale devices\" and choose Yes. You only do this once.", vis: { k: "screen", subs: [{ img: "08-nh-on", target: r("08-nh-on", "allow"), at: 0, zoom: 1.6, click: true }], uacAt: 70 } },
  { text: "Now your site has its own Tailscale links. Copy one.", vis: { k: "screen", subs: [{ img: "09-nh-allowed", target: r("09-nh-allowed", "link"), at: 0, zoom: 1.6 }] } },
  { text: "Step 4. Open it on your phone, or another PC.", vis: { k: "step", n: 4, title: STEPS[3] }, caption: false },
  { text: "Install Tailscale there too. On a phone, get it from the App Store or Google Play.", vis: { k: "phone", mode: "install" } },
  { text: "Your own device? Sign in with the same account you used on the PC.", vis: { k: "phone", mode: "signin" } },
  { text: "Someone else's device? They sign in with their own account. Then, in NexDB, click \"Share this PC\" or \"Invite people\", and add them in Tailscale.", vis: { k: "screen", subs: [{ img: "05-allowed", target: r("05-allowed", "card"), at: 0, zoom: 1.3 }, { img: "05-allowed", target: r("05-allowed", "invite"), at: 120, zoom: 1.7, click: true }] } },
  { text: "Turn Tailscale on. Open the browser, and type or paste your Tailscale link. And there it is!", vis: { k: "phone", mode: "open" } },
  { text: "Quick checklist: your PC is on, NexDB is running, and Tailscale is connected on both devices.", vis: { k: "checklist" } },
  { text: "That's it! Your projects, on your devices, from anywhere.", vis: { k: "end" }, caption: false },
];

/** Frames of quiet after a line; longer before a new step. */
const gapAfter = (i: number) => (i === L.length - 1 ? 75 : L[i + 1].vis.k === "step" ? 30 : L[i].vis.k === "step" ? 10 : 14);
const LEAD = 24;

export type Beat = Line & { i: number; start: number; voFrom: number; voLen: number; end: number; step: number };
export const BEATS: Beat[] = [];
{
  let t = LEAD;
  let step = 0;
  L.forEach((line, i) => {
    const len = Math.ceil((vo as { sec: number }[])[i].sec * FPS);
    if (line.vis.k === "step") step = line.vis.n;
    BEATS.push({ ...line, i, start: i === 0 ? 0 : t, voFrom: t, voLen: len, end: 0, step });
    t += len + gapAfter(i);
  });
  BEATS.forEach((b, i) => (b.end = i + 1 < BEATS.length ? BEATS[i + 1].start : t));
}
export const TOTAL = BEATS[BEATS.length - 1].end;
