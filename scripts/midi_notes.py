"""Notes MIDI des stems. Usage: midi_notes.py <dossier des stems> -> JSON sur stdout.
basic-pitch (other, bass) puis nettoyage; batterie: attaques SuperFlux classées grosse caisse / caisse claire / charley;
accordage du morceau (centièmes de demi-ton)."""
import contextlib, json, os, sys, warnings
warnings.filterwarnings("ignore")
import numpy as np, librosa
from basic_pitch.inference import predict

d = sys.argv[1]
def wav(name):
    p = os.path.join(d, name + ".wav")
    if os.path.exists(p):
        return p
    p = os.path.join(d, name + ".mp3")
    return p if os.path.exists(p) else None

def clean(ev, mono):
    """fusionne les répétitions collées, retire les notes trop courtes, rend la basse monophonique"""
    ev = sorted(ev, key=lambda n: (n[0], n[2]))
    merged = []
    for s, e, p, a in ev:
        last = next((m for m in reversed(merged[-6:]) if m[2] == p), None)
        if last and s - last[1] < 0.02:  # même hauteur, aucun trou: une note coupée en deux (une vraie répétition a toujours un trou)
            last[1] = max(last[1], e); last[3] = max(last[3], a)
        else:
            merged.append([s, e, p, a])
    merged = [m for m in merged if m[1] - m[0] >= 0.09]
    if mono:
        out = []
        for m in merged:
            if out and m[0] < out[-1][1]:
                if m[3] > out[-1][3] * 1.15 or m[0] - out[-1][0] > 0.15: out[-1][1] = m[0]  # la nouvelle note coupe la précédente
                else: continue  # trop faible face à la note en cours: parasite
            if m[1] - m[0] >= 0.06: out.append(m)
        merged = out
    return merged

def notes(path, fmin, fmax, mono):
    with contextlib.redirect_stdout(sys.stderr):  # basic-pitch bavarde sur stdout
        _, _, ev = predict(path, minimum_frequency=fmin, maximum_frequency=fmax, onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=80)
    raw = [[float(s), float(e), int(p), float(a)] for s, e, p, a, *_ in ev if a >= 0.3]
    # basic-pitch places a note ~10 ms after the real attack (measured on the stems): moved back by 10 ms
    return [[round(max(0.0, s - 0.01), 3), round(max(0.0, e - 0.01), 3), p, round(a, 2)] for s, e, p, a in clean(raw, mono)]

def drum_hits(path):
    y, sr = librosa.load(path, sr=22050, mono=True)
    hop, n_fft = 256, 1024
    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop)) ** 2
    mel = librosa.power_to_db(librosa.feature.melspectrogram(S=S, sr=sr, n_mels=64, fmax=11000))
    # SuperFlux: ignore les vibrations. n_fft must be given with S (else librosa aligns as if 2048: one frame late),
    # and backtrack moves each hit from the peak of the curve back to the real start of the sound (was ~35 ms late)
    env = librosa.onset.onset_strength(S=mel, sr=sr, hop_length=hop, lag=2, max_size=3, n_fft=n_fft)
    fr = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, backtrack=True, pre_max=3, post_max=3, pre_avg=12, post_avg=12, delta=0.12, wait=4)
    f = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    low, high = f < 150, f > 5000
    top = float(env.max()) or 1.0
    out = []
    for fi in fr:
        seg = S[:, fi:fi + 4].sum(axis=1)
        tot = float(seg.sum()) or 1.0
        lo, hi = float(seg[low].sum()) / tot, float(seg[high].sum()) / tot
        mid = 1 - lo - hi
        cls = 0 if lo > 0.5 else (2 if hi > 0.6 and mid < 0.15 else 1)  # 0 grosse caisse, 1 caisse claire, 2 charley
        out.append([round(float(librosa.frames_to_time(fi, sr=sr, hop_length=hop)), 3), round(float(env[fi]) / top, 2), cls])
    return out

# hats: a semi-adaptive NMF (kick, snare, hat, tom, cymbal templates + 2 free parts) hears a hat under a kick, which the
# single onset curve above cannot: on rendered songs from real kits, hats found 12 % -> 51 %, onsets 57 % -> 80 %
PARAMS = {"share": 0.15, "min_strength": 0.1, "open_level": 0.5, "open_time": 0.18, "cym_time": 0.35, "delta": 0.06, "tom_share": 0.4}


def nmf_drum_hits(path):
    # Load audio and compute spectrogram
    y, sr = librosa.load(path, sr=22050, mono=True)
    S = np.abs(librosa.stft(y, n_fft=1024, hop_length=256))
    fb = librosa.filters.mel(sr=sr, n_fft=1024, n_mels=96, fmin=30, fmax=11000)
    V = fb @ S + 1e-9
    freqs = librosa.mel_frequencies(n_mels=96, fmin=30, fmax=11000)

    # Build initial templates
    def g(f, c, w):
        return np.exp(-0.5 * (np.log2(f / c) / w) ** 2)

    kick = g(freqs, 60, 0.6) + 0.05 * g(freqs, 3000, 1.0)
    snare = g(freqs, 200, 0.5) + 0.6 * g(freqs, 2500, 1.2) + 0.3 * g(freqs, 6000, 0.8)
    hat = g(freqs, 8000, 0.5) + 0.2 * g(freqs, 5000, 0.5)
    tom = g(freqs, 120, 0.5) + 0.05 * g(freqs, 1500, 1.0)
    cymbal = g(freqs, 6000, 0.9) + 0.4 * g(freqs, 3000, 0.8)

    rng = np.random.default_rng(0)
    W0 = np.column_stack([kick, snare, hat, tom, cymbal, rng.random((96, 2))])
    W0 /= W0.sum(axis=0, keepdims=True)
    W = W0.copy()

    # NMF with KL divergence
    K, T = W.shape[1], V.shape[1]
    H = 0.1 + rng.random((K, T)) * 0.01
    H *= V.mean() / (W @ H).mean()

    for _ in range(60):
        R = V / (W @ H + 1e-9)
        H *= (W.T @ R) / (W.sum(axis=0)[:, None] + 1e-9)
        R = V / (W @ H + 1e-9)
        Wn = W * (R @ H.T) / (H.sum(axis=1)[None, :] + 1e-9)
        W[:, :5] = 0.7 * W0[:, :5] + 0.3 * Wn[:, :5]
        W[:, 5:] = Wn[:, 5:]
        W /= W.sum(axis=0, keepdims=True)

    # Compute WH for crosstalk filter
    WH = W @ H

    # Peak picking and classification
    hits = []
    for k in range(5):
        a = H[k]
        o = np.maximum(0, np.diff(np.log(1 + 100 * a / a.max())))
        o = np.concatenate([[0], o])
        peaks = librosa.util.peak_pick(o.astype(np.float64), pre_max=3, post_max=3, pre_avg=10, post_avg=10, delta=float(PARAMS["delta"] * o.max()), wait=4)

        for p in peaks:
            while p > 0 and o[p - 1] > PARAMS["min_strength"] * o[p]:
                p -= 1
            strength = a[p] / np.percentile(a[peaks], 95)
            strength = min(strength, 1.0)
            if strength < PARAMS["min_strength"]:
                continue

            # Crosstalk filter
            w = W[:, k]; share = (w @ (np.outer(w, H[k, p:min(p+3, T)]))).sum() / ((w @ WH[:, p:min(p+3, T)]).sum() + 1e-9)  # in the component's own band
            if k == 3 and share < PARAMS["tom_share"]:
                continue
            elif k != 3 and share < PARAMS["share"]:
                continue

            time = librosa.frames_to_time(p, sr=sr, hop_length=256)
            cls = k

            if k == 2 or k == 4:
                duration = 0
                while p + duration < T and a[p + duration] > PARAMS["open_level"] * a[p]:
                    duration += 1
                duration_time = librosa.frames_to_time(duration, sr=sr, hop_length=256)
                if duration_time > PARAMS["open_time"]:
                    cls = 3 if k == 2 else 4
                else:
                    cls = 2 if k == 2 else 4

            hits.append([round(time, 3), round(strength, 2), cls])

    # Merge duplicates
    hits.sort()
    merged_hits = []
    i = 0
    while i < len(hits):
        j = i + 1
        while j < len(hits) and hits[j][0] - hits[i][0] < 0.03 and hits[j][2] == hits[i][2]:
            j += 1
        merged_hits.append(max(hits[i:j], key=lambda x: x[1]))
        i = j

    return merged_hits

# with 6 stems guitar and piano carry the chords: their notes join "other"
out = {"version": 1, "rev": 5}
other_notes = []
if wav("other"): other_notes.extend(notes(wav("other"), 60, 2000, False))
if wav("guitar"): other_notes.extend(notes(wav("guitar"), 60, 2000, False))
if wav("piano"): other_notes.extend(notes(wav("piano"), 60, 2000, False))
if other_notes: out["other"] = sorted(other_notes, key=lambda n: (n[0], n[2]))
if wav("bass"): out["bass"] = notes(wav("bass"), 30, 400, True)
if wav("drums"):
    # kick and snare from the onset curve (best on them), every hat from the NMF (cymbals and open hats count as hats)
    kicks_snares = [h for h in drum_hits(wav("drums")) if h[2] in (0, 1)]
    hats = [[t, v, 2] for t, v, c in nmf_drum_hits(wav("drums")) if c in (2, 3, 5)]
    out["drums"] = sorted(kicks_snares + hats)
ref = wav("other") or wav("bass")
if ref:  # accordage: écart au la 440 en demi-tons (± 0,5)
    y, sr = librosa.load(ref, sr=22050, mono=True, duration=180)
    out["tuning"] = round(float(librosa.estimate_tuning(y=y, sr=sr)), 2)
print(json.dumps(out, separators=(",", ":")))
