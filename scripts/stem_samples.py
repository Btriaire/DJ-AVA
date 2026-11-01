"""Stem Sample Pad, made at preparation: up to 5 samples per stem, loops on bar lines that really repeat and one-shots cut in the small silences.
Usage: stem_samples.py <stems_dir> <bpm> <offset> <out.json> -> JSON (written by MaRuche, reviewed)."""
import numpy as np
import soundfile as sf
import json
import sys
import math
import os

def load_mono(path):
    y, sr = sf.read(path, dtype="float32", always_2d=True)
    y = np.mean(y, axis=1)
    return y, sr

def envelope(y, sr, hop=0.01):
    hop_samples = int(hop * sr)
    n = len(y) // hop_samples * hop_samples  # whole frames only
    rms = np.sqrt(np.mean(np.square(y[:n].reshape(-1, hop_samples)), axis=1))
    env_db = 20 * np.log10(rms + 1e-9)
    return env_db

def gaps(env_db, hop=0.01, floor_rel=30.0, min_len=0.06):
    percentile_95 = np.percentile(env_db, 95)
    floor = percentile_95 - floor_rel
    below_floor = env_db < floor
    min_len_samples = int(min_len / hop)
    gaps = []
    start = None
    for i, is_below in enumerate(below_floor):
        if is_below and start is None:
            start = i
        elif not is_below and start is not None:
            if i - start >= min_len_samples:
                gaps.append((start * hop, i * hop))
            start = None
    if start is not None and len(below_floor) - start >= min_len_samples:
        gaps.append((start * hop, len(below_floor) * hop))
    return gaps

def snap_cut(y, sr, t, env_db, hop=0.01, search=0.05):
    search_samples = int(search / hop)
    t_frame = int(t / hop)
    start_frame = max(0, t_frame - search_samples)
    end_frame = min(len(env_db), t_frame + search_samples + 1)
    best_frame = np.argmin(env_db[start_frame:end_frame]) + start_frame
    best_t = best_frame * hop
    best_sample = int(best_t * sr)
    search_samples_3ms = int(0.003 * sr)
    start_sample = max(0, best_sample - search_samples_3ms)
    end_sample = min(len(y), best_sample + search_samples_3ms + 1)
    zero_crossings = np.where(np.diff(np.sign(y[start_sample:end_sample])))[0] + start_sample
    if len(zero_crossings) > 0:
        best_sample = zero_crossings[np.argmin(np.abs(zero_crossings - best_sample))]
    return float(best_sample) / sr

def beat_grid(bpm, offset, duration):
    beat_interval = 60.0 / bpm
    start_time = offset - math.floor(offset / beat_interval) * beat_interval  # the downbeat grid moved back to its first beat >= 0
    num_beats = math.ceil((duration - start_time) / beat_interval)
    beat_times = np.arange(num_beats) * beat_interval + start_time
    return beat_times

def cut_quality(env_db, t, hop=0.01):
    percentile_95 = np.percentile(env_db, 95)
    t_frame = int(t / hop)
    if t_frame < 0 or t_frame >= len(env_db):
        return 0.0
    frame_db = env_db[t_frame]
    if frame_db >= percentile_95:
        return 0.0
    elif frame_db <= percentile_95 - 30.0:
        return 1.0
    else:
        return (percentile_95 - frame_db) / 30.0


def bar_features(y, sr, beats):
    beat_length = np.median(np.diff(beats))
    bar_length = 4 * beat_length
    step_length = bar_length / 16
    n_steps = 16
    n_fft = int(2 ** np.ceil(np.log2(step_length * sr)))
    window = np.hanning(n_fft)
    bar_starts = beats[::4]
    n_bars = len(bar_starts)
    feats = np.zeros((n_bars, 2 * n_steps))

    for i, bar_start in enumerate(bar_starts):
        bar_end = bar_start + bar_length
        if bar_end > len(y) / sr:
            bar_end = len(y) / sr
            y_bar = np.pad(y[int(bar_start * sr):int(bar_end * sr)], (0, int((bar_length - (bar_end - bar_start)) * sr)), 'constant')
        else:
            y_bar = y[int(bar_start * sr):int(bar_end * sr)]

        for j in range(n_steps):
            step_start = j * step_length
            step_end = step_start + step_length
            if step_end > len(y_bar) / sr:
                step_end = len(y_bar) / sr
                y_step = np.pad(y_bar[int(step_start * sr):int(step_end * sr)], (0, int((step_length - (step_end - step_start)) * sr)), 'constant')
            else:
                y_step = y_bar[int(step_start * sr):int(step_end * sr)]

            y_step_windowed = y_step * window[:len(y_step)]
            fft = np.fft.rfft(y_step_windowed, n=n_fft)
            mag = np.abs(fft)
            energy = np.sqrt(np.mean(y_step_windowed ** 2))
            centroid = np.sum(mag * np.arange(len(mag))) / (np.sum(mag) + 1e-9) * (sr / 2) / (n_fft / 2)

            feats[i, j] = energy
            feats[i, j + n_steps] = centroid

        max_energy = np.max(feats[i, :n_steps])
        if max_energy > 0:
            feats[i, :n_steps] /= max_energy

    return bar_starts, feats

def repetition(feats):
    n_bars = feats.shape[0]
    sim_matrix = np.zeros((n_bars, n_bars))
    rep = np.zeros(n_bars)

    for i in range(n_bars):
        for j in range(n_bars):
            if i != j:
                a = feats[i]
                b = feats[j]
                norm_a = np.linalg.norm(a)
                norm_b = np.linalg.norm(b)
                sim_matrix[i, j] = np.dot(a, b) / (norm_a * norm_b + 1e-9)

    for i in range(n_bars):
        row = sim_matrix[i].copy()
        row[i] = 0
        top3 = np.sort(row)[-3:]
        rep[i] = np.mean(top3)

    return rep, sim_matrix

def loop_candidates(bar_starts, feats, rep, beats, bars_per_loop):
    beat_length = np.median(np.diff(beats))
    bar_length = 4 * beat_length
    n_bars = len(bar_starts)
    candidates = []

    for i in range(n_bars - bars_per_loop + 1):
        loop_feats = feats[i:i + bars_per_loop]
        if np.all(loop_feats[:, :16] < 1e-6):
            continue

        loop_score = np.mean(rep[i:i + bars_per_loop])
        next_feats = feats[i + bars_per_loop:i + 2 * bars_per_loop]
        if len(next_feats) == bars_per_loop:
            next_feats = next_feats.flatten()
            loop_feats = loop_feats.flatten()
            norm_loop = np.linalg.norm(loop_feats)
            norm_next = np.linalg.norm(next_feats)
            sim = np.dot(loop_feats, next_feats) / (norm_loop * norm_next + 1e-9)
            loop_score *= sim

        start = bar_starts[i]
        end = start + bars_per_loop * bar_length
        candidates.append({"start": start, "end": end, "bars": bars_per_loop, "score": loop_score, "bar": i})

    return candidates


def loud_enough(env_db, start, end, hop=0.01):
    start_idx = int(start / hop)
    end_idx = int(end / hop)
    seg = env_db[start_idx:end_idx]
    if len(seg) == 0:
        return False
    mean_db = 10 * np.log10(np.mean(10 ** (seg / 10)))  # mean POWER: the gaps between drum hits must not drag the level down
    return mean_db > (np.percentile(env_db, 95) - 18)

def one_shots(y, sr, env_db, min_len, max_len):
    gaps_list = gaps(env_db)
    shots = []
    for i in range(len(gaps_list) - 1):
        g0 = gaps_list[i]
        g1 = gaps_list[i + 1]
        start = g0[1]
        end = g1[0]
        length = end - start
        if min_len <= length <= max_len:
            start = snap_cut(y, sr, start, env_db)
            end = snap_cut(y, sr, end, env_db)
            length = end - start
            if min_len <= length <= max_len and loud_enough(env_db, start, end):
                score = (cut_quality(env_db, start) + cut_quality(env_db, end)) / 2 * min(1, length / max_len + 0.3)
                shots.append({"start": start, "end": end, "score": score})
    return shots

def pick_diverse(cands, k, min_gap):
    picked = []
    cands_sorted = sorted(cands, key=lambda x: x["score"], reverse=True)
    for cand in cands_sorted:
        if len(picked) >= k:
            break
        overlap = False
        for p in picked:
            if cand["start"] < p["end"] + min_gap and cand["end"] > p["start"] - min_gap:  # too close to a picked one
                overlap = True
                break
        if not overlap:
            picked.append(cand)
    return sorted(picked, key=lambda x: x["start"])

def stem_samples(name, y, sr, bpm, offset):
    beats = beat_grid(bpm, offset, len(y)/sr)
    bar_starts, feats = bar_features(y, sr, beats)
    rep, _ = repetition(feats)
    env = envelope(y, sr)

    # Loops
    loop_cands_1 = loop_candidates(bar_starts, feats, rep, beats, 1)
    loop_cands_2 = loop_candidates(bar_starts, feats, rep, beats, 2)
    loop_cands_4 = loop_candidates(bar_starts, feats, rep, beats, 4)  # 4-bar phrases
    loop_cands = loop_cands_1 + loop_cands_2 + loop_cands_4
    loops = []
    for cand in loop_cands:
        if loud_enough(env, cand["start"], cand["end"]):
            cand["start"] = snap_cut(y, sr, cand["start"], env, search=0.005)
            cand["end"] = snap_cut(y, sr, cand["end"], env, search=0.005)
            loops.append(cand)

    # Shots
    if name in ["drums", "bass"]:
        shots = one_shots(y, sr, env, 0.12, 1.5)
    elif name == "vocals":
        shots = one_shots(y, sr, env, 0.4, 4.0)
    else:
        shots = one_shots(y, sr, env, 0.3, 3.0)

    # Pick diverse samples
    if name == "vocals":
        loops_picked = pick_diverse(loops, 4, 8 * 4 * 60 / bpm)  # loops 8 bars apart: from different parts of the song
        shots_picked = pick_diverse(shots, 8, 8.0)
    else:
        loops_picked = pick_diverse(loops, 9, 8 * 4 * 60 / bpm)  # loops 8 bars apart: from different parts of the song
        shots_picked = pick_diverse(shots, 6, 8.0)

    # Fill to 5: when a family is short, take more of the other one (each sample keeps its own kind)
    quota_l = len(loops_picked)
    quota_s = len(shots_picked)
    if quota_l + quota_s < 5:  # a pool of up to 15 for REFRESH; at least 5 when the stem allows
        if len(loops) > quota_l:
            loops_picked = pick_diverse(loops, 5 - quota_s, 8 * 4 * 60 / bpm)  # loops 8 bars apart: from different parts of the song
        if len(loops_picked) + quota_s < 5 and len(shots) > quota_s:
            shots_picked = pick_diverse(shots, 5 - len(loops_picked), 8.0)

    # Prepare output
    samples = []
    for loop in loops_picked:
        label = f"Boucle {loop['bars']} mes."
        samples.append({
            "start": float(round(loop["start"], 3)),
            "end": float(round(loop["end"], 3)),
            "kind": "loop",
            "bars": int(loop["bars"]),
            "score": float(round(loop["score"], 3)),
            "label": label
        })

    for shot in shots_picked:
        if name == "drums":
            label = "Coup"
        elif name == "bass":
            label = "Note"
        elif name == "vocals":
            label = "Phrase" if shot["end"] - shot["start"] > 1.5 else "Mot"
        else:
            label = "Motif"
        samples.append({
            "start": float(round(shot["start"], 3)),
            "end": float(round(shot["end"], 3)),
            "kind": "shot",
            "bars": 0,
            "score": float(round(shot["score"], 3)),
            "label": label
        })

    return sorted(samples, key=lambda x: (x["kind"], x["start"]))

def main():
    if len(sys.argv) != 5:
        print("Usage: stem_samples.py <stems_dir> <bpm> <offset> <out.json>")
        sys.exit(1)

    stems_dir = sys.argv[1]
    bpm = float(sys.argv[2])
    offset = float(sys.argv[3])
    out_file = sys.argv[4]

    stems = {}
    for stem_name in ["drums", "bass", "other", "vocals", "guitar", "piano"]:
        for ext in [".mp3", ".wav", ".flac"]:
            stem_path = os.path.join(stems_dir, f"{stem_name}{ext}")
            if os.path.exists(stem_path):
                y, sr = load_mono(stem_path)
                samples = stem_samples(stem_name, y, sr, bpm, offset)
                stems[stem_name] = samples
                break

    output = {
        "version": 1,
        "bpm": float(bpm),
        "offset": float(offset),
        "stems": stems
    }

    with open(out_file, "w") as f:
        json.dump(output, f, indent=2)

    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    main()
