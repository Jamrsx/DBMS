import { useCallback, useEffect, useState } from "react";
import { Wizard } from "./Wizard";
import { Shell } from "./Shell";
import { Welcome } from "./components/Welcome";
import { showGuide } from "./components/Tour";
import { Diagram } from "./database/Diagram";
import { TerminalPage } from "./terminal/TerminalPage";
import { markPreviewInstalled, setupInfo, type FoundInstall } from "./lib/services";

type View = "loading" | "setup" | "dashboard";

/** Opens the app when an install exists, otherwise the setup wizard. */
/** Set on a terminal window opened from the Terminal page. */
const terminalWindow = new URLSearchParams(location.search).get("view") === "terminal";
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
  if (diagramDb) {
    return (
      <div className="diagram-window">
        <Diagram db={diagramDb} />
      </div>
    );
  }
  return <MainApp />;
}

function MainApp() {
  const [view, setView] = useState<View>("loading");
  const [repairRoot, setRepairRoot] = useState<string | null>(null);
  const [found, setFound] = useState<FoundInstall[]>([]);
  // Just finished setup: the welcome screen plays, then the tour.
  const [welcome, setWelcome] = useState(false);

  const check = useCallback(() => {
    setupInfo()
      .then((info) => {
        setRepairRoot(info.repair_root ?? null);
        setFound(info.found ?? []);
        setView(info.installed ? "dashboard" : "setup");
      })
      .catch(() => setView("setup"));
  }, []);

  useEffect(check, [check]);

  if (view === "loading") return null;
  if (view === "dashboard")
    return (
      <>
        <Shell holdTour={welcome} />
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
      found={found}
      onFinish={() => {
        markPreviewInstalled();
        setWelcome(true);
        check();
      }}
    />
  );
}
