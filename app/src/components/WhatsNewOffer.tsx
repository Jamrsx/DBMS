import { useState } from "react";
import { Nex } from "./Nex";
import { showGuide } from "./Tour";
import { WHATS_NEW } from "./whatsNew";
import { CHANGELOG } from "../lib/changelog";

const SEEN_KEY = "nexdb.seenVersion";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Asks again next launch; harmless.
  }
}

/** a > b for versions like 0.4.10 and 0.4.9. */
function newer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

/**
 * After an update, Nex offers to show what's new, in practice mode: the newest walkthrough the
 * user hasn't seen, so skipping a version (0.4.6 straight to 0.4.8) still offers 0.4.7's.
 * Asked once per update; a first launch gets the full tutorial instead.
 */
export function WhatsNewOffer() {
  const current = CHANGELOG[0]?.version ?? "";
  const seen = read(SEEN_KEY) ?? "0";
  const tour = WHATS_NEW.find((w) => newer(w.version, seen));
  const [open, setOpen] = useState(() => {
    // A new install: the first-run tutorial covers everything, so just remember the version.
    if (read("nexdb.guideDone") !== "1") {
      write(SEEN_KEY, current);
      return false;
    }
    if (!tour) {
      write(SEEN_KEY, current);
      return false;
    }
    return true;
  });

  if (!open || !tour) return null;
  const release = CHANGELOG.find((c) => c.version === tour.version) ?? CHANGELOG[0];
  const close = () => {
    write(SEEN_KEY, current);
    setOpen(false);
  };

  return (
    <aside className="whatsnew-offer" role="dialog" aria-labelledby="whatsnew-offer-title">
      <Nex state="hello" size={56} />
      <div>
        <h2 id="whatsnew-offer-title">
          {tour.version === current ? `NexDB ${current} is here` : `New since your last update: ${tour.version}`}
        </h2>
        <p>
          {release.changes.length} new things: {release.title.toLowerCase()}. Want me to show you? It's practice mode,
          so nothing on your PC changes.
        </p>
        <div className="whatsnew-offer-actions">
          <button className="btn btn-small" onClick={close}>
            Not now
          </button>
          <button
            className="btn btn-small btn-primary"
            autoFocus
            onClick={() => {
              close();
              showGuide(tour.chapter);
            }}
          >
            Show me
          </button>
        </div>
        <p className="field-hint">Settings → Tutorial can show it later.</p>
      </div>
    </aside>
  );
}
