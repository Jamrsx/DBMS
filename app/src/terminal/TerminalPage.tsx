import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { inDesktopApp } from "../lib/scan";
import {
  closeTerminal,
  onTerminalExit,
  onTerminalOutput,
  openTerminal,
  resizeTerminal,
  writeTerminal,
} from "../lib/terminal";

/** Colours come from the app's own tokens, so the terminal follows the light/dark theme. */
function themeFromTokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--surface", "#ffffff"),
    foreground: v("--text", "#1b1f27"),
    cursor: v("--accent", "#2563eb"),
    selectionBackground: v("--accent-soft", "#bfdbfe"),
  };
}

export function TerminalPage({ active }: { active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const session = useRef<number | null>(null);
  const [state, setState] = useState<"starting" | "open" | "closed">("starting");
  const [error, setError] = useState<string | null>(null);

  const refit = useCallback(() => {
    const t = term.current;
    const f = fit.current;
    if (!t || !f || !host.current || host.current.offsetParent === null) return;
    f.fit();
    if (session.current !== null) void resizeTerminal(session.current, t.cols, t.rows).catch(() => {});
  }, []);

  const start = useCallback(async () => {
    const t = term.current;
    if (!t) return;
    setError(null);
    setState("starting");
    try {
      if (session.current !== null) {
        const old = session.current;
        session.current = null;
        await closeTerminal(old);
      }
      t.clear();
      session.current = await openTerminal(t.cols, t.rows);
      setState("open");
      t.focus();
    } catch (e) {
      setError(String(e));
      setState("closed");
    }
  }, []);

  useEffect(() => {
    if (!inDesktopApp || !host.current) return;
    const t = new Terminal({
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme: themeFromTokens(),
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current);
    term.current = t;
    fit.current = f;

    const data = t.onData((d) => {
      if (session.current !== null) void writeTerminal(session.current, d).catch(() => {});
    });
    const unlisten = [
      onTerminalOutput((id, text) => {
        if (id === session.current) t.write(text);
      }),
      onTerminalExit((id) => {
        if (id === session.current) {
          session.current = null;
          setState("closed");
        }
      }),
    ];

    const retheme = () => {
      t.options.theme = themeFromTokens();
    };
    const mo = new MutationObserver(retheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", retheme);
    const ro = new ResizeObserver(refit);
    ro.observe(host.current);

    void start();

    return () => {
      ro.disconnect();
      mo.disconnect();
      mq.removeEventListener("change", retheme);
      data.dispose();
      unlisten.forEach((u) => void u.then((fn) => fn()));
      if (session.current !== null) void closeTerminal(session.current);
      t.dispose();
    };
  }, [refit, start]);

  useEffect(() => {
    if (active) {
      refit();
      term.current?.focus();
    }
  }, [active, refit]);

  return (
    <main className="panel">
      <header className="panel-head dash-head">
        <div>
          <h1>Terminal</h1>
          <p className="dash-summary">
            PowerShell in your projects folder, with NexDB's PHP, Composer, Node and MySQL ready to use.
          </p>
        </div>
        <div className="dash-actions">
          <button className="btn" onClick={start} disabled={state === "starting" || !inDesktopApp}>
            {state === "closed" ? "Start a new session" : "Restart"}
          </button>
        </div>
      </header>
      <div className="panel-body terminal-body">
        {!inDesktopApp ? (
          <p className="notice" role="note">
            The terminal is only available in the desktop app.
          </p>
        ) : (
          <>
            {error && (
              <div className="error-box" role="alert">
                <p>{error}</p>
              </div>
            )}
            <div className="terminal-host" ref={host} />
            {state === "closed" && !error && <p className="terminal-note">The session ended.</p>}
          </>
        )}
      </div>
    </main>
  );
}
