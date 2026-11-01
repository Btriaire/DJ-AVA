"""Stem Sample Pad, IN DEPTH (Préparation > Stems Pad): beats tracked on the drums (live tempo drift followed), bars found
from the low end, every bar described in 32 steps x 12 bands, loops of 1, 2 and 4 real bars that repeat and wrap cleanly,
one-shots cut on their attack; a pool of up to 24 samples per stem for the pads and their REFRESH.
Usage: stem_samples_deep.py <stems_dir> <out.json> [bpm]   (written by MaRuche, reviewed)"""
import json, math, os, sys
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stem_samples import load_mono, envelope, gaps, snap_cut, cut_quality, loud_enough, pick_diverse  # noqa: E402


def stft_mag(y, n_fft=2048, hop=512):
    window = np.hanning(n_fft)
    y_padded = np.pad(y, (0, n_fft), mode='constant')
    frames = sliding_window_view(y_padded, n_fft)[::hop]
    stft = np.fft.rfft(frames * window, n=n_fft)
    mag = np.abs(stft)
    return mag

def onset_flux(y, sr, hop=512):
    mag = stft_mag(y, hop=hop)
    log_mag = np.log1p(100 * mag)
    flux = np.sum(np.maximum(log_mag[1:] - log_mag[:-1], 0), axis=1)
    flux = (flux - np.min(flux)) / (np.max(flux) - np.min(flux) + 1e-9)
    peaks = np.where((flux[1:-1] > flux[:-2]) & (flux[1:-1] > flux[2:]))[0] + 1
    mask = (flux[peaks] > np.median(flux) + 1.5 * np.std(flux)) & (np.diff(np.concatenate(([-np.inf], peaks))) > int(0.05 * sr / hop))
    filtered_peaks = peaks[mask]
    times = filtered_peaks * hop / sr
    strengths = flux[filtered_peaks]
    fps = sr / hop
    return times, strengths, flux, fps

def estimate_tempo(flux, fps, lo=70.0, hi=180.0):
    n = len(flux)
    flux = flux - np.mean(flux)
    corr = np.fft.irfft(np.fft.rfft(flux, 2 * n) * np.fft.rfft(flux, 2 * n).conj())[:n]
    lag_lo = int(fps * 60 / hi)
    lag_hi = int(fps * 60 / lo)
    best_lag = lag_lo + np.argmax(corr[lag_lo:lag_hi + 1])
    if 1 <= best_lag <= n - 2:
        a = corr[best_lag - 1]
        b = corr[best_lag]
        c = corr[best_lag + 1]
        p = 0.5 * (a - c) / (a - 2 * b + c)
        best_lag += p
    bpm = 60 * fps / best_lag
    if bpm < 85:
        bpm *= 2
    elif bpm > 170:
        bpm /= 2
    return bpm

def estimate_offset(flux, fps, bpm):
    period = fps * 60 / bpm
    comb = np.zeros(64)
    for k in range(64):
        phase = k * period / 64
        indices = np.round(phase + np.arange(len(flux)) * period).astype(int)
        mask = indices < len(flux)
        comb[k] = np.sum(flux[indices[mask]])
    best_phase = np.argmax(comb) * period / 64
    time = best_phase / fps
    return time

def deep_bar_features(y, sr, beats, steps=32, bands=12):
    beat_spacing = np.median(np.diff(beats))
    bar_starts = beats[::4]
    bar_ends = bar_starts + 4 * beat_spacing
    mask = bar_ends <= len(y) / sr
    bar_starts = bar_starts[mask]
    bar_ends = bar_ends[mask]
    bar_features = []
    raw_energy = []
    for start, end in zip(bar_starts, bar_ends):
        start_sample = int(start * sr)
        end_sample = int(end * sr)
        bar = y[start_sample:end_sample]
        step_size = len(bar) // steps
        bar_steps = [bar[i * step_size:(i + 1) * step_size] for i in range(steps)]
        step_features = []
        for step in bar_steps:
            energy = np.sum(step ** 2)
            n_fft = 2 ** int(np.ceil(np.log2(len(step))))
            fft = np.fft.rfft(step * np.hanning(len(step)), n=n_fft)
            freqs = np.fft.rfftfreq(n_fft, 1 / sr)
            band_edges = np.logspace(np.log10(40), np.log10(16000), bands + 1)
            band_energies = []
            for i in range(bands):
                mask = np.logical_and(freqs >= band_edges[i], freqs < band_edges[i + 1])
                band_energy = np.sum(np.abs(fft[mask]) ** 2)
                band_energies.append(band_energy)
            features = np.concatenate([[energy], band_energies])
            features = np.log1p(1000 * features)
            step_features.append(features)
        bar_features.append(np.concatenate(step_features))
        raw_energy.append(np.sum(bar ** 2))
    bar_features = np.array(bar_features)
    bar_features = bar_features / (np.linalg.norm(bar_features, axis=1, keepdims=True) + 1e-9)
    return bar_starts, bar_features, raw_energy


def refine_tempo(flux, fps, bpm):
    best_bpm, best_offset, best_sum = bpm, 0, 0
    for candidate_bpm in np.arange(bpm * 0.98, bpm * 1.02, 0.01):
        period = 60.0 / candidate_bpm * fps
        phases = np.linspace(0, period, 32)
        teeth = np.arange(0, len(flux) - period, period)  # every tooth stays inside the curve
        idx = np.minimum(np.round(phases[:, np.newaxis] + teeth).astype(int), len(flux) - 1)
        comb_sums = np.sum(flux[idx], axis=1) / max(1, len(teeth))  # per tooth: a faster tempo has more teeth
        max_idx = np.argmax(comb_sums)
        if comb_sums[max_idx] > best_sum:
            best_bpm, best_offset, best_sum = candidate_bpm, phases[max_idx] / fps, comb_sums[max_idx]
    return round(best_bpm, 2), best_offset

def seam_quality(y, sr, start, end):
    if start < 0.03:
        return 0.5
    L = int(0.03 * sr)  # the same length on both sides
    a_end = min(len(y), int(end * sr))
    b_end = int(start * sr)
    a_start, b_start = a_end - L, b_end - L
    a, b = y[a_start:a_end], y[b_start:b_end]
    if len(a) != L or len(b) != L:
        return 0.5
    a_mag = np.abs(np.fft.rfft(a * np.hanning(len(a))))
    b_mag = np.abs(np.fft.rfft(b * np.hanning(len(b))))
    similarity = np.dot(a_mag, b_mag) / (np.linalg.norm(a_mag) * np.linalg.norm(b_mag) + 1e-9)
    rms_a, rms_b = np.sqrt(np.mean(a**2)), np.sqrt(np.mean(b**2))
    level_match = min(rms_a, rms_b) / (max(rms_a, rms_b) + 1e-9)
    jump = abs(y[a_end - 1] - y[b_start]) / (max(np.max(np.abs(a)), np.max(np.abs(b))) + 1e-9)
    jump_ratio = min(1, jump)
    return 0.5 * similarity + 0.3 * level_match + 0.2 * (1 - jump_ratio)

def deep_loops(y, sr, bar_starts, feats, raw_energy, env_db, n):
    loops = []
    median_energy = np.median(raw_energy)
    bar_len = np.median(np.diff(bar_starts))
    sim = feats @ feats.T
    rep = np.array([np.mean(np.sort(sim[i])[-4:-1]) for i in range(len(bar_starts))])
    for i in range(len(bar_starts) - n + 1):
        start, end = bar_starts[i], bar_starts[i] + n * bar_len
        if min(raw_energy[i:i+n]) < 0.02 * median_energy or not loud_enough(env_db, start, end):
            continue
        repetition = np.mean(rep[i:i+n])
        next_feats = feats[i + n:i + 2 * n] if i + 2 * n < len(bar_starts) else feats[i:i + n]
        next_sim = np.dot(feats[i:i + n].ravel(), next_feats.ravel()) / (np.linalg.norm(feats[i:i + n]) * np.linalg.norm(next_feats) + 1e-9)
        next = next_sim if i + 2 * n < len(bar_starts) else 0.8 * repetition
        seam = seam_quality(y, sr, start, end)
        score = repetition * next * (0.5 + 0.5 * seam)
        loops.append({"start": start, "end": end, "bars": n, "score": score, "seam": seam, "bar": i})
    return loops

def deep_shots(y, sr, onset_times, onset_strengths, env_db, min_len, max_len):
    shots = []
    env_times = np.arange(len(env_db)) * 0.01
    gap_starts = np.array([g[0] for g in gaps(env_db)])
    for t, strength in zip(onset_times, onset_strengths):
        if strength <= 0.25:
            continue
        start = snap_cut(y, sr, t - 0.005, env_db, search=0.004)
        next_onset_idx = np.searchsorted(onset_times, t, side="right")  # the onset AFTER this one
        next_onset = onset_times[next_onset_idx] if next_onset_idx < len(onset_times) else t + max_len
        next_gap_idx = np.searchsorted(gap_starts, t)
        next_gap = gap_starts[next_gap_idx] if next_gap_idx < len(gap_starts) else t + max_len
        end = min(next_onset - 0.005, next_gap, t + max_len)
        start_idx, end_idx = int(start / 0.01), min(len(env_db), int(end / 0.01))
        if end_idx <= start_idx:
            continue
        peak = np.max(env_db[start_idx:end_idx])
        peak_idx = np.argmax(env_db[start_idx:end_idx]) + start_idx
        for i in range(peak_idx, end_idx):
            if env_db[i] < peak - 30:
                end = i * 0.01
                break
        if not (min_len <= end - start <= max_len) or not loud_enough(env_db, start, end):
            continue
        isolation = 1 - min(1, max(0, np.mean(env_db[max(0, int((start - 0.1) / 0.01)):start_idx]) - (peak - 25)) / 25)
        score = strength * cut_quality(env_db, end) * isolation
        shots.append({"start": start, "end": end, "score": score})
    return shots


def track_beats(flux, fps, bpm, tightness=100.0):
    period = 60 * fps / bpm
    sigma = period / 32
    x = np.arange(-3 * sigma, 3 * sigma + 1)
    gaussian = np.exp(-x**2 / (2 * sigma**2))
    gaussian /= gaussian.sum()
    local = np.convolve(flux, gaussian, mode='same')
    cumulative = np.zeros_like(local)
    backlink = np.zeros_like(local, dtype=int)
    for t in range(len(local)):
        if t < period / 2:
            cumulative[t] = local[t]
            backlink[t] = t
        else:
            window = np.arange(max(0, t - 2 * period), t - period / 2, dtype=int)
            cost = -tightness * (np.log((t - window) / period))**2
            cumulative[t] = local[t] + np.max(cumulative[window] + cost)
            backlink[t] = window[np.argmax(cumulative[window] + cost)]
    median_local = np.median(local)
    last_period = int(period)
    candidates = np.where(local[-last_period:] > median_local / 2)[0] + len(local) - last_period
    if len(candidates) == 0:
        last_beat = np.argmax(local[-last_period:]) + len(local) - last_period
    else:
        last_beat = candidates[np.argmax(cumulative[candidates])]
    beats = [last_beat]
    while backlink[beats[-1]] != beats[-1]:  # the first beat links to itself
        beats.append(backlink[beats[-1]])
    beats = np.array(beats[::-1]) / fps
    return beats

def downbeats(beats, y, sr):
    n_fft = int(0.05 * sr)
    low_energy = np.zeros(4)
    for k in range(4):
        for beat in beats[k::4]:
            start = int(beat * sr)
            end = start + n_fft
            if end > len(y):
                end = len(y)
            window = y[start:end]
            if len(window) < n_fft:
                window = np.pad(window, (0, n_fft - len(window)), 'constant')
            mag = np.abs(np.fft.rfft(window))
            low_energy[k] += np.sum(mag[:int(150 * n_fft / sr)])
    k = int(np.argmax(low_energy))  # the kick and the bass land on beat 1
    return beats[k::4]

def tempo_curve(beats):
    diff = np.diff(beats)
    bpm = 60 / diff
    window = 5
    median_bpm = np.zeros_like(bpm)
    for i in range(len(bpm)):
        start = max(0, i - window // 2)
        end = min(len(bpm), i + window // 2 + 1)
        median_bpm[i] = np.median(bpm[start:end])
    return median_bpm


def bar_feats(y, sr, bars, steps=32, bands=12):
    feats = []
    raw_energy = []
    for i in range(len(bars)-1):
        bar_start = int(bars[i] * sr)
        bar_end = int(bars[i+1] * sr)
        bar_len = bar_end - bar_start
        step_len = bar_len // steps
        bar_feats = []
        bar_energy = []
        for j in range(steps):
            step_start = bar_start + j * step_len
            step_end = step_start + step_len
            step = y[step_start:step_end]
            window = np.hanning(len(step))
            windowed_step = step * window
            padded_len = 2 ** math.ceil(math.log2(len(windowed_step)))
            padded_step = np.pad(windowed_step, (0, padded_len - len(windowed_step)), 'constant')
            fft = np.fft.rfft(padded_step)
            freqs = np.fft.rfftfreq(padded_len, 1/sr)
            energy = np.abs(fft) ** 2
            total_energy = np.sum(energy)
            bar_energy.append(total_energy)
            band_edges = np.logspace(np.log10(40), np.log10(16000), bands+1)
            band_energies = []
            for k in range(bands):
                mask = (freqs >= band_edges[k]) & (freqs < band_edges[k+1])
                band_energy = np.sum(energy[mask])
                band_energies.append(np.log1p(1000 * band_energy))
            bar_feats.extend(band_energies)
            bar_feats.append(np.log1p(1000 * total_energy))
        bar_feats = np.array(bar_feats)
        bar_feats /= np.linalg.norm(bar_feats) + 1e-9
        feats.append(bar_feats)
        raw_energy.append(np.mean(bar_energy))
    return np.array(feats), raw_energy


def tracked_loops(y, sr, bars, feats, raw_energy, env_db, n):
    loops = []
    sim = feats @ feats.T
    np.fill_diagonal(sim, 0)
    for i in range(len(bars)-n):
        start = bars[i]
        end = bars[i+n]
        rep = np.mean([np.mean(np.sort(sim[j])[-3:]) for j in range(i, i+n)])
        if i + 2*n <= len(feats):
            a = feats[i:i+n].ravel()
            b = feats[i+n:i+2*n].ravel()
            nxt = np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)
        else:
            nxt = 0.8 * rep
        seam = seam_quality(y, sr, start, end)
        if min(raw_energy[i:i+n]) < 0.02 * np.median(raw_energy) or not loud_enough(env_db, start, end):
            continue
        score = rep * nxt * (0.5 + 0.5 * seam)
        loops.append({"start": start, "end": end, "bars": n, "score": score, "seam": seam, "bar": i})
    return loops

def dedupe(cands, feats, limit=0.985):
    kept = []
    for cand in sorted(cands, key=lambda x: x["score"], reverse=True):
        if cand["bars"] == 0:
            kept.append(cand)
            continue
        duplicate = False
        for k in kept:
            if k["bars"] == cand["bars"]:
                cos = np.dot(feats[cand["bar"]], feats[k["bar"]]) / (np.linalg.norm(feats[cand["bar"]]) * np.linalg.norm(feats[k["bar"]]) + 1e-9)
                if cos > limit:
                    duplicate = True
                    break
        if not duplicate:
            kept.append(cand)
    return kept

LABEL = {"drums": "Coup", "bass": "Note", "other": "Motif"}
def stem_pool(name, y, sr, bars, onsets, strengths):
    env = envelope(y, sr)
    feats, raw = bar_feats(y, sr, bars)
    bar_len = float(np.median(np.diff(bars)))
    loops = []
    for n in (1, 2, 4):
        cands = tracked_loops(y, sr, bars, feats, raw, env, n)
        cands = dedupe(cands, feats)
        loops.extend(pick_diverse(cands, 4 if name != "vocals" else 2, min_gap=8*bar_len))
    if name == "drums":
        shots = deep_shots(y, sr, onsets, strengths, env, 0.08, 1.2)
    elif name == "bass":
        shots = deep_shots(y, sr, onsets, strengths, env, 0.15, 1.5)
    elif name == "vocals":
        shots = deep_shots(y, sr, onsets, strengths, env, 0.4, 4.0)
    else:
        shots = deep_shots(y, sr, onsets, strengths, env, 0.2, 2.5)
    shots = pick_diverse(shots, 12 if name == "vocals" else 8, 3.0)
    samples = []
    for loop in loops:
        label = f"Boucle {loop['bars']} mes."
        samples.append({"start": float(round(loop["start"], 3)), "end": float(round(loop["end"], 3)), "kind": "loop", "bars": loop["bars"], "score": float(round(loop["score"], 3)), "label": label})
    for shot in shots:
        if name == "vocals":
            label = "Phrase" if shot["end"] - shot["start"] > 1.5 else "Mot"
        else:
            label = LABEL.get(name, "Motif")
        samples.append({"start": float(round(shot["start"], 3)), "end": float(round(shot["end"], 3)), "kind": "shot", "bars": 0, "score": float(round(shot["score"], 3)), "label": label})
    return sorted(samples, key=lambda x: x["score"], reverse=True)

def main():
    if len(sys.argv) < 3:
        print("Usage: stem_samples_deep.py <stems_dir> <out.json> [bpm]")
        sys.exit(1)
    stems_dir = sys.argv[1]
    out_json = sys.argv[2]
    bpm = float(sys.argv[3]) if len(sys.argv) > 3 else None
    stems = {}
    for name in ["drums", "bass", "other", "vocals", "guitar", "piano"]:
        stem_path = os.path.join(stems_dir, f"{name}.mp3")
        if not os.path.exists(stem_path):
            stem_path = os.path.join(stems_dir, f"{name}.wav")
            if not os.path.exists(stem_path):
                stem_path = os.path.join(stems_dir, f"{name}.flac")
                if not os.path.exists(stem_path):
                    continue
        y, sr = load_mono(stem_path)
        if name == "drums" or not stems:
            times, strengths, flux, fps = onset_flux(y, sr)
            if bpm is None:
                bpm = estimate_tempo(flux, fps)
            beats = track_beats(flux, fps, bpm)
            bars = downbeats(beats, y, sr)
        onsets, strengths, _, _ = onset_flux(y, sr)
        stems[name] = stem_pool(name, y, sr, bars, onsets, strengths)
    with open(out_json, "w") as f:
        json.dump({"version": 2, "deep": True, "bpm": float(round(np.median(tempo_curve(beats)), 2)), "bars": [float(round(b, 3)) for b in bars], "stems": stems}, f)
    print(json.dumps({"ok": True, "stems": {name: len(pool) for name, pool in stems.items()}}))

if __name__ == "__main__":
    main()
