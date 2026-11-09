import { useCallback, useEffect, useState } from "react";

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

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  const theme = choice === "system" ? (darkQuery().matches ? "dark" : "light") : choice;
  const set = () => {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
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
