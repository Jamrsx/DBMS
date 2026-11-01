import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpCircle, Download } from "lucide-react";
import { createBackup } from "../lib/backups";
import { nexCelebrate } from "../lib/nex";
import {
  formatMb,
  installVersion,
  removeVersion,
  useVersion,
  versionsOverview,
  type Available,
  type ComponentVersions,
  type VersionLabel,
  type VersionsInfo,
} from "../lib/versions";

const LABEL_TEXT: Record<VersionLabel, string> = {
  recommended: "Recommended",
  latest: "Newest",
  lts: "Long-term support",
  "security-fix": "Security fix",
  "ends-soon": "Support ends soon",
};

type Action = "install" | "use" | "remove" | "update" | "reinstall";

/** What is happening right now, so only one change runs at a time. */
type Busy = { id: string; version: string; what: "install" | "use" | "remove"; percent: number | null } | null;

export function VersionsPage({ active }: { active: boolean }) {
  const [info, setInfo] = useState<VersionsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const load = useCallback(() => {
    versionsOverview()
      .then((i) => {
        setInfo(i);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  async function run(c: ComponentVersions, version: string, what: Action) {
    setError(null);
    setDone(null);
    let note: string | null = null;
    try {
      if (what === "install" || what === "update" || what === "reinstall") {
        setBusy({ id: c.id, version, what: "install", percent: 0 });
        note = await installVersion(c.id, version, (percent) => setBusy({ id: c.id, version, what: "install", percent }));
      }
      if (what === "use" || what === "update") {
        setBusy({ id: c.id, version, what: "use", percent: null });
        await useVersion(c.id, version);
      }
      if (what === "remove") {
        setBusy({ id: c.id, version, what: "remove", percent: null });
        await removeVersion(c.id, version);
      }
      const message =
        what === "reinstall"
          ? `${c.name} ${version} is back. ${c.kind === "tool" ? "It's ready to use in the Terminal." : "Press Start on the Dashboard to run it."}`
          : what === "install" && c.kind === "tool"
            ? `${c.name} ${version} is installed and ready to use in the Terminal.`
            : what === "install" && c.kind === "service"
              ? `${c.name} ${version} is installed and added to the Dashboard. Press Start there to run it.`
            : what === "install"
              ? `${c.name} ${version} is installed. Press "Use this" to switch to it.`
              : what === "remove"
                ? `${c.name} ${version} was removed.`
                : `${c.name} ${version} is now in use. Running services restarted with it.`;
      setDone(note ? `${message} ${note}` : message);
      if (what !== "remove") nexCelebrate(message);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
      load();
    }
  }

  return (
    <main className="panel">
      <header className="panel-head dash-head">
        <div>
          <h1>Versions</h1>
          <p className="dash-summary">
            Install other versions side by side and choose which one NexDB uses.
            {info && ` Version list from ${info.catalog_date}; updating NexDB brings newer ones.`}
          </p>
        </div>
      </header>

      <div className="panel-body dash-body settings">
        {error && (
          <div className="error-box" role="alert">
            <p>{error}</p>
          </div>
        )}
        {done && (
          <p className="set-ok ver-done" role="status">
            {done}
          </p>
        )}
        {info?.components
          .filter((c) => c.kind === "runtime")
          .map((c) => <ComponentCard key={c.id} c={c} busy={busy} onRun={run} />)}
        {info && info.components.some((c) => c.kind === "tool") && (
          <h2 className="ver-section">Tools</h2>
        )}
        {info?.components
          .filter((c) => c.kind === "tool")
          .map((c) => <ComponentCard key={c.id} c={c} busy={busy} onRun={run} />)}
        {info && info.components.some((c) => c.kind === "service") && (
          <>
            <h2 className="ver-section">Extra services</h2>
            <p className="set-lede ver-section-lede">Optional helpers. Once installed they show on the Dashboard with the others.</p>
          </>
        )}
        {info?.components
          .filter((c) => c.kind === "service")
          .map((c) => <ComponentCard key={c.id} c={c} busy={busy} onRun={run} />)}
      </div>
    </main>
  );
}

function ComponentCard({
  c,
  busy,
  onRun,
}: {
  c: ComponentVersions;
  busy: Busy;
  onRun: (c: ComponentVersions, version: string, what: Action) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const locked = busy !== null;
  const mine = busy?.id === c.id ? busy : null;
  const others = c.available.filter((a) => !a.installed);
  const hintInstalled = c.hint && c.installed.some((i) => i.version === c.hint!.version);
  const toolToInstall = c.kind !== "runtime" && !c.active ? c.available[0] : null;
  const [confirmSwitch, setConfirmSwitch] = useState<{ version: string; what: Action } | null>(null);
  // Switching MySQL asks first and offers a backup; everything else runs straight away.
  const ask = (version: string, what: Action) =>
    c.id === "mysql" && (what === "use" || what === "update") ? setConfirmSwitch({ version, what }) : onRun(c, version, what);

  return (
    <section className="set-card ver-card" aria-labelledby={`ver-${c.id}`}>
      <div className="ver-head">
        <h2 id={`ver-${c.id}`}>{c.name}</h2>
        {c.missing ? (
          <span className="ver-missing-tag">Missing</span>
        ) : c.active ? (
          <span className="ver-inuse">In use: {c.active}</span>
        ) : (
          <span className="ver-none">Not installed</span>
        )}
      </div>
      <p className="set-lede ver-about">{c.about}</p>

      {c.missing && c.active && (
        <div className="ver-hint ver-hint-missing" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <p>
            <strong>
              {c.name} {c.active} is missing.
            </strong>{" "}
            Its files were deleted, so {c.kind === "tool" ? "the Terminal can't use it" : "it can't start"}. Reinstall it to
            fix this; your settings and projects are kept.
          </p>
          <button className="btn btn-primary" disabled={locked} onClick={() => onRun(c, c.active!, "reinstall")}>
            Reinstall {c.active}
          </button>
        </div>
      )}

      {toolToInstall && !mine && (
        <div className="ver-hint">
          <p>
            {c.name} {toolToInstall.version} isn't installed yet
            {toolToInstall.download_size ? ` (${formatMb(toolToInstall.download_size)} download)` : ""}.
          </p>
          <button className="btn btn-primary" disabled={locked} onClick={() => onRun(c, toolToInstall.version, "install")}>
            <Download size={14} aria-hidden="true" /> Install {c.name}
          </button>
        </div>
      )}

      {c.hint && (
        <div className={c.hint.kind === "update" ? "ver-hint ver-hint-update" : "ver-hint"}>
          <ArrowUpCircle size={16} aria-hidden="true" />
          <p>{c.hint.message}</p>
          {c.hint.kind === "update" && (
            <button
              className="btn btn-primary"
              disabled={locked}
              onClick={() => ask(c.hint!.version, hintInstalled ? "use" : "update")}
            >
              {hintInstalled ? `Use ${c.hint.version}` : `Update to ${c.hint.version}`}
            </button>
          )}
        </div>
      )}

      {confirmSwitch && (
        <SwitchConfirm
          name={c.name}
          version={confirmSwitch.version}
          onCancel={() => setConfirmSwitch(null)}
          onSwitch={() => {
            onRun(c, confirmSwitch.version, confirmSwitch.what);
            setConfirmSwitch(null);
          }}
        />
      )}

      {mine && (
        <Progress name={c.name} busy={mine} />
      )}

      {c.installed.length > 0 && (
        <ul className="ver-list" aria-label={`Installed ${c.name} versions`}>
          {c.installed.map((i) => (
            <li key={i.version} className="ver-row">
              <span className="ver-num">{i.version}</span>
              {i.active ? (
                <span className="ver-tag">In use</span>
              ) : confirmRemove === i.version ? (
                <span className="ver-actions">
                  <span className="field-hint">Remove {c.name} {i.version} from this PC?</span>
                  <button className="btn btn-small" onClick={() => setConfirmRemove(null)}>
                    Keep it
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    disabled={locked}
                    onClick={() => {
                      setConfirmRemove(null);
                      onRun(c, i.version, "remove");
                    }}
                  >
                    Remove
                  </button>
                </span>
              ) : (
                <span className="ver-actions">
                  <button className="btn btn-small" disabled={locked} onClick={() => ask(i.version, "use")}>
                    Use this
                  </button>
                  <button className="btn btn-small" disabled={locked} onClick={() => setConfirmRemove(i.version)}>
                    Remove…
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && c.kind === "runtime" && (
        <details className="ver-more">
          <summary>Other {c.name} versions you can install ({others.length})</summary>
          <ul className="ver-list">
            {others.map((a) => (
              <OtherVersion key={a.version} a={a} locked={locked} onInstall={() => onRun(c, a.version, "install")} />
            ))}
          </ul>
        </details>
      )}

      {c.note && <p className="field-hint ver-note">{c.note}</p>}
    </section>
  );
}

function OtherVersion({ a, locked, onInstall }: { a: Available; locked: boolean; onInstall: () => void }) {
  const why = !a.downloadable
    ? "No Windows download yet"
    : !a.allowed
      ? "Needs a database backup first"
      : null;
  return (
    <li className="ver-row">
      <span className="ver-num">{a.version}</span>
      <span className="ver-labels">
        {a.labels.map((l) => (
          <span key={l} className={l === "ends-soon" ? "kind kind-warn" : "kind"}>
            {LABEL_TEXT[l]}
          </span>
        ))}
        {a.note && <span className="field-hint">{a.note}</span>}
      </span>
      <span className="ver-actions">
        {why ? (
          <span className="field-hint">{why}</span>
        ) : (
          <button className="btn btn-small" disabled={locked} onClick={onInstall}>
            <Download size={13} aria-hidden="true" /> Install{a.download_size ? ` · ${formatMb(a.download_size)}` : ""}
          </button>
        )}
      </span>
    </li>
  );
}

function Progress({ name, busy }: { name: string; busy: NonNullable<Busy> }) {
  const text =
    busy.what === "install"
      ? `Downloading ${name} ${busy.version}${busy.percent === null ? "…" : ` · ${busy.percent}%`}`
      : busy.what === "use"
        ? `Switching to ${name} ${busy.version} and restarting services…`
        : `Removing ${name} ${busy.version}…`;
  return (
    <div className="set-progress ver-progress" role="status">
      <p className="field-hint">{text}</p>
      {busy.what === "install" && (
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={busy.percent ?? undefined}>
          <span className="bar-fill" style={{ width: `${busy.percent ?? 30}%` }} />
        </div>
      )}
    </div>
  );
}

/** Asks before switching MySQL, with a backup of every database ticked by default. */
function SwitchConfirm({
  name,
  version,
  onCancel,
  onSwitch,
}: {
  name: string;
  version: string;
  onCancel: () => void;
  onSwitch: () => void;
}) {
  const [backupFirst, setBackupFirst] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setError(null);
    if (backupFirst) {
      setWorking(true);
      try {
        await createBackup(null);
      } catch (e) {
        const text = String(e);
        // Nothing of the user's own to lose: go ahead.
        if (!/no databases of your own/i.test(text)) {
          setWorking(false);
          setError(
            /NOT_CONNECTED|NEEDS_PASSWORD/.test(text)
              ? "NexDB needs to be connected to MySQL to back up. Open the Database page and connect, then try again."
              : `The backup didn't work, so nothing was switched. ${text}`,
          );
          return;
        }
      }
      setWorking(false);
    }
    onSwitch();
  }

  return (
    <div className="ver-confirm" role="group" aria-label={`Switch ${name} to ${version}`}>
      <p>
        <strong>
          Switch {name} to {version}?
        </strong>{" "}
        Your databases stay where they are. {name} stops for a moment and starts again with the new version.
      </p>
      <label className="set-check">
        <input type="checkbox" checked={backupFirst} disabled={working} onChange={(e) => setBackupFirst(e.target.checked)} />
        <span>Back up all my databases first (recommended)</span>
      </label>
      {working && (
        <p className="field-hint" role="status">
          Backing up your databases…
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error} You can also untick the box to switch without a backup.
        </p>
      )}
      <div className="ver-confirm-actions">
        <button className="btn" disabled={working} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={working} onClick={() => void go()}>
          Switch to {version}
        </button>
      </div>
    </div>
  );
}
