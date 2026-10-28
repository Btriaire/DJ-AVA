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
out = {"version": 1, "rev": 2, "hop": 0.016, "voicedRatio": round(float(ok.mean()), 3)}
if hist.sum() > 0: out["voiceKey"] = key_of(hist)
if len(sys.argv) > 2:  # tonalité du morceau: piste harmonique, hauteur dominante par chroma simple
    y = mono16k(sys.argv[2])[: 16000 * 240]
    spec = np.abs(np.fft.rfft(y.reshape(-1)[: len(y) // 16384 * 16384].reshape(-1, 16384) * np.hanning(16384), axis=1)).sum(0)
    f = np.fft.rfftfreq(16384, 1 / 16000)
    m = (f > 55) & (f < 2000)
    chroma = np.bincount(np.round(69 + 12 * np.log2(f[m] / 440)).astype(int) % 12, weights=spec[m], minlength=12)
    out["songKey"] = key_of(chroma)
# contour: demi-tons fractionnaires (au dixième), -1 si pas de voix. Nettoyé: octaves aberrantes corrigées,
# médiane sur 5 images (le vibrato et les à-coups ne font plus de fausses notes), segments < 80 ms retirés,
# puis un point par bloc de 4 images (64 ms) = la médiane des images voisées du bloc.
def runs(mask):
    i = 0
    while i < len(mask):
        if mask[i]:
            j = i
            while j < len(mask) and mask[j]: j += 1
            yield i, j
            i = j
        else: i += 1

def smooth(m, ok):
    m = m.copy(); ok = ok.copy()
    for a, b in list(runs(ok)):
        if b - a < 5: ok[a:b] = False; continue  # trop court pour être une note chantée
        seg = m[a:b]
        for i in range(len(seg)):  # octave: l'image saute d'une octave par rapport à ses voisines
            lo, hi = max(0, i - 4), min(len(seg), i + 5)
            med = np.median(seg[lo:hi])
            k = round((seg[i] - med) / 12)
            if k != 0 and abs(seg[i] - 12 * k - med) < 2.5: seg[i] -= 12 * k
        pad = np.pad(seg, 2, mode="edge")
        m[a:b] = np.median(np.stack([pad[i:i + len(seg)] for i in range(5)]), axis=0)
    return m, ok

midi, ok = smooth(midi, ok)
n = len(midi) // 4 * 4
blocks = [(midi[i:i + 4][ok[i:i + 4]]) for i in range(0, n, 4)]
c = [float(np.median(b)) if len(b) >= 2 else -1.0 for b in blocks]
for i in range(1, len(c) - 1):  # a one-block hole inside a held note is not silence
    if c[i] < 0 and c[i - 1] >= 0 and c[i + 1] >= 0 and abs(c[i - 1] - c[i + 1]) < 1: c[i] = (c[i - 1] + c[i + 1]) / 2
i = 1
while i < len(c) - 1:  # a plateau of <= 3 blocks (200 ms) far from the notes on both sides is a detection error
    if c[i] < 0: i += 1; continue
    j = i
    while j < len(c) and c[j] >= 0 and abs(c[j] - c[i]) < 1: j += 1
    if j - i <= 3 and j < len(c) and c[i - 1] >= 0 and c[j] >= 0 and abs(c[i - 1] - c[j]) < 2 and abs(c[i] - c[i - 1]) > 5:
        for k in range(i, j): c[k] = (c[i - 1] + c[j]) / 2
    i = max(j, i + 1)
out["contour"] = [round(v, 1) if v >= 0 else -1 for v in c]
print(json.dumps(out, separators=(",", ":")))
