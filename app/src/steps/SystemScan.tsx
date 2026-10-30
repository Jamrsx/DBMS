import { useEffect, useRef, useState } from "react";
import { inDesktopApp, runSystemScan, type ComponentFinding, type ScanReport } from "../lib/scan";

/** Space a default stack (Apache, PHP, MySQL, Node, Composer) needs, with headroom. */
const REQUIRED_BYTES = 2 * 2 ** 30;

export type ScanState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; report: ScanReport; installRoot: string }
  | { status: "failed"; error: string };

/**
 * Owns the scan result for the whole wizard. Scans when `enabled` and there is no result
 * for the current install folder yet; `rescan` forces a fresh one.
 */
export function useSystemScan(installRoot: string, enabled: boolean) {
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const scannedFor = useRef<string | null>(null);

  useEffect(() => {
    const key = `${installRoot}#${attempt}`;
    if (!enabled || scannedFor.current === key) return;
    scannedFor.current = key;
    let cancelled = false;
    setState({ status: "running" });
    runSystemScan(installRoot)
      .then((report) => !cancelled && setState({ status: "done", report, installRoot }))
      .catch((err) => !cancelled && setState({ status: "failed", error: String(err) }));
    return () => {
      cancelled = true;
      // Let an interrupted scan run again next time.
      if (scannedFor.current === key) scannedFor.current = null;
    };
  }, [installRoot, attempt, enabled]);

  return { state, rescan: () => setAttempt((n) => n + 1) };
}

export function SystemScan({ state, onRescan }: { state: ScanState; onRescan: () => void }) {
  return (
    <>
      <p className="lede">
        A quick, read-only look at what's already on this PC. Nothing is changed.
      </p>

      {!inDesktopApp && (
        <p className="notice" role="note">
          Browser preview: showing sample results. The real scan runs in the desktop app.
        </p>
      )}

      {(state.status === "running" || state.status === "idle") && (
        <div className="scanning" role="status">
          <span className="spinner" aria-hidden="true" />
          Scanning runtimes, ports and system requirements…
        </div>
      )}

      {state.status === "failed" && (
        <div className="error-box" role="alert">
          <p>The scan couldn't finish: {state.error}</p>
          <button className="btn" onClick={onRescan}>
            Try again
          </button>
        </div>
      )}

      {state.status === "done" && <ScanResults report={state.report} onRescan={onRescan} />}
    </>
  );
}

function ScanResults({ report, onRescan }: { report: ScanReport; onRescan: () => void }) {
  const busyPorts = report.ports.filter((p) => p.in_use);
  const diskOk = report.disk ? report.disk.free_bytes >= REQUIRED_BYTES : null;

  return (
    <div className="results">
      <section aria-labelledby="runtimes-heading">
        <div className="section-head">
          <h2 id="runtimes-heading">Existing runtimes</h2>
          <button className="btn btn-quiet" onClick={onRescan}>
            Scan again
          </button>
        </div>
        <ul className="component-list">
          {report.components.map((c) => (
            <ComponentRow key={c.id} component={c} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="ports-heading">
        <h2 id="ports-heading">Ports</h2>
        <ul className="check-list">
          {report.ports.map((p) => (
            <li key={p.port} className="check">
              <span className={`dot ${p.in_use ? "dot-warn" : "dot-ok"}`} aria-hidden="true" />
              <span className="check-main">
                <strong>{p.port}</strong> <span className="muted">{p.purpose}</span>
              </span>
              <span className="check-status">
                {p.in_use ? `In use by ${p.process ?? "unknown program"} (PID ${p.pid})` : "Free"}
              </span>
            </li>
          ))}
        </ul>
        {busyPorts.length > 0 && (
          <p className="hint">
            Busy ports aren't a blocker: you can stop that program or pick another port later.
          </p>
        )}
      </section>

      <section aria-labelledby="system-heading">
        <h2 id="system-heading">System</h2>
        <ul className="check-list">
          <li className="check">
            <span className={`dot ${report.vc_runtime ? "dot-ok" : "dot-warn"}`} aria-hidden="true" />
            <span className="check-main">Visual C++ runtime</span>
            <span className="check-status">
              {report.vc_runtime
                ? `Installed (${report.vc_runtime})`
                : "Missing: will be installed (one admin prompt)"}
            </span>
          </li>
          <li className="check">
            <span
              className={`dot ${diskOk === false ? "dot-bad" : diskOk ? "dot-ok" : "dot-warn"}`}
              aria-hidden="true"
            />
            <span className="check-main">Disk space</span>
            <span className="check-status">
              {report.disk
                ? `${formatGB(report.disk.free_bytes)} free on ${report.disk.mount}` +
                  (diskOk === false ? `, need ${formatGB(REQUIRED_BYTES)}` : "")
                : "Couldn't read the drive for this folder"}
            </span>
          </li>
        </ul>
      </section>

      <p className="muted small">Scan took {(report.duration_ms / 1000).toFixed(1)} s.</p>
    </div>
  );
}

function ComponentRow({ component }: { component: ComponentFinding }) {
  const count = component.installs.length;
  return (
    <li className="component">
      <div className="component-head">
        <span className="component-name">{component.name}</span>
        <span className={`pill ${count ? "pill-found" : "pill-none"}`}>
          {count === 0 ? "Not installed" : count === 1 ? "1 found" : `${count} found`}
        </span>
      </div>
      {count > 0 && (
        <ul className="install-list">
          {component.installs.map((i) => (
            <li key={i.path} className="install">
              <span className="install-version">
                {i.version ?? "unknown version"}
                {i.version_from_folder && (
                  <span className="muted" title="Read from the folder name">
                    {" "}
                    (est.)
                  </span>
                )}
              </span>
              <span className="install-meta">
                {i.source}
                {i.on_path && " · on PATH"}
                {i.note && ` · ${i.note}`}
              </span>
              <code className="install-path" title={i.path}>
                {i.path}
              </code>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function formatGB(bytes: number) {
  return `${(bytes / 2 ** 30).toFixed(1)} GB`;
}
