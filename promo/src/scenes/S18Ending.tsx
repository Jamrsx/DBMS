// #18 Ending, three parts (38 beats):
// A (beats 0–10) timeline-travel (demos/TimelineTravel.tsx): the camera speeds along a version
//   axis, each tick's card springs up as it passes, hard stop + push-in 1.28× on today's version.
//   Kept: 1400px tick gap, eased travel [0,.15,.88,1]→[0,.055,.9,1], cards pop 6f early with
//   spring(damping 11, stiffness 160, mass .9), axis + minor ticks. Changed: dark NexDB look.
// B (beats 10–24) the free launch key card + Nex the wizard (casts on beat 12, the card appears
//   from the spell). The key on the card is made up for the video (not a working key).
// C (beats 24–38) ui-to-brand-morph · icon-flip-bloom (demos/IconFlipBloomLogo.tsx): the NexHost
//   icon wobbles (−12/+14/−18°), flips flat along Y (scaleX→0.04, in-cubic, ghosts + blur), and
//   blooms into the NexDB logo (spring damping 11 / stiffness 130) — big hit #3 on beat 28 — then
//   slides left while "NexDB" sweeps in letter by letter (2.2f stagger, 10f, blur 16→0); BY NEXIO
//   DEVS last, then everything fades with the music.
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, Easing } from "remotion";
import { Nex } from "../Nex";
import { C, F, ROOM_BG } from "../theme";
import { beatsIn } from "../timeline";

const land = Easing.bezier(0.34, 1.56, 0.64, 1);
const out = Easing.bezier(0.16, 1, 0.3, 1);
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const END_BEATS = { partB: 10, cast: 12, partC: 24, bloom: 28 };

export const S18Ending: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const partB = beatsIn("s18Ending", END_BEATS.partB);
  const cast = beatsIn("s18Ending", END_BEATS.cast);
  const partC = beatsIn("s18Ending", END_BEATS.partC);
  const bloomAt = beatsIn("s18Ending", END_BEATS.bloom);
  const toB = interpolate(f, [partB - 6, partB], [0, 1], CL);
  const nexIn = interpolate(f, [partB, partB + 18], [0, 1], { ...CL, easing: land });
  const card = interpolate(f, [cast, cast + 16], [0, 1], { ...CL, easing: land });
  const cta = interpolate(f, [cast + 18, cast + 34], [0, 1], { ...CL, easing: out });
  const part1 = toB * interpolate(f, [partC - 10, partC], [1, 0], CL);
  const flash = interpolate(f, [bloomAt, bloomAt + 1, bloomAt + 5], [0, 0.35, 0], CL);
  const fadeOut = interpolate(f, [duration - 45, duration], [1, 0], CL);
  const sparkles = Array.from({ length: 12 }, (_, i) => {
    const life = interpolate(f, [cast + i * 1.5, cast + 22 + i * 1.5], [0, 1], CL);
    const ang = (i / 12) * Math.PI * 2 + 0.3;
    return { x: 1010 + Math.cos(ang) * (60 + life * 260), y: 470 + Math.sin(ang) * (40 + life * 170), o: life > 0 && life < 1 ? 1 - life : 0, r: 6 - life * 4 };
  });

  return (
    <AbsoluteFill style={{ background: ROOM_BG, opacity: fadeOut }}>
      {f < partB && <Travel f={f} opacity={1 - toB} />}
      {f >= partB - 6 && f < partC + 2 && (
        <AbsoluteFill style={{ opacity: part1 }}>
          <div style={{ position: "absolute", left: 160, top: 300, opacity: nexIn, transform: `translateY(${(1 - nexIn) * 300}px)` }}>
            <Nex mood="wizard" size={500} />
          </div>
          {sparkles.map((s, i) => (
            <div key={i} style={{ position: "absolute", left: s.x, top: s.y, width: s.r * 2, height: s.r * 2, borderRadius: "50%", background: i % 3 ? C.accentText : C.ok, boxShadow: `0 0 12px ${C.accentText}`, opacity: s.o }} />
          ))}
          <div style={{ position: "absolute", left: 760, top: 250, width: 960, opacity: card, transform: `translateY(${(1 - card) * 60}px) scale(${0.92 + card * 0.08})`, transformOrigin: "30% 60%" }}>
            <div style={{ padding: "44px 52px", borderRadius: 28, background: `linear-gradient(150deg, #1d2a45, ${C.surface} 70%)`, border: "1px solid rgba(91,143,240,.5)", boxShadow: "0 40px 100px -40px rgba(0,0,0,.9), 0 0 80px -30px rgba(47,106,224,.7)" }}>
              <div style={{ font: `600 22px ${F.mono}`, letterSpacing: 3, color: C.accentText }}>FREE LAUNCH KEY</div>
              <div style={{ marginTop: 20, font: `700 50px ${F.mono}`, letterSpacing: 2, color: C.text }}>NEXDB-FREE-7DAY-LNCH</div>
              <div style={{ marginTop: 26, display: "flex", gap: 14 }}>
                {["7 days free", "NexHost included", "Every feature"].map((t) => (
                  <span key={t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderRadius: 999, background: "rgba(15,17,20,.6)", border: `1px solid ${C.border}`, font: `600 24px ${F.text}`, color: C.text2 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 5, background: C.ok }} />
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 40, font: `700 74px/1.05 ${F.display}`, letterSpacing: -2.5, color: C.text, opacity: cta, transform: `translateY(${(1 - cta) * 20}px)` }}>
              Get your <span style={{ color: C.ok }}>free launch key.</span>
            </div>
          </div>
        </AbsoluteFill>
      )}
      {f >= partC - 10 && <FlipBloom f={f - (bloomAt - 12)} />}
      <AbsoluteFill style={{ background: "#dfe8ff", opacity: flash }} />
    </AbsoluteFill>
  );
};

// ---------- A: timeline travel ----------
const AXIS_Y = 640;
const TICK_GAP = 1400;
const TICKS = [
  { label: "v0.1", card: "One-click start" },
  { label: "v0.2", card: "Project starters" },
  { label: "v0.4", card: "Nex, your helper" },
  { label: "v0.5.5", card: "NexHost" },
].map((t, i) => ({ ...t, x: 960 + TICK_GAP * i }));
const TRAVEL_START = 10;
const TRAVEL_END = 100;
const ZOOM_END = 110;
const camXAt = (f: number) => {
  const t = interpolate(f, [TRAVEL_START, TRAVEL_END], [0, 1], CL);
  return interpolate(t, [0, 0.15, 0.88, 1], [0, 0.055, 0.9, 1], { easing: Easing.inOut(Easing.quad) }) * (TICKS[3].x - 960);
};
const popFrameOf = (x: number) => {
  for (let f = TRAVEL_START; f <= TRAVEL_END; f++) if (camXAt(f) >= x - 960) return f;
  return TRAVEL_END;
};
const Travel: React.FC<{ f: number; opacity: number }> = ({ f, opacity }) => {
  const camX = camXAt(f);
  const zoom = interpolate(f, [TRAVEL_END, ZOOM_END], [1, 1.28], { ...CL, easing: Easing.out(Easing.cubic) });
  const title = interpolate(f, [0, 14], [0, 1], { ...CL, easing: out });
  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: "50% 58%" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 960 + TICK_GAP * 3 + 960, height: 1080, transform: `translateX(${-camX}px)` }}>
          <div style={{ position: "absolute", left: 200, top: AXIS_Y - 3, width: TICK_GAP * 3 + 1520, height: 6, background: C.border, borderRadius: 3 }} />
          {Array.from({ length: 22 }).map((_, i) => (
            <div key={i} style={{ position: "absolute", left: 960 + i * (TICK_GAP / 5) - 2, top: AXIS_Y - 12, width: 4, height: 24, background: C.border, borderRadius: 2 }} />
          ))}
          {TICKS.map((t, i) => {
            const pop = popFrameOf(t.x) - 6;
            const sp = spring({ frame: f - pop, fps: 30, config: { damping: 11, stiffness: 160, mass: 0.9 }, durationInFrames: 26 });
            const last = i === TICKS.length - 1;
            const tone = last ? C.ok : C.accentText;
            return (
              <div key={i} style={{ position: "absolute", left: t.x, top: 0 }}>
                <div style={{ position: "absolute", left: -3, top: AXIS_Y - 28, width: 6, height: 56, background: tone, borderRadius: 3, boxShadow: `0 0 14px ${tone}` }} />
                <div style={{ position: "absolute", left: -120, top: AXIS_Y + 44, width: 240, textAlign: "center", font: `700 44px ${F.mono}`, color: C.text }}>{t.label}</div>
                {f >= pop && (
                  <div
                    style={{
                      position: "absolute",
                      left: -200,
                      top: AXIS_Y - 36 - 210,
                      width: 400,
                      height: 210,
                      boxSizing: "border-box",
                      transform: `scaleY(${sp}) scaleX(${0.6 + 0.4 * sp})`,
                      transformOrigin: "50% 100%",
                      opacity: Math.min(1, sp * 2),
                      borderRadius: 24,
                      background: `linear-gradient(150deg, ${last ? "#173226" : "#1d2a45"}, ${C.surface} 75%)`,
                      border: `1px solid ${last ? "rgba(92,203,139,.55)" : "rgba(91,143,240,.45)"}`,
                      boxShadow: "0 30px 70px -30px rgba(0,0,0,.9)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      padding: "0 34px",
                    }}
                  >
                    <div style={{ width: 44, height: 6, borderRadius: 3, background: tone, marginBottom: 22 }} />
                    <div style={{ font: `700 46px/1.1 ${F.display}`, letterSpacing: -1.2, color: C.text }}>{t.card}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", top: 110, width: "100%", textAlign: "center", opacity: title, font: `700 64px ${F.display}`, letterSpacing: -2, color: C.text }}>
        Always getting <span style={{ color: C.ok }}>better.</span>
      </div>
    </AbsoluteFill>
  );
};

// ---------- C: icon flip bloom ----------
const HostIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <rect x={2} y={2} width={36} height={36} rx={9} fill="#173226" stroke={C.ok} strokeWidth={2} />
    {[11, 19, 27].map((y) => (
      <g key={y}>
        <rect x={9} y={y - 3} width={22} height={6} rx={2} fill="none" stroke={C.ok} strokeWidth={1.8} />
        <circle cx={27} cy={y} r={1.2} fill={C.ok} />
      </g>
    ))}
  </svg>
);
const WORD = "NexDB";
/** f is local: the wobble runs −22→0, the flip 0→12, the bloom (big hit) at 12. */
const FlipBloom: React.FC<{ f: number }> = ({ f }) => {
  const FLIP_MID = 12;
  const WORD_START = 34;
  const BY = WORD_START + 26;
  const inT = spring({ frame: f + 22, fps: 30, config: { damping: 13, stiffness: 140, mass: 0.8 } });
  const wobble = interpolate(f, [-22, -16, -10, -4, 0], [0, -12, 14, -18, 0], { ...CL, easing: Easing.inOut(Easing.sin) });
  const flipIn = interpolate(f, [0, FLIP_MID], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
  const iconScaleX = interpolate(flipIn, [0, 1], [1, 0.04]);
  const bloom = f < FLIP_MID ? 0 : spring({ frame: f - FLIP_MID, fps: 30, config: { damping: 11, stiffness: 130, mass: 0.9 } });
  const shift = interpolate(f, [WORD_START - 2, WORD_START + 16], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
  const markX = -330 * shift;
  const ring = interpolate(f, [FLIP_MID, FLIP_MID + 20], [0, 1], CL);
  const by = interpolate(f, [BY, BY + 16], [0, 1], { ...CL, easing: out });
  const ghosts = f >= 0 && f < FLIP_MID ? [0.12, 0.24] : [];
  return (
    <AbsoluteFill style={{ opacity: interpolate(f, [-32, -22], [0, 1], CL) }}>
      <div style={{ position: "absolute", left: 960 + markX, top: 500, transform: "translate(-50%, -50%)" }}>
        {ring > 0 && ring < 1 && (
          <div style={{ position: "absolute", left: "50%", top: "50%", width: 300, height: 300, marginLeft: -150, marginTop: -150, borderRadius: "50%", boxSizing: "border-box", border: `${10 - 8 * ring}px solid ${C.accentHi}`, transform: `scale(${0.6 + Easing.out(Easing.cubic)(ring) * 1.6})`, opacity: 0.8 * (1 - ring) }} />
        )}
        {f < FLIP_MID ? (
          <>
            {ghosts.map((g, i) => (
              <div key={i} style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) scaleX(${Math.min(1, iconScaleX + g)})`, opacity: 0.22 - i * 0.08, filter: "blur(6px)" }}>
                <HostIcon size={260} />
              </div>
            ))}
            <div style={{ transform: `scale(${inT}) rotate(${wobble}deg) scaleX(${iconScaleX})`, transformOrigin: "center 78%", filter: flipIn > 0.3 ? `blur(${flipIn * 5}px)` : "none", opacity: Math.min(1, inT) }}>
              <HostIcon size={260} />
            </div>
          </>
        ) : (
          <div style={{ transform: `scaleX(${interpolate(bloom, [0, 1], [0.04, 1])}) scale(${0.85 + 0.15 * bloom})` }}>
            <Img src={staticFile("nexdb-logo.png")} style={{ width: 230, height: 230, borderRadius: 52, display: "block", boxShadow: `0 0 ${40 + 60 * bloom}px rgba(47,106,224,.6)` }} />
          </div>
        )}
      </div>
      <div style={{ position: "absolute", left: 960 + markX + 160, top: 500, transform: "translateY(-50%)", display: "flex", font: `700 220px/1 ${F.display}`, letterSpacing: -8, color: C.text }}>
        {WORD.split("").map((ch, i) => {
          const cT = interpolate(f, [WORD_START + i * 2.2, WORD_START + i * 2.2 + 10], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
          return (
            <span key={i} style={{ display: "inline-block", opacity: cT, transform: `translateX(${(1 - cT) * -70}px)`, filter: `blur(${(1 - cT) * 16}px)` }}>
              {ch}
            </span>
          );
        })}
      </div>
      <div style={{ position: "absolute", top: 720, width: "100%", textAlign: "center", font: `600 34px ${F.mono}`, letterSpacing: 10, color: C.text3, opacity: by, transform: `translateY(${(1 - by) * 16}px)` }}>
        BY <span style={{ color: C.accentText }}>NEXIO DEVS</span>
      </div>
    </AbsoluteFill>
  );
};
