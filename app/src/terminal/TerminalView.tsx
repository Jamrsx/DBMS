import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";
import {
  closeTerminal,
  onTerminalExit,
  onTerminalOutput,
  openTerminal,
  resizeTerminal,
  writeTerminal,
} from "../lib/terminal";

export type SessionState = "starting" | "open" | "closed";

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

/** Keys the tab strip handles, so PowerShell never sees them. */
export function isTabShortcut(e: KeyboardEvent) {
  return e.ctrlKey && !e.altKey && (e.key === "Tab" || (e.shiftKey && /^[tw]$/i.test(e.key)));
}

/** One PowerShell session in its own xterm. `restartToken` going up restarts it. */
export function TerminalView({
  active,
  restartToken,
  onState,
}: {
  active: boolean;
  restartToken: number;
  onState: (state: SessionState) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const session = useRef<number | null>(null);
  const [state, setStateRaw] = useState<SessionState>("starting");
  const [error, setError] = useState<string | null>(null);
  const report = useRef(onState);
  report.current = onState;

  const setState = useCallback((s: SessionState) => {
    setStateRaw(s);
    report.current(s);
  }, []);

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
  }, [setState]);

  useEffect(() => {
    if (!host.current) return;
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
    // Links like http://127.0.0.1:8000 from "php artisan serve" open in the browser on click.
    t.loadAddon(new WebLinksAddon((_event, uri) => void openUrl(uri).catch(() => {})));
    t.attachCustomKeyEventHandler((e) => {
      if (isTabShortcut(e)) return false;
      if (e.type !== "keydown" || !e.ctrlKey || e.altKey) return true;
      const key = e.key.toLowerCase();
      // Ctrl+C copies when text is selected; with nothing selected it stops the running command.
      if (key === "c" && (e.shiftKey || t.hasSelection())) {
        if (t.hasSelection()) void navigator.clipboard.writeText(t.getSelection()).catch(() => {});
        t.clearSelection();
        e.preventDefault();
        return false;
      }
      // Ctrl+V (and Ctrl+Shift+V) paste: let the browser fire its paste event, which xterm handles.
      if (key === "v") return false;
      return true;
    });
    term.current = t;
    fit.current = f;
    // Size it before the shell starts, so the first prompt is laid out at the real width.
    if (host.current.offsetParent !== null) f.fit();

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
  }, [refit, start, setState]);

  useEffect(() => {
    if (restartToken > 0) void start();
  }, [restartToken, start]);

  useEffect(() => {
    if (active) {
      refit();
      term.current?.focus();
    }
  }, [active, refit]);

  return (
    <div className="terminal-view" hidden={!active} role="tabpanel">
      {error && (
        <div className="error-box" role="alert">
          <p>{error}</p>
        </div>
      )}
      <div className="terminal-host" ref={host} />
      {state === "closed" && !error && <p className="terminal-note">The session ended.</p>}
    </div>
  );
}
