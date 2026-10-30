"""Drum-hit detector benchmark: songs rendered from real kit samples with a known ground truth.
python scripts/drum_bench.py <kits_dir> <detector.py> [songs]
<kits_dir>/<kit>/{kick,snare,hat,open,tom,cymbal}.ogg (e.g. the drum machines of lib/drumKits.ts); <detector.py> defines drum_hits(path).
On its first run (10 kits x 2 songs, stem variant): onset curve alone hats 0.11, hybrid with NMF hats 0.51."""
import importlib.util, json, os, sys, tempfile
import numpy as np, soundfile as sf, librosa

SR = 22050
PARTS = ["kick", "snare", "hat", "open", "tom", "cymbal"]
FINE = {"kick": 0, "snare": 1, "hat": 2, "open": 3, "tom": 4, "cymbal": 5}
COARSE = {"kick": 0, "snare": 1, "hat": 2, "open": 2, "tom": 1, "cymbal": 2}


def load_kits(d):
    kits = []
    for name in sorted(os.listdir(d)):
        s = {p: librosa.load(os.path.join(d, name, p + ".ogg"), sr=SR, mono=True)[0] for p in PARTS if os.path.exists(os.path.join(d, name, p + ".ogg"))}
        if {"kick", "snare", "hat"} <= s.keys():
            kits.append((name, {p: x / (np.abs(x).max() or 1) for p, x in s.items()}))
    return kits


def song(rng, s, dur=32.0):
    buf, gt = np.zeros(int(dur * SR) + SR, np.float32), []
    step = 60 / rng.uniform(90, 135) / 4

    def hit(part, t, v):
        t = max(0.0, t + rng.normal(0, 0.004))
        i = int(t * SR); x = s[part][: len(buf) - i]
        buf[i:i + len(x)] += x * v
        gt.append((t, part))

    for bar in range(int(dur / (16 * step))):
        sixteenths = rng.random() < 0.3
        for k in range(16):
            t, v = (bar * 16 + k) * step, rng.uniform(0.6, 1.0)
            if k in (0, 8) or (k not in (4, 12) and rng.random() < 0.12): hit("kick", t, v)
            if k in (4, 12):
                if rng.random() < 0.95: hit("snare", t, rng.uniform(0.6, 1.0))
            elif rng.random() < 0.05: hit("snare", t, rng.uniform(0.3, 0.45))
            if (sixteenths or k % 2 == 0) and rng.random() < 0.9:
                hit("open" if k == 14 and "open" in s and rng.random() < 0.35 else "hat", t, rng.uniform(0.4, 0.8))
            if bar % 4 == 3 and k >= 12 and "tom" in s and rng.random() < 0.5: hit("tom", t, v)
            if bar % 8 == 0 and k == 0 and "cymbal" in s: hit("cymbal", t, v)
    return buf[: int(dur * SR)], sorted(gt)


def stemify(rng, x):
    # what a separated stem looks like: a little noise, a short room, a softened top
    y = x + np.sqrt(np.mean(x ** 2)) * 10 ** (-45 / 20) * rng.standard_normal(len(x))
    ir = rng.standard_normal(int(0.35 * SR)) * np.exp(-np.linspace(0, 6, int(0.35 * SR)))
    n = len(y) + len(ir) - 1
    wet = np.fft.irfft(np.fft.rfft(y, n) * np.fft.rfft(ir, n), n)[: len(y)]
    y = y + wet / (np.abs(wet).max() or 1) * np.abs(y).max() * 10 ** (-14 / 20)
    y = 0.7 * y + 0.3 * np.convolve(y, [0.25, 0.5, 0.25], mode="same")
    return (y / np.abs(y).max() * 0.9).astype(np.float32)


def match(gt, det, tol=0.03):
    # one-to-one, nearest first: pairs (gt index, det index, dt)
    cand = sorted((abs(d - g), i, j, d - g) for i, g in enumerate(gt) for j, d in enumerate(det) if abs(d - g) <= tol)
    ug, ud, out = set(), set(), []
    for _, i, j, dt in cand:
        if i not in ug and j not in ud: ug.add(i); ud.add(j); out.append((i, j, dt))
    return out


def score(gt, det, table):
    res = {}
    for c in sorted(set(table.values())):
        g = [t for t, p in gt if table[p] == c]; d = [h[0] for h in det if int(h[2]) == c]
        m = match(g, d)
        res[c] = (len(g), len(m) / max(1, len(g)), len(m) / max(1, len(d)), 1000 * float(np.mean([x[2] for x in m])) if m else 0.0)
    return res


def main():
    kits_dir, det_path = sys.argv[1], sys.argv[2]
    songs = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    spec = importlib.util.spec_from_file_location("det", det_path); det = importlib.util.module_from_spec(spec); spec.loader.exec_module(det)
    acc = {}
    for ki, (name, s) in enumerate(load_kits(kits_dir)):
        for si in range(songs):
            rng = np.random.default_rng(1 + ki * 100 + si)
            x, gt = song(rng, s)
            for variant, y in (("clean", x / np.abs(x).max() * 0.9), ("stem", stemify(rng, x))):
                with tempfile.NamedTemporaryFile(suffix=".wav") as f:
                    sf.write(f.name, y, SR); hits = det.drum_hits(f.name)
                a = acc.setdefault(variant, {"gt": [], "det": []})
                off = len(a["gt"]) and (a["gt"][-1][0] + 10)  # songs laid end to end so they never match each other
                a["gt"] += [(t + off, p) for t, p in gt]; a["det"] += [[h[0] + off, h[1], h[2]] for h in hits]
    names = {0: "kick", 1: "snare", 2: "hat", 3: "open", 4: "tom", 5: "cymbal"}
    summary = {}
    for variant, a in acc.items():
        gt, det = a["gt"], a["det"]
        for label, table in (("coarse", COARSE), ("fine", FINE)):
            for c, (n, r, p, dt) in score(gt, det, table).items():
                print(f"{variant:5} {label:6} {names[c]:6} gt {n:5d} recall {r:5.2f} precision {p:5.2f} dt {dt:+5.1f} ms")
                summary[f"{variant}.{label}.{names[c]}"] = round(r, 3)
        onset = len(match([t for t, _ in gt], [h[0] for h in det])) / len(gt)
        times = [t for t, _ in gt]
        simul = [i for i, (t, p) in enumerate(gt) if any(abs(t - u) < 0.005 and q != p for u, q in gt[max(0, i - 3): i + 4])]
        mm = {i for i, _, _ in match(times, [h[0] for h in det])}
        # a simultaneous hit counts only if each of its parts got its own detection: matched with the right coarse class
        cm = set()
        for c in (0, 1, 2):
            idx = [i for i, (t, p) in enumerate(gt) if COARSE[p] == c]
            cm |= {idx[i] for i, _, _ in match([gt[i][0] for i in idx], [h[0] for h in det if int(h[2]) == c])}
        sim = sum(1 for i in simul if i in cm) / max(1, len(simul))
        print(f"{variant:5} onsets recall {onset:.2f} | simultaneous hits found with their class {sim:.2f} ({len(simul)}) | detections {len(det)} for {len(gt)} hits")
        summary[f"{variant}.onset"] = round(onset, 3); summary[f"{variant}.simultaneous"] = round(sim, 3)
    print("JSON " + json.dumps(summary))


if __name__ == "__main__":
    main()
