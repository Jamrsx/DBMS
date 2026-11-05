import { useEffect, useMemo, useRef, useState } from "react";
import { Database, ExternalLink, FolderKanban, Play, Search, Square } from "lucide-react";
import { listProjects, openProject } from "../lib/projects";
import { listServices, startServices, stopServices, type ServiceStatus } from "../lib/services";
import { dbDatabases } from "../lib/db";

export type PalettePage =
  | "dashboard"
  | "projects"
  | "database"
  | "terminal"
  | "mail"
  | "versions"
  | "health"
  | "performance"
  | "settings"
  | "help";

interface Command {
  id: string;
  label: string;
  /** Where it belongs, shown on the right ("Project", "Service"). */
  group: string;
  icon: typeof Search;
  run: () => void | Promise<void>;
}

const PAGES: [PalettePage, string][] = [
  ["dashboard", "Dashboard"],
  ["projects", "Projects"],
  ["database", "Database"],
  ["terminal", "Terminal"],
  ["mail", "Mail (caught emails)"],
  ["versions", "Versions"],
  ["health", "Check my setup"],
  ["performance", "Performance (memory and CPU)"],
  ["settings", "Settings"],
  ["help", "Help and tutorial"],
];

/** Words of the query in any order, each anywhere in the label ("apa sta" finds "Start Apache"). */
export function matches(label: string, query: string): boolean {
  const text = label.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => text.includes(w));
}

/**
 * Ctrl+K: type to jump to any page, project or database, or to start and stop services,
 * without hunting through pages (HCI: flexibility and efficiency). Arrow keys pick, Enter runs,
 * Escape closes.
 */
export function CommandPalette({
  onPage,
  onProject,
  onDatabase,
}: {
  onPage: (page: PalettePage) => void;
  onProject: (name: string) => void;
  onDatabase: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const [projects, setProjects] = useState<string[]>([]);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [databases, setDatabases] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  // Fresh names each time it opens; anything that can't be read is simply left out.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setAt(0);
    setStatus(null);
    input.current?.focus();
    listProjects()
      .then((i) => setProjects(i.projects.map((p) => p.name)))
      .catch(() => setProjects([]));
    listServices()
      .then(setServices)
      .catch(() => setServices([]));
    dbDatabases()
      .then((d) => setDatabases(d.filter((x) => !x.system).map((x) => x.name)))
      .catch(() => setDatabases([]));
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = PAGES.map(([id, label]) => ({
      id: `page:${id}`,
      label: `Go to ${label}`,
      group: "Page",
      icon: Search,
      run: () => onPage(id),
    }));
    const managed = services.filter((s) => s.state !== "external");
    if (managed.length > 0) {
      out.push(
        { id: "svc:start-all", label: "Start all services", group: "Service", icon: Play, run: () => startServices() },
        { id: "svc:stop-all", label: "Stop all services", group: "Service", icon: Square, run: () => stopServices() },
      );
    }
    for (const s of managed) {
      const up = s.state === "running" || s.state === "starting";
      out.push({
        id: `svc:${s.id}`,
        label: `${up ? "Stop" : "Start"} ${s.name}`,
        group: "Service",
        icon: up ? Square : Play,
        run: () => (up ? stopServices(s.id) : startServices(s.id)),
      });
    }
    for (const p of projects) {
      out.push(
        { id: `open:${p}`, label: `Open ${p}`, group: "Project", icon: FolderKanban, run: () => onProject(p) },
        {
          id: `site:${p}`,
          label: `Open ${p}'s site`,
          group: "Project",
          icon: ExternalLink,
          run: () => openProject(p, "url").catch(() => openProject(p, "local")),
        },
      );
    }
    for (const d of databases) {
      out.push({ id: `db:${d}`, label: `Database ${d}`, group: "Database", icon: Database, run: () => onDatabase(d) });
    }
    return out;
  }, [services, projects, databases, onPage, onProject, onDatabase]);

  const shown = commands.filter((c) => matches(c.label, query)).slice(0, 12);

  async function run(c: Command | undefined) {
    if (!c) return;
    setStatus(`${c.label}…`);
    try {
      await c.run();
      setOpen(false);
    } catch (e) {
      setStatus(String(e));
    }
  }

  if (!open) return null;
  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Go to or do"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="palette-input">
          <Search size={16} aria-hidden="true" />
          <input
            ref={input}
            value={query}
            placeholder="Type a page, project, database or action…"
            aria-label="Search"
            aria-controls="palette-list"
            aria-activedescendant={shown[at] ? `palette-${at}` : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              setAt(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setAt((i) => Math.min(i + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setAt((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                void run(shown[at]);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" id="palette-list" role="listbox">
          {shown.map((c, i) => (
            <li
              key={c.id}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === at}
              className={i === at ? "palette-item current" : "palette-item"}
              onMouseEnter={() => setAt(i)}
              onClick={() => void run(c)}
            >
              <c.icon size={15} aria-hidden="true" />
              <span>{c.label}</span>
              <span className="palette-group">{c.group}</span>
            </li>
          ))}
          {shown.length === 0 && <li className="palette-empty">Nothing matches "{query}".</li>}
        </ul>
        <p className="palette-foot" role="status">
          {status ?? "↑ ↓ to pick · Enter to run · Ctrl+K to open or close"}
        </p>
      </div>
    </div>
  );
}
