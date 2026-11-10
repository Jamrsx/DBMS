import { useCallback, useEffect, useRef, useState } from "react";
import { usePractice } from "./lib/practice";
import {
  Database,
  FolderKanban,
  Layers,
  LayoutDashboard,
  Activity,
  Mail,
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
import { Dashboard, openInbox } from "./dashboard/Dashboard";
import { Database as DatabasePage } from "./database/Database";
import { Projects } from "./projects/Projects";
import { TerminalPage } from "./terminal/TerminalPage";
import { isNewTerminalKey } from "./terminal/TerminalView";
import { AccountButton } from "./components/AccountButton";
import { SettingsPage } from "./settings/SettingsPage";
import { VersionsPage } from "./versions/VersionsPage";
import { HealthPage } from "./health/HealthPage";
import { Tour } from "./components/Tour";
import { WhatsNewOffer } from "./components/WhatsNewOffer";
import { HelpPage } from "./help/HelpPage";
import { InboxPanel } from "./dashboard/InboxPanel";
import { PerformancePage } from "./performance/PerformancePage";
import { mailList } from "./lib/mail";

type Page =
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

const NAV: { id: Page; label: string; Icon: typeof Settings }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "projects", label: "Projects", Icon: FolderKanban },
  { id: "database", label: "Database", Icon: Database },
  { id: "terminal", label: "Terminal", Icon: SquareTerminal },
  { id: "mail", label: "Mail", Icon: Mail },
  { id: "versions", label: "Versions", Icon: Layers },
];

const RAIL_KEY = "nexdb.rail";
const PAGE_KEY = "nexdb.page";
const PAGES: Page[] = [
  "dashboard",
  "projects",
  "database",
  "terminal",
  "mail",
  "versions",
  "health",
  "performance",
  "settings",
  "help",
];
/** Each page's shortcut follows its place in the sidebar: Ctrl+1 to Ctrl+9, then Ctrl+0. */
const keyNo = (p: Page) => (PAGES.indexOf(p) + 1) % 10;
const keys = (p: Page) => `Control+${keyNo(p)}`;
const keyHint = (p: Page) => `Ctrl+${keyNo(p)}`;

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
/** `holdTour`: the welcome screen is up, so the first-run tour waits for it. */
export function Shell({ holdTour = false }: { holdTour?: boolean }) {
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

  // Ctrl+1 … Ctrl+9 open the sidebar's pages in order.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      if (!/^[0-9]$/.test(e.key)) return;
      // 1 is the first page; 0 is the tenth.
      const i = e.key === "0" ? 9 : Number(e.key) - 1;
      if (i < PAGES.length) {
        e.preventDefault();
        go(PAGES[i]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Ctrl+` from any other page: open the Terminal with a new tab (the Terminal page handles it itself).
  useEffect(() => {
    if (page === "terminal") return;
    const onKey = (e: KeyboardEvent) => {
      if (!isNewTerminalKey(e)) return;
      e.preventDefault();
      go("terminal");
      window.dispatchEvent(new Event("nexdb:new-terminal"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, page]);
  // A project to open on the Projects page (from Check my setup); n makes each request new.
  const [openProject, setOpenProject] = useState<{ name: string; n: number } | null>(null);
  // A database to show on the Database page (from the Ctrl+K palette).
  const [openDatabase, setOpenDatabase] = useState<{ name: string; n: number } | null>(null);
  const [collapsed, setCollapsed] = useState(savedCollapsed);
  const updates = useUpdates();
  // Practice mode reloads every page (except the terminal, which keeps its sessions) on sample data.
  const practice = usePractice();
  const mode = practice ? "practice" : "real";
  // The practice strip sits above the app, so it never covers a page, a dialog or Nex.
  useEffect(() => {
    document.body.classList.toggle("practicing", practice);
    // The window itself never scrolls; put it back if anything nudged it.
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    // A sample project or database Nex opened in practice isn't one to open for real.
    setOpenProject(null);
    setOpenDatabase(null);
  }, [practice]);
  // Nex's walkthroughs open a project or database for you.
  useEffect(() => {
    const project = (e: Event) => {
      setOpenProject((r) => ({ name: (e as CustomEvent<string>).detail, n: (r?.n ?? 0) + 1 }));
      setPage("projects");
    };
    const database = (e: Event) => {
      setOpenDatabase((r) => ({ name: (e as CustomEvent<string>).detail, n: (r?.n ?? 0) + 1 }));
      setPage("database");
    };
    window.addEventListener("nexdb:open-project", project);
    window.addEventListener("nexdb:open-database", database);
    return () => {
      window.removeEventListener("nexdb:open-project", project);
      window.removeEventListener("nexdb:open-database", database);
    };
  }, []);
  const updateReady = updates.state.kind === "available" && !practice;

  useEffect(startUpdateChecks, []);

  // New caught emails, counted on Mail in the sidebar (nothing shows while the catcher is off).
  const [newMail, setNewMail] = useState(0);
  useEffect(() => {
    let alive = true;
    const check = () =>
      mailList()
        .then((i) => alive && setNewMail(i.unread))
        .catch(() => alive && setNewMail(0));
    check();
    const t = window.setInterval(() => document.visibilityState === "visible" && check(), 10000);
    const fresh = (e: Event) => setNewMail((e as CustomEvent<number>).detail);
    window.addEventListener("nexdb:mail-count", fresh);
    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener("nexdb:mail-count", fresh);
    };
  }, [mode, page]);
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
              aria-keyshortcuts={keys(id)}
              title={collapsed ? `${label} (${keyHint(id)})` : keyHint(id)}
              onClick={() => go(id)}
            >
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
              <span className="nav-label">{label}</span>
              {id === "mail" && newMail > 0 && (
                <span className="nav-count" data-guide="mail-count">
                  {newMail > 99 ? "99+" : newMail}
                  <span className="visually-hidden"> new {newMail === 1 ? "email" : "emails"}</span>
                </span>
              )}
            </button>
          ))}
          <span className="nav-section">App</span>
          <button
            type="button"
            className={page === "health" ? "nav-item current" : "nav-item"}
            aria-current={page === "health" ? "page" : undefined}
            data-page="health"
            aria-keyshortcuts={keys("health")}
            title={collapsed ? `Check my setup (${keyHint("health")})` : keyHint("health")}
            onClick={() => go("health")}
          >
            <Stethoscope size={16} strokeWidth={2} aria-hidden="true" />
            <span className="nav-label">Check my setup</span>
          </button>
          <button
            type="button"
            className={page === "performance" ? "nav-item current" : "nav-item"}
            aria-current={page === "performance" ? "page" : undefined}
            data-page="performance"
            aria-keyshortcuts={keys("performance")}
            title={collapsed ? `Performance (${keyHint("performance")})` : keyHint("performance")}
            onClick={() => go("performance")}
          >
            <Activity size={16} strokeWidth={2} aria-hidden="true" />
            <span className="nav-label">Performance</span>
          </button>
          <button
            type="button"
            className={page === "settings" ? "nav-item current" : "nav-item"}
            aria-current={page === "settings" ? "page" : undefined}
            data-page="settings"
            aria-keyshortcuts={keys("settings")}
            title={collapsed ? `Settings (${keyHint("settings")})` : keyHint("settings")}
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
            aria-keyshortcuts={keys("help")}
            title={collapsed ? `Help (${keyHint("help")})` : keyHint("help")}
            onClick={() => go("help")}
          >
            <CircleHelp size={16} strokeWidth={2} aria-hidden="true" />
            <span className="nav-label">Help</span>
          </button>
        </nav>

        <div className="rail-foot">
          <TasksButton />
          <UpdateNotice />
          <AccountButton
            onOpenLicense={() => {
              go("settings");
              window.dispatchEvent(new CustomEvent("nexdb:settings-section", { detail: "license" }));
            }}
          />
          <ThemeToggle />
        </div>
      </aside>

      <div className="page" key={`dashboard-${mode}`} hidden={page !== "dashboard"}>
        <Dashboard active={page === "dashboard"} onOpenVersions={() => setPage("versions")} />
      </div>
      <div className="page" key={`projects-${mode}`} hidden={page !== "projects"}>
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
      <div className="page" key={`health-${mode}`} hidden={page !== "health"}>
        <HealthPage
          active={page === "health"}
          onNavigate={go}
          onOpenProject={(name) => {
            setOpenProject((r) => ({ name, n: (r?.n ?? 0) + 1 }));
            setPage("projects");
          }}
        />
      </div>
      <div className="page" key={`database-${mode}`} hidden={page !== "database"}>
        <DatabasePage active={page === "database"} openRequest={openDatabase} />
      </div>
      <div className="page" key={`versions-${mode}`} hidden={page !== "versions"}>
        <VersionsPage active={page === "versions"} />
      </div>
      <div className="page" key={`settings-${mode}`} hidden={page !== "settings"}>
        <SettingsPage active={page === "settings"} />
      </div>
      <div className="page" key={`help-${mode}`} hidden={page !== "help"}>
        <HelpPage />
      </div>
      <div className="page" key={`mail-${mode}`} hidden={page !== "mail"}>
        <InboxPanel page active={page === "mail"} onOpenInBrowser={openInbox} />
      </div>
      <div className="page" key={`performance-${mode}`} hidden={page !== "performance"}>
        <PerformancePage active={page === "performance"} />
      </div>
      <div className="page" hidden={page !== "terminal"}>
        <TerminalPage active={page === "terminal"} />
      </div>
      {practice && (
        <div className="practice-banner" role="status">
          <span>
            <strong>Practice mode.</strong> Nex is using sample projects and databases. Nothing here changes your PC.
          </span>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => window.dispatchEvent(new Event("nexdb:guide-stop"))}
          >
            Leave practice
          </button>
        </div>
      )}
      <NexCorner />
      <Tour onPage={setPage} hold={holdTour} />
      <WhatsNewOffer />
    </div>
  );
}
