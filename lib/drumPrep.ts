import { fft } from "./fft";

export type DrumKind = "kick" | "snare" | "hat" | "clap" | "tom";

export interface DrumHit {
  t: number;
  kind: DrumKind;
  vel: number;
}

export interface DrumPrep {
  version: 1;
  bpm: number;
  offset: number;
  duration: number;
  hits: DrumHit[];
  micro: number[];
  velocity: number[];
  pattern: DrumKind[][];
  swing: number;
  fills: { bar: number; t: number }[];
}

export function detectOnsets(x: Float32Array, sr: number): { t: number; strength: number }[] {
  const hop = 256;
  const windowSize = 512;
  const onsets: { t: number; strength: number }[] = [];
  const e: number[] = [];
  const f: number[] = [];
  const windowSamples = Math.floor(sr / hop);

  for (let i = 0; i < x.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      if (i + j < x.length) {
        sum += x[i + j] * x[i + j];
      }
    }
    e.push(Math.sqrt(sum / windowSize));
  }

  for (let i = 1; i < e.length; i++) {
    f.push(Math.max(0, Math.log(e[i] + 1e-6) - Math.log(e[i - 1] + 1e-6)));
  }

  for (let i = 0; i < f.length; i++) {
    let sum = 0;
    let sumSq = 0;
    const start = Math.max(0, i - windowSamples);
    const end = Math.min(f.length, i + windowSamples);

    for (let j = start; j < end; j++) {
      sum += f[j];
      sumSq += f[j] * f[j];
    }

    const mean = sum / (end - start);
    const std = Math.sqrt(sumSq / (end - start) - mean * mean);
    const threshold = mean + 1.0 * std;

    if (f[i] > threshold && f[i] > 0.25) {
      let isMax = true;
      for (let j = Math.max(0, i - 2); j < Math.min(f.length, i + 3); j++) {
        if (f[j] > f[i]) {
          isMax = false;
          break;
        }
      }

      if (isMax) {
        let tooClose = false;
        for (const onset of onsets) {
          if (Math.abs(onset.t - i * hop / sr) < 0.04) {
            if (onset.strength < f[i]) {
              onsets.splice(onsets.indexOf(onset), 1);
            } else {
              tooClose = true;
            }
            break;
          }
        }

        if (!tooClose) {
          onsets.push({ t: i * hop / sr, strength: f[i] });
        }
      }
    }
  }

  return onsets.sort((a, b) => a.t - b.t);
}

export function refineOnset(x: Float32Array, t: number, sr: number): number {
    const s0 = Math.floor(t * sr);
    const end = Math.min(x.length, s0 + 1024);
    let peak = 0;
    for (let k = s0; k < end; k++) {
        const val = Math.abs(x[k]);
        if (val > peak) peak = val;
    }
    if (peak === 0) return t;
    for (let k = s0; k < end; k++) {
        if (Math.abs(x[k]) >= 0.25 * peak) return k / sr;
    }
    return t;
}

export interface HitFeatures {
    centroid: number;
    low: number;
    vel: number;
}

export function hitFeatures(x: Float32Array, start: number, sr: number): HitFeatures {
    const windowSize = 2048;
    const window = new Float32Array(windowSize);
    const re = new Float64Array(windowSize);
    const im = new Float64Array(windowSize);

    for (let i = 0; i < windowSize; i++) {
        const idx = start + i;
        if (idx < x.length) {
            window[i] = x[idx] * 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSize - 1)));
            re[i] = window[i];
        } else {
            window[i] = 0;
            re[i] = 0;
        }
        im[i] = 0;
    }

    fft(re, im);

    let totalPower = 0;
    let weightedSum = 0;
    let lowPower = 0;
    const binSize = sr / windowSize;

    for (let i = 0; i < windowSize / 2; i++) {
        const freq = i * binSize;
        if (freq < 40 || freq > 16000) continue;
        const power = re[i] * re[i] + im[i] * im[i];
        totalPower += power;
        weightedSum += freq * power;
        if (freq < 150) lowPower += power;
    }

    const centroid = totalPower > 0 ? weightedSum / totalPower : 0;
    const low = totalPower > 0 ? lowPower / totalPower : 0;

    let maxAbs = 0;
    for (let i = 0; i < windowSize; i++) {
        const absVal = Math.abs(x[start + i]);
        if (absVal > maxAbs) maxAbs = absVal;
    }
    const vel = Math.min(maxAbs / 0.6, 1);

    return { centroid, low, vel };
}

export function assignKinds(feats: { centroid: number; low: number }[]): DrumKind[] {
    if (feats.length === 0) return [];

    // Étape 1 : Calculer z
    const z = feats.map(f => Math.log2(Math.max(f.centroid, 40)) - 2 * f.low);

    // Étape 2 : k-moyennes 1D
    const sortedZ = [...z].sort((a, b) => a - b);
    const initialCenters = [
        sortedZ[Math.floor(sortedZ.length * 0.1)],
        sortedZ[Math.floor(sortedZ.length * 0.5)],
        sortedZ[Math.floor(sortedZ.length * 0.9)]
    ];

    let centers = [...initialCenters];
    for (let i = 0; i < 15; i++) {
        const clusters: number[][] = Array.from({ length: 3 }, () => []);
        z.forEach((val, idx) => {
            const distances = centers.map(center => Math.abs(val - center));
            const minDistance = Math.min(...distances);
            const clusterIndex = distances.indexOf(minDistance);
            clusters[clusterIndex].push(idx);
        });

        centers = centers.map((center, idx) => {
            if (clusters[idx].length === 0) return center;
            const sum = clusters[idx].reduce((acc, valIdx) => acc + z[valIdx], 0);
            return sum / clusters[idx].length;
        });
    }

    // Étape 3 : Fusionner les groupes
    const sortedCenters = [...centers].sort((a, b) => a - b);
    const finalGroups: number[][] = [];
    let currentGroup: number[] = [sortedCenters[0]];

    for (let i = 1; i < sortedCenters.length; i++) {
        if (sortedCenters[i] - sortedCenters[i - 1] < 0.7) {
            currentGroup.push(sortedCenters[i]);
        } else {
            finalGroups.push(currentGroup);
            currentGroup = [sortedCenters[i]];
        }
    }
    finalGroups.push(currentGroup);

    if (Math.max(...z) - Math.min(...z) < 1) {
        finalGroups.length = 1;
        finalGroups[0] = sortedCenters;
    }

    // Étape 4 : Assigner les étiquettes
    const finalCenters = finalGroups.map(group => group.reduce((a, b) => a + b, 0) / group.length);
    const sortedFinalCenters = [...finalCenters].sort((a, b) => a - b);

    const labels: DrumKind[] = z.map(val => {
        const distances = sortedFinalCenters.map(center => Math.abs(val - center));
        const minDistance = Math.min(...distances);
        const groupIndex = distances.indexOf(minDistance);

        if (sortedFinalCenters.length === 1) {
            if (sortedFinalCenters[0] < Math.log2(300)) return "kick";
            if (sortedFinalCenters[0] > Math.log2(3000)) return "hat";
            return "snare";
        } else if (sortedFinalCenters.length === 2) {
            if (groupIndex === 0) {
                return sortedFinalCenters[0] < Math.log2(400) ? "kick" : "snare";
            } else {
                return sortedFinalCenters[1] > Math.log2(3000) ? "hat" : "snare";
            }
        } else {
            return ["kick", "snare", "hat"][groupIndex] as DrumKind;
        }
    });

    return labels;
}

export function gridStats(hits: DrumHit[], bpm: number, offset: number): { micro: number[]; velocity: number[]; pattern: DrumKind[][]; swing: number } {
  const step = 60 / bpm / 4;
  const micro: number[] = new Array(16).fill(0);
  const velocity: number[] = new Array(16).fill(0);
  const pattern: DrumKind[][] = Array.from({ length: 16 }, () => []);
  const swingMicro: number[] = [];
  const counts: number[] = new Array(16).fill(0);
  const devSums: number[] = new Array(16).fill(0);
  const velSums: number[] = new Array(16).fill(0);
  const kindSets: Set<DrumKind>[] = Array.from({ length: 16 }, () => new Set());
  const barSets: Set<number>[] = Array.from({ length: 16 }, () => new Set());

  hits.forEach(hit => {
    const n = Math.round((hit.t - offset) / step);
    const gridT = offset + n * step;
    const dev = (hit.t - gridT) * 1000;
    const pos = ((n % 16) + 16) % 16;
    const bar = Math.floor(n / 16);

    counts[pos]++;
    devSums[pos] += dev;
    velSums[pos] += hit.vel;
    kindSets[pos].add(hit.kind);
    barSets[pos].add(bar);

    if (pos % 4 === 2) {
      swingMicro.push(dev);
    }
  });

  for (let pos = 0; pos < 16; pos++) {
    micro[pos] = counts[pos] > 0 ? Math.round(devSums[pos] / counts[pos] * 10) / 10 : 0;
    velocity[pos] = counts[pos] > 0 ? Math.round(velSums[pos] / counts[pos] * 100) / 100 : 0;

    const uniqueBars = barSets[pos].size;
    const threshold = Math.ceil(uniqueBars * 0.3);
    const kindCounts: { [key in DrumKind]?: number } = {};

    hits.forEach(hit => {
      const n = Math.round((hit.t - offset) / step);
      const hitPos = ((n % 16) + 16) % 16;
      if (hitPos === pos) {
        kindCounts[hit.kind] = (kindCounts[hit.kind] || 0) + 1;
      }
    });

    pattern[pos] = Object.entries(kindCounts)
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([kind]) => kind as DrumKind);
  }

  const swing = swingMicro.length > 0 ? Math.round(swingMicro.reduce((a, b) => a + b, 0) / swingMicro.length * 10) / 10 : 0;

  return { micro, velocity, pattern, swing };
}

export function findFills(hits: DrumHit[], bpm: number, offset: number, duration: number): { bar: number; t: number }[] {
  const barLen = 240 / bpm;
  const barCounts: { [key: number]: number } = {};

  hits.forEach(hit => {
    const bar = Math.floor((hit.t - offset) / barLen);
    barCounts[bar] = (barCounts[bar] || 0) + 1;
  });

  const nonEmptyBars = Object.values(barCounts).filter(count => count > 0);
  const median = nonEmptyBars.sort((a, b) => a - b)[Math.floor(nonEmptyBars.length / 2)];
  const threshold = Math.max(1.6 * median, median + 4);

  const fills = Object.entries(barCounts)
    .filter(([bar, count]) => count >= threshold && parseInt(bar) > 0)
    .map(([bar]) => ({ bar: parseInt(bar), t: offset + parseInt(bar) * barLen }))
    .filter(fill => fill.t < duration)
    .sort((a, b) => a.bar - b.bar);

  return fills;
}

export function summarize(x: Float32Array, sr: number, bpm: number, offset: number): DrumPrep {
  const onsets = detectOnsets(x, sr).map((o) => ({ ...o, t: refineOnset(x, o.t, sr) }));
  const feats = onsets.map((o) => hitFeatures(x, Math.max(0, Math.round(o.t * sr) - 128), sr));
  const kinds = assignKinds(feats);
  const hits: DrumHit[] = onsets.map((o, i) => ({ t: Math.round(o.t * 1000) / 1000, kind: kinds[i], vel: Math.round(feats[i].vel * 100) / 100 }));
  const { micro, velocity, pattern, swing } = gridStats(hits, bpm, offset);
  const fills = findFills(hits, bpm, offset, x.length / sr);
  return { version: 1, bpm, offset, duration: x.length / sr, hits, micro, velocity, pattern, swing, fills };
}

export function estimateGrid(hits: DrumHit[]): { bpm: number; offset: number } | null {
    const kicks = hits.filter(hit => hit.kind === "kick").map(hit => hit.t);
    const times = kicks.length >= 6 ? kicks : hits.map(hit => hit.t);
    const intervals = times.slice(1).map((t, i) => t - times[i]);
    const validIntervals = intervals.filter(interval => interval >= 0.25 && interval <= 1.2);
    if (validIntervals.length < 5) return null;
    const med = validIntervals.sort((a, b) => a - b)[Math.floor(validIntervals.length / 2)];
    let bpm = 60 / med;
    while (bpm < 80) bpm *= 2;
    while (bpm > 160) bpm /= 2;
    bpm = Math.round(bpm * 10) / 10;
    const beat = 60 / bpm;
    const offset = Math.round((times[0] % beat) * 1000) / 1000;
    return { bpm, offset };
}

export function analyse(x: Float32Array, sr: number, bpmHint = 0, offsetHint = 0): DrumPrep | null {
    if (bpmHint > 0) return summarize(x, sr, bpmHint, offsetHint);
    const r0 = summarize(x, sr, 120, 0);
    const g = estimateGrid(r0.hits);
    if (g === null) return null;
    return summarize(x, sr, g.bpm, g.offset);
}

export function pickHits(hits: DrumHit[], kind: DrumKind, max = 6, gap = 0.5): DrumHit[] {
  const filteredHits = hits.filter(hit => hit.kind === kind && hit.vel > 0.15)
                           .sort((a, b) => b.vel - a.vel);
  const selectedHits: DrumHit[] = [];
  for (const hit of filteredHits) {
    if (selectedHits.every(selectedHit => Math.abs(hit.t - selectedHit.t) >= gap)) {
      selectedHits.push(hit);
      if (selectedHits.length >= max) break;
    }
  }
  return selectedHits;
}

export function pickHitsTest(): void {
  const hits: DrumHit[] = [
    {t:1, kind:"kick", vel:0.9},
    {t:1.2, kind:"kick", vel:0.95},
    {t:3, kind:"kick", vel:0.5},
    {t:5, kind:"kick", vel:0.1},
    {t:2, kind:"snare", vel:0.8}
  ];
  const kickHits = pickHits(hits, "kick");
  if (kickHits.length !== 2) throw new Error("pickHits(hits, 'kick') should have exactly 2 elements");
  if (kickHits[0].t !== 1.2) throw new Error("pickHits(hits, 'kick')[0].t should be 1.2");
  if (pickHits(hits, "snare").length !== 1) throw new Error("pickHits(hits, 'snare') should have exactly 1 element");
  if (pickHits(hits, "hat").length !== 0) throw new Error("pickHits(hits, 'hat') should have exactly 0 elements");
  if (pickHits(hits, "kick", 1).length !== 1) throw new Error("pickHits(hits, 'kick', 1) should have exactly 1 element");
}

export function slicePeaks(x: Float32Array, start: number, len: number, bins: number): number[] {
  if (bins < 1) return [];
  const peaks: number[] = [];
  let maxPeak = 0;
  for (let b = 0; b < bins; b++) {
    const binStart = Math.floor(start + b * len / bins);
    const binEnd = Math.floor(start + (b + 1) * len / bins);
    let peak = 0;
    for (let i = Math.max(0, binStart); i < Math.min(x.length, binEnd); i++) {
      const absVal = Math.abs(x[i]);
      if (absVal > peak) peak = absVal;
    }
    peaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }
  if (maxPeak === 0) return new Array(bins).fill(0);
  return peaks.map(p => Math.round((p / maxPeak) * 100) / 100);
}

export function slicePeaksTest(): void {
  const x = new Float32Array(1000);
  for (let k = 500; k < 1000; k++) x[k] = 0.5;
  const same = (a: number[], b: number[]) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(slicePeaks(x, 0, 1000, 4), [0, 0, 1, 1])) throw new Error("Test 1 échoué");
  if (!same(slicePeaks(x, 5000, 1000, 4), [0, 0, 0, 0])) throw new Error("Test 2 échoué");
  if (slicePeaks(x, 0, 1000, 0).length !== 0) throw new Error("Test 3 échoué");
  if (!same(slicePeaks(new Float32Array(100), 0, 100, 5), [0, 0, 0, 0, 0])) throw new Error("Test 4 échoué");
  if (slicePeaks(x, 0, 1000, 8).length !== 8) throw new Error("Test 5 échoué");
}

export function drumPrepTest(): void {
    const sr = 44100;
    const bpm = 120;
    const duration = 16;
    const x = new Float32Array(duration * sr);

    const n = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 2 - 1;

    const add = (t0: number, len: number, f: (t: number, i: number) => number) => {
        const start = Math.round(t0 * sr);
        const end = Math.round((t0 + len) * sr);
        for (let i = start; i < end; i++) {
            const t = (i - start) / sr;
            x[i] += f(t, i);
        }
    };

    for (let b = 0; b < 8; b++) {
        for (let pos = 0; pos < 16; pos++) {
            const t0 = b * 2 + pos * 0.125;
            if (pos === 0 || pos === 8) {
                add(t0, 0.2, t => 0.8 * Math.exp(-t / 0.08) * Math.sin(2 * Math.PI * 70 * t));
            }
            if (pos === 4 || pos === 12 || b === 6) {
                add(t0, 0.15, (t, i) => 0.5 * Math.exp(-t / 0.05) * 3 * (n(i) + n(i-1) + n(i-2) + n(i-3) + n(i-4) + n(i-5) + n(i-6) + n(i-7)) / 8 + 0.3 * Math.exp(-t / 0.06) * Math.sin(2 * Math.PI * 220 * t));
            }
            if (pos % 4 === 2) {
                add(t0 + 0.015, 0.06, (t, i) => 0.3 * Math.exp(-t / 0.02) * (n(i) - n(i - 1)));
            }
        }
    }

    const r = summarize(x, sr, bpm, 0);

    if (r.hits.filter(h => h.kind === "kick").length < 12) throw new Error("kick");
    if (r.hits.filter(h => h.kind === "snare").length < 12) throw new Error("snare");
    if (r.hits.filter(h => h.kind === "hat").length < 20) throw new Error("hat");
    if (Math.abs(r.micro[2] - 15) > 8) throw new Error("micro");
    if (r.swing <= 8) throw new Error("swing");
    if (!r.fills.some(f => f.bar === 6)) throw new Error("fills");
    if (!r.pattern[0].includes("kick")) throw new Error("pattern");
}

