"""Human variations of a separated vocal, rendered once at preparation with TD-PSOLA (the pitch moves, the timbre stays).
Usage: vocal_layers.py vocals.(wav|flac|mp3) pitch.json outdir -> one OGG per layer, sample-aligned with the vocal; JSON on stdout."""
import json, os, sys, time
import numpy as np, soundfile as sf

NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
MAJ, MIN = [0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10]
HANN = {}


def load(path):
    y, sr = sf.read(path, dtype="float64", always_2d=True)
    return y.mean(axis=1), sr


def f0_track(contour, step, n, sr):
    """MIDI note per sample (NaN = no voice), interpolated inside voiced runs only."""
    c = np.array(contour, dtype=float)
    c[c < 0] = np.nan
    t = (np.arange(len(c)) + 0.5) * step
    ts = np.arange(n) / sr
    i = np.clip(np.searchsorted(t, ts) - 1, 0, len(c) - 1)
    j = np.clip(i + 1, 0, len(c) - 1)
    w = np.clip((ts - t[i]) / step, 0, 1)
    a, b = c[i], c[j]
    m = np.where(np.isnan(b), a, np.where(np.isnan(a), b, a + (b - a) * w))
    blk = np.clip((ts / step).astype(int), 0, len(c) - 1)
    m[np.isnan(c[blk])] = np.nan
    return m


def analysis_marks(y, sr, midi):
    """Pitch marks on the signal peaks (one per period) where voiced, every 5 ms elsewhere."""
    env = np.convolve(np.abs(y), np.ones(max(1, sr // 1000)) / max(1, sr // 1000), mode="same")
    pos, per, vo = [], [], []
    i, n = 0, len(y)
    while i < n:
        m = midi[i]
        if np.isnan(m):
            T = int(0.005 * sr)
            pos.append(i); per.append(T); vo.append(False)
            i += T
            continue
        T = max(16, int(sr / (440 * 2 ** ((m - 69) / 12))))
        lo, hi = max(0, i - T // 3), min(n, i + T // 3 + 1)
        a = lo + int(np.argmax(env[lo:hi])) if hi > lo else i
        if pos and a <= pos[-1]: a = pos[-1] + T // 2
        pos.append(a); per.append(T); vo.append(True)
        i = a + T
    return np.array(pos), np.array(per), np.array(vo)


def psola(y, sr, midi, shift_fn, formant=1.0, unvoiced_gain=1.0):
    pos, per, vo = analysis_marks(y, sr, midi)
    n = len(y)
    out, wsum = np.zeros(n), np.zeros(n)
    ts = 0.0
    k = 0
    while ts < n:
        while k + 1 < len(pos) and abs(pos[k + 1] - ts) < abs(pos[k] - ts): k += 1  # nearest analysis mark
        a, T, v = pos[k], int(per[k]), bool(vo[k])
        m = midi[min(n - 1, a)]
        shift = shift_fn(a / sr, m) if v and not np.isnan(m) else 0.0
        ratio = 2 ** (shift / 12)
        lo, hi = a - T, a + T
        g = np.zeros(2 * T)
        s0, s1 = max(0, lo), min(n, hi)
        g[s0 - lo:s1 - lo] = y[s0:s1]
        win = HANN.get(T)
        if win is None: win = HANN[T] = np.hanning(2 * T)
        g *= win
        if formant != 1.0:  # a shorter grain = brighter, smaller voice
            L = max(4, int(round(2 * T / formant)))
            g = np.interp(np.linspace(0, 2 * T - 1, L), np.arange(2 * T), g)
            win = np.interp(np.linspace(0, 2 * T - 1, L), np.arange(2 * T), win)
        L = len(g)
        c = int(ts) - L // 2
        o0, o1 = max(0, c), min(n, c + L)
        if o1 > o0:
            gain = 1.0 if v else unvoiced_gain
            out[o0:o1] += g[o0 - c:o1 - c] * gain
            wsum[o0:o1] += win[o0 - c:o1 - c]
        ts += (T / ratio) if v else T  # synthesis marks advance at the new period
    ok = wsum > 0.1
    out[ok] /= wsum[ok]
    return out


def constant(st):
    return lambda t, m: st


def voice_scale(contour, key):
    """The diatonic scale that covers the most sung time (the voice tells the mode better than the mix); the key's scale when the voice is too sparse."""
    c = np.array([v for v in contour if v >= 0])
    hist = np.bincount(np.round(c).astype(int) % 12, minlength=12) if len(c) else np.zeros(12)
    if hist.sum() >= 50:
        t = max(range(12), key=lambda k: hist[[(k + d) % 12 for d in MAJ]].sum())
        return np.array(sorted(((t + d) % 12) for d in MAJ))
    tonic = NOTES.index(key.get("tonic", "C")) if key.get("tonic") in NOTES else 0
    deg = MIN if key.get("mode") == "min" else MAJ
    return np.array(sorted(((tonic + d) % 12) for d in deg))


def scale_shift(scale, steps):
    """Move `steps` degrees in the scale (2 = a third above, -2 = a third below, 4 = a fifth above)."""

    def fn(t, m):
        r = int(round(m))
        pc = r % 12
        i = int(np.argmin([min((pc - s) % 12, (s - pc) % 12) for s in scale]))  # nearest scale degree
        base = r - (((pc - scale[i]) + 6) % 12 - 6)
        j = i + steps
        octv, jj = divmod(j, len(scale))
        target = base + (scale[jj] - scale[i]) + 12 * octv
        return float(target - r)
    return fn


def match_level(out, ref):
    m = np.abs(ref) > 0.01
    a, b = np.sqrt(np.mean(out[m] ** 2)) if m.any() else 0, np.sqrt(np.mean(ref[m] ** 2)) if m.any() else 0
    return out * (b / a) if a > 1e-9 else out


def delayed(x, sr, ms):
    d = int(sr * ms / 1000)
    return np.concatenate([np.zeros(d), x[:len(x) - d]])


def whisper(y, sr):
    n_fft, hop = 1024, 256
    w = np.hanning(n_fft)
    pad = np.concatenate([np.zeros(n_fft), y, np.zeros(n_fft)])
    frames = np.lib.stride_tricks.sliding_window_view(pad, n_fft)[::hop] * w
    mag = np.abs(np.fft.rfft(frames, axis=1))
    mag[:, : int(round(300 * n_fft / sr))] = 0  # high-pass 300 Hz: a whisper has no body
    rng = np.random.default_rng(7)
    spec = mag * np.exp(1j * rng.uniform(0, 2 * np.pi, mag.shape))
    fr = np.fft.irfft(spec, n_fft, axis=1) * w
    out, ws = np.zeros(len(pad)), np.zeros(len(pad))
    for k, f in enumerate(fr):
        out[k * hop:k * hop + n_fft] += f
        ws[k * hop:k * hop + n_fft] += w * w
    out = out / np.maximum(ws, 1e-3)
    return out[n_fft:n_fft + len(y)]


def main():
    t0 = time.time()
    y, sr = load(sys.argv[1])
    p = json.load(open(sys.argv[2]))
    outdir = sys.argv[3]
    os.makedirs(outdir, exist_ok=True)
    key = p.get("songKey") or p.get("voiceKey") or {"tonic": "C", "mode": "maj"}
    midi = f0_track(p["contour"], 4 * p["hop"], len(y), sr)
    scale = voice_scale(p["contour"], key)
    done = []

    def write(name, x):
        x = np.clip(x, -1, 1).astype(np.float32)
        # libsndfile's Vorbis encoder crashes on one huge write: feed it in blocks
        with sf.SoundFile(os.path.join(outdir, name + ".ogg"), "w", sr, 1 if x.ndim == 1 else x.shape[1], format="OGG", subtype="VORBIS") as f:
            for i in range(0, len(x), 32768): f.write(x[i:i + 32768])
        done.append(name)

    def layer(shift_fn, formant=1.0, ug=1.0):
        return match_level(psola(y, sr, midi, shift_fn, formant, ug), y)

    l, r = layer(constant(0.10)), layer(constant(-0.12))
    write("double", np.stack([delayed(l, sr, 17), delayed(r, sr, 29)], axis=1) * 0.8)
    write("third_up", layer(scale_shift(scale, 2), ug=0.3))
    write("third_down", layer(scale_shift(scale, -2), ug=0.3))
    write("fifth_up", layer(scale_shift(scale, 4), ug=0.3))
    write("octave_down", layer(constant(-12), ug=0.5))
    write("girl", layer(constant(4), formant=1.15))
    write("man", layer(constant(-5), formant=0.88))
    write("child", layer(constant(7), formant=1.22))
    write("whisper", match_level(whisper(y, sr), y))
    shifts, delays, pans = [-0.18, 0.15, -0.07, 0.22, 0.05, -0.25], [11, 23, 37, 48, 61, 74], [-0.9, 0.7, -0.4, 0.9, 0.2, -0.7]
    L, R = np.zeros(len(y)), np.zeros(len(y))
    for s, d, pn in zip(shifts, delays, pans):
        v = delayed(psola(y, sr, midi, constant(s)), sr, d)
        a = (pn + 1) * np.pi / 4
        L += v * np.cos(a); R += v * np.sin(a)
    st = np.stack([L, R], axis=1)
    g = np.sqrt(np.mean(y[np.abs(y) > 0.01] ** 2)) / max(1e-9, np.sqrt(np.mean(st[np.abs(st).max(axis=1) > 0.01] ** 2)))
    write("crowd", st * g)
    print(json.dumps({"version": 1, "layers": done, "seconds": round(time.time() - t0, 1)}))


if __name__ == "__main__":
    main()
