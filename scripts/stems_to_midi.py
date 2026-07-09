#!/usr/bin/env python3
"""
Transcribe separated stems into ONE multi-track MIDI file — one instrument track
per stem, all merged in the same file.

  - pitched stems (bass, vocals, other, guitar, piano) -> Spotify basic-pitch
    (polyphonic audio->MIDI), each mapped to a General-MIDI program.
  - drums -> 3-band onset detection (kick / snare / hi-hat) placed on a GM drum
    track (channel 10).

Usage:
  stems_to_midi.py --out combined.mid --stem bass:/tmp/bass.wav --stem drums:/tmp/drums.wav ...
"""
import sys
import os
import argparse


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# role -> (GM program, is_drum, display name)
ROLE = {
    "bass":   (33, False, "Bass"),        # Electric Bass (finger)
    "vocals": (85, False, "Vocals"),      # Lead 6 (voice)
    "other":  (0,  False, "Other"),       # Acoustic Grand Piano
    "guitar": (27, False, "Guitar"),      # Electric Guitar (clean)
    "piano":  (0,  False, "Piano"),       # Acoustic Grand Piano
    "drums":  (0,  True,  "Drums"),       # channel-10 GM drum kit
}


def transcribe_pitched(wav_path):
    """Return a list of (start, end, pitch, velocity) via basic-pitch."""
    from basic_pitch.inference import predict
    try:
        from basic_pitch import ICASSP_2022_MODEL_PATH
        _, midi_data, _ = predict(wav_path, ICASSP_2022_MODEL_PATH)
    except Exception:
        _, midi_data, _ = predict(wav_path)
    notes = []
    for inst in midi_data.instruments:
        for n in inst.notes:
            notes.append((float(n.start), float(n.end), int(n.pitch), int(n.velocity)))
    return notes


def transcribe_drums(wav_path):
    """Return a list of (time, gm_pitch) from 3 frequency bands."""
    import librosa
    from scipy.signal import butter, sosfilt
    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    nyq = sr / 2.0

    def band(lo, hi):
        lo = max(20.0, lo) / nyq
        hi = min(hi, nyq - 1.0) / nyq
        sos = butter(4, [lo, hi], btype="band", output="sos")
        return sosfilt(sos, y)

    hits = []
    for (lo, hi), pitch in [((20, 150), 36), ((180, 2500), 38), ((5000, 11000), 42)]:
        yb = band(lo, hi)
        try:
            onsets = librosa.onset.onset_detect(
                y=yb, sr=sr, units="time", backtrack=True,
                pre_max=3, post_max=3, pre_avg=5, post_avg=5, delta=0.15, wait=3,
            )
        except Exception as e:
            log("drum band failed", pitch, e)
            onsets = []
        for t in onsets:
            hits.append((float(t), pitch))
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--stem", action="append", default=[], help="role:wavpath")
    args = ap.parse_args()

    import pretty_midi

    pm = pretty_midi.PrettyMIDI()
    for spec in args.stem:
        if ":" not in spec:
            continue
        role, path = spec.split(":", 1)
        program, is_drum, name = ROLE.get(role, (0, False, role))
        if not os.path.exists(path):
            log("skip missing", path)
            continue
        inst = pretty_midi.Instrument(program=program, is_drum=is_drum, name=name)
        try:
            if is_drum:
                for t, pitch in transcribe_drums(path):
                    inst.notes.append(pretty_midi.Note(velocity=100, pitch=pitch, start=t, end=t + 0.08))
            else:
                for start, end, pitch, vel in transcribe_pitched(path):
                    inst.notes.append(pretty_midi.Note(
                        velocity=max(1, min(127, vel)), pitch=pitch,
                        start=start, end=max(end, start + 0.03)))
        except Exception as e:
            log("transcribe failed", role, repr(e))
        log("stem", role, "notes", len(inst.notes))
        if inst.notes:
            pm.instruments.append(inst)

    if not pm.instruments:
        log("no instruments produced")
        sys.exit(2)
    pm.write(args.out)
    log("wrote", args.out, "instruments", len(pm.instruments))


if __name__ == "__main__":
    main()
