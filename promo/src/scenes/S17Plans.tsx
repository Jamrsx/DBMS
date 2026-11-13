// #17 Plans — chip-grid-single-select-blackout (demos/ChipGridSingleSelectBlackout.tsx).
// Kept: 3+2 centred chips (h30, r15, gap 10, rows 96/136), entrance d=0.05+i·0.028 over 0.04 outQuad,
// FS-relative timings: 1-frame grey press flash (FS→+0.006→+0.014), inversion over FS+0.008→+0.04
// linear, press bounce 1+sin·0.04 to FS+0.075, others fade to 18% with positions locked
// (transform:none), lift at FS+0.30→+0.42 (−46px, ×0.82, back to centre via measured cx), the line
// below fades in FS+0.36→+0.42 then deepens word by word. Changed: dark NexDB palette where the
// selected chip "inverts" to the blue accent, NexDB plans, the 4-year+NexHost chip is selected, and
// the demo clock is stretched (DEMO) so the press lands on beat 248 and the prices stay readable.
import React, { useRef } from "react";
import { useCurrentFrame } from "remotion";
import { DesignStage, E, lerp, seg } from "../demos/_fixtures/Motion";
import { C, F } from "../theme";
import { beatIn } from "../timeline";
import { GuideCursor } from "../Cursor";

const SANS = F.text;
const BG = C.deep;
const SEL = "#2f6ae0";
const TXT = C.text;
const DIM = "#3a404a";
const LINE = C.borderStrong;
const CHIP = C.surface;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const h2r = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (p: number, a: string, b: string) => {
  const A = h2r(a), B = h2r(b), q = clamp01(p);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * q)},${Math.round(A[1] + (B[1] - A[1]) * q)},${Math.round(A[2] + (B[2] - A[2]) * q)})`;
};

let measureCtx: CanvasRenderingContext2D | null = null;
const chipWidth = (label: string) => {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return 130;
  measureCtx.font = `600 12px ${F.text}`;
  return measureCtx.measureText(label).width + 30 + 2; // padding 15+15, border 1+1
};

const NAMES = ["6 months · ₱299", "1 year · ₱540", "2 years · ₱960", "3 years · ₱1,260", "4 years · ₱4,900 + NexHost"];
const TI = 4;
const FS = 0.44;
const CAP_TEXT = "₱102 a month  ·  NexHost included";
const CAP_WORDS = CAP_TEXT.split(" ");
const CAP_N = CAP_WORDS.length;
const CAP_ST = 0.78 / CAP_N;
const CAP_WIN = CAP_ST * 1.5;

export const S17Plans: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const DEMO = Math.round(beatIn("s17Plans", 248) / FS) + 1; // press lands on beat 248
  const t = Math.min(1, f / (DEMO - 1));
  const targetRef = useRef<HTMLDivElement>(null);
  // The demo measures the chip after layout; Remotion renders each frame fresh, so the offset back
  // to the centre line is computed from the text width instead: row 2 = [3-year, 4-year], gap 10,
  // so the 4-year chip's centre sits (w3 + 10) / 2 right of centre.
  const cx = -(chipWidth(NAMES[3]) + 10) / 2;
  const capShow = seg(t, FS + 0.36, FS + 0.42);
  const capInn = seg(t, FS + 0.37, 0.98);
  const out = Math.min(1, Math.max(0, (duration - f) / 8));

  return (
    <DesignStage bg={BG} raster="zoom">
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(220px 130px at 50% 50%, rgba(47,106,224,.13), transparent 70%), ${BG}`, overflow: "hidden", fontFamily: SANS, opacity: out }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 440, height: 240, margin: "-120px 0 0 -220px" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 26, textAlign: "center", font: `600 11px/1 ${F.mono}`, letterSpacing: 2.4, color: C.accentText, opacity: seg(t, 0.02, 0.1, E.outQuad) }}>
            PICK YOUR PLAN
          </div>
          {[0, 1].map((row) => (
            <div key={row} style={{ position: "absolute", left: -40, right: -40, top: row === 0 ? 96 : 136, display: "flex", justifyContent: "center", gap: 10 }}>
              {NAMES.map((n, i) => {
                if ((i < 3 ? 0 : 1) !== row) return null;
                const d = 0.05 + i * 0.028;
                const inP = seg(t, d, d + 0.04, E.outQuad);
                let bg = CHIP;
                let borderColor = LINE;
                let labelColor = TXT;
                let flashO = "0";
                let opacity: string | number;
                let transform: string;
                if (i === TI) {
                  flashO = (seg(t, FS, FS + 0.006) * (1 - seg(t, FS + 0.006, FS + 0.014))).toFixed(3);
                  const bk = seg(t, FS + 0.008, FS + 0.04, E.linear);
                  bg = mix(bk, CHIP, SEL);
                  borderColor = mix(bk, LINE, "#5b8ff0");
                  labelColor = mix(bk, TXT, "#ffffff");
                  const pr = seg(t, FS + 0.008, FS + 0.075, E.linear);
                  const sc = 1 + Math.sin(pr * Math.PI) * 0.04 * (pr > 0 ? 1 : 0);
                  const lift = seg(t, FS + 0.3, FS + 0.42, E.inOutCubic);
                  opacity = inP;
                  transform = `translate(${(cx * lift).toFixed(2)}px,${(-46 * lift).toFixed(2)}px) scale(${(sc * lerp(lift, 1, 0.82 * 1.25)).toFixed(4)})`;
                } else {
                  const fade = seg(t, FS + 0.008, FS + 0.075, E.outQuad);
                  const gone = seg(t, FS + 0.3, FS + 0.35, E.outQuad);
                  opacity = (inP * lerp(fade, 1, 0.18) * (1 - gone)).toFixed(3);
                  transform = "none";
                }
                return (
                  <div
                    key={i}
                    ref={i === TI ? targetRef : undefined}
                    style={{
                      position: "relative",
                      height: 30,
                      borderRadius: 15,
                      background: bg,
                      border: `1px solid ${borderColor}`,
                      boxSizing: "border-box",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 15px",
                      boxShadow: i === TI ? "0 6px 20px -8px rgba(47,106,224,.8)" : "0 1px 4px rgba(0,0,0,.3)",
                      overflow: "hidden",
                      opacity,
                      transform,
                    }}
                  >
                    <div style={{ font: `600 12px/1 ${SANS}`, color: labelColor, letterSpacing: "-.01em", whiteSpace: "nowrap" }}>{n}</div>
                    <div style={{ position: "absolute", inset: 0, background: "rgba(120,120,120,.5)", opacity: flashO }} />
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ position: "absolute", left: "50%", top: 150, display: "flex", alignItems: "baseline", whiteSpace: "nowrap", transform: "translateX(-50%)", opacity: capShow }}>
            {CAP_WORDS.map((w, i) => {
              const q = clamp01((capInn - i * CAP_ST) / CAP_WIN);
              return (
                <span key={i} style={{ font: `600 15px/1.25 ${F.display}`, color: mix(q, DIM, i < 4 ? TXT : "#5ccb8b"), letterSpacing: (-0.03 * (1 - q)).toFixed(4) + "em", marginRight: i === CAP_N - 1 ? 0 : 4.5 }}>
                  {w}
                </span>
              );
            })}
          </div>
          {/* the guide cursor presses the 4-year plan */}
          <GuideCursor
            ways={[
              { f: 0, x: 360, y: 236 },
              { f: Math.round(FS * (DEMO - 1)) - 2, x: 220 - cx + 6, y: 152 },
              { f: Math.round(FS * (DEMO - 1)), x: 220 - cx + 6, y: 152, click: true },
              { f: Math.round(FS * (DEMO - 1)) + 30, x: 300, y: 230 },
            ]}
            f={f}
            size={10}
            show={Math.min(1, Math.max(0, (Math.round(FS * (DEMO - 1)) + 30 - f) / 14))}
          />
        </div>
      </div>
    </DesignStage>
  );
};
