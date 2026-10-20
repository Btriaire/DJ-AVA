#!/usr/bin/env python3
"""Analyseur audio pour extraire le BPM, les battements et la tonalité."""

import json
import sys
import numpy as np
import librosa

def load_audio(path):
    """Charge l'audio et retourne les échantillons et le taux d'échantillonnage."""
    try:
        y, sr = librosa.load(path, sr=22050, mono=True)
        return y, sr
    except Exception as e:
        raise ValueError(f"Erreur de chargement audio: {str(e)}")

def compute_tempo(y, sr):
    """Calcule le tempo grossier et les battements."""
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo_lib = np.median(librosa.feature.tempo(
        onset_envelope=onset_env, sr=sr, hop_length=512,
        start_bpm=120, aggregate=None
    ))
    _, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env, sr=sr, hop_length=512,
        bpm=tempo_lib, tightness=100
    )
    beats = librosa.frames_to_time(beat_frames, sr=sr, hop_length=512)
    return tempo_lib, beats

def comb_score(onset_env, bpm, phase, fps):
    """Mean onset strength on a beat grid of period 60/bpm starting at frame `phase`."""
    period = 60.0 / bpm * fps
    idx = np.round(phase + np.arange(0, len(onset_env), period)).astype(int)
    idx = idx[(idx >= 0) & (idx < len(onset_env))]
    if len(idx) < 4:
        return 0.0
    return float(np.mean(onset_env[idx]))

def best_grid(onset_env, bpm_center, fps):
    """Search bpm in ±3 % (step 0.05 %) and every phase within one beat; return (score, bpm, phase)."""
    best = (0.0, bpm_center, 0.0)
    for factor in np.arange(0.95, 1.0501, 0.0005):
        bpm = bpm_center * factor
        period_frames = 60.0 / bpm * fps
        for phase in range(int(period_frames)):
            s = comb_score(onset_env, bpm, phase, fps)
            if s > best[0]:
                best = (s, bpm, float(phase))
    return best

def refine_tempo(onset_env, tempo_lib, sr, beats):
    """Grid-refined BPM: best comb score over the three octave candidates; ties (within 5 %) prefer 80–160 BPM."""
    fps = sr / 512.0
    scores = {}
    for mult in (0.5, 1.0, 2.0):
        center = tempo_lib * mult
        if center < 50 or center > 220:
            continue
        scores[center] = best_grid(onset_env, center, fps)
    if not scores:
        return 0.0, 0.0, 0.0
    # octave choice: F1 between strong onsets and the grid (precision = grid points on
    # an onset, recall = strong onsets on the grid); a faster grid loses recall, a slower one precision
    strong = np.where(onset_env > onset_env.mean() + onset_env.std())[0]
    f1 = {}
    for c, v in scores.items():
        if v[0] <= 0:
            f1[c] = 0.0
            continue
        grid = np.arange(v[2], len(onset_env), 60.0 / v[1] * fps)
        gi = np.round(grid).astype(int)
        gi = gi[(gi >= 0) & (gi < len(onset_env))]
        if len(gi) == 0 or len(strong) == 0:
            f1[c] = 0.0
            continue
        on_grid_prec = np.mean(np.array([np.min(np.abs(strong - g)) <= 1 for g in gi]))
        covered = np.array([np.min(np.abs(gi - s)) <= 1 for s in strong])
        recall = float(np.mean(covered))
        f1[c] = 0.0 if on_grid_prec + recall == 0 else 2 * on_grid_prec * recall / (on_grid_prec + recall)
    top = max(f1.values())
    if top <= 0:
        return 0.0, 0.0, 0.0
    # preferred DJ range 90–150 BPM: pick the best F1 candidate inside it, else the best overall
    in_range = [c for c in f1 if 90 <= scores[c][1] <= 150]
    pool = in_range if in_range else list(f1)
    pick = max(pool, key=lambda c: f1[c])
    score, bpm, phase = scores[pick]
    period = 60.0 / bpm
    intervals_ok = 0.0
    if len(beats) >= 4:
        grid = phase / fps + np.arange(0, len(onset_env) / fps, period)
        onsets = np.where(onset_env > onset_env.mean() + onset_env.std())[0] / fps
        if len(onsets) > 0:
            d = np.abs(onsets[:, None] - grid[None, :]).min(axis=1)
            intervals_ok = float(np.mean(d <= 0.03))
    return round(bpm, 2), intervals_ok, phase / fps

def compute_key(y, sr):
    """Détermine la tonalité en utilisant le profil Krumhansl-Schmuckler."""
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr).mean(axis=1)
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

    best_score = -1.0
    best_pitch = 0
    best_mode = "major"
    second_score = -1.0

    for mode, profile in [("major", major_profile), ("minor", minor_profile)]:
        for r in range(12):
            rotated_profile = np.roll(profile, r)
            score = np.corrcoef(chroma, rotated_profile)[0, 1]
            if score > best_score:
                second_score = best_score
                best_score = score
                best_pitch = r
                best_mode = mode
            elif score > second_score:
                second_score = score

    confidence = max(0.0, min(1.0, (best_score - second_score) / 2.0))
    return best_pitch, best_mode, confidence

def get_key_name(pitch_class, mode):
    """Retourne le nom anglais et le code Camelot."""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    camelot_major = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"]
    camelot_minor = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"]

    name = f"{names[pitch_class]} {mode}"
    camelot = camelot_major[pitch_class] if mode == "major" else camelot_minor[pitch_class]
    return name, camelot

def analyze_audio(path):
    """Analyse l'audio et retourne les résultats sous forme de dictionnaire."""
    try:
        y, sr = load_audio(path)
        duration_sec = len(y) / sr

        tempo_lib, beats = compute_tempo(y, sr)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
        bpm, bpm_confidence, _ = refine_tempo(onset_env, tempo_lib, sr, beats)

        pitch_class, mode, key_confidence = compute_key(y, sr)
        key_name, camelot = get_key_name(pitch_class, mode)

        result = {
            "bpm": float(bpm),
            "bpmConfidence": float(bpm_confidence),
            "firstBeatSec": float(beats[0]) if len(beats) > 0 else 0.0,
            "beats": list(map(float, beats[:64])),
            "durationSec": float(duration_sec),
            "key": {
                "pitchClass": int(pitch_class),
                "mode": mode,
                "name": key_name,
                "camelot": camelot,
                "confidence": float(key_confidence)
            }
        }
        return result
    except Exception as e:
        return {"error": str(e)}

def main():
    """Point d'entrée principal."""
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python3 analyze_audio.py CHEMIN"}), file=sys.stderr)
        sys.exit(1)

    result = analyze_audio(sys.argv[1])
    if "error" in result:
        print(json.dumps(result), file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result))

if __name__ == "__main__":
    main()
