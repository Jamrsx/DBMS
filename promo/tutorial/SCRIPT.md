# NexDB 0.5.7 tutorial: Open your projects from anywhere with Tailscale

For people with no networking knowledge. Length about 2:25. Voice: Kokoro `af_heart` (offline, local), speed 0.95.
Video: `promo/out/tut/NexDB-Tailscale-Tutorial.mp4` (1920x1080, 30 fps, captions burned in).

App screens are real captures from NexDB's browser preview with practice data (`tutorial/capture/capture.mjs`),
so nothing on the PC was changed. The Tailscale website, sign-in, taskbar, Windows prompt and phone are simple
drawings, not Tailscale's or Microsoft's real screens.

| # | Time | On screen | Narration |
|---|---|---|---|
| 1 | 0:00 | Nex waves. Title: "Open your projects from anywhere, with Tailscale, in 4 easy steps." | Hi! I'm Nex. Let's open your NexDB projects on your phone, or any other device, from anywhere. We'll use a free app called Tailscale. |
| 2 | 0:10 | A dashed circle "Your Tailscale network" with This PC, your phone, a friend's laptop. A stranger outside gets a red X. | Think of Tailscale as a private club for your devices. Only devices in your club can open your links. Nobody else on the internet can. |
| 3 | 0:19 | Two cards: Personal projects = Free. Client or company work = Paid plan. | It's free for personal projects. For client or company work, Tailscale asks for a paid plan. |
| 4 | 0:26 | Step card: Step 1 of 4, "Put Tailscale on this PC". | Step 1. Put Tailscale on this PC. |
| 5 | 0:28 | Browser types `tailscale.com/download`, clicks "Download for Windows", install bar fills. | Open your browser and go to tailscale.com/download. Download the Windows version and install it like any other app. |
| 6 | 0:37 | "Sign in to Tailscale" with Google / Microsoft / Apple. Tip: remember which one. | When it opens, sign in. Google, Microsoft or Apple all work. Remember which one you used. |
| 7 | 0:44 | Taskbar corner: Tailscale icon by the clock, popup "Connected". Nex cheers. | When the Tailscale icon by the clock says Connected, step 1 is done. |
| 8 | 0:49 | Step card: Step 2 of 4, "Share a project". | Step 2. Share a project from NexDB. |
| 9 | 0:52 | NexDB: click Projects, then the project name (my-shop). | Go to Projects, and click your project's name. |
| 10 | 0:55 | Click the Share tab, then "Share on my Wi-Fi". | Open the Share tab, and click "Share on my Wi-Fi". |
| 11 | 0:58 | The On my Wi-Fi card; zoom on the link `http://my-pc.tail1234.ts.net:8181/`. | See these new links? They end in ts.net, or start with 100. Those are your Tailscale links. |
| 12 | 1:05 | Click "Allow my Tailscale devices"; the Windows prompt appears, cursor picks Yes. | Windows Firewall still blocks them. So click "Allow my Tailscale devices". Windows asks for permission: choose Yes. |
| 13 | 1:14 | The Tailscale card says Connected. | Don't worry: this only lets in your Tailscale devices. Nobody else. |
| 14 | 1:19 | Step card: Step 3 of 4, "Open a NexHost site". | Step 3. Is your site in NexHost? Open it to Tailscale too. |
| 15 | 1:23 | Click NexHost, then the site (shop). | Go to NexHost, and click your site. |
| 16 | 1:26 | Overview → "Who can open it" → Tailscale row; click the switch. | On the Overview, find "Who can open it". Then turn on the Tailscale switch. |
| 17 | 1:31 | Click "Allow my Tailscale devices"; Windows prompt, Yes. | The first time, click "Allow my Tailscale devices" and choose Yes. You only do this once. |
| 18 | 1:37 | "Your Tailscale network" with the site's links and Copy buttons. | Now your site has its own Tailscale links. Copy one. |
| 19 | 1:41 | Step card: Step 4 of 4, "Open it on another device". | Step 4. Open it on your phone, or another PC. |
| 20 | 1:45 | Phone: app store, Tailscale, Get. Side text: another PC uses tailscale.com/download. | Install Tailscale there too. On a phone, get it from the App Store or Google Play. |
| 21 | 1:50 | Phone sign-in: "Same account as on your PC". | Your own device? Sign in with the same account you used on the PC. |
| 22 | 1:55 | NexDB's Tailscale card; the cursor clicks "Share this PC" ("Invite people" next to it). | Someone else's device? They sign in with their own account. Then, in NexDB, click "Share this PC" or "Invite people", and add them in Tailscale. |
| 23 | 2:05 | Phone: Tailscale Connected, the link is typed, my-shop opens. "It opens, from anywhere!" | Turn Tailscale on. Open the browser, and type or paste your Tailscale link. And there it is! |
| 24 | 2:12 | Checklist: PC on · NexDB running · Tailscale connected on both devices. | Quick checklist: your PC is on, NexDB is running, and Tailscale is connected on both devices. |
| 25 | 2:19 | Nex celebrates. "Your projects, on your devices, from anywhere." NexDB · by Nexio Devs. | That's it! Your projects, on your devices, from anywhere. |

## Facts the script relies on (from the 0.5.7 code)

- NexDB never installs Tailscale or signs in for you. It reads Tailscale's status and shows its links.
- "Allow my Tailscale devices" adds one Windows Firewall rule that lets in only Tailscale addresses (100.64.0.0/10).
  Projects use ports 8181 to 8199; NexHost sites use 8201 to 8219. Windows asks once for each.
- Your own devices sign in with your account. Other people sign in with their own account; then you use
  "Share this PC" (they reach only this PC) or "Invite people" (they join your network), on Tailscale's admin site.
- Tailscale is free for personal projects; client or company work needs a paid Tailscale plan.

## Rebuild

From `promo/`, with the dev server on http://localhost:1420 (`npm --prefix ../app run dev`):

```bash
node tutorial/capture/capture.mjs
```

```bash
.venv/Scripts/python tutorial/narrate.py
```

```bash
npx remotion render src/index.ts TailscaleTutorial out/tut/NexDB-Tailscale-Tutorial.mp4
```

If the 0.5.7 screens change (another session is still finishing the UI), rerun the capture; the targets are
found by button text, so the rings follow the buttons.
