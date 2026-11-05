import { invoke } from "./invoke";
import { inDesktopApp } from "./scan";
import { serviceUsage, type ServiceUsage } from "./services";
import { onPractice } from "./practice";

export interface PcUsage {
  /** All cores, 0–100. */
  cpu_percent: number;
  memory_used: number;
  memory_total: number;
}

export interface Performance {
  services: ServiceUsage[];
  pc: PcUsage;
}

/** One reading: each running service and the whole PC. */
export async function getPerformance(): Promise<Performance> {
  if (inDesktopApp) return invoke<Performance>("performance");
  // The browser preview and practice: numbers that move a little, like real ones.
  const services = await serviceUsage();
  const t = Date.now() / 1000;
  const total = 16 * 1024 ** 3;
  return {
    services,
    pc: {
      cpu_percent: Math.max(2, 14 + Math.sin(t / 9) * 7 + Math.random() * 4),
      memory_used: total * (0.52 + Math.sin(t / 30) * 0.03),
      memory_total: total,
    },
  };
}

/** A point on the history graphs. */
export interface Sample {
  at: number;
  nexCpu: number;
  pcCpu: number;
  nexMemory: number;
  pcMemory: number;
}

/** About five minutes, one reading every two seconds. */
export const SAMPLE_MS = 2000;
export const HISTORY = 150;

/**
 * Readings kept while NexDB runs, so the graphs still have their history when you come back
 * to the page. It reads only while the page is open.
 */
export const history: Sample[] = [];
// Practice readings are sample numbers: they don't mix with the real history.
onPractice(() => history.splice(0));

export function addSample(p: Performance): Sample {
  const s: Sample = {
    at: Date.now(),
    nexCpu: p.services.reduce((a, u) => a + u.cpu_percent, 0),
    pcCpu: p.pc.cpu_percent,
    nexMemory: p.services.reduce((a, u) => a + u.memory_bytes, 0),
    pcMemory: p.pc.memory_used,
  };
  history.push(s);
  if (history.length > HISTORY) history.splice(0, history.length - HISTORY);
  return s;
}

export function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}
