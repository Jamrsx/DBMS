import { useState } from "react";
import { X } from "lucide-react";

const HIDE_KEY = "nexdb.freeNoticeUntil";
const WEEK = 7 * 24 * 60 * 60 * 1000;

function hiddenNow(): boolean {
  try {
    return Number(localStorage.getItem(HIDE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

/** One small message in the window, never a popup. Closing it hides it for 7 days. */
export function UpgradeNotice({ trialAvailable, onOpen }: { trialAvailable: boolean; onOpen: () => void }) {
  const [hidden, setHidden] = useState(hiddenNow);
  if (hidden) return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now() + WEEK));
    } catch {
      // It shows again next launch; harmless.
    }
  };

  return (
    <aside className="free-notice" aria-label="Upgrade">
      <p>
        {trialAvailable ? "Try " : "Get "}
        <strong>.test sites</strong>, templates and one-click versions{trialAvailable ? " free for 14 days." : " with the full NexDB."}
      </p>
      <button type="button" className="btn btn-small btn-primary" onClick={onOpen}>
        See what you get
      </button>
      <button type="button" className="free-notice-close" aria-label="Hide this message for 7 days" title="Hide for 7 days" onClick={close}>
        <X size={15} aria-hidden="true" />
      </button>
    </aside>
  );
}
