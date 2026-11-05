import { useEffect, useMemo, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { listServices, type ServiceStatus } from "../lib/services";
import {
  addSample,
  formatBytes,
  getPerformance,
  history,
  HISTORY,
  SAMPLE_MS,
  type Performance,
  type Sample,
} from "../lib/performance";
import { Nex } from "../components/Nex";

/**
 * How much of the PC NexDB's services use: right now, over the last few minutes, and which
 * service uses the most. It reads every two seconds while the page is open.
 */
export function PerformancePage({ active }: { active: boolean }) {
  const [now, setNow] = useState<Performance | null>(null);
  const [names, setNames] = useState<Record<string, ServiceStatus>>({});
  const [samples, setSamples] = useState<Sample[]>(() => [...history]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const read = async () => {
      try {
        const p = await getPerformance();
        if (!alive) return;
        addSample(p);
        setNow(p);
        setSamples([...history]);
        setError(null);
      } catch (e) {
        if (alive) setError(String(e));
      }
    };
    void read();
    listServices()
      .then((list) => alive && setNames(Object.fromEntries(list.map((s) => [s.id, s]))))
      .catch(() => {});
    const t = window.setInterval(() => document.visibilityState === "visible" && void read(), SAMPLE_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [active]);

  const totals = useMemo(() => {
    if (!now) return null;
    const memory = now.services.reduce((a, u) => a + u.memory_bytes, 0);
    const cpu = now.services.reduce((a, u) => a + u.cpu_percent, 0);
    const top = [...now.services].sort((a, b) => b.memory_bytes - a.memory_bytes)[0];
    return { memory, cpu, top };
  }, [now]);
  const nameOf = (id: string) => names[id]?.name ?? id;

  return (
    <main className="panel">
      <header className="panel-head dash-head">
        <div>
          <h1>Performance</h1>
          <p className="dash-summary" role="status">
            {!totals
              ? "Reading…"
              : now!.services.length === 0
                ? "No services are running, so NexDB uses almost nothing."
                : `NexDB's services use ${formatBytes(totals.memory)} of memory and ${totals.cpu.toFixed(1)}% of the CPU right now.`}
          </p>
        </div>
      </header>

      <div className="panel-body dash-body perf">
        {error && (
          <div className="error-box" role="alert">
            <p>{error}</p>
          </div>
        )}
        {now && totals && (
          <>
            <section className="perf-tiles" aria-label="Right now" data-guide="perf-tiles">
              <div className="perf-tile">
                <p className="perf-tile-k">NexDB's services</p>
                <p className="perf-tile-v">{formatBytes(totals.memory)}</p>
                <p className="perf-tile-sub">
                  {totals.cpu.toFixed(1)}% CPU · {now.services.length} running
                </p>
              </div>
              <div className="perf-tile">
                <p className="perf-tile-k">The whole PC</p>
                <p className="perf-tile-v">
                  {formatBytes(now.pc.memory_used)}
                  <span className="perf-tile-of"> of {formatBytes(now.pc.memory_total)}</span>
                </p>
                <p className="perf-tile-sub">{now.pc.cpu_percent.toFixed(1)}% CPU</p>
              </div>
              <div className="perf-tile">
                <p className="perf-tile-k">Uses the most</p>
                <p className="perf-tile-v">{totals.top ? nameOf(totals.top.id) : "Nothing running"}</p>
                <p className="perf-tile-sub">
                  {totals.top
                    ? `${formatBytes(totals.top.memory_bytes)} · ${totals.top.cpu_percent.toFixed(1)}% CPU`
                    : "Start services on the Dashboard"}
                </p>
              </div>
            </section>

            <section className="perf-charts" data-guide="perf-charts">
              <UsageChart
                title="CPU"
                samples={samples}
                max={100}
                format={(v) => `${v.toFixed(1)}%`}
                lines={[
                  { name: "NexDB's services", pick: (s) => s.nexCpu, tone: 1 },
                  { name: "Whole PC", pick: (s) => s.pcCpu, tone: 2 },
                ]}
              />
              <UsageChart
                title="Memory"
                samples={samples}
                max={now.pc.memory_total || 1}
                format={formatBytes}
                lines={[
                  { name: "NexDB's services", pick: (s) => s.nexMemory, tone: 1 },
                  { name: "Whole PC", pick: (s) => s.pcMemory, tone: 2 },
                ]}
              />
            </section>

            <section className="perf-list" aria-labelledby="perf-list-title" data-guide="perf-list">
              <h2 id="perf-list-title">Each service</h2>
              {now.services.length === 0 ? (
                <div className="perf-empty">
                  <Nex state="sleeping" size={64} />
                  <p className="field-hint">
                    Nothing is running. Start your services on the Dashboard to see them here.
                  </p>
                </div>
              ) : (
                <table className="perf-table">
                  <thead>
                    <tr>
                      <th scope="col">Service</th>
                      <th scope="col">Memory</th>
                      <th scope="col">CPU</th>
                      <th scope="col">Processes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...now.services]
                      .sort((a, b) => b.memory_bytes - a.memory_bytes)
                      .map((u) => (
                        <tr key={u.id}>
                          <th scope="row">{nameOf(u.id)}</th>
                          <td>
                            <span className="perf-bar" aria-hidden="true">
                              <span style={{ width: `${(u.memory_bytes / (totals.top?.memory_bytes || 1)) * 100}%` }} />
                            </span>
                            <code>{formatBytes(u.memory_bytes)}</code>
                          </td>
                          <td>
                            <code>{u.cpu_percent.toFixed(1)}%</code>
                          </td>
                          <td>
                            <code>{u.processes}</code>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

interface Line {
  name: string;
  pick: (s: Sample) => number;
  /** Series color slot: 1 for NexDB, 2 for the whole PC. */
  tone: 1 | 2;
}

const W = 600;
const H = 160;

/** The last few minutes as two lines on one scale, with a crosshair and the values on hover. */
function UsageChart({
  title,
  samples,
  max,
  format,
  lines,
}: {
  title: string;
  samples: Sample[];
  max: number;
  format: (v: number) => string;
  lines: Line[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Newest on the right; the x-axis always spans the full five minutes.
  const x = (i: number) => W - ((samples.length - 1 - i) / (HISTORY - 1)) * W;
  const y = (v: number) => H - Math.min(1, Math.max(0, v / max)) * H;
  const path = (l: Line) =>
    samples.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(l.pick(s)).toFixed(1)}`).join(" ");
  const last = samples[samples.length - 1];
  const shown = hover !== null ? samples[hover] : last;

  function onMove(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect();
    if (!r || samples.length === 0) return;
    const fx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(samples.length - 1 - ((W - fx) / W) * (HISTORY - 1));
    setHover(i >= 0 && i < samples.length ? i : null);
  }

  const ago = shown ? Math.round((Date.now() - shown.at) / 1000) : 0;
  return (
    <figure className="perf-chart">
      <figcaption className="perf-chart-head">
        <span className="perf-chart-title">{title}</span>
        <span className="perf-legend">
          {lines.map((l) => (
            <span key={l.name} className="perf-legend-item">
              <span className={`perf-swatch tone-${l.tone}`} aria-hidden="true" />
              {l.name} <code>{shown ? format(l.pick(shown)) : "–"}</code>
            </span>
          ))}
        </span>
      </figcaption>
      <div
        ref={box}
        className="perf-plot"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${title} over the last five minutes. ${lines
          .map((l) => `${l.name}: ${last ? format(l.pick(last)) : "no reading yet"}`)
          .join(". ")}.`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} className="perf-grid" x1="0" x2={W} y1={H * f} y2={H * f} />
          ))}
          {samples.length > 1 &&
            lines.map((l) => <path key={l.name} className={`perf-line tone-${l.tone}`} d={path(l)} />)}
          {hover !== null && <line className="perf-cross" x1={x(hover)} x2={x(hover)} y1="0" y2={H} />}
        </svg>
        <span className="perf-axis perf-axis-top">{format(max)}</span>
        <span className="perf-axis perf-axis-left">5 min ago</span>
        <span className="perf-axis perf-axis-right">now</span>
        {hover !== null && shown && (
          <span className="perf-tip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
            <strong>{ago < 2 ? "Now" : `${ago} s ago`}</strong>
            {lines.map((l) => (
              <span key={l.name}>
                <span className={`perf-swatch tone-${l.tone}`} aria-hidden="true" /> {l.name}:{" "}
                <code>{format(l.pick(shown))}</code>
              </span>
            ))}
          </span>
        )}
        {samples.length < 2 && (
          <span className="perf-wait">
            <Activity size={14} aria-hidden="true" /> Gathering readings…
          </span>
        )}
      </div>
    </figure>
  );
}
