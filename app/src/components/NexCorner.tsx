import { X } from "lucide-react";
import { Nex } from "./Nex";
import { nexHide, useNexLine } from "../lib/nex";

/** Nex peeking up from the bottom-right corner with something to say. Click to send Nex away. */
export function NexCorner() {
  const line = useNexLine();
  if (!line) return null;
  return (
    <div key={line.id} className={`nex-corner nex-corner-${line.state}`} role="status" aria-live="polite">
      <div className="nex-bubble">
        <p>{line.text}</p>
        <button className="nex-bubble-close" onClick={nexHide} aria-label="Dismiss" title="Dismiss">
          <X size={12} aria-hidden="true" />
        </button>
      </div>
      <button className="nex-peek" onClick={nexHide} aria-label="Dismiss Nex" title="Bye, Nex">
        <Nex state={line.state} size={92} />
      </button>
    </div>
  );
}
