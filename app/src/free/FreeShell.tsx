import { useCallback, useEffect, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleHelp, Database, Folder, Globe, LogIn, Play, Settings as SettingsIcon, Sparkles, Square, SquareTerminal } from "lucide-react";
import { Tour, showGuide } from "../components/Tour";
import { UpdateNotice } from "../components/UpdateNotice";
import { getAppSettings, type AppSettings } from "../lib/appsettings";
import { localVersions, type LocalVersion } from "../lib/free";
import { checkInLicense, dateOf, type LicenseStatus } from "../lib/license";
import { pmaInstall, pmaOpen, pmaStatus } from "../lib/phpmyadmin";
import { isPractice } from "../lib/practice";
import { openWwwFolder } from "../lib/projects";
import { realDesktopApp } from "../lib/scan";
import { listServices, startServices, stopServices, type ServiceStatus } from "../lib/services";
import { openTerminalWindow } from "../lib/terminal";
import { startUpdateChecks } from "../lib/updates";
import { AddVersion } from "./AddVersion";
import { FreeSettings } from "./FreeSettings";
import { PausedSites } from "./PausedSites";
import { UpgradeNotice } from "./UpgradeNotice";
import { VersionMenu } from "./VersionMenu";
import { WhatYouGet } from "./WhatYouGet";
import "./free.css";

type Screen = "main" | "upgrade" | "add" | "settings";
type Problem = { text: string; details?: string };

const TOUR_OFFERED = "nexdb.freeTourOffered";

const isUp = (s?: ServiceStatus) => s?.state === "running" || s?.state === "starting";

function stateText(s?: ServiceStatus): string {
  if (!s) return "Not installed";
  if (s.state === "running") return "Running";
  if (s.state === "starting") return "Starting…";
  if (s.state === "failed") return "Didn't start";
  if (s.state === "external") return "Outside NexDB";
  return "Stopped";
}

/** Why this person is in Free, when there is something they should know. */
function licenseMessage(license: LicenseStatus): { text: string; retry?: boolean } | null {
  switch (license.state) {
    case "none":
      return license.notice ? { text: license.notice } : null;
    case "expired":
      return {
        text: license.trial
          ? "Your 14-day trial ended. Your projects and databases are safe."
          : `Your license ended on ${dateOf(license.expires_at)}. Your projects and databases are safe.`,
      };
    case "needs_checkin":
      return { text: "Connect to the internet to bring your license back.", retry: true };
    case "clock_back":
      return { text: "Your computer's date looks wrong. Fix the date and time, then press Try again.", retry: true };
    default:
      return null;
  }
}

function ServiceCard({ title, detail, service }: { title: string; detail: string; service?: ServiceStatus }) {
  return (
    <section className={`free-card is-${service?.state ?? "missing"}`}>
      <h2>{title}</h2>
      <p className="free-card-state">
        <span className="free-dot" aria-hidden="true" />
        {stateText(service)}
      </p>
      <p className="free-card-detail">{service ? `${detail} · port ${service.port}` : detail}</p>
    </section>
  );
}

function ActionButton({ icon, label, title, disabled, primary, stop, tour, onClick }: {
  icon: ReactNode;
  label: string;
  title?: string;
  disabled?: boolean;
  primary?: boolean;
  stop?: boolean;
  tour: string;
  onClick: () => void;
}) {
  const kind = stop ? "free-action is-stop" : primary ? "free-action is-primary" : "free-action";
  return (
    <button type="button" className={kind} title={title} disabled={disabled} data-tour={tour} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** NexDB Free: start the servers, open the site, phpMyAdmin, a terminal, and the projects folder. */
export function FreeShell({ license, onLicense, onActive, holdTour = false }: {
  license: LicenseStatus;
  onLicense: (mode: "key" | "signin") => void;
  onActive: (status: LicenseStatus) => void;
  holdTour?: boolean;
}) {
  const [screen, setScreen] = useState<Screen>("main");
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [versions, setVersions] = useState<LocalVersion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [needPma, setNeedPma] = useState(false);
  const [pmaPercent, setPmaPercent] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (isPractice()) return;
    listServices().then(setServices).catch(() => {});
  }, []);
  const refreshVersions = useCallback(() => {
    localVersions().then(setVersions).catch(() => {});
    getAppSettings().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    refreshVersions();
    const timer = window.setInterval(refresh, 3000);
    const unlisten = realDesktopApp ? listen("services-changed", refresh) : null;
    return () => {
      window.clearInterval(timer);
      void unlisten?.then((stop) => stop());
    };
  }, [refresh, refreshVersions]);

  useEffect(startUpdateChecks, []);

  // Nex offers the short Free tour once.
  useEffect(() => {
    if (holdTour) return;
    try {
      if (localStorage.getItem(TOUR_OFFERED) === "1") return;
      localStorage.setItem(TOUR_OFFERED, "1");
    } catch {
      return;
    }
    showGuide("NexDB Free");
  }, [holdTour]);

  async function run(label: string, failed: string, work: () => Promise<void>) {
    setBusy(label);
    setProblem(null);
    try {
      await work();
    } catch (e) {
      setProblem({ text: failed, details: String(e) });
    } finally {
      setBusy(null);
      refresh();
    }
  }

  const web = services.find((s) => s.id === settings?.web_server);
  const mysql = services.find((s) => s.id === "mysql");
  const php = versions.find((v) => v.id === "php" && v.active);
  const anyUp = services.some(isUp);
  const webReady = web?.state === "running";
  const dbReady = webReady && (mysql?.state === "running" || mysql?.state === "external");
  const failed = services.some((s) => s.state === "failed");
  const message = licenseMessage(license);
  // The website has the final say; this only hides the offer from someone who clearly used it.
  const trialAvailable = license.state === "none";

  const heading = busy ?? (failed ? "Something didn't start" : webReady ? "Your server is running" : "Everything is stopped");
  const subheading = busy
    ? "This can take a few seconds."
    : failed
      ? "Press Stop All, then Start All to try again. Another program may be using the same port."
      : webReady
        ? "Open your sites at localhost, or manage databases in phpMyAdmin."
        : "Press Start All to run your local server.";

  const toggle = () =>
    anyUp
      ? run("Stopping your server…", "NexDB couldn't stop everything.", () => stopServices())
      : run("Starting your server…", "NexDB couldn't start everything.", () => startServices());

  const openWeb = () => {
    const port = web?.port ?? 80;
    const url = port === 80 ? "http://localhost/" : `http://localhost:${port}/`;
    return run("Opening your site…", "NexDB couldn't open your browser.", () =>
      realDesktopApp ? openUrl(url) : Promise.resolve(void window.open(url, "_blank", "noopener")),
    );
  };

  const openDatabase = () =>
    run("Opening phpMyAdmin…", "NexDB couldn't open phpMyAdmin.", async () => {
      const status = await pmaStatus();
      if (!status.installed) {
        setNeedPma(true);
        return;
      }
      await pmaOpen();
    });

  const installPma = () =>
    run("Installing phpMyAdmin…", "phpMyAdmin couldn't be installed. Check your internet connection and try again.", async () => {
      try {
        await pmaInstall((p) => setPmaPercent(p.bytes_total ? Math.round((p.bytes_done / p.bytes_total) * 100) : null));
      } finally {
        // A failed install must not leave "Installing… 97%" next to the error.
        setPmaPercent(null);
      }
      setNeedPma(false);
      await pmaOpen();
    });

  const retryLicense = () =>
    run("Checking your license…", "NexDB couldn't check your license.", async () => {
      const out = await checkInLicense();
      if (out.status) onActive(out.status);
      if (out.code === "offline") setProblem({ text: "Still no connection to the NexDB server." });
    });

  return (
    <div className="free-shell">
      <header className="free-top">
        <img src="/nexdb-logo.png" alt="" width={22} height={22} />
        <strong>NexDB Free</strong>
        {php && <span className="free-top-php">PHP {php.version}</span>}
        <nav className="free-top-actions" aria-label="NexDB">
          <UpdateNotice />
          <button type="button" className="btn btn-small btn-quiet" data-tour="free-upgrade" onClick={() => setScreen("upgrade")}>
            <Sparkles size={14} aria-hidden="true" /> What you get
          </button>
          <button type="button" className="btn btn-small btn-quiet" onClick={() => onLicense("signin")}>
            <LogIn size={14} aria-hidden="true" /> Sign in
          </button>
          <button type="button" className="btn btn-small btn-quiet" onClick={() => showGuide("NexDB Free")}>
            <CircleHelp size={14} aria-hidden="true" /> Help
          </button>
          <button type="button" className="btn btn-small btn-quiet" data-tour="free-settings" onClick={() => setScreen("settings")}>
            <SettingsIcon size={14} aria-hidden="true" /> Settings
          </button>
        </nav>
      </header>

      {screen === "upgrade" ? (
        <WhatYouGet trialAvailable={trialAvailable} onBack={() => setScreen("main")} onKey={() => onLicense("key")} onActive={onActive} />
      ) : screen === "add" ? (
        <AddVersion onBack={() => setScreen("main")} onChanged={refreshVersions} />
      ) : screen === "settings" ? (
        <FreeSettings
          settings={settings}
          phpVersion={php?.version ?? null}
          license={license}
          onSaved={refreshVersions}
          onBack={() => setScreen("main")}
          onLicense={onLicense}
          onUpgrade={() => setScreen("upgrade")}
        />
      ) : (
        <main className="free-main">
          <div role="status" aria-live="polite">
            <h1>{heading}</h1>
            <p className="free-sub">{subheading}</p>
          </div>

          {message && (
            <p className="free-banner">
              <span>{message.text}</span>
              {message.retry && (
                <button type="button" className="btn btn-small" disabled={!!busy} onClick={() => void retryLicense()}>
                  Try again
                </button>
              )}
            </p>
          )}

          {problem && (
            <div className="free-problem" role="alert">
              <p>{problem.text}</p>
              {problem.details && (
                <details>
                  <summary>Show details</summary>
                  <pre>{problem.details}</pre>
                </details>
              )}
            </div>
          )}

          {needPma && (
            <p className="free-banner">
              <span>{pmaPercent === null ? "phpMyAdmin isn't installed yet." : `Installing phpMyAdmin… ${pmaPercent}%`}</span>
              <button type="button" className="btn btn-small btn-primary" disabled={!!busy} onClick={() => void installPma()}>
                Install phpMyAdmin
              </button>
            </p>
          )}

          <div className="free-cards">
            <ServiceCard title={web?.name ?? "Web server"} detail="Web server" service={web} />
            <ServiceCard title="MySQL" detail="Database" service={mysql} />
            <VersionMenu versions={versions} busy={!!busy} onAdd={() => setScreen("add")} onChanged={refreshVersions} run={run} />
          </div>

          <PausedSites />

          {!busy && <UpgradeNotice trialAvailable={trialAvailable} onOpen={() => setScreen("upgrade")} />}
        </main>
      )}

      {screen === "main" && (
        <footer className="free-actions">
          <ActionButton
            tour="free-start"
            primary={!anyUp}
            stop={anyUp}
            disabled={!!busy}
            icon={anyUp ? <Square size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            label={anyUp ? "Stop All" : "Start All"}
            onClick={() => void toggle()}
          />
          <ActionButton
            tour="free-web"
            disabled={!webReady || !!busy}
            title={webReady ? "Open localhost in your browser" : "Press Start All first"}
            icon={<Globe size={16} aria-hidden="true" />}
            label="Web"
            onClick={() => void openWeb()}
          />
          <ActionButton
            tour="free-database"
            disabled={!dbReady || !!busy}
            title={dbReady ? "Open phpMyAdmin" : "Press Start All first"}
            icon={<Database size={16} aria-hidden="true" />}
            label="Database"
            onClick={() => void openDatabase()}
          />
          <ActionButton
            tour="free-terminal"
            disabled={!!busy}
            title="Open a terminal with PHP, Node, Composer and Git ready"
            icon={<SquareTerminal size={16} aria-hidden="true" />}
            label="Terminal"
            onClick={() => void run("Opening a terminal…", "NexDB couldn't open a terminal.", async () => void (await openTerminalWindow()))}
          />
          <ActionButton
            tour="free-folder"
            disabled={!!busy}
            title="Open your projects folder"
            icon={<Folder size={16} aria-hidden="true" />}
            label="Folder"
            onClick={() => void run("Opening your folder…", "NexDB couldn't open your projects folder.", () => openWwwFolder())}
          />
        </footer>
      )}

      <Tour onPage={() => {}} hold />
    </div>
  );
}
