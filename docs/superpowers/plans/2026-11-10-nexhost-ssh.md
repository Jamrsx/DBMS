# NexHost SSH Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-site SSH/SFTP login for NexHost sites, served by a small SSH server inside NexDB, reachable through the owner's Cloudflare tunnel.

**Architecture:** Pure logic (logins, password hashes, lockout, command checking, logs) lives in a new `nexhost_ssh.rs` with unit tests; a `ssh_server.rs` wraps `russh` + `russh-sftp` on 127.0.0.1:2222 and calls that logic. The UI adds an SSH tab to `SiteDetail` with users, on/off, connect instructions and logs.

**Tech Stack:** Rust (`russh` 0.65, `russh-sftp` 3, `argon2` 0.6, `tokio` from Tauri's runtime, `portable-pty` already used), React + TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-10-nexhost-ssh-design.md`

## Global Constraints

- Listen only on `127.0.0.1:2222`. Never `0.0.0.0`.
- Server runs only while: NexDB open, license has `nexhost`, at least one site has SSH on.
- Login name: `<site>-<name>`; `name` = 1-20 lowercase letters/digits; login max 61 chars.
- Passwords: generated, 24 chars, alphabet of `quickstart::random_password`; stored only as Argon2id PHC hash.
- Lockout: 1 s delay per wrong password; 5 wrong within 10 min locks that login 15 min.
- Roles: `"files"` (default: SFTP + allowed commands) and `"shell"` (full PowerShell in site folder, off until switched on).
- Allowed commands: `php artisan`, `composer`, `git`, `npm`, `npx`, `node`, `ls`, `cat`, `tail`, `mkdir`, `rm`, `pwd`, `exit`. `php` only as `php artisan …`. Arguments that are absolute paths, drive paths, UNC paths or contain `..` are refused.
- Refused SSH features: port forwarding (`-L`/`-R`), agent forwarding, X11.
- Host key: Ed25519, DPAPI-protected at `<root>\nexhost\.ssh\host_key`; fingerprint shown as `SHA256:…`.
- Log: `<root>\nexhost\.ssh\log.jsonl`, entries older than 30 days dropped on write; panel shows last 100.
- Panel warning text (exact): `Anyone who can change this site's files can run code on this PC through the site's PHP. Only give SSH to people you trust.`
- Plain language everywhere; Nex tour + Help topic (memory rules). Version stays 0.5.5 (unreleased).

## Review Focus

1. A login for site A must never read or write site B or anything outside A's folder, through SFTP or commands (`../`, `C:\`, `\\server`, symlinks). Tests in Task 2 and Task 4.
2. A disabled user, a deleted user, a site with SSH off, or a license without `nexhost` must be refused at login, and an open session must end when that changes. Tests in Task 1 and Task 5.
3. Wrong-password floods: the 6th try within 10 minutes is refused even with the right password, and the lock lifts after 15 minutes. Test in Task 1.
4. `php -r`, `php file.php`, `git -C C:\`, `npm --prefix C:\` must be refused for `files` users. Test in Task 2.
5. Port-forward and agent-forward requests get refused without crashing the server. Test in Task 4.

---

### Task 1: Logins, passwords and lockout

**Files:**
- Create: `app/src-tauri/src/nexhost_ssh.rs` (register `mod nexhost_ssh;` in `lib.rs`)
- Modify: `app/src-tauri/src/nexhost.rs` (`NexSite` gains `#[serde(default)] pub ssh: SiteSsh`)
- Modify: `app/src-tauri/Cargo.toml` (`argon2 = "0.6"`)

**Interfaces:**
- Produces:
  - `#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)] pub struct SiteSsh { pub on: bool, pub users: Vec<SshUser> }`
  - `#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)] pub struct SshUser { pub name: String, pub login: String, pub hash: String, pub role: String /* "files"|"shell" */, pub enabled: bool, pub created_at: i64 }`
  - `pub fn valid_user_name(name: &str) -> Result<(), String>`
  - `pub fn login_for(site: &str, name: &str) -> String`
  - `pub fn hash_password(pw: &str) -> Result<String, String>`; `pub fn check_password(hash: &str, pw: &str) -> bool`
  - `pub fn new_user(site: &str, name: &str, existing: &[SshUser], now: i64) -> Result<(SshUser, String /* password */), String>`
  - `pub struct Lockout` with `pub fn new() -> Self`, `pub fn allowed(&self, login: &str, now: i64) -> bool`, `pub fn failed(&self, login: &str, now: i64)`, `pub fn succeeded(&self, login: &str)`
  - `pub enum Who { Ok { site: String, user: SshUser }, Refused(&'static str) }`
  - `pub fn authenticate(sites: &BTreeMap<String, NexSite>, has_nexhost: bool, login: &str, password: &str) -> Who`

- [ ] **Step 1: Failing tests** in `nexhost_ssh.rs`:

```rust
#[test] fn user_names_and_logins() {
    assert!(valid_user_name("maria").is_ok());
    for bad in ["", "Maria", "ma ria", "a-b", &"a".repeat(21)] { assert!(valid_user_name(bad).is_err(), "{bad}"); }
    assert_eq!(login_for("shop", "maria"), "shop-maria");
}
#[test] fn passwords_are_hashed_and_checked() {
    let h = hash_password("s3cret").unwrap();
    assert!(h.starts_with("$argon2id$") && !h.contains("s3cret"));
    assert!(check_password(&h, "s3cret") && !check_password(&h, "nope"));
}
#[test] fn new_user_gets_a_strong_password_once() {
    let (u, pw) = new_user("shop", "maria", &[], 1).unwrap();
    assert_eq!((u.login.as_str(), u.role.as_str(), u.enabled), ("shop-maria", "files", true));
    assert_eq!(pw.len(), 24);
    assert!(new_user("shop", "maria", &[u], 2).is_err(), "same name twice");
}
#[test] fn login_needs_site_on_user_enabled_and_licence() { /* builds sites map: refuse when ssh.on false, user disabled, wrong password, unknown login, has_nexhost false; Ok otherwise; Ok carries site "shop" */ }
#[test] fn five_wrong_tries_lock_for_fifteen_minutes() {
    let l = Lockout::new();
    for i in 0..5 { assert!(l.allowed("shop-maria", 100 + i)); l.failed("shop-maria", 100 + i); }
    assert!(!l.allowed("shop-maria", 110));
    assert!(l.allowed("shop-maria", 110 + 15 * 60));
    assert!(l.allowed("shop-other", 110), "other logins unaffected");
}
```

- [ ] **Step 2: Run** `cargo test --lib nexhost_ssh`. Expected: FAIL (not defined).
- [ ] **Step 3: Implement.** `new_user` uses `quickstart::random_password()` truncated/kept at 24 chars; `authenticate` finds the site whose `ssh.users` has the login (the prefix before the last `-` is not trusted; search all sites).
- [ ] **Step 4: Run**, expect pass. Fix any `NexSite { .. }` literal in existing tests (`..Default::default()` already covers it).
- [ ] **Step 5: Commit** `feat: NexHost SSH logins, hashed passwords and lockout`.

### Task 2: Allowed commands

**Files:**
- Modify: `app/src-tauri/src/nexhost_ssh.rs`

**Interfaces:**
- Produces:
  - `pub fn split_args(line: &str) -> Result<Vec<String>, String>` (spaces, double and single quotes; no `|`, `>`, `<`, `&`, `;`, backticks or `$(`: refused with a plain message)
  - `pub fn check_command(args: &[String]) -> Result<(), String>`

- [ ] **Step 1: Failing tests**:

```rust
#[test] fn allowed_commands_pass() {
    for ok in ["php artisan migrate", "composer install", "git pull", "npm run build", "ls", "cat .env", "tail -n 50 storage/logs/laravel.log", "mkdir uploads", "rm old.txt", "pwd"] {
        assert!(check_command(&split_args(ok).unwrap()).is_ok(), "{ok}");
    }
}
#[test] fn escapes_are_refused() {
    for bad in ["php -r 'echo 1;'", "php x.php", "powershell", "cmd /c dir", "git -C C:\\ status", "npm --prefix ..\\x i", "cat ../../secret", "ls C:/", "cat \\\\server\\x", "rm -rf /"] {
        assert!(split_args(bad).and_then(|a| check_command(&a)).is_err(), "{bad}");
    }
    assert!(split_args("ls | more").is_err());
    assert!(split_args("git pull; calc").is_err());
}
```

- [ ] **Step 2: Run**, expect FAIL. **Step 3: Implement** (`rm -rf /` refused because `/` is absolute). **Step 4: Run**, expect pass.
- [ ] **Step 5: Commit** `feat: NexHost SSH allowed commands`.

### Task 3: Host key and log

**Files:**
- Modify: `app/src-tauri/src/nexhost_ssh.rs`; `Cargo.toml` (`russh = "0.65"` brings `russh::keys`)

**Interfaces:**
- Produces:
  - `pub fn host_key(root: &Path) -> Result<russh::keys::PrivateKey, String>` (creates once; DPAPI via `license::dpapi`)
  - `pub fn fingerprint(key: &russh::keys::PrivateKey) -> String` (`SHA256:...`)
  - `#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)] pub struct LogEntry { pub at: i64, pub login: String, pub site: String, pub from: Option<String>, pub event: String /* login_ok|login_failed|locked|command|sftp_write|sftp_delete */, pub detail: Option<String> }`
  - `pub fn log(root: &Path, e: &LogEntry)`; `pub fn recent(root: &Path, site: &str, limit: usize) -> Vec<LogEntry>` (newest first)

- [ ] **Step 1: Failing tests**: host key made once (same fingerprint on second call, file not plain); `recent` filters by site, newest first, limit honoured; entries older than 30 days are dropped on the next `log`.
- [ ] **Step 2: Run**, FAIL. **Step 3: Implement.** **Step 4: Run**, pass.
- [ ] **Step 5: Commit** `feat: NexHost SSH host key and login log`.

### Task 4: The SSH server

**Files:**
- Create: `app/src-tauri/src/ssh_server.rs` (register mod); `Cargo.toml` (`russh-sftp = "3"`, `tokio = { version = "1", features = ["net", "sync", "rt", "macros", "io-util"] }`)

**Interfaces:**
- Consumes: Task 1-3 functions; `nexhost::safe_join`, `nexhost::dir`; `terminal::tool_dirs`, `terminal::path_with`; `license::has_feature`.
- Produces:
  - `pub const PORT: u16 = 2222;`
  - `pub struct SshServer` with `pub async fn start(root: PathBuf, sites: Arc<RwLock<BTreeMap<String, NexSite>>>, tool_path: String) -> Result<SshServer, String>` and `pub fn stop(self)`
  - `pub static SERVER: Mutex<Option<SshServer>>`
  - Behaviour: password auth only (`auth_password`), via `Lockout` + `authenticate`; every other auth method refused. `exec` and `shell` requests: `files` role → line shell / single command checked by `check_command`, run with `std::process::Command` in the site folder, PATH = `tool_path`, output streamed, exit status sent; `shell` role → PowerShell in a `portable-pty` PTY in the site folder. `subsystem "sftp"` → `russh-sftp` handler whose every path goes through `safe_join(site_dir, ..)` and refuses symlinks (`symlink_metadata`). `tcpip_forward`, `channel_open_direct_tcpip`, agent and x11 requests return false. Each login/command/SFTP write/delete is logged.
  - Before each command and SFTP write the session re-checks `authenticate`-level state (site on, user enabled, license) and closes the channel when it no longer holds.

- [ ] **Step 1: Failing tests** (integration, `#[tokio::test]`, using `russh` client against `SshServer::start` on a temp root with port override `SshServer::start_on(0, ..)`):
  - `password_login_and_command`: login `shop-maria` with the right password, run `pwd`, output ends with `nexhost\shop`.
  - `wrong_password_is_refused`, `disabled_user_is_refused`.
  - `sftp_stays_in_the_site`: SFTP `open("../other/x")` fails; `write("index.php")` lands in the site.
  - `forwarding_is_refused`: `channel_open_direct_tcpip` returns an error, server still accepts a new login after.
  - `site_turned_off_ends_session`: set `on=false` in the shared map, next command fails.
- [ ] **Step 2: Run** `cargo test --lib ssh_server`, FAIL. **Step 3: Implement.** **Step 4: Run**, pass; `cargo build` clean.
- [ ] **Step 5: Commit** `feat: SSH server inside NexDB for NexHost sites`.

### Task 5: Commands and life cycle

**Files:**
- Modify: `app/src-tauri/src/lib.rs`

**Interfaces:**
- Produces Tauri commands (each starts with `license::require_feature("nexhost")?`):
  `nexhost_ssh_info(name) -> SshInfo { on, users: Vec<{name, login, role, enabled, created_at}>, port: 2222, fingerprint, running: bool }`,
  `nexhost_ssh_set(name, on: bool) -> SshInfo`, `nexhost_ssh_add_user(name, user) -> { info: SshInfo, password: String }`,
  `nexhost_ssh_reset(name, user) -> { info, password }`, `nexhost_ssh_user_set(name, user, enabled: Option<bool>, role: Option<String>) -> SshInfo`,
  `nexhost_ssh_delete_user(name, user) -> SshInfo`, `nexhost_ssh_log(name) -> Vec<LogEntry>`.
- `fn sync_ssh(app)`: starts the server when any site has `ssh.on` and the license has `nexhost`, stops it otherwise; called after every change above, at startup (after `restore_nexhost`), and from `lose_nexhost`.

- [ ] **Step 1: Failing test** for the pure decision `fn ssh_should_run(sites, has_nexhost) -> bool` (false with no site on, false without licence, true otherwise).
- [ ] **Step 2: Run**, FAIL. **Step 3: Implement** commands + `sync_ssh`; role `"shell"` accepted only with an explicit `role` argument (never default). **Step 4: Run** `cargo test --lib`, pass; `cargo build` clean.
- [ ] **Step 5: Commit** `feat: NexHost SSH commands; server starts and stops with the sites`.

### Task 6: SSH tab, instructions, tour, help

**Files:**
- Create: `app/src/nexhost/SshCard.tsx`
- Modify: `app/src/lib/nexhost.ts` (wrappers + demo data), `app/src/nexhost/SiteDetail.tsx` (tab `"ssh"` label `SSH` after Database), `app/src/styles.css`, `app/src/components/whatsNew.ts` (tour steps: open SSH tab, switch on, add user, Copy instructions), `app/src/help/HelpPage.tsx` (topic "Connect to a site with SSH"), `app/src/lib/changelog.ts` (0.5.5 line).
- Content of SshCard:
  - On/Off switch; the exact warning line (Global Constraints); running/stopped status.
  - Users table: login, role (Files and site commands / Full shell), on/off, Reset password, Delete (confirm). Add user form (name). After add/reset: password shown once with Copy and "It won't be shown again."
  - Full shell switch per user shows a confirm: "Full shell can reach this whole PC. Turn it on for <login>?".
  - **How to connect from another PC**: the six steps from the spec with the site's SSH address (from Settings → NexHost connection domain: `ssh.<domain>`, editable field) and the login filled in; each command with Copy; fingerprint shown. Per-user **Copy instructions** copies the same steps as plain text without the password.
  - Cloudflare setup box: add public hostname type SSH `ssh.<domain>` → `ssh://localhost:2222`.
  - Recent activity list (last 100 from `nexhost_ssh_log`).

- [ ] **Step 1:** Build. **Step 2: Run** `npx tsc --noEmit`, clean. **Step 3: Check in the preview** (`?view=nexhost&license=nexhost`, SSH tab, demo data): add user shows password once, Copy instructions text contains the login and not the password. One screenshot.
- [ ] **Step 4: Commit** `feat: NexHost SSH tab with connect instructions`.
