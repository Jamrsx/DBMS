# NexHost SSH design

Date: 2026-11-10. Status: draft, waiting for the owner's approval.

## Why

People hosting a test site with NexHost (4-year plan) want hosting-style SSH: log in from
another computer to manage the site's files and run its tools (`php artisan`, `composer`, `git`,
`npm`), the way Hostinger offers SSH on a plan.

## Decisions (owner)

- The SSH server is **inside NexDB**, not Windows' OpenSSH: it only knows NexHost sites and
  runs only while NexDB is open. It never logs anyone into the whole Windows account.
- Access is **per site** with a **user name and password made in NexHost** and saved there.
- SSH can be **turned on and off** (per site).
- Only people the owner trusts get access: anyone who can change a site's files can run code on
  this PC through the site's own PHP (said plainly in the panel).

## Goals

- A **SSH** tab on each NexHost site:
  - On / Off switch (off by default).
  - **Add user**: name (e.g. `maria`). NexDB makes the login `<site>-<name>` (e.g.
    `shop-maria`) and a generated password, shown once with Copy. Reset password, turn a user
    off, delete a user.
  - What each user may do: **Files and site commands** (default) or **Full shell** (owner
    only, off until switched on, with a warning).
  - **How to connect** box with the exact commands to copy (below).
  - **Recent logins and commands** (who, when, from where, what ran).
- SFTP for files (FileZilla, WinSCP, VS Code SFTP extensions work).
- Commands run in the site's folder with NexDB's PHP, Composer, Node and Git.

## Non-goals

- Windows OpenSSH, Windows accounts, admin rights.
- ngrok (its free plan can't carry SSH). Cloudflare only.
- Port forwarding, SSH tunnels through NexDB (`-L` / `-R`), agent forwarding, X11: all refused.
- Key login in the first version (can come later; passwords are generated, so they can't be
  guessed).

## How it works

### Server

- Rust SSH server inside the app (`russh` + `russh-sftp` crates), listening on
  **127.0.0.1:2222** only, started when at least one site has SSH on and the license includes
  `nexhost`; stopped when none has, or the license loses it (same hook as Go live).
- Host key: one Ed25519 key made on first start, kept DPAPI-protected in
  `<root>\nexhost\.ssh\host_key`; its fingerprint shown in the panel so people can check it.

### Users and passwords

- Stored in settings per site: `ssh: { on, users: [{ name, login, hash, role, enabled,
  created_at }] }`. Passwords are never stored, only an Argon2id hash.
- Generated passwords: 24 letters and digits (same alphabet as database passwords).
- Wrong password: 1 second delay; 5 wrong in 10 minutes locks that login for 15 minutes; all
  attempts are logged.

### What a login can do

- **Files and site commands** (default):
  - SFTP rooted at the site folder (paths checked with `nexhost::safe_join`; links refused).
  - Commands: `php artisan …`, `composer …`, `git …`, `npm …`, `npx …`, `node …`, `ls`,
    `cat`, `tail`, `mkdir`, `rm` (inside the site), `pwd`, `exit`; run in the site folder with
    NexDB's tools on PATH; arguments that are absolute paths or contain `..` refused. A small
    line-based shell (prompt `shop$`) offers these; anything else says what is allowed.
  - The panel says plainly: this prevents mistakes, not a determined person, because site code
    runs as this PC's user.
- **Full shell** (owner only): PowerShell in the site folder, like Terminal here. Off until
  switched on per user, with a warning.

### Reaching it from outside (Cloudflare)

- In the Cloudflare tunnel the owner adds a public hostname of type **SSH**, e.g.
  `ssh.myshop.com` → `ssh://localhost:2222`. The panel shows these steps.
- People connecting install `cloudflared` once and log in with:
  `ssh -o ProxyCommand="cloudflared access ssh --hostname %h" shop-maria@ssh.myshop.com`
  and SFTP with the same ProxyCommand. The panel shows both, with the login filled in, plus an
  `~/.ssh/config` block to copy.
- One SSH address serves every site: the login (`shop-maria`) says which site.

### Logs

- `<root>\nexhost\.ssh\log.jsonl`: time, login, site, remote address (from Cloudflare), event
  (login ok, login failed, locked, command, SFTP write/delete), kept 30 days. The panel shows the
  last 100.

## Help and tour

- Nex tour (practice mode, fake site and users): turn SSH on, add a user, copy the password,
  copy the connect command.
- Help topic: setting up the Cloudflare SSH hostname and connecting from another computer.

## Left to the builder

- Exact `russh` / `russh-sftp` versions and wiring.
- Line shell details (history, Ctrl+C), how command output streams.
- Log rotation details.

## Open

- None for SSH. The visual "connect the parts" diagram is a separate design, next.
