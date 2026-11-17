# NexDB for Mac: roadmap after the first server builds

Floor: macOS 13 Ventura. Test Mac: MacBook Air 2018 (Intel i5, macOS 14.8.9).
Status on 2026-11-17: Stage 1 done; Stage 2 passed on the MacBook Air after three fix rounds
(Stage 3): setup, Apache, PHP, MySQL, projects, database and mail work. Left from the test:
ngrok must be installed on the Mac (`brew install ngrok`); PHP extensions show as built in.
Done early from Stage 4: "which PHP other terminals use" (~/.zprofile), leftover-service cleanup.
Each stage ends with a check before the next starts.

## Stage 1: first installable build (Claude, about 1 hour after the builds finish)

1. Collect the passing builds from the nexdb-servers releases (runs #5 and #6).
2. `python scripts/macos-servers/catalog.py add` for each release: Mac download links into
   `catalog/catalog.json`.
3. Add official Mac downloads for **cloudflared** to the catalog (no build needed). Git has no
   official standalone Mac build; Macs use their own (`xcode-select --install`), see Stage 4.
4. Push `macos-port`. The "NexDB macOS app" workflow builds the universal `.dmg`.
5. Check the run is green and the `.dmg` is there.

Done when: a `.dmg` artifact exists and the catalog lists Mac builds for Apache, PHP, MySQL,
PostgreSQL, Redis, Node, nginx, Mailpit.

## Stage 2: first test on the MacBook Air (you, about 1 hour)

Follow `docs/macos-test-checklist.md`, extended with:

- Setup wizard installs Apache + PHP + MySQL.
- Start all → open `http://localhost` → PHP info page shows.
- Create a project → `http://<name>.test` opens (asks the Mac password once).
- MySQL: phpMyAdmin opens, a database can be created.
- Terminal: `php -v`, `composer -V`, `node -v` work.
- Quit NexDB → nothing left running in Activity Monitor.

Write down every problem with a photo of the screen. Then clean up the friend's Mac
(end of the checklist).

## Stage 3: fix round(s) (Claude, then you retest)

Expected areas: Apache and PHP config on macOS (paths, modules), hosts file, ports 80/443,
the tray/menu bar, first-run permission prompts. Each fix → push → new `.dmg` → retest only
what failed. Repeat until the Stage 2 list passes.

## Stage 4: close the gaps to Windows (Claude)

| Gap | Plan |
|---|---|
| MongoDB, Python | Done: MongoDB 9.0.4 (macOS 14+), Python 3.14.10 (python-build-standalone) |
| MariaDB, Memcached | Not in the first Mac release (decided 2026-11-17): MySQL and Redis cover them; they show "No Mac download yet" |
| Git | Use the Mac's own Git; if missing, NexDB offers `xcode-select --install` |
| "Which PHP other terminals use" | Done: a NexDB block in `~/.zprofile` |
| Restore deleted projects | Done: NexDB records where Finder put each project; Finder moves it back |
| License file not encrypted on Mac | Done: encrypted with a key kept in the login Keychain |
| Servers left running after a NexDB crash | Done: stopped on the next Start |
| System scan misses MAMP / Homebrew installs | Done: MAMP, XAMPP, Homebrew, /usr/local/mysql, macOS Apache |
| UI says "PC" / shows `C:\` examples | Done: Mac wording pass (lib/macWording.ts), ⌘ shortcuts |
| Uninstall | Done: Settings → Updates → "Uninstall NexDB" button at the bottom: keep or delete the NexDB folder; stops servers; removes Open at login, hosts lines, the HTTPS certificate, the ~/.zprofile block and app settings; NexDB.app to the Trash |
| Nex tours | Done (Mac-only steps in the main tour); "Open Anyway" goes on the download page |

Each gap: build, test on the MacBook, tick off.

## Stage 5: release (you decide when)

1. Merge `macos-port` into `main` (Windows build and tests must still pass).
2. Version bump (same number for Windows and Mac, e.g. 0.5.8).
3. Later, when affordable (decided 2026-11-17: not now): Apple Developer account ($99/year),
   then `MACOS_SIGNING=true` and the six secrets. Until then the `.dmg` is unsigned and the
   download page explains System Settings → Privacy & Security → Open Anyway.
4. Publish the `.dmg` beside the Windows installer in Jamrsx/nexdb-releases, with
   `darwin-x86_64` and `darwin-aarch64` in `latest.json` for in-app updates.
5. Website: a Mac download button and "macOS 13 or newer" on the download page.

## Upkeep (when new versions come out)

New PHP/MySQL/Node version → refresh the catalog → update `versions.txt` in nexdb-servers →
run "Build Mac servers" → `catalog.py add` → NexDB update. Later: automate this into one click.
