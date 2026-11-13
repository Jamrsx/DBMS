# NexDB — "Coming soon to Mac" teaser (2026-11-15)

Status check: NexDB for Mac is **not released**. The port is only planned (`docs/macos-port.md`, floor macOS 12), with no code ported and no Mac build yet. So the video says "Coming soon to Mac", never "Now on Mac", and gives no release date.

- Composition: `MacTeaser` (`src/mac/MacTeaser.tsx`), 1920x1080, 30 fps, about 32 s
- Voice: the user's own ElevenLabs recordings (1.mp3 to 6.mp3), converted to `public/mac/vo/01.wav` to `06.wav` with the silence at each end trimmed. The earlier Kokoro take (`mac/narrate.py`) is kept in `public/mac/vo-kokoro/`. Running `narrate.py` again overwrites `public/mac/vo/`.
- Music: original track made for this video by `mac/compose.py` (synthesized on the PC, no samples or services) at `public/mac/music.wav`. 123 BPM, F major (Dm-Bb-F-C). A soft build under lines 1-2, the drop on the Mac window reveal, drums under lines 3-5, then a held chord on the end card. Ducks under the voice. Swooshes on the cuts. Re-run `compose.py` if the voice clips change length.
- Look: soft blue gradient background, white/grey type, no colored pills; masked slide-up text reveals, slow push-ins, 3D settle on the Mac window, blur-out cuts.
- Screens: real NexDB captures (practice data), drawn inside a mock macOS window frame. The frame carries a "Preview · Windows screens shown" label, as the user agreed.
- Output: `out/mac/NexDB-Coming-Soon-to-Mac.mp4`

| # | On screen | Voice (caption) |
|---|-----------|-----------------|
| 1 | Nex waves, NexDB logo, "COMING SOON TO MAC" label | Hey, I'm Nex! And guess what? NexDB is coming to Mac! |
| 2 | Apache, PHP, MySQL, Node revealed one per beat, "All in one app." | Apache, PHP, MySQL and Node, all in one app, with zero setup headaches! |
| 3 | Mock Mac window cycling Dashboard, Projects, NexHost Overview; "Preview" label | Your projects, your databases and NexHost, right on your Mac, really soon! |
| 4 | Nex thinking, "In development" headline, "MAC VERSION" label | We're building it right now! It's not out yet, so stay tuned. |
| 5 | Logo, "Available now on Windows" headline, "14-DAY FREE TRIAL" label | Can't wait? NexDB is on Windows today, with a 14-day free trial! |
| 6 | End card: Nex, logo, "Coming soon to Mac", "Mac release date to be announced" | NexDB. Coming soon to Mac! |

## Rebuild

```bash
# voice: your recordings are already in public/mac/vo (narrate.py would overwrite them with Kokoro)
.venv/Scripts/python mac/compose.py
npx remotion render src/index.ts MacTeaser out/mac/NexDB-Coming-Soon-to-Mac.mp4
```

When a Mac build actually ships: re-capture real Mac screens, drop the "Preview" label, and change the wording to "Now on Mac".
