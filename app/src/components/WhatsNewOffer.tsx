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

/**
 * After an update, Nex offers to show what's new, in practice mode. Asked once per version;
 * a first launch gets the full tutorial instead.
 */
export function WhatsNewOffer() {
  const current = CHANGELOG[0]?.version ?? "";
  const tour = WHATS_NEW.find((w) => w.version === current);
  const [open, setOpen] = useState(() => {
    if (!tour) return false;
    const seen = read(SEEN_KEY);
    // A new install: the first-run tutorial covers everything, so just remember the version.
    if (read("nexdb.guideDone") !== "1") {
      write(SEEN_KEY, current);
      return false;
    }
    return seen !== current;
  });

  if (!open || !tour) return null;
  const release = CHANGELOG[0];
  const close = () => {
    write(SEEN_KEY, current);
    setOpen(false);
  };

  return (
    <aside className="whatsnew-offer" role="dialog" aria-labelledby="whatsnew-offer-title">
      <Nex state="hello" size={56} />
      <div>
        <h2 id="whatsnew-offer-title">NexDB {current} is here</h2>
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
