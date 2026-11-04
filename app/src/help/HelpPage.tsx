import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { showGuide, type Chapter } from "../components/Tour";

interface Topic {
  id: string;
  title: string;
  /** Short steps, in the order you'd do them. */
  steps: string[];
  /** Nex's tutorial chapter that shows this on screen. */
  chapter?: Chapter;
}

const TOPICS: Topic[] = [
  {
    id: "start",
    title: "Get started",
    chapter: "Dashboard",
    steps: [
      "Open the Dashboard and press Start all. Your web server, PHP and MySQL start.",
      "Go to Projects and press New project. Pick Laravel, WordPress, React or plain PHP and give it a name.",
      "Press Open on the project. It runs at its own address, like http://shop.test.",
      "Put your own code in the project's folder (⋯ → Open folder) or open it in your editor (⋯ → Open in editor).",
    ],
  },
  {
    id: "services",
    title: "Start, stop and fix services",
    chapter: "Dashboard",
    steps: [
      "Each service on the Dashboard shows whether it runs, its port and its version.",
      "Start or stop one with its own button, or all of them with Start all and Stop all.",
      "If one won't start, its row says why, for example another program using port 80. Logs shows what it wrote.",
      "NexDB can start them when Windows starts: Settings → Startup.",
    ],
  },
  {
    id: "projects",
    title: "Projects",
    chapter: "Projects",
    steps: [
      "Every folder in your projects folder is a project with its own address.",
      "New project makes a ready-to-run app. Clone downloads one from GitHub and sets it up. Import copies projects from Laragon, XAMPP or WAMP.",
      "Open a project's page for its folder, PHP version, database, Git branch, and Laravel buttons.",
      "Each project can use its own PHP version: project page → PHP.",
    ],
  },
  {
    id: "databases",
    title: "Databases",
    chapter: "Database",
    steps: [
      "On the Database page, pick MySQL or PostgreSQL at the top.",
      "New database makes one. NexDB then offers to connect it to a project; you can skip that.",
      "Connecting writes the project's .env (Laravel) or wp-config.php (WordPress) and keeps the old file as a .backup. Other apps get the values to copy.",
      "Pick a database to browse tables, edit rows, run SQL (ready-made commands help), back it up or restore it.",
      "Users makes database users with their own passwords. phpMyAdmin is there too if you prefer it.",
    ],
  },
  {
    id: "share",
    title: "Share a project",
    steps: [
      "Open a project and go to its Share tab.",
      "On the same Wi-Fi: turn sharing on and scan the QR code with your phone.",
      "Anywhere: Public link makes a temporary https address that works until you stop it.",
      "A whole app with a separate front end and Laravel API can share as one link.",
    ],
  },
  {
    id: "terminal",
    title: "Terminal",
    chapter: "Terminal",
    steps: [
      "The Terminal page is PowerShell with NexDB's PHP, Composer, Node and Git ready.",
      "Ctrl+Shift+T opens a new tab, Ctrl+Shift+W closes it, Ctrl+Tab switches. Double-click a tab to rename it.",
      "Open in new window gives you a terminal you can move and resize.",
      "Select text and press Ctrl+C to copy; Ctrl+V pastes.",
    ],
  },
  {
    id: "versions",
    title: "Versions and extras",
    chapter: "Versions",
    steps: [
      "Versions installs other PHP, Node and MySQL versions and sets the default.",
      "Extras like Redis, Mailpit and PostgreSQL install from the same page.",
      "PHP settings: extensions, limits like upload size, and your own php.ini lines per version.",
    ],
  },
  {
    id: "trouble",
    title: "When something goes wrong",
    chapter: "Check my setup",
    steps: [
      "Open Check my setup. NexDB checks ports, services, sites and projects, and offers a fix for each problem.",
      "A site shows the wrong project or doesn't open: Set up addresses on the Projects page adds its .test address.",
      "Still stuck? Save support report on Check my setup makes a zip you can send for help. It leaves out passwords.",
    ],
  },
  {
    id: "backup",
    title: "Backups and moving",
    steps: [
      "Settings → Automatic backups saves your databases on a schedule.",
      "A database's Backups tab makes a backup now, or restores one.",
      "Moved the NexDB folder or reinstalled Windows? Install NexDB and setup offers to use your old folder, so everything is back.",
      "Uninstalling asks whether to keep the NexDB folder. Keeping it is the default.",
    ],
  },
  {
    id: "keys",
    title: "Keyboard shortcuts",
    chapter: "Search",
    steps: [
      "Ctrl+K: search pages, projects, databases and actions.",
      "Ctrl+1 to Ctrl+8: open the sidebar's pages, top to bottom.",
      "Tab moves between controls; the first Tab press offers Skip to page content.",
      "Esc closes menus, panels and the tutorial.",
    ],
  },
];

/** A short user guide: plain steps per topic, with a Show me button for Nex's tutorial. */
export function HelpPage() {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOPICS;
    return TOPICS.filter((t) => t.title.toLowerCase().includes(q) || t.steps.some((s) => s.toLowerCase().includes(q)));
  }, [query]);

  return (
    <main className="panel help">
      <header className="panel-head dash-head">
        <div>
          <h1>Help</h1>
          <p className="dash-summary">How to do things in NexDB, step by step.</p>
        </div>
        <div className="dash-actions">
          <button className="btn btn-primary" onClick={() => showGuide()}>
            Start the tutorial
          </button>
        </div>
      </header>

      <div className="panel-body dash-body">
        <label className="help-search">
          <Search size={14} aria-hidden="true" />
          <span className="visually-hidden">Search help</span>
          <input
            className="input"
            type="search"
            placeholder="Search help, for example .env or port 80"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <nav className="help-jump" aria-label="Topics">
          {shown.map((t) => (
            <a key={t.id} href={`#help-${t.id}`} className="btn btn-small btn-quiet">
              {t.title}
            </a>
          ))}
        </nav>

        {shown.length === 0 && (
          <p className="lede" role="status">
            Nothing matches “{query}”. Try another word, or press Ctrl+K to search projects and databases.
          </p>
        )}

        <div className="help-topics">
          {shown.map((t) => (
            <section key={t.id} id={`help-${t.id}`} className="help-topic" aria-labelledby={`help-${t.id}-title`}>
              <div className="help-topic-head">
                <h2 id={`help-${t.id}-title`}>{t.title}</h2>
                {t.chapter && (
                  <button className="btn btn-small" onClick={() => showGuide(t.chapter)}>
                    Show me
                  </button>
                )}
              </div>
              <ol>
                {t.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
