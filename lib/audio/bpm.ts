// Rough BPM detection via energy-onset autocorrelation.
// Good enough to display + drive beat-loops. Not sample-accurate.
//
// Memory/CPU note: we never allocate a full-length mono copy (a 15-min stereo
// track is ~170 MB) — we read the channels in place. We also analyse at most
// ANALYSIS_SECONDS from the middle of the track: a steady-tempo song doesn't
// need 20 minutes of audio to find its beat, and scanning the whole thing on
// the main thread is what froze/crashed long files.
const ANALYSIS_SECONDS = 120;
export function detectBPM(buffer: AudioBuffer): number {
  const sr = buffer.sampleRate;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const total = ch0.length;
  // centered window, capped — skips intros/outros and bounds the work
  const maxLen = sr * ANALYSIS_SECONDS;
  const from = total > maxLen ? Math.floor((total - maxLen) / 2) : 0;
  const to = Math.min(total, from + maxLen);

  // Envelope: downsample to ~200 Hz by taking windowed RMS.
  const win = Math.floor(sr / 200);
  const env: number[] = [];
  for (let i = from; i < to; i += win) {
    let sum = 0;
    const end = Math.min(i + win, to);
    for (let j = i; j < end; j++) {
      const x = ch1 ? (ch0[j] + ch1[j]) * 0.5 : ch0[j];
      sum += x * x;
    }
    env.push(Math.sqrt(sum / (end - i)));
  }

  // Onset = positive difference of envelope.
  const onset = new Float32Array(env.length);
  for (let i = 1; i < env.length; i++) onset[i] = Math.max(0, env[i] - env[i - 1]);

  const envRate = sr / win; // samples per second of the onset signal
  let best = 120;
  let bestScore = -Infinity;
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = Math.round((60 / bpm) * envRate);
    if (lag < 1 || lag >= onset.length) continue;
    let score = 0;
    for (let i = lag; i < onset.length; i++) score += onset[i] * onset[i - lag];
    if (score > bestScore) {
      bestScore = score;
      best = bpm;
    }
  }
  return Math.round(best * 10) / 10;
}

// Serato-style colored waveform: per bucket we keep the overall peak plus the
// energy split into low / mid / high bands (→ R / G / B), so bass hits render
// red, mids green and hats/treble blue. One cheap pass with three one-pole
// lowpasses (low, low+mid) derives the bands; the remainder is treble.
export interface ColoredPeaks {
  amp: Float32Array; // 0..1 peak per bucket
  r: Uint8Array; // low-band intensity 0..255
  g: Uint8Array; // mid-band
  b: Uint8Array; // high-band
}

export function buildColoredPeaks(buffer: AudioBuffer, buckets = 1600): ColoredPeaks {
  // read channels in place — no full-length mono copy (see detectBPM note)
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const sr = buffer.sampleRate;
  const n = ch0.length;
  // one-pole lowpass coefficients
  const coeff = (fc: number) => {
    const rc = 1 / (2 * Math.PI * fc);
    const dt = 1 / sr;
    return dt / (rc + dt);
  };
  const aLow = coeff(220); // bass below ~220 Hz
  const aMid = coeff(2500); // everything below ~2.5 kHz (low+mid)

  const amp = new Float32Array(buckets);
  const r = new Uint8Array(buckets);
  const g = new Uint8Array(buckets);
  const b = new Uint8Array(buckets);
  const step = Math.floor(n / buckets) || 1;

  let lpLow = 0;
  let lpMid = 0;
  let bucket = 0;
  let peak = 0;
  let eLow = 0;
  let eMid = 0;
  let eHigh = 0;
  let count = 0;
  const flush = () => {
    if (bucket >= buckets) return;
    amp[bucket] = Math.min(1, peak);
    const lo = Math.sqrt(eLow / Math.max(1, count));
    const mi = Math.sqrt(eMid / Math.max(1, count));
    const hi = Math.sqrt(eHigh / Math.max(1, count));
    const m = Math.max(lo, mi, hi, 1e-6);
    // normalize so the dominant band is vivid; scale by peak for brightness
    const bright = 0.35 + 0.65 * Math.min(1, peak);
    r[bucket] = Math.min(255, (lo / m) * 255 * bright);
    g[bucket] = Math.min(255, (mi / m) * 255 * bright);
    b[bucket] = Math.min(255, (hi / m) * 255 * bright);
    bucket++;
    peak = 0;
    eLow = eMid = eHigh = 0;
    count = 0;
  };

  for (let i = 0; i < n; i++) {
    const x = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
    lpLow += aLow * (x - lpLow);
    lpMid += aMid * (x - lpMid);
    const low = lpLow;
    const mid = lpMid - lpLow;
    const high = x - lpMid;
    eLow += low * low;
    eMid += mid * mid;
    eHigh += high * high;
    const a = Math.abs(x);
    if (a > peak) peak = a;
    count++;
    if (count >= step) flush();
  }
  if (count > 0) flush();
  return { amp, r, g, b };
}

// Beat times (seconds) across a buffer for a given BPM, anchored at `offset`.
export function buildBeatGrid(durationSec: number, bpm: number, offset = 0): number[] {
  if (!bpm || bpm <= 0) return [];
  const beat = 60 / bpm;
  const beats: number[] = [];
  for (let t = offset; t < durationSec; t += beat) if (t >= 0) beats.push(t);
  return beats;
}

// Downsampled peak data for waveform rendering.
export function buildWaveformPeaks(buffer: AudioBuffer, buckets = 1600): Float32Array {
  // read channels in place — no full-length mono copy (see detectBPM note)
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const n = ch0.length;
  const peaks = new Float32Array(buckets);
  const step = Math.floor(n / buckets) || 1;
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    const start = b * step;
    const end = Math.min(start + step, n);
    for (let i = start; i < end; i++) {
      const x = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
      const v = x < 0 ? -x : x;
      if (v > max) max = v;
    }
    peaks[b] = max;
  }
  return peaks;
}
