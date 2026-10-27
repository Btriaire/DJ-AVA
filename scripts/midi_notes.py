"""Notes MIDI des stems (basic-pitch: other, bass; librosa: attaques de la batterie). Usage: midi_notes.py <dossier des stems> -> JSON sur stdout."""
import contextlib, json, os, sys, warnings
warnings.filterwarnings("ignore")
import numpy as np, librosa
from basic_pitch.inference import predict

d = sys.argv[1]
def wav(name):
    p = os.path.join(d, name + ".wav")
    return p if os.path.exists(p) else None

def notes(path, fmin, fmax):
    with contextlib.redirect_stdout(sys.stderr):  # basic-pitch bavarde sur stdout
        _, _, ev = predict(path, minimum_frequency=fmin, maximum_frequency=fmax, onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=80)
    ev = sorted(ev, key=lambda n: n[0])
    return [[round(float(s), 3), round(float(e), 3), int(p), round(float(a), 2)] for s, e, p, a, *_ in ev if a >= 0.3]

out = {"version": 1}
if wav("other"): out["other"] = notes(wav("other"), 60, 2000)
if wav("bass"): out["bass"] = notes(wav("bass"), 30, 400)
if wav("drums"):
    y, sr = librosa.load(wav("drums"), sr=22050, mono=True)
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=256)
    fr = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=256, backtrack=False)
    t = librosa.frames_to_time(fr, sr=sr, hop_length=256)
    top = float(env.max()) or 1.0
    out["drums"] = [[round(float(a), 3), round(float(env[f]) / top, 2)] for a, f in zip(t, fr)]
print(json.dumps(out, separators=(",", ":")))
