import { useRef } from "react";
import { PlayCircle, X } from "lucide-react";

/** Tutorial videos that ship inside NexDB (app/public/tutorials), so they play offline. */
const VIDEOS = {
  tailscale: {
    src: "/tutorials/tailscale-setup.mp4",
    title: "How to set up Tailscale with NexDB",
    length: "2½ min",
  },
} as const;

/**
 * A "Watch how" button that plays a tutorial in a window over the app. Esc or Close stops it;
 * nothing is downloaded, the video comes with NexDB.
 */
export function TutorialVideo({ video, label = "Watch how to set it up" }: { video: keyof typeof VIDEOS; label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const v = VIDEOS[video];

  const close = () => {
    player.current?.pause();
    dialog.current?.close();
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-small"
        data-guide={`tutorial-${video}`}
        onClick={() => {
          dialog.current?.showModal();
          void player.current?.play().catch(() => {});
        }}
      >
        <PlayCircle size={14} aria-hidden="true" /> {label} ({v.length})
      </button>
      <dialog
        ref={dialog}
        className="tutorial-dialog"
        aria-label={v.title}
        onClose={() => player.current?.pause()}
        onClick={(e) => e.target === dialog.current && close()}
      >
        <header className="tutorial-head">
          <h2>{v.title}</h2>
          <button type="button" className="btn btn-small btn-quiet" onClick={close} aria-label="Close the video">
            <X size={14} aria-hidden="true" /> Close
          </button>
        </header>
        <video ref={player} className="tutorial-video" src={v.src} controls preload="metadata" playsInline />
      </dialog>
    </>
  );
}
