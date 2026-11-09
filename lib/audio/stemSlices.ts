import type { PadSample } from "@/lib/stemSamples";

export interface Slice {
  t: number;
  dur: number;
  score: number;
  label?: string;
}

// held parts (pads, chords, guitar, piano): a slice runs to the next STRONG onset only, lasts 1 beat to 1 bar,
// and is rounded to whole beats so it loops in time. `beat` is the length of a beat in seconds (0 = tempo unknown).
export interface HeldOpts { beat: number }

export function pickSlices(data: Float32Array, sr: number, n = 8, minLen = 0.2, maxLen = 1.6, held?: HeldOpts): Slice[] {
  if (held) {
    const beat = held.beat > 0 ? held.beat : 0.5;
    minLen = beat;
    maxLen = beat * 4;
  }
  const hopSize = Math.round(0.01 * sr); // 10 ms hop
  const env: number[] = [];
  const flux: number[] = [];
  const candidates: Slice[] = [];
  const picks: Slice[] = [];

  // Compute envelope and onset flux
  for (let i = 0; i < data.length; i += hopSize) {
    const end = Math.min(i + hopSize, data.length);
    let sum = 0;
    for (let j = i; j < end; j++) {
      sum += data[j] * data[j];
    }
    const rms = Math.sqrt(sum / (end - i));
    env.push(rms);

    if (i >= 4 * hopSize) {
      const prevMean = env.slice(i / hopSize - 4, i / hopSize).reduce((a, b) => a + b, 0) / 4;
      const f = Math.max(0, rms - prevMean) / (1e-4 + prevMean);
      flux.push(f);
    } else {
      flux.push(0);
    }
  }

  // Find candidates
  const globalPeak = Math.max(...env);
  for (let i = 5; i < flux.length - 5; i++) {
    const score = flux[i] * env[i];
    let isLocalMax = true;
    for (let j = i - 5; j <= i + 5; j++) {
      if (flux[j] > flux[i]) {
        isLocalMax = false;
        break;
      }
    }
    if (isLocalMax && env[i] > 0.05 * globalPeak) {
      candidates.push({ t: i * hopSize / sr, dur: 0, score });
    }
  }

  // Sort candidates by descending score
  candidates.sort((a, b) => b.score - a.score);

  // Pick slices greedily
  for (const candidate of candidates) {
    if (picks.length >= n) break;
    let overlap = false;
    for (const pick of picks) {
      // a held part: no new slice inside one already picked (its small attacks), nor just before it
      const inside = held ? candidate.t > pick.t - minLen * 0.75 && candidate.t < pick.t + pick.dur : false;
      if (inside || Math.abs(candidate.t - pick.t) < 0.35) {
        overlap = true;
        break;
      }
    }
    if (!overlap) {
      // Find the next candidate onset (for a held part: only a strong one, the small attacks inside a chord don't cut it)
      let nextOnset = Infinity;
      for (const c of candidates) {
        if (held && c.score < 0.35 * candidate.score) continue;
        if (c.t > candidate.t + (held ? minLen * 0.75 : 0) && c.t < nextOnset) {
          nextOnset = c.t;
        }
      }

      // Find the point where the envelope falls below 10% of the peak after the onset
      const onsetIdx = Math.round(candidate.t * sr / hopSize);
      let endIdx = onsetIdx;
      for (let i = onsetIdx; i < env.length; i++) {
        if (env[i] < 0.1 * env[onsetIdx]) {
          endIdx = i;
          break;
        }
      }

      // Determine the duration (a held part keeps sounding past its first fade: only the next strong onset ends it)
      const maxEnd = Math.min(candidate.t + maxLen, held ? Infinity : endIdx * hopSize / sr, nextOnset);
      let dur = Math.max(minLen, Math.min(maxLen, maxEnd - candidate.t));
      if (held && held.beat > 0) dur = Math.max(1, Math.round(dur / held.beat)) * held.beat; // whole beats

      picks.push({ t: Math.max(0, candidate.t - 0.005), dur, score: candidate.score });
    }
  }

  // Sort picks by t ascending
  picks.sort((a, b) => a.t - b.t);

  return picks;
}

export function poolSlices(pool: PadSample[], n = 8): Slice[] {
  const result: Slice[] = [];
  for (const s of pool) {
    if (result.length >= n) break;
    if (s.end <= s.start) continue;
    result.push({ t: s.start, dur: s.end - s.start, score: s.score, label: s.label });
  }
  return result;
}

export function stemSlicesTest(): string[] {
  const failures: string[] = [];

  // Test 1: Four decaying sine bursts
  const sr = 44100;
  const dur = 6;
  const data = new Float32Array(sr * dur);
  const freq = 80;
  const bursts = [0.5, 1.5, 3, 4.5];

  for (const t of bursts) {
    const start = Math.round(t * sr);
    const end = Math.min(start + Math.round(0.4 * sr), data.length);
    for (let i = start; i < end; i++) {
      const decay = Math.exp(-(i - start) / (0.4 * sr));
      data[i] = Math.sin(2 * Math.PI * freq * (i - start) / sr) * decay;
    }
  }

  const slices = pickSlices(data, sr);

  if (slices.length !== 4) {
    failures.push(`Expected 4 slices, got ${slices.length}`);
  } else {
    for (let i = 0; i < slices.length; i++) {
      if (Math.abs(slices[i].t - bursts[i]) > 0.03) {
        failures.push(`Slice ${i} t ${slices[i].t} is not within 30 ms of burst start ${bursts[i]}`);
      }
      if (slices[i].dur < 0.2 || slices[i].dur > 0.6) {
        failures.push(`Slice ${i} dur ${slices[i].dur} is not between 0.2 and 0.6`);
      }
    }
  }

  // Test 1b: a held chord with small attacks inside it is not cut at each of them, and lasts whole beats
  {
    const beat = 0.5;
    const held = new Float32Array(sr * 8);
    const chords = [1, 3, 5];
    for (const t of chords) {
      const start = Math.round(t * sr);
      for (let i = start; i < Math.min(held.length, start + 1.8 * sr); i++) { // 0.2 s of silence between chords
        const k = i - start;
        const flicker = 1 + 0.25 * (Math.floor(k / (0.15 * sr)) % 2); // little attacks every 150 ms
        held[i] = 0.8 * Math.sin(2 * Math.PI * 220 * k / sr) * flicker;
      }
    }
    const hs = pickSlices(held, sr, 8, 0.2, 1.6, { beat });
    const main = hs.filter((x) => chords.some((c) => Math.abs(x.t - c) < 0.05));
    if (main.length !== 3) failures.push(`held: expected the 3 chord starts, got ${hs.map((x) => x.t.toFixed(2)).join(",")}`);
    for (const x of main) {
      if (x.dur < 1.5 - 1e-6) failures.push(`held: slice at ${x.t.toFixed(2)} lasts ${x.dur.toFixed(2)} s, cut too early`);
      if (Math.abs(x.dur / beat - Math.round(x.dur / beat)) > 1e-6) failures.push(`held: ${x.dur} s is not whole beats`);
    }
  }

  // Test 2: All-zero buffer
  const zeroData = new Float32Array(sr * dur);
  const zeroSlices = pickSlices(zeroData, sr);

  if (zeroSlices.length !== 0) {
    failures.push(`Expected 0 slices for all-zero buffer, got ${zeroSlices.length}`);
  }

  // Test 3: poolSlices with 10 samples
  const pool: PadSample[] = [];
  for (let i = 0; i < 10; i++) {
    pool.push({ start: i, end: i + 0.5, kind: "loop", bars: 1, score: 1, label: `L${i}` });
  }
  pool.push({ start: 10, end: 10, kind: "loop", bars: 1, score: 1, label: "L10" });
  const poolResult = poolSlices(pool, 8);
  if (poolResult.length !== 8) {
    failures.push(`Expected 8 slices from pool, got ${poolResult.length}`);
  } else {
    if (poolResult[0].t !== 0 || poolResult[0].dur !== 0.5 || poolResult[0].label !== "L0") {
      failures.push(`First slice should be t=0, dur=0.5, label="L0"`);
    }
  }
  if (poolSlices([]).length !== 0) {
    failures.push("poolSlices([]) should return []");
  }

  return failures;
}
