import { useCallback, useEffect, useState } from "react";
import { Wizard } from "./Wizard";
import { Shell } from "./Shell";
import { TerminalPage } from "./terminal/TerminalPage";
import { markPreviewInstalled, setupInfo, type FoundInstall } from "./lib/services";

type View = "loading" | "setup" | "dashboard";

/** Opens the app when an install exists, otherwise the setup wizard. */
/** Set on a terminal window opened from the Terminal page. */
const terminalWindow = new URLSearchParams(location.search).get("view") === "terminal";

export default function App() {
  if (terminalWindow) {
    return (
      <div className="terminal-window">
        <TerminalPage active standalone />
      </div>
    );
  }
  return <MainApp />;
}

function MainApp() {
  const [view, setView] = useState<View>("loading");
  const [repairRoot, setRepairRoot] = useState<string | null>(null);
  const [found, setFound] = useState<FoundInstall[]>([]);

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
  if (view === "dashboard") return <Shell />;
  return (
    <Wizard
      repairRoot={repairRoot}
      found={found}
      onFinish={() => {
        markPreviewInstalled();
        check();
      }}
    />
  );
}
