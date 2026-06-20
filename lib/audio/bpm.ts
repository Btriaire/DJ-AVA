// Rough BPM detection via energy-onset autocorrelation.
// Good enough to display + drive beat-loops. Not sample-accurate.
export function detectBPM(buffer: AudioBuffer): number {
  const sr = buffer.sampleRate;
  const ch = buffer.numberOfChannels > 1 ? mixToMono(buffer) : buffer.getChannelData(0);

  // Envelope: downsample to ~200 Hz by taking windowed RMS.
  const win = Math.floor(sr / 200);
  const env: number[] = [];
  for (let i = 0; i < ch.length; i += win) {
    let sum = 0;
    const end = Math.min(i + win, ch.length);
    for (let j = i; j < end; j++) sum += ch[j] * ch[j];
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

function mixToMono(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const out = new Float32Array(len);
  const chs = buffer.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i] / chs;
  }
  return out;
}

// Downsampled peak data for waveform rendering.
export function buildWaveformPeaks(buffer: AudioBuffer, buckets = 1600): Float32Array {
  const data = buffer.numberOfChannels > 1 ? mixToMono(buffer) : buffer.getChannelData(0);
  const peaks = new Float32Array(buckets);
  const step = Math.floor(data.length / buckets) || 1;
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    const start = b * step;
    const end = Math.min(start + step, data.length);
    for (let i = start; i < end; i++) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
    peaks[b] = max;
  }
  return peaks;
}
