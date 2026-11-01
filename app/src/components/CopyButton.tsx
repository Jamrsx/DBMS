import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A small button that copies `text`, showing a tick for a moment afterwards. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-small btn-icon"
      title={copied ? "Copied" : "Copy"}
      aria-label={copied ? "Copied" : `Copy ${label ?? text}`}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
    </button>
  );
}
