"""NexDB 0.6.1 announcement narration with Kokoro (offline). Writes assets/vo/lineNN.wav and vo.json.
Run with the promo venv: ../../promo/.venv/Scripts/python narrate.py
"""
import json
import pathlib

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

SPEED = 1.08
MAX_PAUSE = 0.14
SAY = [
    "Hey! Nex D B zero point six point one is here!",
    "PHP eight point six is ready to install, right next to the versions you already use.",
    "Nothing changes until you choose it. Nex D B keeps recommending eight point five for now.",
    "PHP, Node, and Apache all get the latest security and bug fixes.",
    "Plus newer engine X, Postgres, Mongo D B, Mailpit, Composer, Git, and more.",
    "On a Mac? Reinstall PHP eight point two, eight point three, or eight point four from Versions to get the correct build.",
    "Update from Settings today, or try Nex D B free for fourteen days.",
]
here = pathlib.Path(__file__).resolve().parent
tts = here.parent.parent / "promo" / "tts"
out = here / "assets" / "vo"
out.mkdir(parents=True, exist_ok=True)
k = Kokoro(str(tts / "kokoro-v1.0.onnx"), str(tts / "voices-v1.0.bin"))
voice = 0.65 * k.get_voice_style("af_heart") + 0.35 * k.get_voice_style("af_bella")


def squeeze(y, sr):
    """Shorten silences inside a line to MAX_PAUSE."""
    w = int(0.02 * sr)
    n = len(y) // w
    quiet = [np.sqrt(np.mean(y[i * w:(i + 1) * w] ** 2)) < 0.008 for i in range(n)]
    keep = int(MAX_PAUSE / 0.02)
    parts, run = [], 0
    for i in range(n):
        run = run + 1 if quiet[i] else 0
        if run <= keep:
            parts.append(y[i * w:(i + 1) * w])
    parts.append(y[n * w:])
    return np.concatenate(parts)


durations = []
for i, text in enumerate(SAY, 1):
    y, sr = k.create(text, voice=voice, speed=SPEED, lang="en-us")
    y = squeeze(y, sr)
    y = y * (0.89 / max(1e-6, np.max(np.abs(y))))
    sf.write(out / f"line{i:02d}.wav", y, sr)
    durations.append(round(len(y) / sr, 3))
(here / "vo.json").write_text(json.dumps(durations), encoding="utf-8")
print(durations, round(sum(durations), 2))
