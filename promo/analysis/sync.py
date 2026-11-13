"""Audio sync check (sound-design §4.6): cross-correlate SFX source files against the rendered SFX-only
track around their designed peak frames. Residual = where the peak landed − where it was designed.
Usage: .venv/Scripts/python analysis/sync.py out/sfx-track.wav
"""
import sys, json
import numpy as np, librosa

T0, BEAT, FPS = 9.458, 0.48387, 30
beatF = lambda n: round((T0 + n * BEAT) * FPS)
probes = [
    ("impact-deep-whoosh.mp3", beatF(12)),
    ("switch-click-quick.mp3", beatF(26)),
    ("sparkle-poof-hit.mp3", beatF(116)),  # v2: Fix burst
    ("switch-tap.mp3", beatF(274)),  # v2: beat-step word 2
    ("switch-click-quick.mp3", beatF(292)),  # v2: 4-year plan press
    ("impact-deep-whoosh.mp3", beatF(336)),  # v2: icon bloom (big hit #3)
]
peaks = json.load(open("analysis/sfx_peaks.json"))
y, sr = librosa.load(sys.argv[1], sr=None, mono=True)
for name, target in probes:
    s, _ = librosa.load(f"public/audio/sfx/{name}", sr=sr, mono=True)
    lo = int(max(0, (target / FPS - 1.5)) * sr)
    seg = y[lo : lo + int(3 * sr)]
    c = np.correlate(seg, s[: min(len(s), len(seg) // 2)], mode="valid")
    start = (lo + int(np.argmax(np.abs(c)))) / sr * FPS  # frame where the file starts in the render
    landed = start + peaks[name]["peakF"]
    print(f"{name:26s} designed peak f{target:5d}  landed f{landed:8.2f}  residual {landed - target:+.2f}f")
