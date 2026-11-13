// "Share with Tailscale" tutorial: one Sequence per narration line (lines.ts), captions, the step
// chip, and audio. App screens are real captures from the browser preview (practice data).
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, F, ROOM_BG } from "../theme";
import { Nex } from "../Nex";
import { Caption } from "../Caption";
import { GuideCursor, type Way } from "../Cursor";
import { BEATS, STEPS, TOTAL, type Rect, type Sub, type Vis } from "./lines";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const io = Easing.inOut(Easing.cubic);
const fadeIn = (f: number, at = 0, len = 12) => interpolate(f, [at, at + len], [0, 1], { ...clamp, easing: ease });
const rise = (f: number, at = 0) => ({ opacity: fadeIn(f, at), transform: `translateY(${(1 - fadeIn(f, at)) * 24}px)` });

const card: React.CSSProperties = { background: C.surface, border: `1px solid ${C.borderStrong}`, borderRadius: 18, boxShadow: "0 40px 90px -40px rgba(0,0,0,.9)" };
const btn = (primary = false): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "14px 26px", borderRadius: 10,
  font: `600 26px ${F.text}`, color: primary ? "#fff" : C.text, background: primary ? C.accent : C.surface3, border: `1px solid ${primary ? C.accentHi : C.borderStrong}`,
});

// ---------- a captured screen with a moving camera, a ring on the target and the guide cursor ----------
const center = (t: Rect) => ({ x: t.x + t.w / 2, y: t.y + t.h / 2 });
const cam = (t: Rect, z: number) => {
  const c = center(t);
  return { z, tx: Math.min(0, Math.max(1920 - 1920 * z, 960 - c.x * z)), ty: Math.min(0, Math.max(1080 - 1080 * z - 220, 430 - c.y * z)) };
};

const Screen: React.FC<{ subs: Sub[]; uacAt?: number; len: number }> = ({ subs, uacAt, len }) => {
  const f = useCurrentFrame();
  // camera: whole screen, then each target in turn
  let view = { z: 1, tx: 0, ty: 0 };
  subs.forEach((s, i) => {
    const to = cam(s.target, s.zoom ?? 1.5);
    const from = view;
    const st = i === 0 ? 8 : s.at;
    const k = interpolate(f, [st, st + 22], [0, 1], { ...clamp, easing: io });
    view = { z: from.z + (to.z - from.z) * k, tx: from.tx + (to.tx - from.tx) * k, ty: from.ty + (to.ty - from.ty) * k };
  });
  const cur = [...subs].reverse().find((s) => f >= s.at) ?? subs[0];
  const curI = subs.indexOf(cur);
  const prev = curI > 0 && subs[curI - 1].img !== cur.img ? subs[curI - 1] : null;
  const xf = prev ? interpolate(f, [cur.at, cur.at + 8], [0, 1], clamp) : 1;
  // the cursor visits every target it clicks
  const ways: Way[] = [];
  const clicks = subs.filter((s) => s.click);
  if (clicks.length) {
    const c0 = center(clicks[0].target);
    ways.push({ f: 0, x: c0.x + 320, y: c0.y + 220 });
    for (const s of clicks) {
      const c = center(s.target);
      const arrive = Math.max(s.at, 8) + 24;
      ways.push({ f: arrive, x: c.x - 2, y: c.y - 2 }, { f: arrive + 8, x: c.x, y: c.y, click: true });
    }
  }
  const showCur = clicks.length ? fadeIn(f, 4, 10) * interpolate(f, [len - 8, len], [1, 0], clamp) : 0;
  const ringOn = fadeIn(f, Math.max(cur.at, 8) + 14, 10);
  const pulse = 0.55 + 0.45 * Math.sin(f / 6);
  const t = cur.target;
  return (
    <AbsoluteFill style={{ background: C.deep, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${view.tx}px,${view.ty}px) scale(${view.z})` }}>
        {prev && <Img src={staticFile(`tut/${prev.img}.png`)} style={{ position: "absolute", width: 1920, height: 1080 }} />}
        <Img src={staticFile(`tut/${cur.img}.png`)} style={{ position: "absolute", width: 1920, height: 1080, opacity: xf }} />
        <div
          style={{
            position: "absolute", left: t.x - 8, top: t.y - 8, width: t.w + 16, height: t.h + 16, borderRadius: 10,
            border: `3px solid ${C.accentHi}`, boxShadow: `0 0 ${10 + 14 * pulse}px rgba(91,143,240,${0.45 + 0.35 * pulse})`, opacity: ringOn * xf,
          }}
        />
        {clicks.length > 0 && <GuideCursor ways={ways} f={f} size={26 / view.z} show={showCur} />}
      </div>
      {uacAt !== undefined && <Uac f={f - uacAt} />}
    </AbsoluteFill>
  );
};

/** Windows' permission prompt (drawn), with the cursor choosing Yes. */
const Uac: React.FC<{ f: number }> = ({ f }) => {
  if (f < 0) return null;
  const inn = fadeIn(f, 0, 14);
  const out = interpolate(f, [62, 74], [1, 0], clamp);
  const ways: Way[] = [{ f: 0, x: 1080, y: 760 }, { f: 30, x: 852, y: 682 }, { f: 40, x: 854, y: 684, click: true }];
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <AbsoluteFill style={{ background: "rgba(0,0,0,.55)", opacity: inn }} />
      <div style={{ position: "absolute", left: 600, top: 300, width: 720, transform: `scale(${0.94 + 0.06 * inn})`, opacity: inn, ...card, borderRadius: 12, overflow: "hidden", background: "#1f2430" }}>
        <div style={{ padding: "18px 28px", font: `600 22px ${F.text}`, color: C.text2, borderBottom: `1px solid ${C.border}` }}>Windows asks for your permission</div>
        <div style={{ padding: "28px 28px 10px", font: `600 32px/1.3 ${F.text}`, color: C.text }}>Do you want to allow this app to make changes to your device?</div>
        <div style={{ padding: "6px 28px 26px", font: `400 24px ${F.text}`, color: C.text3 }}>NexDB is adding one firewall rule for Tailscale devices.</div>
        <div style={{ display: "flex", gap: 16, padding: "18px 28px 28px", background: "#191d26" }}>
          <div style={{ ...btn(true), flex: 1, boxShadow: f > 28 ? `0 0 0 4px rgba(91,143,240,.45)` : "none" }}>Yes</div>
          <div style={{ ...btn(false), flex: 1 }}>No</div>
        </div>
      </div>
      <GuideCursor ways={ways} f={f} size={30} show={inn} />
    </AbsoluteFill>
  );
};

// ---------- drawn scenes ----------
const Monitor: React.FC<{ s?: number; color?: string }> = ({ s = 1, color = C.accentHi }) => (
  <svg width={110 * s} height={92 * s} viewBox="0 0 110 92"><rect x="4" y="4" width="102" height="64" rx="8" fill={C.surface3} stroke={color} strokeWidth="4" /><rect x="44" y="70" width="22" height="12" fill={color} /><rect x="28" y="82" width="54" height="6" rx="3" fill={color} /></svg>
);
const Phone: React.FC<{ s?: number; color?: string }> = ({ s = 1, color = C.accentHi }) => (
  <svg width={60 * s} height={100 * s} viewBox="0 0 60 100"><rect x="4" y="4" width="52" height="92" rx="10" fill={C.surface3} stroke={color} strokeWidth="4" /><rect x="22" y="84" width="16" height="4" rx="2" fill={color} /></svg>
);
const Laptop: React.FC<{ s?: number; color?: string }> = ({ s = 1, color = C.accentHi }) => (
  <svg width={130 * s} height={84 * s} viewBox="0 0 130 84"><rect x="18" y="4" width="94" height="60" rx="7" fill={C.surface3} stroke={color} strokeWidth="4" /><path d="M4 70 H126 L118 80 H12 Z" fill={color} /></svg>
);
const Label: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.text2 }) => <div style={{ font: `600 26px ${F.text}`, color, marginTop: 14, textAlign: "center" }}>{children}</div>;

const Title: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 70 }}>
      <div style={{ ...rise(f, 0) }}><Nex mood="hello" size={340} /></div>
      <div style={{ maxWidth: 980 }}>
        <div style={{ font: `700 30px ${F.text}`, color: C.accentText, letterSpacing: 2, textTransform: "uppercase", ...rise(f, 8) }}>NexDB tutorial · 0.5.7</div>
        <div style={{ font: `700 84px/1.05 ${F.display}`, color: C.text, marginTop: 16, letterSpacing: -2, ...rise(f, 14) }}>Open your projects from anywhere</div>
        <div style={{ font: `500 38px/1.3 ${F.text}`, color: C.text2, marginTop: 22, ...rise(f, 22) }}>with Tailscale, in 4 easy steps. No networking skills needed.</div>
      </div>
    </AbsoluteFill>
  );
};

const Club: React.FC = () => {
  const f = useCurrentFrame();
  const out = fadeIn(f, 120, 16);
  const dev = (i: number) => ({ ...rise(f, 14 + i * 10) });
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 230, top: 150, width: 980, height: 700, borderRadius: 360, border: `4px dashed ${C.ok}`, background: "rgba(92,203,139,.06)", ...rise(f, 0) }} />
      <div style={{ position: "absolute", left: 230, top: 100, width: 980, textAlign: "center", font: `700 34px ${F.text}`, color: C.ok, ...rise(f, 4) }}>Your Tailscale network</div>
      <div style={{ position: "absolute", left: 610, top: 230, ...dev(0) }}><Monitor s={1.6} /><Label>This PC (NexDB)</Label></div>
      <div style={{ position: "absolute", left: 380, top: 520, ...dev(1) }}><Phone s={1.4} /><Label>Your phone</Label></div>
      <div style={{ position: "absolute", left: 830, top: 540, ...dev(2) }}><Laptop s={1.4} /><Label>A friend's laptop</Label></div>
      <div style={{ position: "absolute", left: 1390, top: 380, opacity: out, transform: `translateX(${(1 - out) * 40}px)`, textAlign: "center" }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <Laptop s={1.6} color={C.bad} />
          <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: "absolute", left: 44, top: -18 }}><circle cx="60" cy="60" r="50" fill="rgba(244,123,123,.15)" stroke={C.bad} strokeWidth="8" /><path d="M35 35 L85 85 M85 35 L35 85" stroke={C.bad} strokeWidth="10" strokeLinecap="round" /></svg>
        </div>
        <Label color={C.bad}>A stranger on the internet</Label>
        <div style={{ font: `500 24px ${F.text}`, color: C.text3, marginTop: 6 }}>can't open your links</div>
      </div>
    </AbsoluteFill>
  );
};

const Price: React.FC = () => {
  const f = useCurrentFrame();
  const box = (i: number, head: string, big: string, small: string, color: string) => (
    <div style={{ ...card, width: 620, padding: "44px 48px", ...rise(f, 6 + i * 26), borderColor: color }}>
      <div style={{ font: `600 30px ${F.text}`, color: C.text2 }}>{head}</div>
      <div style={{ font: `700 76px ${F.display}`, color, marginTop: 10 }}>{big}</div>
      <div style={{ font: `500 26px/1.35 ${F.text}`, color: C.text3, marginTop: 10 }}>{small}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 60, paddingBottom: 120 }}>
      {box(0, "Personal projects", "Free", "Your own sites, school work, practice.", C.ok)}
      {box(1, "Client or company work", "Paid plan", "Tailscale asks for one of its paid plans.", C.warn)}
    </AbsoluteFill>
  );
};

const StepCard: React.FC<{ n: number; title: string }> = ({ n, title }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 22, marginBottom: 40, ...rise(f, 0) }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ width: 120, height: 10, borderRadius: 5, background: i < n ? C.ok : i === n ? C.accentHi : C.surface3 }} />
        ))}
      </div>
      <div style={{ font: `700 40px ${F.text}`, color: C.accentText, letterSpacing: 2, textTransform: "uppercase", ...rise(f, 4) }}>Step {n} of 4</div>
      <div style={{ font: `700 96px ${F.display}`, color: C.text, marginTop: 14, letterSpacing: -2, ...rise(f, 10) }}>{title}</div>
    </AbsoluteFill>
  );
};

const Window: React.FC<{ url: string; typed: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ url, typed, children, style }) => (
  <div style={{ ...card, position: "absolute", left: 260, top: 110, width: 1400, height: 760, overflow: "hidden", ...style }}>
    <div style={{ height: 70, background: C.surface2, display: "flex", alignItems: "center", gap: 14, padding: "0 22px", borderBottom: `1px solid ${C.border}` }}>
      {[C.bad, C.warn, C.ok].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c, opacity: 0.7 }} />)}
      <div style={{ flex: 1, marginLeft: 16, height: 44, borderRadius: 22, background: C.bg, border: `1px solid ${C.borderStrong}`, display: "flex", alignItems: "center", padding: "0 22px", font: `500 26px ${F.mono}`, color: C.text }}>
        {url.slice(0, Math.round(url.length * typed))}
        {typed < 1 && <span style={{ width: 3, height: 28, background: C.accentHi, marginLeft: 2 }} />}
      </div>
    </div>
    {children}
  </div>
);

const Browser: React.FC = () => {
  const f = useCurrentFrame();
  const typed = interpolate(f, [10, 50], [0, 1], clamp);
  const page = fadeIn(f, 58);
  const prog = interpolate(f, [130, 220], [0, 1], { ...clamp, easing: io });
  const ways: Way[] = [{ f: 60, x: 1300, y: 760 }, { f: 92, x: 940, y: 560 }, { f: 100, x: 942, y: 562, click: true }];
  return (
    <AbsoluteFill>
      <Window url="tailscale.com/download" typed={typed}>
        <div style={{ opacity: page, padding: "90px 0", textAlign: "center" }}>
          <div style={{ font: `700 64px ${F.display}`, color: C.text }}>Download Tailscale</div>
          <div style={{ font: `500 30px ${F.text}`, color: C.text3, marginTop: 14 }}>Pick your device: Windows, Mac, iPhone, Android…</div>
          <div style={{ ...btn(true), marginTop: 70, padding: "22px 44px", font: `700 34px ${F.text}` }}>Download for Windows</div>
          <div style={{ marginTop: 70, opacity: fadeIn(f, 126), display: "inline-block", textAlign: "left" }}>
            <div style={{ font: `600 28px ${F.text}`, color: prog >= 1 ? C.ok : C.text2 }}>{prog >= 1 ? "Installed ✓" : "Installing Tailscale…"}</div>
            <div style={{ width: 620, height: 14, borderRadius: 7, background: C.surface3, marginTop: 14 }}><div style={{ width: `${prog * 100}%`, height: "100%", borderRadius: 7, background: C.ok }} /></div>
          </div>
        </div>
      </Window>
      <GuideCursor ways={ways} f={f} size={32} show={fadeIn(f, 56)} />
    </AbsoluteFill>
  );
};

const SignIn: React.FC = () => {
  const f = useCurrentFrame();
  const ways: Way[] = [{ f: 20, x: 1300, y: 800 }, { f: 60, x: 960, y: 498 }, { f: 68, x: 962, y: 500, click: true }];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...card, width: 760, padding: "50px 60px", textAlign: "center", ...rise(f, 0) }}>
        <div style={{ font: `700 50px ${F.display}`, color: C.text }}>Sign in to Tailscale</div>
        <div style={{ font: `500 26px ${F.text}`, color: C.text3, margin: "12px 0 36px" }}>Use an account you already have.</div>
        {["Sign in with Google", "Sign in with Microsoft", "Sign in with Apple"].map((t, i) => (
          <div key={t} style={{ ...btn(false), display: "flex", marginTop: 18, boxShadow: i === 0 && f > 64 ? `0 0 0 4px rgba(91,143,240,.5)` : "none" }}>{t}</div>
        ))}
        <div style={{ font: `600 26px ${F.text}`, color: C.warn, marginTop: 34, opacity: fadeIn(f, 100) }}>Tip: remember which one you picked.</div>
      </div>
      <GuideCursor ways={ways} f={f} size={32} show={fadeIn(f, 18)} />
    </AbsoluteFill>
  );
};

const Tray: React.FC = () => {
  const f = useCurrentFrame();
  const pop = fadeIn(f, 16, 14);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 96, background: "#1a1d24", borderTop: `1px solid ${C.border}` }} />
      <div style={{ position: "absolute", right: 60, bottom: 22, display: "flex", alignItems: "center", gap: 30, font: `500 28px ${F.text}`, color: C.text }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: C.surface3, border: `3px solid ${C.ok}`, display: "grid", placeItems: "center" }}>
          <svg width="30" height="30" viewBox="0 0 30 30">{[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={6 + c * 9} cy={6 + r * 9} r="3.2" fill={r === 1 || c === 1 ? "#fff" : "#6b7280"} />))}</svg>
        </div>
        <div style={{ textAlign: "right", lineHeight: 1.15 }}>10:24<br /><span style={{ fontSize: 22, color: C.text3 }}>13/11/2026</span></div>
      </div>
      <div style={{ position: "absolute", right: 120, bottom: 140, width: 560, ...card, padding: "30px 34px", opacity: pop, transform: `translateY(${(1 - pop) * 30}px)` }}>
        <div style={{ font: `700 34px ${F.text}`, color: C.text }}>Tailscale</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, font: `600 30px ${F.text}`, color: C.ok }}>
          <span style={{ width: 16, height: 16, borderRadius: 8, background: C.ok }} /> Connected
        </div>
        <div style={{ font: `500 24px ${F.mono}`, color: C.text3, marginTop: 12 }}>This PC: my-pc · 100.101.5.7</div>
      </div>
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ position: "absolute", right: 30, bottom: 70, opacity: pop }}>
        <circle cx="70" cy="70" r="56" fill="none" stroke={C.accentHi} strokeWidth="5" strokeDasharray="8 8" />
      </svg>
      <div style={{ position: "absolute", left: 160, top: 300, ...rise(f, 30) }}><Nex mood="success" size={300} /></div>
    </AbsoluteFill>
  );
};

/** A phone with a screen; children fill the screen. */
const PhoneFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", left: 300, top: 70, width: 470, height: 930, borderRadius: 64, background: "#0b0d11", border: `6px solid ${C.borderStrong}`, padding: 18, boxShadow: "0 50px 100px -40px rgba(0,0,0,.9)" }}>
    <div style={{ width: "100%", height: "100%", borderRadius: 48, background: C.surface, overflow: "hidden", position: "relative" }}>{children}</div>
  </div>
);

const PhoneScene: React.FC<{ mode: "install" | "signin" | "open" }> = ({ mode }) => {
  const f = useCurrentFrame();
  const side = (t: string, s: string, color = C.text) => (
    <div style={{ position: "absolute", left: 900, top: 330, width: 820, ...rise(f, 10) }}>
      <div style={{ font: `700 64px/1.1 ${F.display}`, color, letterSpacing: -1 }}>{t}</div>
      <div style={{ font: `500 32px/1.4 ${F.text}`, color: C.text2, marginTop: 22 }}>{s}</div>
    </div>
  );
  if (mode === "install") {
    const got = f > 90;
    return (
      <AbsoluteFill>
        <PhoneFrame>
          <div style={{ padding: "70px 30px", font: `600 24px ${F.text}`, color: C.text3 }}>App Store / Google Play</div>
          <div style={{ margin: "0 26px", padding: 24, borderRadius: 20, background: C.surface2, display: "flex", alignItems: "center", gap: 20, ...rise(f, 6) }}>
            <div style={{ width: 80, height: 80, borderRadius: 18, background: C.surface3, border: `2px solid ${C.borderStrong}` }} />
            <div style={{ flex: 1 }}><div style={{ font: `700 30px ${F.text}`, color: C.text }}>Tailscale</div><div style={{ font: `500 20px ${F.text}`, color: C.text3 }}>Free</div></div>
            <div style={{ ...btn(!got), padding: "10px 22px", fontSize: 22, borderRadius: 20, boxShadow: f > 80 && f < 100 ? `0 0 0 4px rgba(91,143,240,.5)` : "none" }}>{got ? "Open" : "Get"}</div>
          </div>
        </PhoneFrame>
        {side("Install Tailscale on the other device", "Phone: App Store or Google Play. Another PC: tailscale.com/download, like step 1.")}
      </AbsoluteFill>
    );
  }
  if (mode === "signin") {
    return (
      <AbsoluteFill>
        <PhoneFrame>
          <div style={{ padding: "110px 30px 0", textAlign: "center" }}>
            <div style={{ font: `700 36px ${F.text}`, color: C.text }}>Sign in</div>
            {["Google", "Microsoft", "Apple"].map((t, i) => (
              <div key={t} style={{ ...btn(false), display: "flex", marginTop: 22, fontSize: 24, boxShadow: i === 0 && f > 40 ? `0 0 0 4px rgba(92,203,139,.6)` : "none" }}>{t}</div>
            ))}
            <div style={{ font: `600 22px/1.3 ${F.text}`, color: C.ok, marginTop: 30, opacity: fadeIn(f, 44) }}>Same account as on your PC</div>
          </div>
        </PhoneFrame>
        {side("Your own device?", "Sign in with the same account you used on your PC. That's all.", C.ok)}
      </AbsoluteFill>
    );
  }
  const url = "http://my-pc.tail1234.ts.net:8181/";
  const typed = interpolate(f, [24, 80], [0, 1], clamp);
  const loaded = fadeIn(f, 96, 14);
  return (
    <AbsoluteFill>
      <PhoneFrame>
        <div style={{ padding: "60px 18px 14px", display: "flex", alignItems: "center", gap: 10, font: `600 18px ${F.text}`, color: C.ok }}>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: C.ok }} /> Tailscale: Connected
        </div>
        <div style={{ margin: "0 16px", height: 54, borderRadius: 27, background: C.bg, border: `1px solid ${C.borderStrong}`, display: "flex", alignItems: "center", padding: "0 16px", font: `500 17px ${F.mono}`, color: C.text, overflow: "hidden", whiteSpace: "nowrap" }}>
          {url.slice(0, Math.round(url.length * typed))}
        </div>
        <div style={{ margin: 16, borderRadius: 18, background: "#f5f1ea", height: 600, opacity: loaded, padding: 26, color: "#1d1d1f", font: `700 34px ${F.display}` }}>
          my-shop
          <div style={{ font: `500 18px ${F.text}`, color: "#555", marginTop: 8 }}>Welcome to the shop</div>
          {[0, 1, 2].map((i) => <div key={i} style={{ height: 110, borderRadius: 12, background: ["#e7dccb", "#d9e4ee", "#e3e9d8"][i], marginTop: 18 }} />)}
        </div>
      </PhoneFrame>
      {side("Open your Tailscale link", "Tailscale on → browser → paste the link that ends in ts.net (or starts with 100).")}
      <div style={{ position: "absolute", left: 900, top: 660, font: `700 54px ${F.display}`, color: C.ok, opacity: fadeIn(f, 110), transform: `scale(${0.8 + 0.2 * fadeIn(f, 110)})`, transformOrigin: "0 50%" }}>It opens, from anywhere!</div>
    </AbsoluteFill>
  );
};

const Checklist: React.FC = () => {
  const f = useCurrentFrame();
  const items = ["Your PC is on", "NexDB is running", "Tailscale is connected on both devices"];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 120 }}>
      <div style={{ ...card, width: 1100, padding: "50px 64px", ...rise(f, 0) }}>
        <div style={{ font: `700 54px ${F.display}`, color: C.text, marginBottom: 20 }}>Link not opening? Check:</div>
        {items.map((t, i) => {
          const on = fadeIn(f, 30 + i * 40, 10);
          return (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 26, font: `600 40px ${F.text}`, color: C.text }}>
              <div style={{ width: 54, height: 54, borderRadius: 12, border: `3px solid ${on > 0.5 ? C.ok : C.borderStrong}`, background: `rgba(92,203,139,${0.18 * on})`, display: "grid", placeItems: "center" }}>
                <svg width="32" height="32" viewBox="0 0 32 32" style={{ opacity: on }}><path d="M6 17 L13 24 L26 9" fill="none" stroke={C.ok} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              {t}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const End: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...rise(f, 0) }}><Nex mood="success" size={320} /></div>
      <div style={{ font: `700 76px ${F.display}`, color: C.text, marginTop: 20, letterSpacing: -1.5, ...rise(f, 10) }}>Your projects, on your devices, from anywhere.</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 34, font: `600 32px ${F.text}`, color: C.text2, ...rise(f, 24) }}>
        <Img src={staticFile("nexdb-logo.png")} style={{ height: 52 }} /> NexDB · by Nexio Devs
      </div>
    </AbsoluteFill>
  );
};

const Visual: React.FC<{ vis: Vis; len: number }> = ({ vis, len }) => {
  switch (vis.k) {
    case "title": return <Title />;
    case "club": return <Club />;
    case "price": return <Price />;
    case "step": return <StepCard n={vis.n} title={vis.title} />;
    case "browser": return <Browser />;
    case "signin": return <SignIn />;
    case "tray": return <Tray />;
    case "screen": return <Screen subs={vis.subs} uacAt={vis.uacAt} len={len} />;
    case "phone": return <PhoneScene mode={vis.mode} />;
    case "checklist": return <Checklist />;
    case "end": return <End />;
  }
};

/** Top-left: which step we're on, after its title card. */
const StepChip: React.FC<{ step: number }> = ({ step }) => (
  <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 24, display: "flex", whiteSpace: "nowrap", alignItems: "center", gap: 14, padding: "12px 22px", borderRadius: 30, background: "rgba(23,26,31,.88)", border: `1px solid ${C.borderStrong}`, font: `600 26px ${F.text}`, color: C.text, zIndex: 50 }}>
    <span style={{ color: C.accentText }}>Step {step} of 4</span> · {STEPS[step - 1]}
  </div>
);

export const Tutorial: React.FC = () => (
  <AbsoluteFill style={{ background: ROOM_BG, fontFamily: F.text }}>
    {BEATS.map((b) => {
      const len = b.end - b.start;
      return (
        <Sequence key={b.i} from={b.start} durationInFrames={len}>
          <FadeWrap len={len} first={b.i === 0}>
            <Visual vis={b.vis} len={len} />
          </FadeWrap>
          {b.step > 0 && b.vis.k !== "step" && b.vis.k !== "checklist" && b.vis.k !== "end" && <StepChip step={b.step} />}
        </Sequence>
      );
    })}
    {BEATS.filter((b) => b.caption !== false).map((b) => (
      <Sequence key={`c${b.i}`} from={b.voFrom - 4} durationInFrames={b.voLen + 14}>
        <Caption text={b.text} duration={b.voLen + 14} align="center" />
      </Sequence>
    ))}
    {BEATS.map((b) => (
      <Sequence key={`a${b.i}`} from={b.voFrom} durationInFrames={b.voLen + 10}>
        <Audio src={staticFile(`tut/vo/${String(b.i + 1).padStart(2, "0")}.wav`)} />
      </Sequence>
    ))}
    {BEATS.flatMap((b) =>
      b.vis.k === "screen"
        ? b.vis.subs.filter((s) => s.click).map((s, j) => (
            <Sequence key={`k${b.i}-${j}`} from={b.start + Math.max(s.at, 8) + 32} durationInFrames={20}>
              <Audio src={staticFile("audio/sfx/switch-tap.mp3")} volume={0.35} />
            </Sequence>
          ))
        : [],
    )}
    <Audio src={staticFile("audio/bgm-tech-house.mp3")} volume={(f) => 0.05 * interpolate(f, [0, 30, TOTAL - 60, TOTAL], [0, 1, 1, 0], clamp)} loop />
  </AbsoluteFill>
);

const FadeWrap: React.FC<{ len: number; first: boolean; children: React.ReactNode }> = ({ len, first, children }) => {
  const f = useCurrentFrame();
  const o = Math.min(first ? 1 : interpolate(f, [0, 8], [0, 1], clamp), interpolate(f, [len - 6, len], [1, 0.0001], clamp));
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};
