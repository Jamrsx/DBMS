import { useEffect, useRef, useState } from "react";
import { AppWindow, Plus, SquareTerminal, X } from "lucide-react";
import { openTerminalWindow } from "../lib/terminal";
import { inDesktopApp } from "../lib/scan";
import { isTabShortcut, TerminalView, type SessionState } from "./TerminalView";

interface Tab {
  key: number;
  name: string;
  /** Opens in this project's folder. */
  project?: string;
  state: SessionState;
  restart: number;
}

/** `standalone` is the page inside its own window, opened with "Open in new window". */
/** A terminal window opened for one project starts in its folder (`?project=name`). */
const startProject = new URLSearchParams(location.search).get("project") ?? undefined;

export function TerminalPage({ active, standalone = false }: { active: boolean; standalone?: boolean }) {
  const [popError, setPopError] = useState<string | null>(null);
  const count = useRef(1);
  const [tabs, setTabs] = useState<Tab[]>(() => [
    standalone && startProject
      ? { key: 1, name: startProject, project: startProject, state: "starting", restart: 0 }
      : { key: 1, name: "Terminal 1", state: "starting", restart: 0 },
  ]);
  const [current, setCurrent] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);

  const shown = tabs.find((t) => t.key === current) ?? tabs[0];
  const update = (key: number, change: Partial<Tab>) =>
    setTabs((all) => all.map((t) => (t.key === key ? { ...t, ...change } : t)));

  function add() {
    const key = ++count.current;
    setTabs((all) => [...all, { key, name: `Terminal ${key}`, state: "starting", restart: 0 }]);
    setCurrent(key);
  }

  function close(key: number) {
    const i = tabs.findIndex((t) => t.key === key);
    const rest = tabs.filter((t) => t.key !== key);
    setTabs(rest);
    if (key === current && rest.length) setCurrent(rest[Math.min(i, rest.length - 1)].key);
  }

  function rename(key: number, name: string) {
    const clean = name.trim();
    if (clean) update(key, { name: clean.slice(0, 40) });
    setEditing(null);
  }

  // Ctrl+Shift+T opens, Ctrl+Shift+W closes, Ctrl+Tab and Ctrl+Shift+Tab switch.
  const keys = useRef({ add, close, tabs, current });
  keys.current = { add, close, tabs, current };
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isTabShortcut(e)) return;
      e.preventDefault();
      const { add, close, tabs, current } = keys.current;
      if (e.key === "Tab") {
        if (tabs.length < 2) return;
        const i = tabs.findIndex((t) => t.key === current);
        setCurrent(tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length].key);
      } else if (e.key.toLowerCase() === "t") add();
      else if (tabs.length) close(current);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  return (
    <main className="panel">
      <header className="panel-head dash-head">
        <div>
          <h1>Terminal</h1>
          <p className="dash-summary">
            PowerShell in your projects folder, with NexDB's PHP, Composer, Node and MySQL ready to use.
          </p>
          {popError && (
            <p className="field-error" role="alert">
              {popError}
            </p>
          )}
        </div>
        {(shown || !standalone) && (
          <div className="dash-actions">
            {!standalone && inDesktopApp && (
              <button
                className="btn"
                title="Open a terminal in its own window that you can move and resize"
                onClick={() => openTerminalWindow().catch((e) => setPopError(String(e)))}
              >
                <AppWindow size={14} aria-hidden="true" /> Open in new window
              </button>
            )}
            {shown && (
              <button
                className="btn"
                onClick={() => update(shown.key, { restart: shown.restart + 1 })}
                disabled={shown.state === "starting" || !inDesktopApp}
              >
                {shown.state === "closed" ? "Start a new session" : "Restart"}
              </button>
            )}
          </div>
        )}
      </header>
      <div className="panel-body terminal-body">
        <div className="term-tabs">
          <div className="term-tablist" role="tablist" aria-label="Terminals">
            {tabs.map((t) => {
              const selected = t.key === shown?.key;
              return (
                <div key={t.key} className="term-tab" data-selected={selected || undefined}>
                  {editing === t.key ? (
                    <input
                      className="term-tab-input"
                      defaultValue={t.name}
                      aria-label="Terminal name"
                      maxLength={40}
                      autoFocus
                      spellCheck={false}
                      onFocus={(e) => e.currentTarget.select()}
                      onBlur={(e) => rename(t.key, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(t.key, e.currentTarget.value);
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                  ) : (
                    <button
                      role="tab"
                      aria-selected={selected}
                      className="term-tab-name"
                      title={`${t.name}. Double-click or press F2 to rename.`}
                      onClick={() => setCurrent(t.key)}
                      onDoubleClick={() => setEditing(t.key)}
                      onKeyDown={(e) => e.key === "F2" && setEditing(t.key)}
                      onAuxClick={(e) => e.button === 1 && close(t.key)}
                    >
                      <SquareTerminal size={14} aria-hidden="true" />
                      <span className={t.state === "closed" ? "term-tab-label ended" : "term-tab-label"}>{t.name}</span>
                    </button>
                  )}
                  <button
                    className="term-tab-close"
                    aria-label={`Close ${t.name}`}
                    title="Close (Ctrl+Shift+W)"
                    onClick={() => close(t.key)}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          <button className="term-tab-add" aria-label="New terminal" title="New terminal (Ctrl+Shift+T)" onClick={add}>
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>

        {tabs.length === 0 ? (
          <div className="terminal-empty">
            <p>No terminals are open.</p>
            <button className="btn btn-primary" onClick={add}>
              <Plus size={14} aria-hidden="true" /> New terminal
            </button>
          </div>
        ) : !inDesktopApp ? (
          <p className="notice" role="note">
            The terminal is only available in the desktop app.
          </p>
        ) : (
          tabs.map((t) => (
            <TerminalView
              key={t.key}
              active={active && t.key === shown?.key}
              restartToken={t.restart}
              project={t.project}
              onState={(state) => update(t.key, { state })}
            />
          ))
        )}
      </div>
    </main>
  );
}
