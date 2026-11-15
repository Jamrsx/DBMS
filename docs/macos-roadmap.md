# NexDB for Mac: roadmap after the first server builds

Floor: macOS 13 Ventura. Test Mac: MacBook Air 2018 (Intel i5, macOS 14.8.9).
Status on 2026-11-15: app code ported (branch `macos-port`), server builds running in
Jamrsx/nexdb-servers. Each stage ends with a check before the next starts.

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
| MariaDB, MongoDB, Memcached, Python | MongoDB and Python have official Mac builds (catalog entries); MariaDB and Memcached get build scripts in nexdb-servers |
| Git | Use the Mac's own Git; if missing, NexDB offers `xcode-select --install` |
| "Which PHP other terminals use" | Mac version: a NexDB block in `~/.zprofile` |
| Restore deleted projects | Keep NexDB's own record of what it moved to the Trash |
| License file not encrypted on Mac | Store it in the macOS Keychain |
| Servers left running after a NexDB crash | Clean them up on the next start |
| System scan misses MAMP / Homebrew installs | Add their folders |
| UI says "PC" / shows `C:\` examples | Mac wording and paths everywhere |
| Nex tours | A Nex walkthrough for the Mac-specific steps (password prompt, Open Anyway) |

Each gap: build, test on the MacBook, tick off.

## Stage 5: release (you decide when)

1. Merge `macos-port` into `main` (Windows build and tests must still pass).
2. Version bump (same number for Windows and Mac, e.g. 0.5.8).
3. Apple Developer account ($99/year), then set `MACOS_SIGNING=true` and the six secrets:
   the `.dmg` is signed and notarized, so no "Apple can't check it" warning.
4. Publish the `.dmg` beside the Windows installer in Jamrsx/nexdb-releases, with
   `darwin-x86_64` and `darwin-aarch64` in `latest.json` for in-app updates.
5. Website: a Mac download button and "macOS 13 or newer" on the download page.

## Upkeep (when new versions come out)

New PHP/MySQL/Node version → refresh the catalog → update `versions.txt` in nexdb-servers →
run "Build Mac servers" → `catalog.py add` → NexDB update. Later: automate this into one click.
