import { useCallback, useEffect, useState } from "react";
import { Archive, FileUp, FolderOpen, RotateCcw, Trash2 } from "lucide-react";
import {
  createBackup,
  deleteBackup,
  formatWhen,
  importSqlFile,
  listBackups,
  nameFromFile,
  openBackupsFolder,
  pickSqlFile,
  restoreBackup,
  type BackupFile,
} from "../lib/backups";
import { dbNameProblem, formatSize } from "../lib/db";
import { Nex } from "../components/Nex";
import { nexCelebrate } from "../lib/nex";

type Pending =
  | { kind: "restore"; file: BackupFile; target: string }
  | { kind: "import"; path: string; target: string }
  | { kind: "delete"; file: BackupFile }
  | null;

/** Backups tab: make, restore, import and remove `.sql` backups. */
export function Backups({
  selected,
  databases,
  onChanged,
}: {
  selected: string | null;
  databases: string[];
  onChanged: () => void;
}) {
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const load = useCallback(() => {
    listBackups()
      .then(setFiles)
      .catch((e) => setMessage({ ok: false, text: String(e) }));
  }, []);

  useEffect(load, [load]);

  async function act(label: string, work: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    try {
      const text = await work();
      setMessage({ ok: true, text });
      nexCelebrate(text);
      setPending(null);
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: String(e) });
    } finally {
      setBusy(null);
      load();
    }
  }

  const backUp = (name: string | null) =>
    act(name ? `Backing up ${name}…` : "Backing up all your databases…", async () => {
      const made = await createBackup(name);
      return made.length === 1
        ? `Backed up ${made[0].database ?? made[0].name} (${formatSize(made[0].size_bytes)}).`
        : `Backed up ${made.length} databases.`;
    });

  async function chooseFile() {
    setMessage(null);
    const path = await pickSqlFile().catch((e) => {
      setMessage({ ok: false, text: String(e) });
      return null;
    });
    // Default to a new database named after the file, so nothing is replaced by accident.
    if (path) setPending({ kind: "import", path, target: nameFromFile(path) });
  }

  const exists = (name: string) => databases.some((d) => d.toLowerCase() === name.toLowerCase());

  return (
    <div className="backups">
      <p className="field-hint backups-lede">
        A backup is a .sql file with your tables and data. Keep one before big changes, and to move a database to
        another PC.
      </p>

      <div className="backups-actions">
        {selected && (
          <button className="btn btn-primary" disabled={!!busy} onClick={() => backUp(selected)}>
            <Archive size={14} aria-hidden="true" /> Back up {selected}
          </button>
        )}
        <button className={selected ? "btn" : "btn btn-primary"} disabled={!!busy} onClick={() => backUp(null)}>
          <Archive size={14} aria-hidden="true" /> Back up all my databases
        </button>
        <button className="btn" disabled={!!busy} onClick={chooseFile}>
          <FileUp size={14} aria-hidden="true" /> Import a .sql file…
        </button>
        <button className="btn" onClick={() => openBackupsFolder().catch((e) => setMessage({ ok: false, text: String(e) }))}>
          <FolderOpen size={14} aria-hidden="true" /> Open backups folder
        </button>
      </div>

      {busy && (
        <p className="field-hint" role="status">
          {busy} This can take a while for big databases.
        </p>
      )}
      {message && (
        <p className={message.ok ? "set-ok backups-msg" : "field-error"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      )}

      {pending && pending.kind !== "delete" && (
        <TargetForm
          title={
            pending.kind === "restore"
              ? `Restore ${pending.file.name}`
              : `Import ${pending.path.split(/[\\/]/).pop()}`
          }
          target={pending.target}
          exists={exists}
          busy={!!busy}
          onTarget={(target) => setPending({ ...pending, target })}
          onCancel={() => setPending(null)}
          onConfirm={() =>
            pending.kind === "restore"
              ? act(`Restoring into ${pending.target}…`, async () => {
                  await restoreBackup(pending.file.name, pending.target);
                  return `Restored into ${pending.target}.`;
                })
              : act(`Importing into ${pending.target}…`, async () => {
                  await importSqlFile(pending.path, pending.target);
                  return `Imported into ${pending.target}.`;
                })
          }
        />
      )}

      {files && files.length === 0 && (
        <div className="empty empty-nex">
          <Nex state="idle" size={96} />
          <p className="lede">No backups yet. Back up a database to make your first one.</p>
        </div>
      )}

      {files && files.length > 0 && (
        <table className="data-table backups-table">
          <thead>
            <tr>
              <th>Database</th>
              <th>Made</th>
              <th className="num">Size</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.name}>
                <td title={f.name}>
                  {f.database ?? f.name}
                  {f.auto && (
                    <span className="kind tag-auto" title="Made by the automatic schedule in Settings">
                      Automatic
                    </span>
                  )}
                </td>
                <td>{formatWhen(f.created)}</td>
                <td className="num">{formatSize(f.size_bytes)}</td>
                <td className="backups-row-actions">
                  {pending?.kind === "delete" && pending.file.name === f.name ? (
                    <>
                      <span className="field-hint">Delete this backup?</span>
                      <button className="btn btn-small" onClick={() => setPending(null)}>
                        Keep it
                      </button>
                      <button
                        className="btn btn-small btn-danger"
                        disabled={!!busy}
                        onClick={() =>
                          act("Deleting…", async () => {
                            await deleteBackup(f.name);
                            return "The backup was deleted.";
                          })
                        }
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-small"
                        disabled={!!busy}
                        onClick={() => setPending({ kind: "restore", file: f, target: f.database ?? selected ?? nameFromFile(f.name) })}
                      >
                        <RotateCcw size={13} aria-hidden="true" /> Restore…
                      </button>
                      <button
                        className="btn btn-small"
                        disabled={!!busy}
                        aria-label={`Delete backup ${f.name}`}
                        title="Delete this backup"
                        onClick={() => setPending({ kind: "delete", file: f })}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TargetForm({
  title,
  target,
  exists,
  busy,
  onTarget,
  onCancel,
  onConfirm,
}: {
  title: string;
  target: string;
  exists: (name: string) => boolean;
  busy: boolean;
  onTarget: (t: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // An existing name is fine here: it is restored into, not created.
  const problem = target ? dbNameProblem(target, []) : "Type a database name.";
  const into = target && !problem && exists(target);
  return (
    <form
      className="new-project backups-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) onConfirm();
      }}
    >
      <strong className="backups-form-title">{title}</strong>
      <label className="field">
        <span className="field-label">Into database</span>
        <input className="input" value={target} onChange={(e) => onTarget(e.target.value.trim())} spellCheck={false} autoFocus />
        <span className={problem ? "field-error" : into ? "field-warn" : "field-hint"}>
          {problem ??
            (into
              ? `${target} already exists. Tables with the same names are replaced by the ones in the file.`
              : `A new database named ${target} is created.`)}
        </span>
      </label>
      <div className="backups-form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!!problem || busy}>
          {into ? "Replace and restore" : "Restore"}
        </button>
      </div>
    </form>
  );
}
