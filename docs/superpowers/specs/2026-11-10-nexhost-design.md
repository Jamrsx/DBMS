# NexHost design

Date: 2026-11-10. Status: draft, owner's questions answered, waiting for approval.

## Why

NexDB users build websites on their own PC. Before they pay for real hosting they need to show
the site to a client and test things that only work on a real HTTPS address (PayMongo webhooks,
Google sign-in). NexHost turns the user's own PC or laptop into a small Hostinger-like host for
testing: put the files in, give it a database, press **Go live**, and anyone with the link can
open it, on the user's own domain when they have one.

It is also the reason to buy the new **4-year plan**: NexHost is only in that plan.

## Goals

- A **NexHost** page in the app where the user keeps hosted sites, like a small hosting panel.
- Per site: a folder the user fills by dragging files or a zip in (file manager), a database
  with its own user and password, and a **Go live** / **Go offline** switch.
- Live sites use the user's **own Cloudflare or ngrok account**:
  - Own domain: Cloudflare Tunnel on the user's domain (`test.myshop.com`), free, no warning
    page, several sites at once (one hostname each).
  - No domain: ngrok's free fixed address (`name.ngrok-free.app`), one live site at a time.
- HTTPS on every live address (comes from Cloudflare / ngrok).
- Only licenses whose plan includes the `nexhost` feature can use it, checked in Rust.
- On every other plan the **Public link** and **Fixed link** features are removed too (owner's
  call: public access is part of the 4-year plan only). **On my Wi-Fi** and **Dev server**
  sharing stay on all plans.

## Non-goals

- No NexDB-run relay server and no NexDB domains (owner's call: users bring their own
  Cloudflare/ngrok account).
- No raw IP addresses as links. Most PH homes are behind CGNAT, so a home PC has no public IP,
  and an IP can't have normal HTTPS.
- Not real production hosting: a site is online only while the PC is on and NexDB runs.
- No email hosting, no holding webhooks while the PC is off (needs a relay we don't run).
- No path-style sites on one address (`/shop`, `/blog`): Laravel and WordPress expect `/`.

## Anti-goals (would make it a failure even if it works)

- Exposing MySQL, phpMyAdmin, NexDB's own tools or a Laravel `.env` to the internet.
- A free-plan user getting NexHost by editing settings files.
- Technical wording the user has to translate (see the plain-language and Nielsen rules).

## Constraints

- App: Tauri + Rust backend (`app/src-tauri`), React UI (`app/src`). Website: Laravel
  (`C:\laragon\www\nexdb`), license token signed with Ed25519.
- Existing pieces to reuse: `fixedlink.rs` (ngrok/Cloudflare account, forwarder on
  `FIXED_PORT` 8899, password page via `gate.rs`), `share.rs` (per-site ports 8181-8199,
  firewall rule, cloudflared download), `db.rs` / `dbedit.rs` (create database / user),
  `license.rs` (token claims, `require()`).
- Each website schema change gets its own new migration. Version bump per the versioning rule
  (next app version 0.5.5). Every new feature gets a Nex tour in practice mode (dummy data,
  nothing on the PC changes).

## Approaches considered

1. **NexDB-run relay on a VPS** with NexDB subdomains. Full control and webhook holding, but a
   server bill, abuse handling and the owner didn't want NexDB domains. Rejected.
2. **Direct public IP + port forwarding.** No middleman, but fails behind CGNAT for most users
   and has no proper HTTPS. Rejected.
3. **User's own Cloudflare or ngrok account (chosen).** Free for the user, HTTPS included,
   already half-built in Fixed link. Cloudflare for own domains, ngrok when there is no domain.

## How it works

### License feature (website + app)

- Website: new migration adds `plans.features` (JSON, nullable). The 4-year plan
  (`duration_days` 1460) is turned on with `features = ["nexhost"]`. Prices page gets a
  "Includes NexHost" checkbox per plan (owner only).
- License token payload gains `features` (array). Old tokens have none, so no NexHost until the
  next check-in refreshes the token.
- App: `license::has_feature("nexhost")`. Every NexHost command and the Public link / Fixed
  link commands call it and refuse with a plain message when it is false. The UI shows the
  locked feature with "Part of the 4-year plan" and an Upgrade button (reuses RenewOptions).
- `GET /api/v1/plans` returns each plan's features so the upgrade screen can say which plan
  has NexHost.

### Sites

- Folder: `C:\NexDB\nexhost\<site>\` (separate from `www`). Site name = folder name, lowercase
  letters, numbers and dashes.
- **Web root**: auto-detected (Laravel `public/`, else the folder itself), changeable in the
  site's settings. Only the web root is served, so `.env` and `vendor/` are never reachable.
- Each site gets a site entry in whichever web server NexDB runs (Apache or Nginx) on its own
  port from a new range (8201-8219), bound to `127.0.0.1` only. Not on the Wi-Fi, not through
  the firewall. (Builder's call, marked: same PHP version picker as projects, default PHP.)
- Databases: MySQL only in the first version (builder's call, marked).
- **File manager**: list folders and files, drag and drop files or a `.zip` (unpacked in place,
  with progress), new folder, rename, delete (to the recycle bin like the rest of NexDB), open
  in Explorer / VS Code. Uses the existing `recyclebin.rs`.
- **Database**: "Create database" makes `nh_<site>` plus a user `nh_<site>` with a random
  password, granted only on that database, and shows name / user / password / host / port with
  copy buttons, plus "Import .sql" and "Open in phpMyAdmin" (local only). Offers to write these
  into the site's `.env` when it is Laravel.

### Going live

- **Settings > NexHost connection** (moves the current Fixed link card here):
  - Cloudflare: tunnel token + the user's domain. Guide text tells the user to add one public
    hostname per site, or a wildcard `*.myshop.com`, pointing at `http://localhost:8899`.
  - ngrok: authtoken + free fixed address.
- `fixedlink.rs` grows into routing by host name: the forwarder on 8899 reads the `Host`
  header and sends the visitor to that site's local port. Unknown host or offline site: a
  plain "This site is offline" page.
- **Go live** on a site: pick its address (`<site>.myshop.com` with Cloudflare; the ngrok
  address with ngrok, which first takes any other live site offline with a clear message).
  Optional password (existing `gate.rs`). Shows Live / Offline / Connecting, the link with
  copy and QR, and a "Test it" button that opens the public link.
- Live sites are remembered and go live again when NexDB starts, while the license allows it.
- **Warnings shown to the user**: the site works only while this PC is on; ngrok shows its own
  "You are about to visit" page to visitors once (webhooks are not affected).

### Free plans

- Share tab: remove the Public link card; show a small locked card pointing at the 4-year plan.
- Settings: Fixed link card hidden behind the same lock.
- Changelog / What's new for 0.5.5 says plainly that public links moved to the 4-year plan.

### Help and tour

- Nex tour for NexHost in practice mode: fake site, fake files, fake database, fake Go live.
- Help page section: own domain with Cloudflare, no domain with ngrok, what "only while your PC
  is on" means.

## Left to the builder

- Exact vhost template and how the per-site Apache listener is added and removed.
- Zip unpack library, upload size limits, progress events.
- Forwarder internals (WebSocket pass-through for live reload is nice to have).
- Exact copy of messages, within the plain-language rule.

## Owner's answers (2026-11-10)

- 4-year plan price: **₱4,900** direct (about ₱102 a month), because it includes NexHost.
  Reseller price not decided; placeholder 60% = ₱2,940, changeable on the Prices page.
- People who bought a 6-month to 3-year key **lose Public link and Fixed link in 0.5.5**, even
  before their key ends.
