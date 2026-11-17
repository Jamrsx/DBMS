import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "nexdb.theme";
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

/** The saved choice; storage can be unavailable, so fall back to following Windows. */
function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // Storage blocked: follow the system.
  }
  return "system";
}

/** How long switching between light and dark fades, so it never flashes. Matches styles.css. */
const FADE_MS = 700;

/* ------------------------------------------------------------------ glass */

const GLASS_KEY = "nexdb.glass";
const reduceTransparencyQuery = () => window.matchMedia("(prefers-reduced-transparency: reduce)");

/** Whether the person turned Glass on (it still shows solid while the OS asks for less transparency). */
function readGlass(): boolean {
  try {
    return localStorage.getItem(GLASS_KEY) === "1";
  } catch {
    return false;
  }
}

/** The OS setting "Reduce transparency" (macOS) / "Transparency effects" off (Windows). */
export function transparencyReduced(): boolean {
  return reduceTransparencyQuery().matches;
}

/** In a plain browser (the dev preview) there is no desktop behind the window, so paint a sample one. */
const browserPreview = import.meta.env.DEV && !isTauri();

let glassWanted = readGlass();

/** Asks the window for its native blur (macOS vibrancy / Liquid Glass, Windows 11 Mica) to match. */
function syncWindow() {
  const root = document.documentElement;
  const on = glassWanted && !transparencyReduced();
  root.toggleAttribute("data-glass", on);
  root.toggleAttribute("data-glass-preview", on && browserPreview);
  // Your own desktop picture, if copied to app/dev-preview/wallpaper.jpg (git-ignored, dev only).
  if (browserPreview) root.style.setProperty("--preview-wall", 'url("/dev-preview/wallpaper.jpg")');
  if (!isTauri()) return;
  invoke("set_window_glass", { on, dark: root.dataset.theme === "dark" }).catch(() => {
    // An older core without the command: the page stays on its solid look.
    root.removeAttribute("data-glass");
  });
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  const theme = choice === "system" ? (darkQuery().matches ? "dark" : "light") : choice;
  const set = () => {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    syncWindow();
  };
  // First paint, or no change: apply at once.
  if (!root.dataset.theme || root.dataset.theme === theme) return set();

  // Cross-fade the whole window from the old look to the new one.
  const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
  if (doc.startViewTransition && !document.hidden) {
    let done = false;
    const once = () => {
      if (!done) (done = true), set();
    };
    doc.startViewTransition(once);
    // A window that isn't drawing (minimised to the tray) would hold the change back.
    window.setTimeout(once, FADE_MS);
    return;
  }
  // Older engines: let colours ease over instead.
  root.classList.add("theme-fading");
  set();
  window.setTimeout(() => root.classList.remove("theme-fading"), FADE_MS);
}

/** Current theme choice and a setter that saves it and applies it immediately. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);

  useEffect(() => {
    apply(choice);
    if (choice !== "system") return;
    // Follow Windows live while set to System.
    const query = darkQuery();
    const onChange = () => apply("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [choice]);

  const update = useCallback((next: ThemeChoice) => {
    setChoice(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not saved; the choice still applies for this session.
    }
  }, []);

  return [choice, update] as const;
}

/** Glass on or off, whether the OS is holding it back, and a setter that saves and applies it. */
export function useGlass() {
  const [on, setOn] = useState(glassWanted);
  const [reduced, setReduced] = useState(transparencyReduced);

  useEffect(() => {
    // Follow the OS accessibility setting live.
    const query = reduceTransparencyQuery();
    const onChange = () => {
      setReduced(query.matches);
      syncWindow();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const update = useCallback((next: boolean) => {
    glassWanted = next;
    setOn(next);
    try {
      localStorage.setItem(GLASS_KEY, next ? "1" : "0");
    } catch {
      // Not saved; it still applies for this session.
    }
    syncWindow();
  }, []);

  return { on, reduced, setGlass: update } as const;
}
