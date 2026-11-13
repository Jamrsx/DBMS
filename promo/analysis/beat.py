"""Beat grid + drum hits + energy sections for the promo BGM (music-beat-sync method).
Usage: .venv/Scripts/python analysis/beat.py <bgm.mp3>  ->  analysis/beat_data.json, grid_drift.json
"""
import json, sys
import numpy as np, librosa
from scipy.signal import butter, sosfilt

path = sys.argv[1]
y, sr = librosa.load(path, sr=None, mono=True)
dur = len(y) / sr
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, tightness=400, units="time")

def fit(b):
    i = np.arange(len(b))
    A = np.vstack([i, np.ones_like(i)]).T
    (T, t0), *_ = np.linalg.lstsq(A, b, rcond=None)
    return T, t0, b - (t0 + i * T)

T, t0, res = fit(beats)

perc = librosa.effects.hpss(y)[1]
def band_env(lo, hi):
    sos = butter(4, [lo, hi], btype="band", fs=sr, output="sos")
    env = librosa.onset.onset_strength(y=sosfilt(sos, perc), sr=sr)
    return env, librosa.times_like(env, sr=sr)

onsets = librosa.onset.onset_detect(y=perc, sr=sr, units="time")
def score(Tc, t0c):
    grid = np.arange(t0c, dur - 0.05, Tc)
    d = np.array([np.min(np.abs(onsets - g)) for g in grid])
    match = float(np.mean(d < 0.035))
    i = np.arange(len(grid))
    slope = np.polyfit(i, d, 1)[0] * len(grid) if len(grid) > 2 else 0
    return {"bpm": 60 / Tc, "match": match, "mean_abs_ms": float(np.mean(d[d < 0.035]) * 1000) if np.any(d < 0.035) else None, "drift_ms": float(slope * 1000)}

cands = {"0.5x": score(T * 2, t0), "1x": score(T, t0), "2x": score(T / 2, t0)}
win = max(cands, key=lambda k: cands[k]["match"] - (0.02 if k != "1x" else 0))

kick, kt = band_env(40, 160)
snare, st = band_env(150, 500)
hat, ht = band_env(6000, 14000)
nb = int((dur - t0) / T)
hits = []
for n in range(nb):
    t = t0 + n * T
    k = float(kick[np.argmin(np.abs(kt - t))]); s = float(snare[np.argmin(np.abs(st - t))])
    hits.append({"beat": n, "t": round(t, 4), "kick": round(k, 3), "snare": round(s, 3)})

rms = librosa.feature.rms(y=y)[0]
rt = librosa.times_like(rms, sr=sr)
bars = []
for b in range(nb // 4):
    a, z = t0 + b * 4 * T, t0 + (b + 1) * 4 * T
    m = (rt >= a) & (rt < z)
    bars.append(round(float(rms[m].mean()), 4) if m.any() else 0)
mx = max(bars) or 1
levels = ["low" if v < 0.55 * mx else "mid" if v < 0.85 * mx else "high" for v in bars]
sections, start = [], 0
for i in range(1, len(levels) + 1):
    if i == len(levels) or levels[i] != levels[start]:
        sections.append({"bars": [start, i - 1], "beats": [start * 4, i * 4 - 1], "t": [round(t0 + start * 4 * T, 2), round(t0 + i * 4 * T, 2)], "energy": levels[start]})
        start = i
top = sorted(hits, key=lambda h: -h["kick"])[:8]
out = {"file": path, "duration": round(dur, 3), "bpm": round(60 / T, 3), "t0": round(t0, 4), "T": round(T, 5),
       "residual_ms": round(float(np.abs(res).max() * 1000), 1), "beats": [round(float(b), 4) for b in beats],
       "hits": hits, "top_kicks": top, "bar_rms": bars, "sections": sections}
json.dump(out, open("analysis/beat_data.json", "w"), indent=1)
json.dump({"candidates": cands, "winner": win}, open("analysis/grid_drift.json", "w"), indent=1)
print(f"dur={dur:.1f}s BPM={60/T:.2f} t0={t0:.3f} T={T:.4f} residual±{np.abs(res).max()*1000:.0f}ms winner={win}")
print("candidates:", {k: (round(v['match'], 3), v['mean_abs_ms'] and round(v['mean_abs_ms'], 1)) for k, v in cands.items()})
for s in sections: print("section", s)
print("top kicks (beat, t):", [(h["beat"], h["t"]) for h in top])
