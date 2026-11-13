"""Narration with Kokoro (offline). Each line -> public/audio/vo/NN.wav (24 kHz mono), plus vo.json
with durations. `say` is the spelling the voice reads; the caption text lives in src/narration.ts.
Usage: .venv/Scripts/python analysis/narrate.py [voice] [speed]
"""
import json, sys, pathlib
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

VOICE = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
SPEED = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
SAY = [
    "Apache. PHP. My S Q L. Node. Every project needs them... and setting them up can eat your whole day.",
    "Meet Nex D B. Your whole local stack, in one app.",
    "No more juggling tools. Everything lives in one place.",
    "Press Start all... and everything comes to life. Web server, PHP, databases, running in seconds.",
    "Stopped, or running. One click.",
    "Need a different PHP version? Switch it in a click.",
    "Start a fresh Laravel app in minutes, not hours.",
    "Open your projects in one click.",
    "Explore your database.",
    "And run every tool from one terminal.",
    "Something broke? Nex, your built-in helper, finds it... and fixes it.",
    "Catch every email your app sends. Run Postgres and Redis too.",
    "Composer, Artisan, N P M... all ready to go.",
    "And when your site is ready to share...",
    "meet Nex Host.",
    "Import your project. Edit your files, right here.",
    "Then update your live site with one click.",
    "Your own PC becomes the server. No complicated setup.",
    "Go live... and anyone can open your site.",
    "Build it. Host it. From your own PC.",
    "Pick the plan that fits you.",
    "Four years, with Nex Host included.",
    "And we keep making it better.",
    "Get your free launch key. Seven days, every feature, Nex Host included.",
    "Nex D B. By Nexio Devs.",
]
root = pathlib.Path(__file__).resolve().parent.parent
out = root / "public/audio/vo"
out.mkdir(parents=True, exist_ok=True)
k = Kokoro(str(root / "tts/kokoro-v1.0.onnx"), str(root / "tts/voices-v1.0.bin"))
meta = []
for i, text in enumerate(SAY):
    y, sr = k.create(text, voice=VOICE, speed=SPEED, lang="en-us")
    # trim near-silence at both ends (keep 40 ms), so a clip starts on its first sound
    a = np.abs(y)
    idx = np.where(a > 0.01)[0]
    lo, hi = max(0, idx[0] - int(0.04 * sr)), min(len(y), idx[-1] + int(0.04 * sr))
    y = y[lo:hi]
    sf.write(out / f"{i + 1:02d}.wav", y, sr)
    meta.append({"n": i + 1, "sec": round(len(y) / sr, 2)})
    print(f"{i + 1:02d} {len(y) / sr:5.2f}s  {text}")
json.dump(meta, open(root / "analysis/vo.json", "w"), indent=1)
