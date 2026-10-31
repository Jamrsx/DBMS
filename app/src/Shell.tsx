import { useState } from "react";
import {
  Database,
  FolderKanban,
  Layers,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  SquareTerminal,
} from "lucide-react";
import { BrandMark } from "./components/BrandMark";
import { ThemeToggle } from "./components/ThemeToggle";
import { Dashboard } from "./dashboard/Dashboard";
import { Database as DatabasePage } from "./database/Database";
import { Projects } from "./projects/Projects";
import { TerminalPage } from "./terminal/TerminalPage";
import { SettingsPage } from "./settings/SettingsPage";
import { VersionsPage } from "./versions/VersionsPage";

type Page = "dashboard" | "projects" | "database" | "terminal" | "versions" | "settings";

const NAV: { id: Page; label: string; Icon: typeof Settings }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "projects", label: "Projects", Icon: FolderKanban },
  { id: "database", label: "Database", Icon: Database },
  { id: "terminal", label: "Terminal", Icon: SquareTerminal },
  { id: "versions", label: "Versions", Icon: Layers },
];

const RAIL_KEY = "nexdb.rail";

function savedCollapsed(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/** The rail plus the open page. Pages stay mounted so the terminal keeps its session. */
export function Shell() {
  const [page, setPage] = useState<Page>("dashboard");
  const [collapsed, setCollapsed] = useState(savedCollapsed);

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
      <aside className="rail">
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

        <nav className="nav" aria-label="Main">
          <span className="nav-section">Workspace</span>
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={page === id ? "nav-item current" : "nav-item"}
              aria-current={page === id ? "page" : undefined}
              title={collapsed ? label : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
              <span className="nav-label">{label}</span>
            </button>
          ))}
          <span className="nav-section">App</span>
          <button
            type="button"
            className={page === "settings" ? "nav-item current" : "nav-item"}
            aria-current={page === "settings" ? "page" : undefined}
            title={collapsed ? "Settings" : undefined}
            onClick={() => setPage("settings")}
          >
            <Settings size={16} strokeWidth={2} aria-hidden="true" />
            <span className="nav-label">Settings</span>
          </button>
        </nav>

        <div className="rail-foot">
          <ThemeToggle />
        </div>
      </aside>

      <div className="page" hidden={page !== "dashboard"}>
        <Dashboard onOpenVersions={() => setPage("versions")} />
      </div>
      <div className="page" hidden={page !== "projects"}>
        <Projects active={page === "projects"} onOpenTerminal={() => setPage("terminal")} />
      </div>
      <div className="page" hidden={page !== "database"}>
        <DatabasePage active={page === "database"} />
      </div>
      <div className="page" hidden={page !== "versions"}>
        <VersionsPage active={page === "versions"} />
      </div>
      <div className="page" hidden={page !== "settings"}>
        <SettingsPage active={page === "settings"} />
      </div>
      <div className="page" hidden={page !== "terminal"}>
        <TerminalPage active={page === "terminal"} />
      </div>
    </div>
  );
}
