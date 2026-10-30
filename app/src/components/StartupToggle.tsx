import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { inDesktopApp } from "../lib/scan";

/** "Start with Windows": NexDB opens hidden in the notification area at sign-in. */
export function StartupToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (inDesktopApp) invoke<boolean>("autostart_get").then(setOn).catch(() => setOn(false));
  }, []);

  if (!inDesktopApp || on === null) return null;

  const change = async (next: boolean) => {
    setError(null);
    try {
      await invoke("autostart_set", { on: next });
      setOn(next);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="startup-toggle">
      <label>
        <input type="checkbox" checked={on} onChange={(e) => change(e.target.checked)} />
        <span>Start with Windows</span>
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
