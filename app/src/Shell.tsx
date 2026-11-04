import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database,
  FolderKanban,
  Layers,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Search,
  SquareTerminal,
  Stethoscope,
  CircleHelp,
} from "lucide-react";
import { CommandPalette } from "./components/CommandPalette";
import { BrandMark } from "./components/BrandMark";
import { ThemeToggle } from "./components/ThemeToggle";
import { UpdateNotice } from "./components/UpdateNotice";
import { TasksButton } from "./components/TasksButton";
import { startUpdateChecks, useUpdates } from "./lib/updates";
import { NexCorner } from "./components/NexCorner";
import { nexGreet } from "./lib/nex";
import { Dashboard } from "./dashboard/Dashboard";
import { Database as DatabasePage } from "./database/Database";
import { Projects } from "./projects/Projects";
import { TerminalPage } from "./terminal/TerminalPage";
import { SettingsPage } from "./settings/SettingsPage";
import { VersionsPage } from "./versions/VersionsPage";
import { HealthPage } from "./health/HealthPage";
import { Tour } from "./components/Tour";
import { HelpPage } from "./help/HelpPage";

type Page = "dashboard" | "projects" | "database" | "terminal" | "versions" | "health" | "settings" | "help";

const NAV: { id: Page; label: string; Icon: typeof Settings }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "projects", label: "Projects", Icon: FolderKanban },
  { id: "database", label: "Database", Icon: Database },
  { id: "terminal", label: "Terminal", Icon: SquareTerminal },
  { id: "versions", label: "Versions", Icon: Layers },
];

const RAIL_KEY = "nexdb.rail";
const PAGE_KEY = "nexdb.page";
const PAGES: Page[] = ["dashboard", "projects", "database", "terminal", "versions", "health", "settings", "help"];

/** The page open when NexDB last closed, so it opens where the user left off. */
function savedPage(): Page {
  try {
    const p = localStorage.getItem(PAGE_KEY) as Page | null;
    return p && PAGES.includes(p) ? p : "dashboard";
  } catch {
    return "dashboard";
  }
}

function savedCollapsed(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/** The rail plus the open page. Pages stay mounted so the terminal keeps its session. */
export function Shell() {
  const [page, setPage] = useState<Page>(savedPage);
  useEffect(() => {
    try {
      localStorage.setItem(PAGE_KEY, page);
    } catch {
      // Opens on the dashboard next time instead.
    }
  }, [page]);

  // Moving to a page puts keyboard focus on its title, so screen readers say where you are.
  const moved = useRef(false);
  const go = useCallback((p: Page) => {
    moved.current = true;
    setPage(p);
  }, []);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    // The terminal takes the keyboard itself, so typing works straight away.
    if (page === "terminal") return;
    const title = document.querySelector<HTMLElement>(".page:not([hidden]) h1");
    if (title && !title.closest(".rail")) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  }, [page]);

  // Ctrl+1 … Ctrl+8 open the sidebar's pages in order.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= PAGES.length) {
        e.preventDefault();
        go(PAGES[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
  // A project to open on the Projects page (from Check my setup); n makes each request new.
  const [openProject, setOpenProject] = useState<{ name: string; n: number } | null>(null);
  // A database to show on the Database page (from the Ctrl+K palette).
  const [openDatabase, setOpenDatabase] = useState<{ name: string; n: number } | null>(null);
  const [collapsed, setCollapsed] = useState(savedCollapsed);
  const updates = useUpdates();
  const updateReady = updates.state.kind === "available";

  useEffect(startUpdateChecks, []);
  useEffect(nexGreet, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(RAIL_KEY, next ? "collapsed" : "open");
    } catch {
      // The rail still works; it just won't be remembered.
    }
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div className={collapsed ? "shell rail-collapsed" : "shell"}>
      <a
        className="skip-link"
        href="#page"
        onClick={(e) => {
          e.preventDefault();
          const title = document.querySelector<HTMLElement>(".page:not([hidden]) h1");
          if (title) {
            title.tabIndex = -1;
            title.focus();
          }
        }}
      >
        Skip to page content
      </a>
      <aside className="rail" data-guide="rail">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">NexDB</span>
          <button
            type="button"
            className="rail-toggle"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ToggleIcon size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className="nav-item nav-search"
          data-guide="search"
          title="Search pages, projects, databases and actions (Ctrl+K)"
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
        >
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <span className="nav-label">Search</span>
          <kbd className="nav-label">Ctrl K</kbd>
        </button>

        <nav className="nav" aria-label="Main">
          <span className="nav-section">Workspace</span>
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={page === id ? "nav-item current" : "nav-item"}
              aria-current={page === id ? "page" : undefined}
              data-page={id}
              aria-keyshortcuts={`Control+${PAGES.indexOf(id) + 1}`}
              title={collapsed ? `${label} (Ctrl+${PAGES.indexOf(id) + 1})` : `Ctrl+${PAGES.indexOf(id) + 1}`}
              onClick={() => go(id)}
            >
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
              <span className="nav-label">{label}</span>
            </button>
          ))}
          <span className="nav-section">App</span>
          <button
            type="button"
            className={page === "health" ? "nav-item current" : "nav-item"}
            aria-current={page === "health" ? "page" : undefined}
            data-page="health"
            aria-keyshortcuts="Control+6"
            title={collapsed ? "Check my setup (Ctrl+6)" : "Ctrl+6"}
            onClick={() => go("health")}
          >
            <Stethoscope size={16} strokeWidth={2} aria-hidden="true" />
            <span className="nav-label">Check my setup</span>
          </button>
          <button
            type="button"
            className={page === "settings" ? "nav-item current" : "nav-item"}
            aria-current={page === "settings" ? "page" : undefined}
            data-page="settings"
            aria-keyshortcuts="Control+7"
            title={collapsed ? "Settings (Ctrl+7)" : "Ctrl+7"}
            onClick={() => go("settings")}
          >
            <Settings size={16} strokeWidth={2} aria-hidden="true" />
            <span className="nav-label">Settings</span>
            {updateReady && (
              <span className="nav-dot" title="A new NexDB is ready">
                <span className="visually-hidden">, a new NexDB is ready</span>
              </span>
            )}
          </button>
          <button
            type="button"
            className={page === "help" ? "nav-item current" : "nav-item"}
            aria-current={page === "help" ? "page" : undefined}
            data-page="help"
            aria-keyshortcuts="Control+8"
            title={collapsed ? "Help (Ctrl+8)" : "Ctrl+8"}
            onClick={() => go("help")}
          >
            <CircleHelp size={16} strokeWidth={2} aria-hidden="true" />
            <span className="nav-label">Help</span>
          </button>
        </nav>

        <div className="rail-foot">
          <TasksButton />
          <UpdateNotice />
          <ThemeToggle />
        </div>
      </aside>

      <div className="page" hidden={page !== "dashboard"}>
        <Dashboard onOpenVersions={() => setPage("versions")} />
      </div>
      <div className="page" hidden={page !== "projects"}>
        <Projects active={page === "projects"} onOpenTerminal={() => setPage("terminal")} openRequest={openProject} />
      </div>
      <CommandPalette
        onPage={go}
        onProject={(name) => {
          setOpenProject((r) => ({ name, n: (r?.n ?? 0) + 1 }));
          setPage("projects");
        }}
        onDatabase={(name) => {
          setOpenDatabase((r) => ({ name, n: (r?.n ?? 0) + 1 }));
          setPage("database");
        }}
      />
      <div className="page" hidden={page !== "health"}>
        <HealthPage
          active={page === "health"}
          onNavigate={go}
          onOpenProject={(name) => {
            setOpenProject((r) => ({ name, n: (r?.n ?? 0) + 1 }));
            setPage("projects");
          }}
        />
      </div>
      <div className="page" hidden={page !== "database"}>
        <DatabasePage active={page === "database"} openRequest={openDatabase} />
      </div>
      <div className="page" hidden={page !== "versions"}>
        <VersionsPage active={page === "versions"} />
      </div>
      <div className="page" hidden={page !== "settings"}>
        <SettingsPage active={page === "settings"} />
      </div>
      <div className="page" hidden={page !== "help"}>
        <HelpPage />
      </div>
      <div className="page" hidden={page !== "terminal"}>
        <TerminalPage active={page === "terminal"} />
      </div>
      <NexCorner />
      <Tour onPage={setPage} />
    </div>
  );
}
