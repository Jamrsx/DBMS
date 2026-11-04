import { useEffect, useRef, useState } from "react";
import { Nex } from "./Nex";

const TOUR_KEY = "nexdb.tourDone";

/** Opens the tour again (Settings → Show the tour). */
export function showTour() {
  window.dispatchEvent(new Event("nexdb:tour"));
}

interface Step {
  title: string;
  body: string;
  /** The rail button the step is about, highlighted while it shows. */
  page?: string;
}

const STEPS: Step[] = [
  {
    title: "Welcome to NexDB",
    body: "A quick look around: five short stops. Press Esc any time to skip; Settings can show it again.",
  },
  {
    title: "Dashboard",
    body: "Start and stop Apache, PHP, MySQL and the rest. Each one shows whether it's running and why, if it isn't.",
    page: "dashboard",
  },
  {
    title: "Projects",
    body: "Every folder in your projects folder is a site at its own address. Make a new one, clone one from Git, or share one on your network.",
    page: "projects",
  },
  {
    title: "Database",
    body: "Browse and edit tables, run SQL, back up, and connect a database to a project so its .env is filled in for you.",
    page: "database",
  },
  {
    title: "Terminal and Versions",
    body: "A terminal with NexDB's PHP, Composer and Node ready, and a page to add or switch versions.",
    page: "terminal",
  },
  {
    title: "Search with Ctrl+K",
    body: "Jump to any page, project or database, or run an action, from anywhere in NexDB. Ctrl+1 to Ctrl+7 open the pages in the sidebar.",
  },
];

/** A short first-run tour: one card at a time, pointing at the sidebar. */
export function Tour({ onPage }: { onPage: (page: never) => void }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(TOUR_KEY) !== "1";
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const before = useRef<Element | null>(null);

  useEffect(() => {
    const again = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener("nexdb:tour", again);
    return () => window.removeEventListener("nexdb:tour", again);
  }, []);

  const s = STEPS[step];

  // Show the page each stop is about, and mark its sidebar button.
  useEffect(() => {
    if (!open) return;
    if (s.page) onPage(s.page as never);
    const btn = s.page ? document.querySelector(`.nav-item[data-page="${s.page}"]`) : null;
    btn?.setAttribute("data-tour", "");
    return () => btn?.removeAttribute("data-tour");
  }, [open, s, onPage]);

  useEffect(() => {
    if (!open) return;
    before.current = document.activeElement;
    card.current?.querySelector<HTMLButtonElement>(".btn-primary")?.focus();
  }, [open, step]);

  function finish() {
    setOpen(false);
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // Shows again next launch; harmless.
    }
    onPage("dashboard" as never);
    (before.current as HTMLElement | null)?.focus?.();
  }

  if (!open) return null;
  const last = step === STEPS.length - 1;
  return (
    <div
      className="tour"
      ref={card}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      onKeyDown={(e) => {
        if (e.key === "Escape") finish();
        if (e.key === "ArrowRight" && !last) setStep(step + 1);
        if (e.key === "ArrowLeft" && step > 0) setStep(step - 1);
      }}
    >
      <div className="tour-head">
        <Nex state={last ? "success" : step === 0 ? "hello" : "idle"} size={40} />
        <div>
          <p className="tour-count">
            {step + 1} of {STEPS.length}
          </p>
          <h2 id="tour-title">{s.title}</h2>
        </div>
      </div>
      <p id="tour-body">{s.body}</p>
      <div className="tour-actions">
        <button className="btn btn-small tour-skip" onClick={finish}>
          Skip tour
        </button>
        {step > 0 && (
          <button className="btn btn-small" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        <button className="btn btn-small btn-primary" onClick={() => (last ? finish() : setStep(step + 1))}>
          {last ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}
