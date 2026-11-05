import { useEffect, useRef, useState } from "react";
import { Nex } from "./Nex";

/** How long Nex waits after saying hello before the tour starts on its own. */
const AUTO_MS = 6500;

/**
 * Right after setup: a blue flash, "Welcome to NexDB" in large clean type, then Nex walks in to
 * say hello and the tour starts by itself. "Skip for now" leaves the tour for later (Settings →
 * Tutorial); Esc does the same.
 */
export function Welcome({ onDone }: { onDone: (tour: boolean) => void }) {
  // "zoom": into the Dashboard through a white flash (the tour starts); "fade": just goes.
  const [leaving, setLeaving] = useState<false | "zoom" | "fade">(false);
  const start = useRef<HTMLButtonElement>(null);
  const done = useRef(false);

  const finish = (tour: boolean) => {
    if (done.current) return;
    done.current = true;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setLeaving(tour && !still ? "zoom" : "fade");
    window.setTimeout(() => onDone(tour), tour && !still ? 820 : 450);
  };

  useEffect(() => {
    const auto = window.setTimeout(() => finish(true), AUTO_MS);
    // The start button gets focus once it shows, so Enter starts the tour.
    const focus = window.setTimeout(() => start.current?.focus(), 2600);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(auto);
      window.clearTimeout(focus);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={leaving ? `welcome leaving ${leaving}` : "welcome"}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-nex"
    >
      <div className="welcome-flash" aria-hidden="true" />
      <div className="welcome-glow" aria-hidden="true" />
      <div className="welcome-whiteout" aria-hidden="true" />
      <div className="welcome-body">
        <p className="welcome-kicker">Welcome to</p>
        <h1 id="welcome-title" className="welcome-title">
          NexDB
        </h1>
        <p className="welcome-sub">Your local stack is set up and ready.</p>

        <div className="welcome-nex">
          <Nex state="teacher" size={112} />
          <p className="welcome-bubble" id="welcome-nex">
            Hi, I'm Nex! Let me show you around. It takes about two minutes.
          </p>
        </div>

        <div className="welcome-actions">
          <button ref={start} className="btn btn-primary welcome-start" onClick={() => finish(true)}>
            <span className="welcome-start-fill" aria-hidden="true" />
            <span className="welcome-start-label">Start the tour</span>
          </button>
          <button className="btn btn-quiet welcome-skip" onClick={() => finish(false)}>
            Skip for now
          </button>
        </div>
        <p className="welcome-hint">The tour starts by itself in a moment. Settings → Tutorial replays it any time.</p>
      </div>
    </div>
  );
}
