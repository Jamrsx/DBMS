// NexDB dark theme tokens (app/src/styles.css) and the promo's motion tokens (DESIGN-SPEC.md).
export const C = {
  bg: "#0f1114",
  deep: "#07090c",
  surface: "#171a1f",
  surface2: "#1e2228",
  surface3: "#252a31",
  border: "#272c34",
  borderStrong: "#363c46",
  text: "#e4e7ec",
  text2: "#b3b9c4",
  text3: "#8e95a2",
  accent: "#2f6ae0",
  accentHi: "#5b8ff0",
  accentText: "#8fb3ff",
  ok: "#5ccb8b",
  warn: "#f0b552",
  bad: "#f47b7b",
};

export const F = {
  display: '"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif',
  text: '"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif',
  mono: '"Cascadia Mono","Cascadia Code",Consolas,monospace',
};

/** Soft blue/green room light behind every scene (Night Console). */
export const ROOM_BG = `radial-gradient(1200px 700px at 70% 28%, rgba(47,106,224,.16), transparent 60%),
 radial-gradient(900px 600px at 12% 92%, rgba(92,203,139,.07), transparent 60%), ${C.bg}`;
