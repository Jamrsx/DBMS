// Turns Apache, MySQL and PHP log lines into short sentences people can read.
// Lines that only matter to experts are counted and hidden; the raw log stays one click away.

export type LogLevel = "info" | "ok" | "warn" | "error";

export interface LogEntry {
  /** Local time, like "08:39:23", when the line had one. */
  time: string | null;
  level: LogLevel;
  text: string;
  /** The original line, shown on hover. */
  raw: string;
}

export interface ReadableLog {
  entries: LogEntry[];
  /** Technical lines left out of the readable view. */
  hidden: number;
}

type Rule = { level: LogLevel; text: string | ((m: string) => string) } | "hide";

// Apache messages are identified by their AH codes.
const APACHE: Record<string, Rule> = {
  AH00098: { level: "warn", text: "Apache wasn't stopped cleanly last time. It recovered on its own; nothing to do." },
  AH00455: { level: "info", text: (m) => `Apache ${m.match(/Apache\/([\d.]+)/)?.[1] ?? ""} is set up and loading.`.replace("  ", " ") },
  AH00456: "hide",
  AH00094: "hide",
  AH00418: "hide",
  AH00354: { level: "ok", text: "Apache is running and answering requests." },
  AH00422: { level: "info", text: "Apache was asked to stop." },
  AH00364: "hide",
  AH00430: { level: "ok", text: "Apache stopped cleanly." },
  AH00558: "hide",
  AH00072: {
    level: "error",
    text: (m) => `Apache couldn't use port ${m.match(/:(\d+)\s*$/)?.[1] ?? m.match(/:(\d+)/)?.[1] ?? ""}, because another program is already using it.`,
  },
  AH00451: { level: "error", text: "Apache had no free port to listen on, so it stopped." },
  AH00015: { level: "error", text: "Apache couldn't open its log files." },
  AH00526: { level: "error", text: "Apache's settings file has a mistake, so it can't start." },
};

// MySQL messages are identified by their MY- codes.
const MYSQL: Record<string, Rule> = {
  "MY-015015": { level: "info", text: "MySQL is starting." },
  "MY-010116": "hide",
  "MY-015150": "hide",
  "MY-015603": "hide",
  "MY-013576": { level: "info", text: "Loading your databases…" },
  "MY-013577": "hide",
  "MY-010229": "hide",
  "MY-010232": { level: "info", text: "Checked for unfinished work from last time. Everything is in order." },
  "MY-010068": "hide",
  "MY-013602": "hide",
  "MY-011323": "hide",
  "MY-010931": { level: "ok", text: (m) => `MySQL is ready. Apps can connect on port ${m.match(/port:\s*(\d+)/)?.[1] ?? "3306"}.` },
  "MY-013172": { level: "info", text: "MySQL was asked to stop." },
  "MY-010910": { level: "ok", text: "MySQL stopped cleanly." },
  "MY-015016": "hide",
  "MY-010262": { level: "error", text: "MySQL couldn't use its port, because another program is already using it." },
  "MY-010119": { level: "error", text: "MySQL couldn't start. See the raw log for the exact reason." },
  "MY-010946": "hide",
  "MY-010101": "hide",
};

const PAD = (n: number) => String(n).padStart(2, "0");
const clock = (d: Date) => `${PAD(d.getHours())}:${PAD(d.getMinutes())}:${PAD(d.getSeconds())}`;

function apacheTime(stamp: string): string | null {
  // "Sat Oct 31 08:39:23.483192 2026"
  const m = stamp.match(/(\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : null;
}

function mysqlTime(stamp: string): string | null {
  const d = new Date(stamp);
  return Number.isNaN(d.getTime()) ? null : clock(d);
}

function apply(rule: Rule | undefined, message: string, time: string | null, raw: string, fallback: LogLevel): LogEntry | null {
  if (rule === "hide") return null;
  if (rule) {
    return { time, level: rule.level, text: typeof rule.text === "function" ? rule.text(message) : rule.text, raw };
  }
  return { time, level: fallback, text: tidy(message), raw };
}

/** Removes codes and file paths that mean nothing to most people. */
function tidy(message: string): string {
  return message
    .replace(/^AH\d{5}:\s*/, "")
    .replace(/\(OS \d+\)\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}


export function readable(text: string): ReadableLog {
  const entries: LogEntry[] = [];
  let hidden = 0;
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    // File headers added by NexDB, e.g. "== apache_error.log ==".
    if (/^== .+ ==$/.test(line)) continue;

    // NexDB's own start marker, e.g. "--- Apache starting ---".
    if (/^--- .+ starting ---$/.test(line)) {
      hidden++;
      continue;
    }

    if (line === "No log output yet.") continue;

    // Apache: [time] [module:level] [pid ...] AHxxxxx: message
    const ap = line.match(/^\[([^\]]+)\] \[([\w-]+):(\w+)\](?: \[pid [^\]]+\])?(?: \[client [^\]]+\])? (.*)$/);
    if (ap) {
      let message = ap[4];
      // Apache wraps long messages onto the next physical line.
      while (i + 1 < lines.length && lines[i + 1] && !/^[[=-]/.test(lines[i + 1].trim())) {
        message += " " + lines[++i].trim();
      }
      const code = message.match(/AH\d{5}/)?.[0];
      const lvl = ap[3];
      const fallback: LogLevel = /emerg|alert|crit|error/.test(lvl) ? "error" : lvl === "warn" ? "warn" : "info";
      const entry = apply(code ? APACHE[code] : undefined, message, apacheTime(ap[1]), raw, fallback);
      if (entry) entries.push(entry);
      else hidden++;
      continue;
    }

    // MySQL: 2026-10-31T00:39:20.720107Z 0 [System] [MY-015015] [Server] message
    const my = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+\d+\s+\[(\w+)\]\s+\[(MY-\d+)\]\s+\[\w+\]\s+(.*)$/);
    if (my) {
      let message = my[4];
      while (i + 1 < lines.length && lines[i + 1] && !/^(\d{4}-|==|---)/.test(lines[i + 1].trim())) {
        message += " " + lines[++i].trim();
      }
      const fallback: LogLevel = my[2] === "ERROR" ? "error" : my[2] === "Warning" ? "warn" : "info";
      const entry = apply(MYSQL[my[3]], message, mysqlTime(my[1]), raw, fallback);
      if (entry) entries.push(entry);
      else hidden++;
      continue;
    }

    // PHP: "PHP Warning:  something in C:\...\file.php on line 3"
    const php = line.match(/^(?:\[[^\]]+\]\s*)?PHP (Fatal error|Parse error|Warning|Notice|Deprecated):\s+(.*)$/);
    if (php) {
      const level: LogLevel = /error/i.test(php[1]) ? "error" : php[1] === "Warning" ? "warn" : "info";
      const where = php[2].match(/ in (.+?) on line (\d+)/);
      const what = php[2].replace(/ in .+? on line \d+.*$/, "");
      const file = where ? where[1].split(/[\\/]/).pop() : null;
      entries.push({
        time: null,
        level,
        text: file ? `PHP ${php[1].toLowerCase()} in ${file}, line ${where![2]}: ${what}` : `PHP ${php[1].toLowerCase()}: ${what}`,
        raw,
      });
      continue;
    }

    // Anything else: keep it, lightly cleaned.
    entries.push({ time: null, level: /error|failed|denied|cannot|can't/i.test(line) ? "error" : "info", text: tidy(line), raw });
  }

  return { entries, hidden };
}
