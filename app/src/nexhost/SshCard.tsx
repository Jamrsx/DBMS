import { useEffect, useState } from "react";
import { KeyRound, ShieldAlert, Terminal, TriangleAlert } from "lucide-react";
import { CopyButton } from "../components/CopyButton";
import { fixedLinkInfo } from "../lib/share";
import {
  connectInstructions,
  installCommand,
  sshCommand,
  sshAddUser,
  sshDeleteUser,
  sshInfo,
  sshLog,
  sshReset,
  sshSet,
  sshUserSet,
  type ConnectOs,
  type Site,
  type SshInfo,
  type SshLog,
} from "../lib/nexhost";

const WARNING = "Anyone who can change this site's files can run code on this PC through the site's PHP. Only give SSH to people you trust.";
const HOST_KEY = "nexdb.sshHost";
const EVENT_TEXT: Record<SshLog["event"], string> = {
  login_ok: "Signed in",
  login_failed: "Wrong password",
  locked: "Locked after wrong passwords",
  command: "Ran",
  sftp_write: "Changed file",
  sftp_delete: "Deleted",
};

function savedHost(): string {
  try {
    return localStorage.getItem(HOST_KEY) ?? "";
  } catch {
    return "";
  }
}

/** The site's SSH: on/off, logins, how to connect from another PC, and recent activity. */
export function SshCard({ site }: { site: Site }) {
  const [info, setInfo] = useState<SshInfo | null>(null);
  const [log, setLog] = useState<SshLog[]>([]);
  const [host, setHost] = useState(savedHost);
  const [newUser, setNewUser] = useState("");
  const [shown, setShown] = useState<{ login: string; password: string } | null>(null);
  const [os, setOs] = useState<ConnectOs>("windows");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    sshInfo(site.name)
      .then(setInfo)
      .catch((e) => setMsg({ ok: false, text: String(e) }));
    sshLog(site.name)
      .then(setLog)
      .catch(() => {});
    if (!savedHost())
      fixedLinkInfo()
        .then((f) => f.provider === "cloudflare" && f.address && setHost(`ssh.${f.address}`))
        .catch(() => {});
  }, [site.name]);

  const saveHost = (h: string) => {
    setHost(h);
    try {
      localStorage.setItem(HOST_KEY, h);
    } catch {
      // Only a convenience.
    }
  };
  const act = (p: Promise<SshInfo>, done?: string) =>
    p
      .then((i) => {
        setInfo(i);
        if (done) setMsg({ ok: true, text: done });
      })
      .catch((e) => setMsg({ ok: false, text: String(e) }));
  const addressFor = host || "ssh.yourdomain.com";

  if (!info) return <section className="set-card">{msg ? <p className="field-error">{msg.text}</p> : <p role="status">Loading…</p>}</section>;

  return (
    <section className="nh-ssh" data-guide="nexhost-ssh">
      <div className="set-card">
        <div className="nh-ssh-head">
          <h2>
            <Terminal size={16} aria-hidden="true" /> SSH access
          </h2>
          <label className="check-row" data-guide="nexhost-ssh-switch">
            <input type="checkbox" checked={info.on} onChange={(e) => act(sshSet(site.name, e.target.checked), e.target.checked ? "SSH is on for this site." : "SSH is off for this site.")} />
            {info.on ? "On" : "Off"}
          </label>
        </div>
        <p className="nh-ssh-warn">
          <ShieldAlert size={14} aria-hidden="true" /> {WARNING}
        </p>
        <p className="field-hint">
          {info.running ? "NexDB's SSH server is running on this PC (port 2222)." : "NexDB's SSH server is stopped. It starts when a site has SSH on."} Server fingerprint:{" "}
          <code>{info.fingerprint || "made when SSH first starts"}</code>
        </p>
      </div>

      <div className="set-card">
        <h2>
          <KeyRound size={16} aria-hidden="true" /> Logins
        </h2>
        {info.users.length === 0 ? (
          <p className="set-lede">No logins yet. Add one for each person who needs SSH.</p>
        ) : (
          <table className="nh-table nh-ssh-users">
            <thead>
              <tr>
                <th>Login</th>
                <th>Can do</th>
                <th>On</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {info.users.map((u) => (
                <tr key={u.name}>
                  <td>
                    <code>{u.login}</code>
                  </td>
                  <td>
                    <select
                      value={u.role}
                      aria-label={`What ${u.login} can do`}
                      onChange={(e) => {
                        const role = e.target.value as "files" | "shell";
                        if (role === "shell" && !window.confirm(`Full shell can reach this whole PC. Turn it on for ${u.login}?`)) return;
                        act(sshUserSet(site.name, u.name, { role }), role === "shell" ? `${u.login} has a full shell now.` : `${u.login} can use files and site commands.`);
                      }}
                    >
                      <option value="files">Files and site commands</option>
                      <option value="shell">Full shell</option>
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" checked={u.enabled} aria-label={`${u.login} on`} onChange={(e) => act(sshUserSet(site.name, u.name, { enabled: e.target.checked }))} />
                  </td>
                  <td className="nh-actions">
                    <CopyButton text={connectInstructions(u.login, addressFor, info.fingerprint)} label="Copy instructions" />
                    <button
                      className="btn btn-small"
                      onClick={() =>
                        sshReset(site.name, u.name)
                          .then((r) => {
                            setInfo(r.info);
                            setShown({ login: u.login, password: r.password });
                          })
                          .catch((e) => setMsg({ ok: false, text: String(e) }))
                      }
                    >
                      Reset password
                    </button>
                    {confirm === u.name ? (
                      <button className="btn btn-small btn-danger" onClick={() => act(sshDeleteUser(site.name, u.name), `Deleted ${u.login}.`).finally(() => setConfirm(null))}>
                        Yes, delete
                      </button>
                    ) : (
                      <button className="btn btn-small btn-quiet" onClick={() => setConfirm(u.name)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form
          className="nh-ssh-add"
          onSubmit={(e) => {
            e.preventDefault();
            sshAddUser(site.name, newUser.trim())
              .then((r) => {
                setInfo(r.info);
                setShown({ login: `${site.name}-${newUser.trim()}`, password: r.password });
                setNewUser("");
              })
              .catch((err) => setMsg({ ok: false, text: String(err) }));
          }}
        >
          <label className="field">
            <span className="field-label">New login</span>
            <input value={newUser} onChange={(e) => setNewUser(e.target.value.toLowerCase())} placeholder="maria" spellCheck={false} data-guide="nexhost-ssh-add" />
            <span className="field-hint">The login becomes {site.name}-{newUser || "maria"}. NexDB makes a strong password for it.</span>
          </label>
          <div className="nh-buttons">
            <button className="btn btn-primary" disabled={!newUser.trim()}>
              Add login
            </button>
          </div>
        </form>
        {shown && (
          <div className="nh-ssh-pw" role="status">
            <p>
              Password for <code>{shown.login}</code>: <code>{shown.password}</code> <CopyButton text={shown.password} label="Copy password" />
            </p>
            <p className="field-hint">It won't be shown again. Send it separately from the instructions.</p>
            <button className="btn btn-small btn-quiet" onClick={() => setShown(null)}>
              I saved it
            </button>
          </div>
        )}
        {msg && (
          <p className={msg.ok ? "set-ok" : "field-error"} role="status">
            {msg.text}
          </p>
        )}
      </div>

      <div className="set-card" data-guide="nexhost-ssh-connect">
        <h2>Connect from another PC</h2>
        <p className="set-lede">Follow these on the computer that connects. Steps 1 to 3 are needed only once.</p>

        <div className="nh-steps">
          <section className="nh-step">
            <span className="nh-step-num" aria-hidden="true">1</span>
            <div className="nh-step-body">
              <h3>Give this PC an SSH address</h3>
              <p className="field-hint">
                On this PC, in Cloudflare: add a public hostname of type <strong>SSH</strong> that points{" "}
                <code>{addressFor}</code> to <code>ssh://localhost:2222</code>. Then type the address here.
              </p>
              <label className="field">
                <span className="field-label">SSH address</span>
                <input value={host} onChange={(e) => saveHost(e.target.value.trim())} placeholder="ssh.yourdomain.com" spellCheck={false} />
              </label>
            </div>
          </section>

          <section className="nh-step">
            <span className="nh-step-num" aria-hidden="true">2</span>
            <div className="nh-step-body">
              <h3>Install Cloudflare's connector on their computer</h3>
              <div className="log-tabs" role="tablist" aria-label="Their computer">
                {(
                  [
                    ["windows", "Windows"],
                    ["mac", "macOS"],
                    ["linux", "Linux"],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} role="tab" className="log-tab" aria-selected={os === id} onClick={() => setOs(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {installCommand(os) ? (
                <>
                  <p className="field-hint">Open {os === "windows" ? "PowerShell" : "Terminal"} and run:</p>
                  <div className="nh-ssh-cmd">
                    <code>{installCommand(os)}</code>
                    <CopyButton text={installCommand(os)!} label="Copy command" />
                  </div>
                </>
              ) : (
                <p className="field-hint">Download cloudflared for your Linux from Cloudflare's downloads page and install it.</p>
              )}
            </div>
          </section>

          <section className="nh-step">
            <span className="nh-step-num" aria-hidden="true">3</span>
            <div className="nh-step-body">
              <h3>Check SSH is there</h3>
              <p className="field-hint">Windows 10/11, macOS and Linux include it. This should print a version:</p>
              <div className="nh-ssh-cmd">
                <code>ssh -V</code>
                <CopyButton text="ssh -V" label="Copy command" />
              </div>
            </div>
          </section>

          <section className="nh-step">
            <span className="nh-step-num" aria-hidden="true">4</span>
            <div className="nh-step-body">
              <h3>Sign in</h3>
              <p className="field-hint">Run the line for your login, then type the password you were given.</p>
              {(info.users.length ? info.users : [{ login: `${site.name}-maria`, name: "example" }]).map((u) => {
                const cmd = sshCommand(u.login, addressFor);
                return (
                  <div key={u.login} className="nh-ssh-cmd">
                    <code>{cmd}</code>
                    <CopyButton text={cmd} label="Copy command" />
                  </div>
                );
              })}
              <p className="field-hint">
                The first time, SSH shows a fingerprint. Answer <strong>yes</strong> only if it matches:{" "}
                <code>{info.fingerprint || "shown once SSH starts"}</code>
              </p>
            </div>
          </section>
        </div>

        <div className="nh-more">
          <details>
            <summary>Easier next time: just type ssh {site.name}</summary>
            <p className="field-hint">
              Copy the <code>~/.ssh/config</code> lines from <strong>Copy instructions</strong> into that file on their computer.
            </p>
          </details>
          <details>
            <summary>Edit files with WinSCP, FileZilla or VS Code</summary>
            <p className="field-hint">Run this and keep the window open:</p>
            <div className="nh-ssh-cmd">
              <code>{`cloudflared access tcp --hostname ${addressFor} --url localhost:2222`}</code>
              <CopyButton text={`cloudflared access tcp --hostname ${addressFor} --url localhost:2222`} label="Copy command" />
            </div>
            <p className="field-hint">
              Then connect with SFTP to <code>localhost</code>, port <code>2222</code>, with the same login and password.
            </p>
          </details>
          <details>
            <summary>Not connecting?</summary>
            <ul className="field-hint nh-ssh-steps">
              <li>This PC must be on, with NexDB open and SSH turned on above.</li>
              <li>"Locked" means too many wrong passwords: wait 15 minutes, or reset the password above.</li>
              <li>Check the SSH address matches the hostname you added in Cloudflare.</li>
            </ul>
          </details>
        </div>
      </div>

      <div className="set-card">
        <h2>Recent activity</h2>
        {log.length === 0 ? (
          <p className="set-lede">Nobody has used SSH on this site yet.</p>
        ) : (
          <ul className="nh-ssh-log">
            {log.map((e, i) => (
              <li key={i} className={e.event === "login_failed" || e.event === "locked" ? "bad" : undefined}>
                {e.event === "login_failed" || e.event === "locked" ? <TriangleAlert size={13} aria-hidden="true" /> : null}
                <span className="nh-ssh-when">{new Date(e.at * 1000).toLocaleString()}</span>
                <code>{e.login}</code> {EVENT_TEXT[e.event]} {e.detail && e.event !== "login_failed" ? <code>{e.detail}</code> : null}
                {e.from && <span className="nh-ssh-from"> · from {e.from}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
