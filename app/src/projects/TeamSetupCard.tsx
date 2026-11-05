import { useCallback, useEffect, useState } from "react";
import { FileJson, Users } from "lucide-react";
import { applyTeamSetup, checkTeamSetup, exportTeamSetup, SERVICE_NAMES, type TeamCheck } from "../lib/team";
import { nexCelebrate } from "../lib/nex";

/**
 * Share a project's setup with the team as one file, nexdb-setup.json, committed with the code.
 * When the project has one (a teammate made it), this says what it needs and sets it up.
 */
export function TeamSetupCard({ name }: { name: string }) {
  const [check, setCheck] = useState<TeamCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; lines: string[] } | null>(null);

  const load = useCallback(() => {
    checkTeamSetup(name)
      .then(setCheck)
      .catch((e) => setMessage({ ok: false, lines: [String(e)] }));
  }, [name]);
  useEffect(load, [load]);

  async function share() {
    setBusy("Saving…");
    setMessage(null);
    try {
      const path = await exportTeamSetup(name);
      setMessage({
        ok: true,
        lines: [`Saved ${path}. Commit it with the code; passwords, keys and tokens were left out.`],
      });
      load();
    } catch (e) {
      setMessage({ ok: false, lines: [String(e)] });
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    setBusy("Setting it up…");
    setMessage(null);
    try {
      const done = await applyTeamSetup(name);
      setMessage({ ok: true, lines: done });
      nexCelebrate("Set up like the rest of the team!");
      load();
    } catch (e) {
      setMessage({ ok: false, lines: [String(e)] });
    } finally {
      setBusy(null);
    }
  }

  const s = check?.setup;
  return (
    <section className="details-section team-setup" data-guide="team-setup">
      <h3>
        <Users size={15} aria-hidden="true" /> Team setup
      </h3>
      {!s ? (
        <p className="field-hint">
          Save this project's setup as one file for your team: its PHP version, the services it uses, and a .env with
          the passwords left blank. A teammate's NexDB reads it and sets the project up the same way.
        </p>
      ) : (
        <>
          <p className="field-hint">
            <FileJson size={13} aria-hidden="true" /> <code>nexdb-setup.json</code> asks for:
          </p>
          <ul className="team-needs">
            {s.php && (
              <li>
                PHP <code>{s.php}</code>
                {check.php_here && check.php_here !== s.php && (
                  <span className="muted"> (it uses {check.php_here} here now)</span>
                )}
              </li>
            )}
            {s.services.map((id) => (
              <li key={id}>{SERVICE_NAMES[id] ?? id}</li>
            ))}
            <li>
              A .env with {s.env.length} settings
              {check.has_env && <span className="muted"> (this project has its own, so it stays as it is)</span>}
            </li>
          </ul>
          {check.missing.length > 0 && (
            <ul className="team-missing" role="status">
              {check.missing.map((m) => (
                <li key={m} className="field-warn">
                  {m}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="set-row-actions">
        {s && (
          <button
            className="btn btn-primary btn-small"
            disabled={!!busy}
            data-working={busy === "Setting it up…" || undefined}
            onClick={() => void apply()}
            data-guide="team-apply"
          >
            {busy === "Setting it up…" ? busy : "Set it up from the file"}
          </button>
        )}
        <button
          className={s ? "btn btn-small" : "btn btn-primary btn-small"}
          disabled={!!busy}
          data-working={busy === "Saving…" || undefined}
          onClick={() => void share()}
          data-guide="team-share"
        >
          {busy === "Saving…" ? busy : s ? "Save it again from this project" : "Save the setup file"}
        </button>
      </div>
      {message && (
        <div className={message.ok ? "set-ok" : "field-error"} role={message.ok ? "status" : "alert"}>
          {message.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
    </section>
  );
}
