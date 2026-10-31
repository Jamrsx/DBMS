import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import {
  dbCreateUser,
  dbDropUser,
  dbGrant,
  dbRevoke,
  dbSetUserPassword,
  dbUsers,
  makePassword,
  type DbUser,
} from "../lib/db";
import { nexCelebrate } from "../lib/nex";

/** MySQL users for this PC: create, password, which databases they can use, remove. */
export function Users({ databases }: { databases: string[] }) {
  const [users, setUsers] = useState<DbUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showOwn, setShowOwn] = useState(false);

  const load = useCallback(() => {
    dbUsers()
      .then(setUsers)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(load, [load]);

  async function act(work: () => Promise<unknown>, done: string, cheer = false) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await work();
      setStatus(done);
      if (cheer) nexCelebrate(done);
      load();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="users">
      <div className="rows-toolbar">
        <span className="field-hint">
          Apps log in to MySQL with a user. Give each project its own user that can only use its own database.
        </span>
        <span className="quickstart-spacer" />
        <button className="btn btn-small btn-primary" onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
          <UserPlus size={13} aria-hidden="true" /> New user
        </button>
      </div>

      {status && (
        <p className="set-ok" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {creating && (
        <NewUser
          databases={databases}
          busy={busy}
          onCancel={() => setCreating(false)}
          onCreate={async (name, password, db) => {
            const ok = await act(
              () => dbCreateUser(name, password, db),
              `User ${name} is ready${db ? ` and can use ${db}` : ""}.`,
              true,
            );
            if (ok) setCreating(false);
          }}
        />
      )}

      {users && (
        <>
          {users.filter((u) => !u.protected).length === 0 ? (
            <p className="lede">No users of your own yet. Make one for each app that needs MySQL.</p>
          ) : (
            <ul className="project-list users-list" aria-label="Your MySQL users">
              {users
                .filter((u) => !u.protected)
                .map((u) => (
                  <UserRow key={u.name} user={u} databases={databases} busy={busy} act={act} />
                ))}
            </ul>
          )}
          <button className="btn btn-small btn-quiet users-own" onClick={() => setShowOwn((v) => !v)} aria-expanded={showOwn}>
            {showOwn ? "Hide" : "Show"} MySQL&apos;s own accounts ({users.filter((u) => u.protected).length})
          </button>
          {showOwn && (
            <ul className="project-list users-list users-own-list" aria-label="MySQL's own accounts">
              {users
                .filter((u) => u.protected)
                .map((u) => (
                  <UserRow key={u.name} user={u} databases={databases} busy={busy} act={act} />
                ))}
            </ul>
          )}
        </>
      )}
      {!users && !error && <p className="lede">Loading…</p>}
    </div>
  );
}

function UserRow({
  user: u,
  databases,
  busy,
  act,
}: {
  user: DbUser;
  databases: string[];
  busy: boolean;
  act: (work: () => Promise<unknown>, done: string, cheer?: boolean) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"password" | "delete" | "allow" | null>(null);
  const [password, setPassword] = useState("");
  const [grantDb, setGrantDb] = useState("");
  const free = databases.filter((d) => !u.databases.includes(d));

  return (
    <li className="user-row">
      <div className="user-main">
        <strong className="user-name">{u.name || "(anonymous)"}</strong>
        {u.protected ? (
          <span className="kind">
            <ShieldCheck size={11} aria-hidden="true" /> MySQL&apos;s own
          </span>
        ) : null}
        <span className="user-dbs">
          {u.everything ? (
            <span className="field-hint">Can use every database</span>
          ) : u.databases.length === 0 ? (
            <span className="field-hint">No databases yet</span>
          ) : (
            u.databases.map((d) => (
              <span key={d} className="chip">
                <code>{d}</code>
                {!u.protected && (
                  <button
                    className="chip-x"
                    disabled={busy}
                    aria-label={`Take away ${d} from ${u.name}`}
                    title={`Take away ${d}`}
                    onClick={() => void act(() => dbRevoke(u.name, d), `${u.name} can't use ${d} any more.`)}
                  >
                    <X size={11} aria-hidden="true" />
                  </button>
                )}
              </span>
            ))
          )}
        </span>
        {!u.protected && free.length > 0 && (
          <button className="chip chip-add" disabled={busy} onClick={() => setMode(mode === "allow" ? null : "allow")}>
            <Plus size={11} aria-hidden="true" /> Database
          </button>
        )}
        {!u.protected && (
          <span className="user-actions">
            <button
              className="btn btn-small btn-icon"
              aria-label={`Change ${u.name}'s password`}
              title="Change password"
              onClick={() => setMode(mode === "password" ? null : "password")}
            >
              <KeyRound size={13} aria-hidden="true" />
            </button>
            <button
              className="btn btn-small btn-icon"
              aria-label={`Delete ${u.name}`}
              title="Delete user"
              onClick={() => setMode(mode === "delete" ? null : "delete")}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>

      {mode === "allow" && (
        <form
          className="user-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (grantDb && (await act(() => dbGrant(u.name, grantDb), `${u.name} can now use ${grantDb}.`))) {
              setGrantDb("");
              setMode(null);
            }
          }}
        >
          <span>Let {u.name} use</span>
          <select className="input" value={grantDb} onChange={(e) => setGrantDb(e.target.value)} autoFocus aria-label="Database">
            <option value="">Pick a database…</option>
            {free.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button className="btn btn-small btn-primary" type="submit" disabled={!grantDb || busy}>
            Allow
          </button>
          <button className="btn btn-small" type="button" onClick={() => setMode(null)}>
            Cancel
          </button>
        </form>
      )}

      {mode === "password" && (
        <form
          className="user-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act(() => dbSetUserPassword(u.name, password), `New password saved for ${u.name}.`)) {
              setMode(null);
            }
          }}
        >
          <input
            className="input input-medium"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            aria-label={`New password for ${u.name}`}
            spellCheck={false}
            autoFocus
          />
          <button className="btn btn-small" type="button" onClick={() => setPassword(makePassword())}>
            Make one
          </button>
          <button className="btn btn-small btn-primary" type="submit" disabled={password.length < 4 || busy}>
            Save
          </button>
          <span className="field-hint">Apps using this user need the new password in their .env too.</span>
        </form>
      )}
      {mode === "delete" && (
        <div className="user-form">
          <span>
            Delete <strong>{u.name}</strong>? Apps that log in with it stop working. Its databases stay.
          </span>
          <button className="btn btn-small" onClick={() => setMode(null)}>
            Keep
          </button>
          <button
            className="btn btn-small btn-danger"
            disabled={busy}
            onClick={() => void act(() => dbDropUser(u.name), `User ${u.name} was deleted.`)}
          >
            Delete user
          </button>
        </div>
      )}
    </li>
  );
}

function NewUser({
  databases,
  busy,
  onCancel,
  onCreate,
}: {
  databases: string[];
  busy: boolean;
  onCancel: () => void;
  onCreate: (name: string, password: string, db: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState(() => makePassword());
  const [db, setDb] = useState("");
  const problem = name && !/^[A-Za-z0-9_.-]{1,32}$/.test(name) ? "Use up to 32 letters, numbers, _ . or -." : null;
  return (
    <form
      className="add-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (name && !problem) onCreate(name, password, db || null);
      }}
    >
      <div className="add-row-fields">
        <label className="field">
          <span className="field-label">User name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value.trim())} autoFocus spellCheck={false} />
          {problem && <span className="field-error">{problem}</span>}
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <span className="user-pass">
            <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} spellCheck={false} />
            <button className="btn btn-small" type="button" onClick={() => setPassword(makePassword())}>
              New
            </button>
          </span>
          <span className="field-hint">Copy it now; MySQL doesn&apos;t show passwords again.</span>
        </label>
        <label className="field">
          <span className="field-label">Can use</span>
          <select className="input" value={db} onChange={(e) => setDb(e.target.value)}>
            <option value="">No database yet</option>
            {databases.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="wizard-actions">
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" type="submit" disabled={!name || !!problem || password.length < 4 || busy}>
          Create user
        </button>
      </div>
    </form>
  );
}
