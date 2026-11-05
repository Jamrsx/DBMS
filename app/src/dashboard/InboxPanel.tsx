import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Inbox as InboxIcon, Paperclip, RefreshCw, Trash2, X } from "lucide-react";
import { mailDelete, mailGet, mailList, type Inbox, type MailMessage } from "../lib/mail";
import { startServices } from "../lib/services";
import { Nex } from "../components/Nex";

/** "2 min ago", "10:42", "3 Nov". */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return new Date().toDateString() === d.toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * The mail catcher's inbox inside NexDB: every email your apps sent, newest first. The email is
 * shown in a sandbox with no scripts, the way a mail program would. It's the Mail page in the
 * sidebar (`page`), or a window over the Dashboard.
 */
export function InboxPanel({
  onClose,
  onOpenInBrowser,
  page = false,
  active = true,
}: {
  onClose?: () => void;
  onOpenInBrowser: () => void;
  page?: boolean;
  /** The page is showing; it only checks for new emails then. */
  active?: boolean;
}) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [open, setOpen] = useState<MailMessage | null>(null);
  const [view, setView] = useState<"email" | "text">("email");
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    mailList()
      .then((i) => {
        setInbox(i);
        setError(null);
        // The sidebar's count follows what you just read or deleted.
        window.dispatchEvent(new CustomEvent("nexdb:mail-count", { detail: i.unread }));
      })
      .catch((e) => setError(String(e)));
  }, []);
  // New emails show up by themselves.
  useEffect(() => {
    if (!active) return;
    load();
    const t = window.setInterval(() => document.visibilityState === "visible" && load(), 4000);
    return () => window.clearInterval(t);
  }, [load, active]);

  // Esc closes the email, then the inbox.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".palette")) return;
      if (open) setOpen(null);
      else onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, active]);

  async function startCatcher() {
    setStarting(true);
    try {
      await startServices("mailpit");
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  }
  // The mail catcher is off: say so and offer to start it, instead of an empty inbox.
  const off = !inbox && !!error;

  async function show(id: string) {
    try {
      setOpen(await mailGet(id));
      load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(ids: string[]) {
    setBusy(true);
    try {
      await mailDelete(ids);
      if (!ids.length || (open && ids.includes(open.id))) setOpen(null);
      setConfirmAll(false);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const box = (
    <div className="inbox">
      <header className="inbox-head">
        {page ? (
          <h1 id="inbox-title">
            <InboxIcon size={18} aria-hidden="true" /> Mail
          </h1>
        ) : (
          <h2 id="inbox-title">
            <InboxIcon size={16} aria-hidden="true" /> Caught emails
          </h2>
        )}
        <span className="field-hint" role="status">
          {inbox
            ? `${inbox.total} email${inbox.total === 1 ? "" : "s"}${inbox.unread ? `, ${inbox.unread} new` : ""}`
            : ""}
        </span>
        <div className="inbox-tools">
          <button className="btn btn-small btn-icon" aria-label="Check for new emails" title="Check now" onClick={load}>
            <RefreshCw size={13} aria-hidden="true" />
          </button>
          <button className="btn btn-small" onClick={onOpenInBrowser} title="Mailpit's own inbox, in your browser">
            <ExternalLink size={13} aria-hidden="true" /> In the browser
          </button>
          {!!inbox?.total &&
            (confirmAll ? (
              <span className="inbox-confirm" role="alert">
                Delete all {inbox.total}?
                <button className="btn btn-small" onClick={() => setConfirmAll(false)}>
                  Keep
                </button>
                <button className="btn btn-small btn-danger" disabled={busy} onClick={() => void remove([])}>
                  Delete all
                </button>
              </span>
            ) : (
              <button className="btn btn-small" onClick={() => setConfirmAll(true)}>
                <Trash2 size={13} aria-hidden="true" /> Delete all…
              </button>
            ))}
          {!page && (
            <button
              className="btn btn-small btn-icon"
              aria-label="Close the inbox"
              title="Close (Esc)"
              onClick={onClose}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {error && !off && (
        <p className="field-error inbox-error" role="alert">
          {error}
        </p>
      )}

      {off ? (
        <div className="inbox-off" role="status">
          <Nex state="sleeping" size={88} />
          <p className="inbox-off-title">No inbox to show yet</p>
          <p className="field-hint">{error}</p>
          <div className="set-row-actions">
            <button
              className="btn btn-primary btn-small"
              disabled={starting}
              data-working={starting || undefined}
              onClick={() => void startCatcher()}
            >
              {starting ? "Starting the mail catcher…" : "Start the mail catcher"}
            </button>
          </div>
          <p className="field-hint">Not installed? Add it on the Versions page, under Extra services.</p>
        </div>
      ) : (
        <div className="inbox-body">
          <ul className="inbox-list" aria-label="Emails">
            {inbox && inbox.messages.length === 0 && (
              <li className="inbox-empty">
                No emails yet. When your app sends one (a password reset, an order confirmation), it lands here instead
                of reaching a real person.
              </li>
            )}
            {inbox?.messages.map((m) => (
              <li key={m.id}>
                <button
                  className={`inbox-item${m.read ? "" : " unread"}${open?.id === m.id ? " current" : ""}`}
                  aria-current={open?.id === m.id ? "true" : undefined}
                  onClick={() => void show(m.id)}
                >
                  <span className="inbox-item-top">
                    <span className="inbox-from">{m.from || "(no sender)"}</span>
                    <span className="inbox-when">{when(m.created)}</span>
                  </span>
                  <span className="inbox-subject">
                    {!m.read && <span className="visually-hidden">New: </span>}
                    {m.subject || "(no subject)"}
                    {m.attachments > 0 && <Paperclip size={12} aria-label="has attachments" />}
                  </span>
                  <span className="inbox-snippet">{m.snippet}</span>
                </button>
              </li>
            ))}
          </ul>

          <section className="inbox-view" aria-label="Email">
            {open ? (
              <>
                <div className="inbox-view-head">
                  <h3>{open.subject || "(no subject)"}</h3>
                  <dl>
                    <dt>From</dt>
                    <dd>{open.from}</dd>
                    <dt>To</dt>
                    <dd>{open.to.join(", ")}</dd>
                    {open.cc.length > 0 && (
                      <>
                        <dt>Cc</dt>
                        <dd>{open.cc.join(", ")}</dd>
                      </>
                    )}
                    <dt>Sent</dt>
                    <dd>{new Date(open.date).toLocaleString()}</dd>
                    {open.attachments.length > 0 && (
                      <>
                        <dt>Files</dt>
                        <dd>{open.attachments.join(", ")}</dd>
                      </>
                    )}
                  </dl>
                  <div className="inbox-view-tools">
                    <div className="log-tabs" role="tablist" aria-label="Show as">
                      <button
                        role="tab"
                        className="log-tab"
                        aria-selected={view === "email"}
                        onClick={() => setView("email")}
                      >
                        Email
                      </button>
                      <button
                        role="tab"
                        className="log-tab"
                        aria-selected={view === "text"}
                        onClick={() => setView("text")}
                      >
                        Plain text
                      </button>
                    </div>
                    <button className="btn btn-small" disabled={busy} onClick={() => void remove([open.id])}>
                      <Trash2 size={13} aria-hidden="true" /> Delete
                    </button>
                  </div>
                </div>
                {view === "email" && open.html ? (
                  // No scripts, no forms, no navigation: just the email as it looks.
                  <iframe className="inbox-frame" title={`Email: ${open.subject}`} sandbox="" srcDoc={open.html} />
                ) : (
                  <pre className="inbox-text">{open.text || "This email has no plain-text version."}</pre>
                )}
              </>
            ) : (
              <p className="inbox-pick">{inbox?.messages.length ? "Pick an email to read it." : ""}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );

  if (page)
    return (
      <main className="panel inbox-page" aria-labelledby="inbox-title" data-guide="mail-page">
        {box}
      </main>
    );
  return (
    <div className="inbox-overlay" role="dialog" aria-modal="true" aria-labelledby="inbox-title" data-guide="inbox">
      {box}
    </div>
  );
}
