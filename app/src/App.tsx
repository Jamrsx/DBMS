import { NexHostPanel } from "./nexhost/NexHostPanel";
import { useCallback, useEffect, useState } from "react";
import { Wizard } from "./Wizard";
import { Shell } from "./Shell";
import { Welcome } from "./components/Welcome";
import { LicenseGate } from "./components/LicenseGate";
import { checkInLicense, licenseStatus, licenseWorks, OPEN_LICENSE, type LicenseStatus } from "./lib/license";
import { FreeShell } from "./free/FreeShell";
import { GraceNotice } from "./components/GraceNotice";
import { listen } from "@tauri-apps/api/event";
import { realDesktopApp } from "./lib/scan";
import { showGuide } from "./components/Tour";
import { Diagram } from "./database/Diagram";
import { TerminalPage } from "./terminal/TerminalPage";
import { MacMoveDialog } from "./components/MacMoveDialog";
import { markPreviewInstalled, setupInfo, type FoundInstall } from "./lib/services";

type View = "loading" | "setup" | "dashboard";

/** Opens the app when an install exists, otherwise the setup wizard. */
/** Set on a terminal window opened from the Terminal page. */
const terminalWindow = new URLSearchParams(location.search).get("view") === "terminal";
/** Set on the NexHost hosting panel window. */
const nexhostWindow = new URLSearchParams(location.search).get("view") === "nexhost";
/** Set on a relationship diagram window opened from the Database page. */
const diagramDb =
  new URLSearchParams(location.search).get("view") === "diagram"
    ? new URLSearchParams(location.search).get("db")
    : null;

export default function App() {
  if (terminalWindow) {
    return (
      <div className="terminal-window">
        <TerminalPage active standalone />
      </div>
    );
  }
  if (nexhostWindow) {
    return <NexHostPanel />;
  }
  if (diagramDb) {
    return (
      <div className="diagram-window">
        <Diagram db={diagramDb} />
      </div>
    );
  }
  return (
    <>
      <MainApp />
      <MacMoveDialog />
    </>
  );
}

function MainApp() {
  const [view, setView] = useState<View>("loading");
  const [repairRoot, setRepairRoot] = useState<string | null>(null);
  const [found, setFound] = useState<FoundInstall[]>([]);
  const [defaultRoot, setDefaultRoot] = useState<string | undefined>(undefined);
  // Just finished setup: the welcome screen plays, then the tour.
  const [welcome, setWelcome] = useState(false);
  // No working license: NexDB Free. A key or sign-in unlocks the full app at any time.
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [typingKey, setTypingKey] = useState(false);
  const [licenseMode, setLicenseMode] = useState<"key" | "signin">("key");
  const openLicense = useCallback((mode: "key" | "signin") => {
    setLicenseMode(mode);
    setTypingKey(true);
  }, []);

  useEffect(() => {
    const open = () => openLicense("key");
    window.addEventListener(OPEN_LICENSE, open);
    return () => window.removeEventListener(OPEN_LICENSE, open);
  }, [openLicense]);

  const check = useCallback(() => {
    setupInfo()
      .then((info) => {
        setRepairRoot(info.repair_root ?? null);
        setFound(info.found ?? []);
        setDefaultRoot(info.default_root ?? undefined);
        setView(info.installed ? "dashboard" : "setup");
      })
      .catch(() => setView("setup"));
  }, []);

  useEffect(check, [check]);

  // Once installed: read the license on this PC, then check it with the website quietly. A key
  // turned off or moved to another PC brings the license screen back.
  useEffect(() => {
    if (view !== "dashboard") return;
    let live = true;
    licenseStatus()
      .then((s) => {
        if (!live) return;
        setLicense(s);
        if (s.state === "active" || s.state === "needs_checkin") {
          checkInLicense()
            .then((out) => live && out.status && setLicense(out.status))
            .catch(() => {});
        }
      })
      .catch(() => live && setLicense({ state: "none", notice: null }));
    return () => {
      live = false;
    };
  }, [view]);

  // While open: read the license again every minute (and when the Rust side says it changed), so
  // it ends on time. Ended within 3 days: a notice, nothing locked. After that: NexDB Free.
  useEffect(() => {
    if (view !== "dashboard") return;
    const reread = () => void licenseStatus().then(setLicense).catch(() => {});
    const timer = window.setInterval(reread, 60_000);
    const unlisten = realDesktopApp ? listen("license-changed", reread) : null;
    return () => {
      window.clearInterval(timer);
      void unlisten?.then((stop) => stop());
    };
  }, [view]);

  if (view === "loading") return null;
  if (view === "dashboard" && license === null) return null;
  if (view === "dashboard" && typingKey)
    return (
      <LicenseGate
        status={license!}
        initialMode={licenseMode}
        onActive={(s) => {
          setTypingKey(false);
          setLicense(s);
        }}
        onClose={() => setTypingKey(false)}
      />
    );
  if (view === "dashboard" && !licenseWorks(license))
    return (
      <>
        <FreeShell license={license!} onLicense={openLicense} onActive={setLicense} holdTour={welcome} />
        {welcome && (
          <Welcome
            onDone={(tour) => {
              setWelcome(false);
              if (tour) showGuide("NexDB Free");
              try {
                localStorage.setItem("nexdb.guideDone", "1");
                localStorage.setItem("nexdb.freeTourOffered", "1");
              } catch {
                // It offers the tour again next launch; harmless.
              }
            }}
          />
        )}
      </>
    );
  if (view === "dashboard")
    return (
      <>
        <Shell holdTour={welcome} />
        {license?.state === "grace" && <GraceNotice status={license} onNewKey={() => setTypingKey(true)} />}
        {welcome && (
          <Welcome
            onDone={(tour) => {
              setWelcome(false);
              if (tour) showGuide();
              else
                try {
                  localStorage.setItem("nexdb.guideDone", "1");
                } catch {
                  // It offers the tour again next launch; harmless.
                }
            }}
          />
        )}
      </>
    );
  return (
    <Wizard
      repairRoot={repairRoot}
      defaultRoot={defaultRoot}
      found={found}
      onFinish={() => {
        markPreviewInstalled();
        setWelcome(true);
        check();
      }}
    />
  );
}
