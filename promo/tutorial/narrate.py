"""Tailscale tutorial narration with Kokoro (offline, af_heart). Each line -> public/tut/vo/NN.wav plus
tutorial/vo.json with durations. SAY is what the voice reads (spelled for the voice); the captions live
in src/tutorial/lines.ts and the readable script in tutorial/SCRIPT.md.
Usage (from promo/): .venv/Scripts/python tutorial/narrate.py [voice] [speed]
"""
import json, sys, pathlib
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

VOICE = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
SPEED = float(sys.argv[2]) if len(sys.argv) > 2 else 0.95
SAY = [
    "Hi! I'm Nex. Let's open your Nex D B projects on your phone, or any other device, from anywhere. We'll use a free app called Tailscale.",
    "Think of Tailscale as a private club for your devices. Only devices in your club can open your links. Nobody else on the internet can.",
    "It's free for personal projects. For client or company work, Tailscale asks for a paid plan.",
    "Step one. Put Tailscale on this PC.",
    "Open your browser, and go to tailscale dot com, slash download. Download the Windows version, and install it like any other app.",
    "When it opens, sign in. Google, Microsoft, or Apple all work. Remember which one you used.",
    "When the Tailscale icon, by the clock, says Connected, step one is done.",
    "Step two. Share a project from Nex D B.",
    "Go to Projects, and click your project's name.",
    "Open the Share tab, and click, Share on my Wi-Fi.",
    "See these new links? They end in ts dot net, or start with one hundred. Those are your Tailscale links.",
    "Windows Firewall still blocks them. So click, Allow my Tailscale devices. Windows asks for permission. Choose Yes.",
    "Don't worry. This only lets in your Tailscale devices. Nobody else.",
    "Step three. Is your site in Nex Host? Open it to Tailscale too.",
    "Go to Nex Host, and click your site.",
    "On the Overview, find, Who can open it. Then turn on the Tailscale switch.",
    "The first time, click, Allow my Tailscale devices, and choose Yes. You only do this once.",
    "Now your site has its own Tailscale links. Copy one.",
    "Step four. Open it on your phone, or another PC.",
    "Install Tailscale there too. On a phone, get it from the App Store, or Google Play.",
    "Is it your own device? Sign in with the same account you used on the PC.",
    "Is it someone else's device? They sign in with their own account. Then, in Nex D B, click Share this PC, or Invite people, and add them in Tailscale.",
    "Turn Tailscale on. Open the browser, and type or paste your Tailscale link. And there it is!",
    "Quick checklist. Your PC is on. Nex D B is running. And Tailscale is connected on both devices.",
    "That's it! Your projects, on your devices, from anywhere.",
]
root = pathlib.Path(__file__).resolve().parent.parent
out = root / "public/tut/vo"
out.mkdir(parents=True, exist_ok=True)
k = Kokoro(str(root / "tts/kokoro-v1.0.onnx"), str(root / "tts/voices-v1.0.bin"))
meta = []
for i, text in enumerate(SAY):
    y, sr = k.create(text, voice=VOICE, speed=SPEED, lang="en-us")
    a = np.abs(y)
    idx = np.where(a > 0.01)[0]
    lo, hi = max(0, idx[0] - int(0.04 * sr)), min(len(y), idx[-1] + int(0.04 * sr))
    y = y[lo:hi]
    sf.write(out / f"{i + 1:02d}.wav", y, sr)
    meta.append({"n": i + 1, "sec": round(len(y) / sr, 2)})
    print(f"{i + 1:02d} {len(y) / sr:5.2f}s  {text}")
json.dump(meta, open(root / "tutorial/vo.json", "w"), indent=1)
