import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "devmanager.theme";
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

function apply(choice: ThemeChoice) {
  const theme = choice === "system" ? (darkQuery().matches ? "dark" : "light") : choice;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
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
