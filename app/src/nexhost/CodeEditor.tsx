import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileCode, Save } from "lucide-react";
import { readFile, writeFile } from "../lib/nexhost";

/**
 * A site file as editable text, like a hosting panel's editor: line numbers, Ctrl+S saves, Tab
 * indents. It warns before leaving with unsaved changes, and never saves over a newer version.
 */
export function CodeEditor({ site, rel, onClose }: { site: string; rel: string; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [stamp, setStamp] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    readFile(site, rel)
      .then((f) => {
        if (!live) return;
        setText(f.text);
        setSaved(f.text);
        setStamp(f.stamp);
        window.setTimeout(() => area.current?.focus(), 0);
      })
      .catch((e) => live && setMsg({ ok: false, text: String(e) }));
    return () => {
      live = false;
    };
  }, [site, rel]);

  const dirty = text !== null && text !== saved;
  const save = () => {
    if (text === null || saving) return;
    setSaving(true);
    writeFile(site, rel, text, stamp)
      .then((s) => {
        setStamp(s);
        setSaved(text);
        setMsg({ ok: true, text: `Saved ${rel}.` });
      })
      .catch((e) => setMsg({ ok: false, text: String(e) }))
      .finally(() => setSaving(false));
  };
  const close = () => {
    if (!dirty || window.confirm(`${rel} has changes that aren't saved. Close it and lose them?`)) onClose();
  };

  // Leaving the page (or closing the window) with unsaved work asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const lines = (text ?? "").split("\n").length;

  return (
    <section className="nh-editor" aria-label={`Editing ${rel}`} data-guide="nexhost-editor">
      <header className="nh-editor-head">
        <button className="btn btn-small btn-quiet" onClick={close}>
          <ArrowLeft size={14} aria-hidden="true" /> Files
        </button>
        <span className="nh-editor-name">
          <FileCode size={14} aria-hidden="true" /> <code>{rel}</code>
          {dirty && <span className="nh-editor-dirty"> · not saved</span>}
        </span>
        <span className="nh-editor-hint">Ctrl+S saves</span>
        <button className="btn btn-small btn-primary" disabled={!dirty || saving} onClick={save}>
          <Save size={14} aria-hidden="true" /> {saving ? "Saving…" : "Save"}
        </button>
      </header>
      {msg && (
        <p className={msg.ok ? "set-ok" : "field-error"} role="status">
          {msg.text}
        </p>
      )}
      {text === null ? (
        !msg && <p role="status">Opening {rel}…</p>
      ) : (
        <div className="nh-editor-body">
          <div className="nh-editor-gutter" ref={gutter} aria-hidden="true">
            {Array.from({ length: lines }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <textarea
            ref={area}
            className="nh-editor-text"
            value={text}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            aria-label={`Contents of ${rel}`}
            onChange={(e) => {
              setText(e.target.value);
              setMsg(null);
            }}
            onScroll={(e) => {
              if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                save();
              } else if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey) {
                // Tab indents instead of leaving the editor (Esc then Tab still moves on).
                e.preventDefault();
                const t = e.currentTarget;
                const [a, b] = [t.selectionStart, t.selectionEnd];
                const next = t.value.slice(0, a) + "    " + t.value.slice(b);
                setText(next);
                window.requestAnimationFrame(() => t.setSelectionRange(a + 4, a + 4));
              } else if (e.key === "Escape") {
                e.currentTarget.blur();
              }
            }}
          />
        </div>
      )}
    </section>
  );
}
