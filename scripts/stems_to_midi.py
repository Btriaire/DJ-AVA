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
    """Transcribe the drums stem to (time, gm_pitch, velocity) events.

    One onset pass over the whole stem, then each hit is classified by its
    spectral band energy so kick / snare / hi-hat can fire together (a kick and
    a hi-hat on the same beat both land), with a velocity from the band energy.
    """
    import numpy as np
    import librosa

    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    if y.size == 0:
        return []

    hop = 256
    n_fft = 1024
    # onsets on the full stem (percussive content is already isolated by Demucs)
    onset_frames = librosa.onset.onset_detect(
        y=y, sr=sr, hop_length=hop, backtrack=True, units="frames",
        delta=0.06, wait=2, pre_max=2, post_max=2, pre_avg=4, post_avg=4,
    )
    if len(onset_frames) == 0:
        return []
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop)

    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    nframes = S.shape[1]

    def band_energy(lo, hi):
        idx = np.where((freqs >= lo) & (freqs < hi))[0]
        return S[idx, :].sum(axis=0) if idx.size else np.zeros(nframes)

    e_low = band_energy(20, 130)     # kick
    e_mid = band_energy(130, 3000)   # snare / body
    e_high = band_energy(6000, 11025)  # hi-hat / cymbal
    m_low = max(float(e_low.max()), 1e-9)
    m_mid = max(float(e_mid.max()), 1e-9)
    m_high = max(float(e_high.max()), 1e-9)

    def peak(env, f):
        a, b = max(0, f - 1), min(nframes, f + 3)
        return float(env[a:b].max()) if b > a else 0.0

    def vel(x, m):
        return int(min(127, max(30, round(35 + 92 * (x / m)))))

    hits = []
    for t in onset_times:
        f = int(round(t * sr / hop))
        f = min(max(f, 0), nframes - 1)
        lo, mid, hi = peak(e_low, f), peak(e_mid, f), peak(e_high, f)
        if lo > 0.15 * m_low:                       # kick
            hits.append((float(t), 36, vel(lo, m_low)))
        if mid > 0.18 * m_mid and mid > 0.45 * lo:  # snare (not just kick spill)
            hits.append((float(t), 38, vel(mid, m_mid)))
        if hi > 0.12 * m_high:                       # closed hi-hat / cymbal
            hits.append((float(t), 42, vel(hi, m_high)))
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
                for t, pitch, v in transcribe_drums(path):
                    inst.notes.append(pretty_midi.Note(velocity=v, pitch=pitch, start=t, end=t + 0.08))
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
