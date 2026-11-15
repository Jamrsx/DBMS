# Testing NexDB on a borrowed MacBook Air

Nothing on the Mac needs to be installed besides NexDB itself. Afterwards, everything can be
removed (see the end).

## Before you go

1. Run the **NexDB macOS app** workflow in GitHub Actions and download the
   `nexdb-macos-universal` artifact (it holds the `.dmg`).
2. Note the Mac's model and macOS version: Apple menu → About This Mac.

## On the Mac

| # | Do this | Expected |
|---|---|---|
| 1 | Open the `.dmg`, drag NexDB to Applications, open it | macOS says it can't check the app. Go to System Settings → Privacy & Security → "Open Anyway" (on macOS 13–14 you can also right-click the app → Open). |
| 2 | NexDB opens | Window and Nex appear, no blank screen |
| 3 | Setup wizard, first page | Install folder shows `/Users/<name>/NexDB`; no "must be a full path" error |
| 4 | System check step | Ports 80, 443, 3306 listed as free or with the program using them |
| 5 | Pick versions | Apache, PHP, MySQL say no Mac build yet (expected until Phase 2) |
| 6 | Activity Monitor → NexDB → "Kind" column | "Intel" on a 2018 Air, "Apple" on M1 or newer |
| 7 | Settings → "Open at login" on, then off | `~/Library/LaunchAgents/com.jamrsx.nexdb.autostart.plist` appears, then goes |
| 8 | Quit NexDB from the menu bar icon | App closes, nothing left in Activity Monitor |

Write down anything that looks wrong, with a photo of the screen.

## Clean up the friend's Mac

1. Quit NexDB, drag it from Applications to the Trash.
2. Delete `~/NexDB` (if setup made it), `~/Library/Application Support/NexDB` and
   `~/Library/Application Support/com.jamrsx.nexdb`.
3. If project addresses were added: Terminal → `sudo nano /etc/hosts`, delete the lines from
   `# NexDB begin` to `# NexDB end`.
