"""Hauteur de la voix (SwiftF0) + tonalité. Usage: pitch_vocals.py vocals.wav [other.wav] -> JSON sur stdout."""
import json, sys
import numpy as np, soundfile as sf, soxr
from swift_f0 import SwiftF0

NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

def mono16k(path):
    y, sr = sf.read(path, dtype="float32", always_2d=True)
    return soxr.resample(y.mean(axis=1), sr, 16000)

def key_of(hist):
    best = (-2, 0, "maj")
    for tonic in range(12):
        for name, prof in (("maj", MAJ), ("min", MIN)):
            c = np.corrcoef(hist, np.roll(prof, tonic))[0, 1]
            if c > best[0]: best = (c, tonic, name)
    return {"tonic": NOTES[best[1]], "mode": best[2], "score": round(float(best[0]), 3)}

res = SwiftF0().detect(mono16k(sys.argv[1]), 16000)
ok = res.confidence >= 0.5
midi = 69 + 12 * np.log2(np.maximum(res.pitch_hz, 1) / 440)
hist = np.bincount(np.round(midi[ok]).astype(int) % 12, weights=res.confidence[ok], minlength=12)
out = {"version": 1, "hop": 0.016, "voicedRatio": round(float(ok.mean()), 3)}
if hist.sum() > 0: out["voiceKey"] = key_of(hist)
if len(sys.argv) > 2:  # tonalité du morceau: piste harmonique, hauteur dominante par chroma simple
    y = mono16k(sys.argv[2])[: 16000 * 240]
    spec = np.abs(np.fft.rfft(y.reshape(-1)[: len(y) // 16384 * 16384].reshape(-1, 16384) * np.hanning(16384), axis=1)).sum(0)
    f = np.fft.rfftfreq(16384, 1 / 16000)
    m = (f > 55) & (f < 2000)
    chroma = np.bincount(np.round(69 + 12 * np.log2(f[m] / 440)).astype(int) % 12, weights=spec[m], minlength=12)
    out["songKey"] = key_of(chroma)
# contour décimé (1 point / 4 images = 64 ms): midi arrondi ou -1 si pas de voix
c = np.where(ok, np.round(midi), -1).astype(int)[::4]
out["contour"] = c.tolist()
print(json.dumps(out, separators=(",", ":")))
