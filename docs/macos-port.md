# NexDB for Mac — port plan

Status: plan only (2026-11-15). Nothing here is built or tested on a real Mac yet.

> **Update 2026-11-15: the floor is now macOS 13 Ventura**, chosen by the user (test Mac: MacBook
> Air 2018, Intel i5, macOS 14.8.9). Where this document says macOS 12 / 12.0, read 13 / 13.0.
> Node 24 and 26 still need 13.5 and are offered only on Macs that new (`min_macos` in the catalog).

## Goal

Every Mac gets the same NexDB: same features, same server versions.

- **Oldest macOS: 12 Monterey** (chosen 2026-11-15). This covers Intel Macs from about 2015–2017
  onward (MacBook Air 2018 with its dual-core i5 included) and every Apple Silicon Mac (M1 and newer).
- **One app download**: a universal `.dmg` (Intel + Apple Silicon in one file).
- **Server programs** (Apache, PHP, MySQL, …) are built by us for both chips, all with
  `MACOSX_DEPLOYMENT_TARGET=12.0`, from the same source versions, so an Intel Mac and an M3 run the
  exact same PHP 8.x.y.

## Phase 1 — make the Rust code build and run on macOS

Windows-only code is already mostly behind `#[cfg(windows)]` (74 places), and `windows-sys` and
`winreg` are Windows-only dependencies in `Cargo.toml`, so the app should get far in a Mac build.
What is missing is the macOS side of each place. Heaviest files first:

| File | Windows today | macOS replacement |
|---|---|---|
| `scan.rs` | `netstat` and `tasklist` for "what uses port 80", registry (HKLM) to find installed apps, `CREATE_NO_WINDOW` | `lsof -nP -iTCP:<port> -sTCP:LISTEN` (gives PID and program); `ps -p <pid> -o comm=`; installed apps from `/Applications` and `mdfind "kMDItemCFBundleIdentifier == '…'"`; Homebrew under `/opt/homebrew` (Apple Silicon) and `/usr/local` (Intel) |
| `supervisor.rs` | `httpd.exe`, `php-cgi.exe`, `mysqld.exe`; Job Object so servers die with the app; named events to stop | binary names without `.exe` (one helper `exe("httpd")`); kill-with-app via a process group (`setsid`/`process_group(0)`) and `killpg(SIGTERM)` on quit, plus a PID file swept at startup in case the app crashed; stop Apache with `httpd -k stop`, MySQL with `mysqladmin shutdown`, others with `SIGTERM`. PHP runs as `php-fpm` (or `php-cgi -b`) behind `proxy_fcgi` |
| `projects.rs`, `lib.rs`, `localname.rs` | edit `C:\Windows\System32\drivers\etc\hosts` through PowerShell `RunAs` | `/etc/hosts` with one admin password prompt: `osascript -e 'do shell script "…" with administrator privileges'`; afterwards `dscacheutil -flushcache; killall -HUP mDNSResponder`. Keep one marked NexDB block so we only touch our own lines |
| `syspath.rs` | add PHP/Node to PATH through HKCU/HKLM registry and `setx` | write a small block to `~/.zprofile` (zsh is the default shell since 10.15), marked as NexDB's so it can be removed; or symlinks in `~/.nexdb/bin` added once to PATH. No admin needed |
| `quickstart.rs`, `importer.rs` | `robocopy`, `cmd /c` | `std::fs` copy in Rust (or `ditto` / `rsync -a`); no shell |
| `share.rs` | firewall rules and network profile through PowerShell, `netsh` | macOS app firewall asks the user itself the first time a server listens; to check it, `/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate`. There is no "Public/Private network" setting, so that step is skipped on Mac |
| `installer.rs`, `versions.rs`, `configure.rs`, `importer.rs`, `dbedit.rs`, `pg.rs` | many `"…exe"` names (`php.exe`, `mysqld.exe`, `mysqldump.exe`, `pg_dump.exe`, `redis-server.exe`, `node.exe`, …), `.zip` downloads | one `exe(name)` helper adds `.exe` only on Windows; downloads are `.tar.xz` for macOS (catalog gets `darwin-x64` and `darwin-arm64` entries, picked with `std::env::consts::ARCH`); after unpacking, remove the quarantine flag: `xattr -dr com.apple.quarantine <dir>` and `chmod +x` |
| `fixedlink.rs`, `lib.rs` | `ngrok.exe`, `cloudflared.exe` | both ship official macOS builds for Intel and Apple Silicon; same code, other file names |
| `terminal.rs`, `ssh_server.rs` | `powershell.exe`, `cmd`, `Get-Location` | `$SHELL` (normally `/bin/zsh`) started as a login shell (`-l`), `pwd` |
| `editors.rs`, `editorphp.rs` | `phpstorm64.exe`, `webstorm64.exe`, `code.cmd` | `open -a "PhpStorm" <path>`, `open -a "Visual Studio Code" <path>`, or the `code` command when installed |
| `tray.rs` | start-with-Windows through HKCU `Run` key | `tauri-plugin-autostart` (writes a LaunchAgent in `~/Library/LaunchAgents`) |
| `license.rs` | machine id from `MachineGuid` (HKLM), DPAPI to protect stored data | machine id from `ioreg -rd1 -c IOPlatformExpertDevice` → `IOPlatformUUID` (hashed, same as today); DPAPI becomes the macOS Keychain (`security` command or the `keyring` crate) |
| `admin.rs` | `RunAs`, `Get-AuthenticodeSignature` | admin through `osascript … with administrator privileges`; signature check through `codesign --verify --deep --strict` and `spctl -a -vv` |
| `uninstall.rs` | `MessageBoxW` | Tauri dialog plugin (already a dependency) |
| `health.rs`, `migrate.rs`, `backup.rs`, `recyclebin.rs`, others with 1–8 hits | `C:\` paths, `.exe` names | data folder from Tauri's `app_data_dir()` (`~/Library/Application Support/com.jamrsx.nexdb`); deleting to Trash with the `trash` crate |

### Ports 80 and 443

Since macOS 10.14, any program may listen on ports below 1024 on all addresses **without** root
(Apple removed the restriction). So Apache can keep using 80/443 like on Windows. Check this on a
real Monterey Mac during testing; if a port is blocked, fall back to 8080/8443 and say so in plain words
in the app.

### HTTPS certificates

Windows trusts the local certificate through the Windows certificate store. On Mac:
`security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db <ca.pem>`
(asks for the user's password once). Firefox keeps its own store, same as on Windows.

### Suggested way to do Phase 1

Add one small module, `platform.rs`, holding every OS difference (`exe()`, `open_hosts_editor()`,
`port_owner()`, `add_to_path()`, `machine_id()`, `admin_run()`, `kill_tree()`), with a Windows and a
macOS version of each. The other files call it instead of having their own `cfg` blocks. Windows
behaviour must stay exactly as it is.

## Phase 2 — server programs for both chips

**Decision: we build them ourselves in GitHub Actions**, on a native Intel runner and a native Apple
Silicon runner, every one with `MACOSX_DEPLOYMENT_TARGET=12.0`, and publish per-chip `.tar.xz`
files plus SHA-256 sums. NexDB downloads the right one, just as it downloads the Windows zips today.

Why not ready-made builds: Homebrew bottles depend on `/opt/homebrew` and drop old macOS versions
quickly; MySQL's official macOS packages only support recent macOS (8.4 LTS and 9.x list macOS 14
and 15). Building ourselves is the only way all Macs get the same versions.

Why not universal (`lipo`) server files: the app already downloads servers one by one, so a
per-chip download is half the size. The NexDB app itself is universal.

| Program | How we get it for macOS 12, both chips | Risk |
|---|---|---|
| PHP (8.1–8.4 lines) | [static-php-cli](https://github.com/crazywhalecc/static-php-cli) (`spc`): builds `php`, `php-fpm` and `php-cgi` with all libraries linked in (openssl, icu, libzip, oniguruma, …), no Homebrew needed at run time | Low. It supports macOS x86_64 and arm64 |
| Apache httpd 2.4 | source build with bundled APR (`--with-included-apr`), PCRE2, OpenSSL and nghttp2 built static first; modules `proxy_fcgi`, `ssl`, `http2`, `rewrite` | Low–medium (a script, not a tool) |
| MySQL 8.4 LTS | source build with CMake, `-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0`, `-DWITH_SSL=<our static OpenSSL>`, `-DWITH_BOOST` bundled | **Medium–high, see below** |
| PostgreSQL (16, 17) | source build (`./configure --without-icu` or our static ICU, `--with-openssl`) | Low |
| Redis 7.x / 8.x | source build (`make BUILD_TLS=yes`) | Low |
| Node.js | official builds: Node 22 LTS supports macOS 11+, so fine. **Node 24 needs macOS 13.5+** on the official builds | Medium for Node 24 (see below) |
| Mailpit | official release (`darwin-amd64` and `darwin-arm64`); it is a Go program and current Go supports macOS 12 | None |
| nginx, Composer, phpMyAdmin, cloudflared, ngrok | nginx: source build (small). Composer and phpMyAdmin are PHP files, same on every OS. cloudflared and ngrok ship official Mac builds | Low |
| MariaDB, MongoDB, memcached, Python (in the Windows catalog) | later; not part of the first Mac release | — |

### MySQL on macOS 12

MySQL 8.4 is written in modern C++. Built with a current Xcode and a target of 12.0, the compiler
refuses C++ library features that Apple only added to macOS 13.3+ (for example `std::to_chars` for
decimals) if MySQL uses them. What to do, in order:

1. Build MySQL 8.4 with `CMAKE_OSX_DEPLOYMENT_TARGET=12.0` and see if it compiles. If yes, done.
2. If it fails on "is unavailable: introduced in macOS 13.x": build with Homebrew's LLVM clang and
   link its `libc++` **statically** (`-nostdlib++ <llvm>/lib/c++/libc++.a <llvm>/lib/c++/libc++abi.a`).
   The program then carries its own C++ library and no longer depends on the Mac's. Chrome and
   Firefox do the same.
3. Only if both fail: offer MariaDB on Macs older than 14. That breaks "same versions on every
   Mac", so it would need the user's OK first.

MySQL 8.0 is not an option: it reached end of life in April 2026.

### Node 24 on macOS 12

Same fix as MySQL step 1: build Node 24 from source with `MACOSX_DEPLOYMENT_TARGET=12.0` (Node's own
`configure` reads it). Until that works, Macs below 13.5 offer Node 22 LTS only, and the app says so
in plain words. This is the one place where Macs may differ, so try the source build first.

### Checking each built file

Every server build ends with a check that fails the job if a file needs newer macOS than 12:

```sh
vtool -show-build bin/mysqld | grep minos   # must print "minos 12.0" for every slice
otool -L bin/mysqld   # only /usr/lib and /System/Library may appear; no /opt/homebrew
```

### Where the builds run, and cost

- Intel runner: `macos-15-intel` (GitHub's last Intel image; check it is still offered before
  starting). Apple Silicon runner: `macos-15`. When GitHub drops Intel runners, build x86_64 on the
  Apple Silicon runner with `-arch x86_64` and test it under Rosetta.
- **macOS minutes cost about 10× Linux minutes on private repositories**, and a MySQL build takes
  30–60 minutes per chip. The source code repo `Jamrsx/DBMS` is private.
- Recommendation: run the server builds in a **public** repository (for example a new
  `nexdb-servers`, or `Jamrsx/nexdb-releases`). The servers are open-source, so nothing secret is
  exposed, and Actions minutes are free for public repositories. Ask the user before creating it.
- All workflows here start only by hand (`workflow_dispatch`), so nothing runs or costs anything until
  someone presses "Run workflow".

## Phase 3 — the app download (`.github/workflows/macos-app.yml`)

- Runs on `macos-15`, installs both Rust targets, builds with
  `npm run tauri build -- --target universal-apple-darwin --bundles app,dmg`.
- `tauri.conf.json` gets `bundle.macOS.minimumSystemVersion: "12.0"` so the app itself also states
  macOS 12.
- Output: `NexDB_<version>_universal.dmg`, plus `NexDB.app.tar.gz` and `.sig` for in-app updates.
  In `latest.json`, list the same `.app.tar.gz` under both `darwin-x86_64` and `darwin-aarch64`.
- **Signing and notarization: ready but off.** The steps run only when the repository variable
  `MACOS_SIGNING` is `true`. They need an Apple Developer account ($99 per year, ask the user first)
  and these secrets: `APPLE_CERTIFICATE` (base64 `.p12` of the "Developer ID Application"
  certificate), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
  `APPLE_PASSWORD` (an app-specific password), `APPLE_TEAM_ID`. Tauri signs and notarizes by itself
  when these are set.
- Without signing the app is ad-hoc signed (`-`). Apple Silicon Macs refuse completely unsigned
  programs, ad-hoc is enough to start. Users then see "cannot be opened because Apple cannot check
  it". On macOS 15 they must allow it in System Settings → Privacy & Security → "Open Anyway". Fine
  for testing; not acceptable for paying customers.
- Server programs downloaded by the app are not part of the `.dmg`, so they are not notarized. NexDB
  removes the quarantine flag after download (Phase 1), so Gatekeeper does not block them. When
  signing is on, sign them too (`codesign --options runtime --timestamp`) in the server workflow.

## Testing

- No Mac yet. Minimum test set before selling: one Intel Mac on macOS 12 (MacBook Air 2018 class)
  and one Apple Silicon Mac on the newest macOS.
- GitHub runners can run the smoke test (start Apache + PHP + MySQL, load a PHP page, stop) but
  only on macOS 14/15, never on 12. The `vtool` check above is what proves the 12.0 floor until a
  real Monterey Mac is available.

## Phase 1 status (branch `macos-port`, 2026-11-15)

Done, Windows unchanged (all 235 Windows tests pass):

- `platform.rs`: `exe()` (113 `.exe` names now go through it), `shell()`, `PATH_SEP`,
  `default_root()` (`~/NexDB`), `local_data_dir()` (`~/Library/Application Support`), and the
  macOS helpers: `lsof` ports, `ps` process names, admin prompt through `osascript`, `ioreg`
  machine id, `scutil` computer name, quarantine removal, folder copy.
- Ports in use (`scan.rs`), project addresses in `/etc/hosts` with one password prompt
  (`projects.rs`), clean stop of Apache and MySQL by SIGTERM to the process group
  (`supervisor.rs`), zsh terminals (`terminal.rs`, `ssh_server.rs`), `sh -c` for setup commands,
  `cp -R` for project imports, a `composer` shell script, editors in `/Applications` opened
  with `open -a`, start at login through a LaunchAgent, local HTTPS trust through the login
  keychain, Trash through Finder, Docker/ngrok/Tailscale Mac locations, old NexDB folders found
  in the home folder and `/Volumes`.
- License id on Mac is the hashed IOPlatformUUID (before this every Mac would have had the same id).
- Catalog: each version can carry `macos.x64` / `macos.arm64` downloads; a Mac only offers what has
  a Mac build, and `.tar.xz` archives unpack with their file modes.
- Setup wizard accepts `/Users/…` paths and suggests `~/NexDB`.
- `.github/workflows/macos-check.yml`: a short Mac type-check and test run.

Not done yet:

- **Mac server builds (Phase 2).** Until they exist, a Mac can open NexDB and go through setup,
  but Apache, PHP, MySQL and the rest show as having no Mac build.
- "Which PHP other terminals use" (Windows PATH shims): says it isn't on Mac yet.
- The license file is stored unencrypted on Mac (Windows uses DPAPI). Move it to the Keychain.
- Servers left running if NexDB itself crashes are not cleaned up on the next start.
- Finding MAMP / Homebrew installs in the system scan.
- Many UI texts still say "PC" or show `C:\` examples in the browser preview data.
- Never compiled on a Mac: run `macos-check.yml` first.

## Phase 2 status (2026-11-15)

The build scripts live in the public repository **Jamrsx/nexdb-servers** (free Mac build minutes;
only open-source build recipes, no NexDB code):

- `scripts/build.sh <id> <version>` builds one program for the machine's chip: Redis, PostgreSQL,
  Apache (with APR and static OpenSSL/PCRE2), nginx, PHP (static-php-cli, every extension built in,
  `php`, `php-fpm`, `php-cgi`), MySQL (CMake + Ninja), Node (official build if it runs on macOS 12,
  else from source) and Mailpit. Libraries load from the program's own folder (`@rpath`), files are
  re-signed ad hoc, and each archive is checked: nothing may need a macOS newer than 12.0 or load a
  library from Homebrew or the build machine.
- `versions.txt` lists what to build. Refresh it from this repo with
  `python scripts/macos-servers/catalog.py versions <id>` when the catalog changes.
- Actions -> "Build Mac servers" builds on Intel and Apple Silicon runners and publishes a release.
- Here, `scripts/macos-servers/catalog.py add <files> <release URL>` writes the `macos.x64` /
  `macos.arm64` entries; `catalog/build-catalog.mjs` keeps them when it refreshes the Windows data.
- On macOS NexDB writes no `extension=` lines into php.ini (they are built in).

Still to check on the first run: the exact static-php-cli download name, whether MySQL 8.4/9.x/26.x
compile for macOS 12 (see "MySQL on macOS 12"), and Node 24/26 (likely built from source).

## Order of work

1. Phase 1 `platform.rs` and the table above (Windows must still pass its tests).
2. App workflow green, unsigned `.dmg` (expect the first run to fail at the Rust build until step 1
   is done).
3. Server builds: Redis, Mailpit, Node 22 first (easy), then PHP (spc), Apache, PostgreSQL, MySQL.
4. Catalog: add `darwin-x64` / `darwin-arm64` entries with SHA-256 sums.
5. Real-Mac testing, then Apple Developer account and signing.
