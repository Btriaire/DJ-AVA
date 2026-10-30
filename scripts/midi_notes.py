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

# with 6 stems guitar and piano carry the chords: their notes join "other"
out = {"version": 1, "rev": 4}
other_notes = []
if wav("other"): other_notes.extend(notes(wav("other"), 60, 2000, False))
if wav("guitar"): other_notes.extend(notes(wav("guitar"), 60, 2000, False))
if wav("piano"): other_notes.extend(notes(wav("piano"), 60, 2000, False))
if other_notes: out["other"] = sorted(other_notes, key=lambda n: (n[0], n[2]))
if wav("bass"): out["bass"] = notes(wav("bass"), 30, 400, True)
if wav("drums"): out["drums"] = drum_hits(wav("drums"))
ref = wav("other") or wav("bass")
if ref:  # accordage: écart au la 440 en demi-tons (± 0,5)
    y, sr = librosa.load(ref, sr=22050, mono=True, duration=180)
    out["tuning"] = round(float(librosa.estimate_tuning(y=y, sr=sr)), 2)
print(json.dumps(out, separators=(",", ":")))
