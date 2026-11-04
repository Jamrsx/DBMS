import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ListChecks, LoaderCircle, X, XCircle } from "lucide-react";
import { clearFinished, dismissTask, useTasks, type Task } from "../lib/tasks";

/** What runs in the background (setups, downloads, imports, backups), from any page. */
export function TasksButton() {
  const tasks = useTasks();
  const [open, setOpen] = useState(false);
  // Fixed to the window, so the list is never cut off by the sidebar's edge.
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const running = tasks.filter((t) => t.status === "running").length;
  const failed = tasks.filter((t) => t.status === "failed").length;

  // Closes on Escape or a click outside, like any menu.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const click = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", click);
    };
  }, [open]);

  if (tasks.length === 0) return null;
  const label = running
    ? `${running} task${running === 1 ? "" : "s"} running`
    : failed
      ? `${failed} task${failed === 1 ? "" : "s"} stopped`
      : "Tasks done";

  return (
    <div className="tasks" ref={box}>
      {open && (
        <div
          className="tasks-pop"
          role="dialog"
          aria-label="Background tasks"
          style={at ? { left: at.left, bottom: at.bottom } : undefined}
        >
          <div className="tasks-head">
            <strong>Background tasks</strong>
            {tasks.some((t) => t.status !== "running") && (
              <button className="btn btn-small btn-quiet" onClick={clearFinished}>
                Clear finished
              </button>
            )}
          </div>
          <p className="field-hint">They keep going while you use other pages.</p>
          <ul className="tasks-list">
            {tasks.map((t) => (
              <TaskRow key={t.id} t={t} />
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        className={`tasks-button${failed && !running ? " tasks-failed" : ""}`}
        aria-expanded={open}
        title={label}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setAt({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
          setOpen((v) => !v);
        }}
      >
        {running ? (
          <LoaderCircle size={15} className="status-spin" aria-hidden="true" />
        ) : failed ? (
          <XCircle size={15} aria-hidden="true" />
        ) : (
          <ListChecks size={15} aria-hidden="true" />
        )}
        <span className="nav-label">{label}</span>
      </button>
    </div>
  );
}

function TaskRow({ t }: { t: Task }) {
  const Icon = t.status === "running" ? LoaderCircle : t.status === "done" ? CheckCircle2 : XCircle;
  return (
    <li className={`tasks-item tasks-${t.status}`}>
      <Icon size={15} className={t.status === "running" ? "status-spin" : undefined} aria-hidden="true" />
      <div className="tasks-text">
        <p className="tasks-title">{t.title}</p>
        {t.status === "running" ? (
          <>
            <p className="field-hint">
              {t.detail ?? "Working…"}
              {t.percent !== null && ` · ${t.percent}%`}
            </p>
            {t.percent !== null && (
              <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.percent}>
                <span className="bar-fill" style={{ width: `${t.percent}%` }} />
              </span>
            )}
          </>
        ) : (
          <p className={t.status === "failed" ? "field-error" : "field-hint"}>
            {t.message ?? (t.status === "done" ? "Done." : "Stopped.")}
          </p>
        )}
      </div>
      {t.status !== "running" && (
        <button className="tasks-dismiss" aria-label={`Dismiss ${t.title}`} onClick={() => dismissTask(t.id)}>
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
