import { useCallback, useEffect, useState } from "react";
import { Wizard } from "./Wizard";
import { Shell } from "./Shell";
import { markPreviewInstalled, setupInfo } from "./lib/services";

type View = "loading" | "setup" | "dashboard";

/** Opens the app when an install exists, otherwise the setup wizard. */
export default function App() {
  const [view, setView] = useState<View>("loading");

  const check = useCallback(() => {
    setupInfo()
      .then((info) => setView(info.installed ? "dashboard" : "setup"))
      .catch(() => setView("setup"));
  }, []);

  useEffect(check, [check]);

  if (view === "loading") return null;
  if (view === "dashboard") return <Shell />;
  return (
    <Wizard
      onFinish={() => {
        markPreviewInstalled();
        check();
      }}
    />
  );
}
