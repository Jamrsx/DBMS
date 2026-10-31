# Releasing NexDB updates

NexDB updates itself from Settings → NexDB updates. Each release must be **signed**, and the
update file must be **reachable without logging in**.

## One-time facts

- Signing key (private, never commit or share): `C:\Users\PC\.tauri\nexdb-updater.key`
- Public key: already in `app/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`
- Update address the app checks:
  `https://github.com/Jamrsx/nexdb-releases/releases/latest/download/latest.json`

If the private key is lost, installed copies can no longer be updated in-app; users would need to
reinstall once with a build that has a new public key. Back the key up somewhere safe.

Releases are published in the **public** repository `Jamrsx/nexdb-releases`. The source code
stays private in `Jamrsx/DBMS`; only installers and `latest.json` go to the public one.

## Making a release

1. Raise the version in `app/src-tauri/tauri.conf.json` and `app/package.json` (e.g. `0.1.0` → `0.2.0`).
   Installed copies only offer an update when the published version is higher.
2. Build with the signing key available (PowerShell):

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\nexdb-updater.key" -Raw
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
   cd app; npm run tauri build
   ```

3. In `app/src-tauri/target/release/bundle/` you get the installer (`nsis/NexDB_<version>_x64-setup.exe`)
   and its signature (`.sig`).
4. Create `latest.json`:

   ```json
   {
     "version": "0.2.0",
     "notes": "What changed, in plain words.",
     "pub_date": "2026-11-01T00:00:00Z",
     "platforms": {
       "windows-x86_64": {
         "signature": "<contents of the .sig file>",
         "url": "https://github.com/Jamrsx/nexdb-releases/releases/download/v0.2.0/NexDB_0.2.0_x64-setup.exe"
       }
     }
   }
   ```

5. In `Jamrsx/nexdb-releases`, publish a GitHub release tagged `v0.2.0` with the installer and `latest.json` attached.
   Copies of NexDB find it the next time someone presses **Check for updates**.

The version list on the Versions page (PHP, Apache, MySQL, Node.js) is bundled with NexDB, so a
NexDB release also brings newer versions of those. Refresh it before a release with
`node catalog/build-catalog.mjs`.
