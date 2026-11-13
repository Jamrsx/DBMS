"""Peak offset (frames @30fps) and length of each SFX file: align the peak, not the file start."""
import glob, json, os
import numpy as np, librosa
out = {}
for p in sorted(glob.glob("public/audio/sfx/*.mp3")):
    y, sr = librosa.load(p, sr=None, mono=True)
    env = librosa.feature.rms(y=y, frame_length=1024, hop_length=256)[0]
    t = librosa.frames_to_time(np.argmax(env), sr=sr, hop_length=256)
    peak_db = 20 * np.log10(max(1e-9, np.max(np.abs(y))))
    out[os.path.basename(p)] = {"peakF": round(float(t) * 30, 2), "lenS": round(len(y) / sr, 2), "maxDb": round(float(peak_db), 1)}
json.dump(out, open("analysis/sfx_peaks.json", "w"), indent=1)
for k, v in out.items(): print(k, v)
