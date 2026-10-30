# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Rendered inside a Tauri 2 desktop window on Windows (WebView2), plus a browser-based database manager served on `127.0.0.1`.

## Users

Both, equally:

- Students and junior PHP developers learning web development on Windows (school projects, Laravel, WordPress) who want a local stack that works without fiddling.
- Professional PHP/JS developers running many projects daily who care about speed, per-site versions and control.

The interface has to be simple enough for the first group without slowing down the second.

## Product Purpose

A local development environment manager for Windows, in the space of Laragon and XAMPP. It installs, configures and runs PHP, Node.js, Apache/nginx and MySQL, gives every project folder a `.test` address, and manages databases. Success: a fresh Windows PC goes from nothing to a working stack in one guided setup, and day-to-day work (switching versions, adding sites, updating) never needs a config file edited by hand.

## Positioning

- **Install only what you pick.** It starts empty, scans the PC first and installs only the chosen components, never a pre-bundled stack.
- **Safe, verified updates.** Downloads come from official vendor sources and are checked (SHA-256, MD5 for MySQL, Microsoft signatures) before use. Updates are recommended by rule (security fixes first, LTS preferred, end-of-life warnings) and install side by side for rollback.
- **Per-site PHP and Node.** Each project can run its own PHP and Node version (PHP runs over FastCGI to make this possible).
- **Built-in web database manager.** A phpMyAdmin-style MySQL manager served by the app's own core, so it keeps working when PHP or Apache are broken.

## Operating Context

- First run: a six-step setup wizard (Welcome, System scan, Components, MySQL, Review, Install).
- Daily use (planned): a dashboard to start/stop services, switch versions, manage PHP extensions, sites and updates; tray menu.
- The user's projects live in a projects folder; each sub-folder becomes `http://<folder>.test`.
- Some steps need Windows approval: an administrator prompt (Visual C++ runtime) and Windows' own certificate-trust dialog (local HTTPS authority limited to `.test` and `localhost`).

## Capabilities and Constraints

- Built so far: setup wizard with real system scan, version catalog and recommendations, MySQL setup, review, and installer (download, verify, unpack, configure, MySQL init, local CA). Not yet built: dashboard and service control, sites and hosts helper, update flow, web database manager.
- MySQL is the default, first-class database; MySQL users should feel at home (root user, port 3306, usual CLI tools).
- The MySQL root password is never saved or shown after entry.
- Windows only for now.
- Open: the product name. "NexDB" is a working name to be replaced before release; nothing may reuse Laragon's name or branding.

## Brand Commitments

- Visual direction: the category standard, executed at full craft (chosen on 2026-10-30 over rolled directions). It should sit naturally alongside Laravel Herd, Docker Desktop, GitHub Desktop and Linear, whose craft level is the quality bar.
- Light and dark themes with a user toggle (Light / Dark / System) are required.
- Working name only (see Capabilities and Constraints).

## Evidence on Hand

No users, testimonials, benchmarks or press exist. Real data available: the catalog in `catalog/catalog.json` (current versions, support dates, checksums). Future work must not invent adoption, ratings or performance claims.

## Product Principles

1. Ask before changing the system; say exactly what will change and why.
2. Recommend, don't force: sensible defaults are preselected and every choice can be changed.
3. Verify before trusting: nothing downloaded runs or installs until it is checked.
4. Never lose user data: existing installs and databases are used or left alone, not overwritten.
5. Plain language over jargon, with detail available for those who want it.
