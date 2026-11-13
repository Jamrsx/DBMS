"""Original background track for the Mac teaser, synthesized offline (no samples, no services).
Timed to the video: it reads mac/vo.json and repeats MacTeaser.tsx's beat-grid timing, so the
drop lands on the Mac window reveal (line 3) and the drums stop for a final chord on the end card
(line 6). 123 BPM, key of F major (Dm - Bb - F - C).
Output: public/mac/music.wav (stereo, 44.1 kHz).
Usage (from promo/): .venv/Scripts/python mac/compose.py
"""
import json, math, pathlib
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

root = pathlib.Path(__file__).resolve().parent.parent
SR = 44100
FPS = 30
BPM = 123
BEAT_S = 60 / BPM
HALF_F = FPS * BEAT_S / 2

# ---- same timing as src/mac/MacTeaser.tsx ----
vo = json.load(open(root / "mac/vo.json"))
snap = lambda fr: math.ceil(fr / HALF_F - 1e-6) * HALF_F
starts, ex = [], snap(16)
for v in vo:
    say = math.ceil(v["sec"] * FPS)
    starts.append(ex)
    ex = snap(ex + say + 4)
last_say = math.ceil(vo[-1]["sec"] * FPS)
TOTAL_S = round(snap(starts[-1] + last_say + 66)) / FPS
DROP = starts[2] / FPS     # Mac window reveal
OUTRO = starts[5] / FPS    # end card
LEN = TOTAL_S + 2.5        # room for the reverb tail; the video fades it out
N = int(LEN * SR)
t = np.arange(N) / SR
print(f"drop {DROP:.2f}s  outro {OUTRO:.2f}s  video {TOTAL_S:.2f}s")

def midi(m): return 440 * 2 ** ((m - 69) / 12)
def lp(x, fc, order=2): return sosfilt(butter(order, fc, "low", fs=SR, output="sos"), x)
def hp(x, fc, order=2): return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], "band", fs=SR, output="sos"), x)
def env_ad(n, a, d):
    e = np.ones(n)
    na = max(1, int(a * SR)); e[:na] = np.linspace(0, 1, na)
    return e * np.exp(-np.maximum(0, np.arange(n) - na) / (d * SR))
def add(buf, x, at):
    i = int(at * SR)
    if i >= len(buf): return
    x = x[: len(buf) - i]; buf[i:i + len(x)] += x

rng = np.random.default_rng(7)
# chords: (bass root, pad notes) over 2 bars each, loop
CHORDS = [(38, [62, 65, 69, 74]),   # Dm
          (34, [62, 65, 70, 74]),   # Bb
          (41, [60, 65, 69, 72]),   # F
          (36, [60, 64, 67, 72])]   # C
BAR = BEAT_S * 4
def chord_at(s): return CHORDS[int(s // (BAR * 2)) % 4]

L = np.zeros(N); R = np.zeros(N)

# ---- pad: band-limited detuned saws, slow filter swell, chord changes every 2 bars ----
pad = np.zeros((2, N))
seg = BAR * 2
for k in range(int(LEN // seg) + 1):
    s0 = k * seg
    if s0 >= OUTRO: break
    _, notes = chord_at(s0)
    n = int(min(seg + 0.6, LEN - s0) * SR)
    tt = np.arange(n) / SR
    for ch, det in ((0, -0.08), (1, 0.08)):
        x = np.zeros(n)
        for m in notes:
            for d in (det, -det * 0.5):
                f = midi(m) * 2 ** (d / 12)
                for h in range(1, 10):
                    if f * h > 9000: break
                    x += np.sin(2 * np.pi * f * h * tt + rng.uniform(0, 6.28)) / h
        e = np.minimum(1, tt / 0.5) * np.minimum(1, np.maximum(0, (n / SR - tt)) / 0.6)
        add(pad[ch], x * e * 0.018, s0)
# filter: dark in the intro, opening toward the drop, bright after
pad_bright = lp(pad, 900, 2), lp(pad, 3800, 2)
open_k = np.clip((t - (DROP - BAR * 2)) / (BAR * 2), 0, 1)
pad = pad_bright[0] * (1 - open_k) + pad_bright[1] * open_k
intro_fade = np.clip(t / 1.2, 0, 1)
pad *= intro_fade

# sidechain pump after the drop (quarter notes)
ph = (t % BEAT_S) / BEAT_S
pump = np.where((t >= DROP) & (t < OUTRO), 0.35 + 0.65 * np.clip(ph / 0.45, 0, 1) ** 0.7, 1.0)
pad *= pump

# ---- pluck arp: 8th notes, chord tones up an octave, dotted-8th echo ----
arp = np.zeros(N)
eighth = BEAT_S / 2
pattern = [0, 2, 1, 3, 2, 1, 3, 2]
k = 0
s = 0.0
while s < OUTRO - 0.01:
    _, notes = chord_at(s)
    m = notes[pattern[k % 8]] + 12
    f = midi(m)
    n = int(0.5 * SR); tt = np.arange(n) / SR
    tone = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt * 18) + 0.12 * np.sin(2 * np.pi * 3 * f * tt) * np.exp(-tt * 30)
    vel = 0.55 + 0.45 * (k % 2 == 0)
    level = 0.05 if s < DROP else 0.065
    add(arp, tone * env_ad(n, 0.003, 0.16) * vel * level, s)
    k += 1; s += eighth
arp *= np.clip((t - BAR * 1) / (BAR * 2), 0, 1)   # arp enters after the first bar, fades up
d = int(BEAT_S * 0.75 * SR)
echo = np.zeros(N); echo[d:] = arp[:-d] * 0.38
echo2 = np.zeros(N); echo2[2 * d:] = arp[:-2 * d] * 0.16
arpL, arpR = arp + echo2, arp * 0.8 + echo
arpL, arpR = lp(arpL, 6000), lp(arpR, 6000)

# ---- drums (drop to outro) ----
drum = np.zeros(N)
hat = np.zeros(N)
kn = int(0.45 * SR); kt = np.arange(kn) / SR
kick = np.sin(2 * np.pi * np.cumsum(45 + 95 * np.exp(-kt * 32)) / SR) * np.exp(-kt * 7.5)
kick += 0.25 * hp(rng.standard_normal(kn), 3000) * np.exp(-kt * 300)
hn = int(0.08 * SR); htt = np.arange(hn) / SR
cn = int(0.25 * SR); ct = np.arange(cn) / SR
clap = bp(rng.standard_normal(cn), 900, 4000) * (np.exp(-ct * 25) + 0.5 * np.exp(-np.maximum(0, ct - 0.012) * 40) * (ct > 0.012))
b = 0
s = DROP
while s < OUTRO - 0.01:
    add(drum, kick * 0.55, s)
    if b % 2 == 1: add(drum, clap * 0.16, s)
    add(hat, hp(rng.standard_normal(hn), 7000) * np.exp(-htt * 60) * 0.12, s + BEAT_S / 2)
    add(hat, hp(rng.standard_normal(hn), 9000) * np.exp(-htt * 120) * 0.04, s + BEAT_S / 4 * 3)
    b += 1; s += BEAT_S
# soft pulse in the intro second half (filtered kick), so it is not static before the drop
s = DROP - BAR * 2
while s < DROP - 0.01:
    add(drum, lp(kick, 300) * 0.22, s); s += BEAT_S

# ---- sub bass: offbeat 8ths after the drop, long notes in the intro's last 2 bars ----
bass = np.zeros(N)
s = DROP
while s < OUTRO - 0.01:
    root_m, _ = chord_at(s)
    f = midi(root_m)
    n = int(eighth * 0.95 * SR); tt = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt)
    add(bass, x * env_ad(n, 0.005, 0.25) * 0.20, s + eighth)
    s += BEAT_S
bass = lp(bass, 400)

# ---- riser into the drop, and the downlifter/impact ----
rn = int(BAR * 2 * SR); rt = np.arange(rn) / SR
noise = rng.standard_normal(rn)
riser = np.zeros(rn)
for i, fc in enumerate(np.linspace(300, 6000, 16)):
    a, z = i * rn // 16, (i + 1) * rn // 16
    riser[a:z] = bp(noise, fc * 0.7, min(fc * 1.4, 20000))[a:z]
riser *= (rt / rt[-1]) ** 2 * 0.09
add(drum, riser, DROP - BAR * 2)
imp_n = int(2.5 * SR); it = np.arange(imp_n) / SR
impact = np.sin(2 * np.pi * np.cumsum(30 + 60 * np.exp(-it * 6)) / SR) * np.exp(-it * 2.2) * 0.4
add(drum, impact, DROP)

# ---- outro: drums stop, held F major chord with a soft bell on top ----
outro = np.zeros(N)
on = int((LEN - OUTRO) * SR); ot = np.arange(on) / SR
for m in (41, 53, 60, 65, 69, 72, 77):
    f = midi(m)
    x = sum(np.sin(2 * np.pi * f * h * ot) / h for h in range(1, 6) if f * h < 8000)
    outro[int(OUTRO * SR):int(OUTRO * SR) + on] += x * np.minimum(1, ot / 0.05) * np.exp(-ot * 0.55) * 0.03
for m, dly in ((81, 0.0), (84, 0.25), (89, 0.5)):
    f = midi(m)
    bell = (np.sin(2 * np.pi * f * ot) + 0.4 * np.sin(2 * np.pi * f * 2.76 * ot) * np.exp(-ot * 4)) * np.exp(-ot * 1.4) * 0.05
    add(outro, bell, OUTRO + dly)
add(outro, impact * 0.8, OUTRO)
outro = lp(outro, 5000)

# ---- mix, reverb, master ----
L = pad[0] + arpL + outro + bass + drum + hat * 0.9
R = pad[1] + arpR + outro + bass + drum + hat * 1.1
def ir(seed, sec=2.2):
    r = np.random.default_rng(seed); n = int(sec * SR); x = r.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.0)
    return lp(x, 6000) / np.sqrt(np.sum(x ** 2))
send = pad + np.stack([arpL, arpR]) * 1.2 + outro * 1.5
wetL = fftconvolve(send[0], ir(1))[:N]
wetR = fftconvolve(send[1], ir(2))[:N]
L += wetL * 0.45; R += wetR * 0.45
mix = np.stack([L, R])
mix = hp(mix, 30)
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 0.89 / np.max(np.abs(mix))
fade = np.clip((LEN - t) / 1.5, 0, 1)
mix *= fade
out = root / "public/mac/music.wav"
sf.write(out, mix.T, SR)
print("wrote", out, f"{LEN:.2f}s")
