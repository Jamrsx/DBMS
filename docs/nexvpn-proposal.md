# NexVPN: reach a NexHost site without ngrok or Cloudflare

Status: proposal, 2026-11-13. Nothing built, nothing installed, no firewall ports opened.

## The catch first

A VPN only lets in devices that **join** it. A friend, client or phone that should open the
site must install the VPN app and sign in. A link that "anyone can open" (what ngrok and
Cloudflare give today) always needs a public server in the middle. So there are two different
things a user may mean:

- **Private sharing**: my phone, my teammate, my tester. A VPN fits.
- **Public link**: anyone with the URL. A VPN does not fit. A relay server does.

## Options

| | What it is | Who runs a server | Visitor must install | Cost to Nexio Devs | Licence |
|---|---|---|---|---|---|
| A. Same Wi-Fi sharing | Site answers on the PC's LAN address (e.g. `http://192.168.1.20:8080`) plus a QR code | Nobody | Nothing | None | n/a |
| B. NexVPN (mesh) | Bundle a WireGuard mesh client; Nexio runs the coordination server | Nexio: coordination + relay (DERP/TURN) for hard NATs | Yes, NexVPN app on every device | VPS + relay bandwidth, support | Headscale BSD-3; NetBird client BSD-3, server AGPLv3 since v0.53 (commercial licence offered); ZeroTier source-available (BSL), needs check; wireguard.dll bundled under its own binary licence, no "WireGuard" branding allowed |
| C. Use the user's own Tailscale | NexDB detects Tailscale, shows the `*.ts.net` address, optional Funnel for public | Tailscale Inc. | Tailscale on visitor devices (private) or nothing (Funnel) | None | User's own account |
| D. NexTunnel (Nexio relay) | ngrok-style: NexDB opens an outbound tunnel to a Nexio server, site gets `name.nexdb.live` | Nexio: relay VPS + wildcard domain + TLS | Nothing | Bandwidth, abuse handling (phishing sites on our domain), uptime | Self-written or frp/rathole (Apache-2.0) |

NAT traversal: B and D both work behind home routers and mobile data because the PC only dials
out. B tries direct peer links first and falls back to the relay. A needs no traversal but only
works on the same network. None of them needs a port opened on the router; A needs one Windows
Firewall rule (private networks only), which NexDB must ask for first.

## Security

- Exposing a dev site exposes its `.env`, debug pages and default DB passwords. Whatever we pick:
  on by switch, off by default, auto-off timer, warn if `APP_DEBUG=true`, never expose phpMyAdmin
  or the MySQL port.
- B: Nexio holds the keys to every customer's network. A breach of the coordination server is a
  breach of all users. Needs proper ops, audits, and ACLs so a visitor only reaches that one site,
  not the whole PC.
- D: Nexio's domain hosts whatever users put up; abuse reports and takedowns land on Nexio.
- A: only people on the same Wi-Fi; firewall rule limited to the private profile.

## Recommendation

1. **Build A now** (small, no server, no cost): "Share on this Wi-Fi" switch with QR code. Covers
   "test on my phone", the most common case.
2. **Add C** (detect the user's Tailscale) for private remote sharing: no server for Nexio.
3. **Only if public links without ngrok/Cloudflare matter for sales, build D** (NexTunnel) as a
   4-year-plan perk, with a bandwidth cap and abuse terms. It is a hosted service with running
   costs, not a feature that ships once.
4. **Skip B (true NexVPN)** for now: it costs the most (servers, security, support), still makes
   every visitor install an app, and Headscale/NetBird self-hosting plus a branded client is a
   product of its own.

## Decision needed from the user

- Which: A, A + C, A + C + D, or B anyway?
- For D or B: willing to run and pay for a server, and own abuse/security handling?
