// Pads at the same loudness, whatever stem they come from: a drum loop and a quiet pad of the "other" stem would
// otherwise play 15-20 dB apart. The gain brings a slice of a stem buffer to a common RMS, within ±12 dB
// (a near-silent slice is not blown up). Measured once per slice and kept.
export const PAD_TARGET_RMS = 0.12; // about -18 dBFS
const MIN_GAIN = 0.25; // -12 dB
const MAX_GAIN = 4; // +12 dB

const cache = new WeakMap<AudioBuffer, Map<string, number>>();

// RMS of [t, t + dur] over all channels (every 4th sample: plenty for a level, 4x faster)
export function sliceRms(buf: AudioBuffer, t: number, dur: number): number {
  const sr = buf.sampleRate;
  const a = Math.max(0, Math.floor(t * sr));
  const b = Math.min(buf.length, Math.ceil((t + dur) * sr));
  if (b <= a) return 0;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = a; i < b; i += 4) {
      sum += d[i] * d[i];
      n++;
    }
  }
  return n ? Math.sqrt(sum / n) : 0;
}

export function normGain(buf: AudioBuffer, t: number, dur: number): number {
  let m = cache.get(buf);
  if (!m) cache.set(buf, (m = new Map()));
  const key = `${t.toFixed(3)}:${dur.toFixed(3)}`;
  let g = m.get(key);
  if (g === undefined) {
    const rms = sliceRms(buf, t, dur);
    g = rms > 1e-5 ? Math.min(MAX_GAIN, Math.max(MIN_GAIN, PAD_TARGET_RMS / rms)) : 1;
    m.set(key, g);
  }
  return g;
}
