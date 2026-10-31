import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { pmaInstall, pmaOpen, pmaStatus, type PmaStatus } from "../lib/phpmyadmin";

/** Opens phpMyAdmin in the browser, or installs it first. It lives at localhost/phpmyadmin. */
export function PhpMyAdmin({ onError }: { onError: (message: string | null) => void }) {
  const [status, setStatus] = useState<PmaStatus | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => pmaStatus().then(setStatus).catch(() => setStatus(null)), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!status || !status.web_server) return null;

  async function install() {
    setBusy(true);
    setPercent(0);
    onError(null);
    try {
      await pmaInstall((p) => setPercent(p.bytes_total ? Math.round((p.bytes_done / p.bytes_total) * 100) : null));
      await refresh();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
      setPercent(null);
    }
  }

  if (!status.installed) {
    return (
      <button className="btn" onClick={install} disabled={busy} title="Adds phpMyAdmin at localhost/phpmyadmin">
        <Download size={15} aria-hidden="true" />{" "}
        {busy ? (percent === null ? "Installing…" : `Installing ${percent}%`) : "Install phpMyAdmin"}
      </button>
    );
  }
  return (
    <button className="btn" onClick={() => pmaOpen().catch((e) => onError(String(e)))} title={status.url}>
      <ExternalLink size={15} aria-hidden="true" /> phpMyAdmin {status.version ?? ""}
    </button>
  );
}
