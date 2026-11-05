import { useEffect, useState } from "react";
import { Terminal } from "lucide-react";
import { chooseOtherTerminals, otherTerminals, type OtherTerminals } from "../lib/terminals";
import { nexCelebrate } from "../lib/nex";

/** "PHP 8.5.12 (NexDB)", for the list. */
const label = (i: { version: string; source: string }) => `PHP ${i.version} · ${i.source}`;

/**
 * Which PHP Windows' other terminals use (cmd, PowerShell, an editor's terminal), picked from
 * every PHP on the PC. NexDB's own Terminal and the projects it runs aren't affected.
 */
export function OtherTerminalsCard() {
  const [info, setInfo] = useState<OtherTerminals | null>(null);
  const [pick, setPick] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    otherTerminals()
      .then((i) => {
        setInfo(i);
        setPick(i.chosen_dir ?? "");
      })
      .catch((e) => setMessage({ ok: false, text: String(e) }));
  }, []);

  if (!info) return null;
  const current = info.installs.find((i) => i.dir.toLowerCase() === info.current_dir?.toLowerCase());
  const asWindows = info.chosen_dir === null;
  const changed = (pick || null) !== info.chosen_dir;

  async function apply() {
    setBusy(true);
    setMessage(null);
    try {
      const next = await chooseOtherTerminals(pick || null);
      setInfo(next);
      const chosen = next.installs.find((i) => i.dir === next.chosen_dir);
      setMessage({
        ok: true,
        text: chosen
          ? `New terminals now use PHP ${chosen.version}. Terminals already open keep the old one until you open a new one.`
          : "Back to how Windows had it. New terminals use the first PHP on Windows' own PATH.",
      });
      if (chosen) nexCelebrate(`Other terminals use PHP ${chosen.version} now.`);
    } catch (e) {
      setMessage({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="health-item health-info other-php" data-guide="other-php">
      <Terminal size={16} className="health-icon" aria-hidden="true" />
      <div className="health-text">
        <p className="health-title">
          Other terminals use {current ? label(current) : info.current_dir ? `PHP from ${info.current_dir}` : "no PHP"}
        </p>
        <p className="field-hint">
          That's cmd, PowerShell and an editor's terminal. NexDB's own Terminal, and projects opened in VS Code from
          NexDB, always use the PHP each project is set to.
        </p>
        <div className="other-php-pick">
          <label className="field">
            <span className="field-label">Use in other terminals</span>
            <select className="input" value={pick} disabled={busy} onChange={(e) => setPick(e.target.value)}>
              <option value="">As Windows has it{asWindows && current ? ` (${label(current)})` : ""}</option>
              {info.installs.map((i) => (
                <option key={i.dir} value={i.dir}>
                  {label(i)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-small btn-primary"
            disabled={!changed || busy}
            data-working={busy || undefined}
            onClick={() => void apply()}
          >
            {busy ? "Waiting for Windows…" : "Use it"}
          </button>
        </div>
        <p className="field-hint">
          The first time, Windows asks for permission, because this changes the system PATH. NexDB adds one small folder
          in front of it; nothing of Laragon or other tools is changed or removed.
        </p>
        {message && (
          <p className={message.ok ? "set-ok" : "field-error"} role={message.ok ? "status" : "alert"}>
            {message.text}
          </p>
        )}
      </div>
    </li>
  );
}
