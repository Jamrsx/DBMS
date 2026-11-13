"""Mac teaser narration with Kokoro (offline, af_heart). Each line -> public/mac/vo/NN.wav plus
mac/vo.json with durations. SAY is what the voice reads (spelled for the voice); captions live in
src/mac/MacTeaser.tsx and the readable script in mac/SCRIPT.md.
Usage (from promo/): .venv/Scripts/python mac/narrate.py [voice] [speed]
"""
import json, sys, pathlib
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

# Default voice: a 65/35 blend of af_heart (warm) and af_bella (bright) for a livelier read.
VOICE = sys.argv[1] if len(sys.argv) > 1 else "heart+bella"
SPEED = float(sys.argv[2]) if len(sys.argv) > 2 else 1.1
MAX_PAUSE = 0.14  # seconds; Kokoro leaves 0.3-0.5 s at full stops, which sounds robotic
SAY = [
    "Hey, I'm Nex! And guess what? Nex D B is coming to Mac!",
    "Apache, PHP, MySQL and Node, all in one app, with zero setup headaches!",
    "Your projects, your databases, and Nex Host, right on your Mac, really soon!",
    "We're building it right now! It's not out yet, so stay tuned.",
    "Can't wait? Nex D B is on Windows today, with a fourteen-day free trial!",
    "Nex D B. Coming soon to Mac!",
]
root = pathlib.Path(__file__).resolve().parent.parent
out = root / "public/mac/vo"
out.mkdir(parents=True, exist_ok=True)
k = Kokoro(str(root / "tts/kokoro-v1.0.onnx"), str(root / "tts/voices-v1.0.bin"))
voice = VOICE
if VOICE == "heart+bella":
    voice = 0.65 * k.get_voice_style("af_heart") + 0.35 * k.get_voice_style("af_bella")


def squeeze(y, sr):
    """Shorten silences inside a line to MAX_PAUSE (20 ms frames, quiet = RMS < 0.008)."""
    w = int(0.02 * sr)
    n = len(y) // w
    quiet = [np.sqrt(np.mean(y[i * w:(i + 1) * w] ** 2)) < 0.008 for i in range(n)]
    keep = int(MAX_PAUSE / 0.02)
    out, run = [], 0
    for i in range(n):
        run = run + 1 if quiet[i] else 0
        if run <= keep:
            out.append(y[i * w:(i + 1) * w])
    out.append(y[n * w:])
    return np.concatenate(out)


meta = []
for i, text in enumerate(SAY):
    y, sr = k.create(text, voice=voice, speed=SPEED, lang="en-us")
    y = squeeze(y, sr)
    y = y * (0.89 / max(1e-6, np.max(np.abs(y))))  # same peak level on every line
    idx = np.where(np.abs(y) > 0.01)[0]
    lo, hi = max(0, idx[0] - int(0.04 * sr)), min(len(y), idx[-1] + int(0.04 * sr))
    y = y[lo:hi]
    sf.write(out / f"{i + 1:02d}.wav", y, sr)
    meta.append({"n": i + 1, "sec": round(len(y) / sr, 2)})
    print(f"{i + 1:02d} {len(y) / sr:5.2f}s  {text}")
json.dump(meta, open(root / "mac/vo.json", "w"), indent=1)
