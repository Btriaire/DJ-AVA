// Musical key detection for harmonic mixing — chroma extraction (Goertzel,
// no need for a full FFT) + Krumhansl-Schmuckler key-finding, mapped to
// Camelot wheel notation (the "8A/9B"-style labels pro DJs use to know which
// tracks mix cleanly together). Like detectBPM, this is "good enough for DJ
// use, on the main thread, in well under a second" — not lab-grade musicology.

const ANALYSIS_SECONDS = 60; // centered window — a track's key doesn't drift

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

// Camelot wheel position per pitch class (0 = C), one table per mode.
const CAMELOT_MAJOR = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"];
const CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];

// Krumhansl-Kessler key profiles — index 0 = tonic, index i = weight of the
// scale degree i semitones above the tonic. Standard, widely-used constants.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Goertzel algorithm: the energy at ONE target frequency, without computing a
// full spectrum — much cheaper than an FFT when we only want ~36 specific
// note frequencies out of a window.
function goertzelMag(samples: Float32Array, offset: number, len: number, sr: number, freq: number): number {
  const k = Math.round((len * freq) / sr);
  const w = (2 * Math.PI * k) / len;
  const coeff = 2 * Math.cos(w);
  let s0 = 0,
    s1 = 0,
    s2 = 0;
  for (let i = 0; i < len; i++) {
    s0 = samples[offset + i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const real = s1 - s2 * Math.cos(w);
  const imag = s2 * Math.sin(w);
  return Math.sqrt(real * real + imag * imag);
}

export interface KeyResult {
  pitchClass: number; // 0..11, 0 = C
  mode: "major" | "minor";
  name: string; // e.g. "A♯ minor"
  camelot: string; // e.g. "3A" — the notation DJ software shows
}

export function detectKey(buffer: AudioBuffer): KeyResult | null {
  const sr = buffer.sampleRate;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const total = ch0.length;
  const maxLen = sr * ANALYSIS_SECONDS;
  const from = total > maxLen ? Math.floor((total - maxLen) / 2) : 0;
  const to = Math.min(total, from + maxLen);
  if (to - from < sr * 4) return null; // too short to bother

  // bounded-length mono mix of just the analysis window (safe to allocate —
  // capped at ANALYSIS_SECONDS, unlike a full-track copy)
  const mono = new Float32Array(to - from);
  for (let i = from; i < to; i++) mono[i - from] = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];

  const WIN = 4096;
  const HOP = 4096; // no overlap — plenty of windows in a minute of audio
  const chroma = new Float64Array(12);

  // three octaves centred on the musically dominant range (~130 Hz – 1 kHz)
  const midiLo = 48,
    midiHi = 83; // C3..B5
  const freqs: number[] = [];
  const pcs: number[] = [];
  for (let m = midiLo; m <= midiHi; m++) {
    freqs.push(440 * Math.pow(2, (m - 69) / 12));
    pcs.push(m % 12);
  }

  for (let pos = 0; pos + WIN <= mono.length; pos += HOP) {
    for (let f = 0; f < freqs.length; f++) {
      chroma[pcs[f]] += goertzelMag(mono, pos, WIN, sr, freqs[f]);
    }
  }
  const sum = chroma.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  for (let i = 0; i < 12; i++) chroma[i] /= sum;

  // correlate the observed chroma against all 24 rotated major/minor profiles
  const meanChroma = chroma.reduce((a, b) => a + b, 0) / 12;
  const correlate = (profile: number[], tonicPc: number): number => {
    const rotated = new Array(12);
    for (let i = 0; i < 12; i++) rotated[(i + tonicPc) % 12] = profile[i];
    const meanP = rotated.reduce((a, b) => a + b, 0) / 12;
    let num = 0,
      denA = 0,
      denB = 0;
    for (let i = 0; i < 12; i++) {
      const da = chroma[i] - meanChroma;
      const db = rotated[i] - meanP;
      num += da * db;
      denA += da * da;
      denB += db * db;
    }
    const den = Math.sqrt(denA * denB);
    return den > 0 ? num / den : 0;
  };

  let best = { score: -Infinity, pc: 0, mode: "major" as "major" | "minor" };
  for (let pc = 0; pc < 12; pc++) {
    const sMaj = correlate(MAJOR_PROFILE, pc);
    if (sMaj > best.score) best = { score: sMaj, pc, mode: "major" };
    const sMin = correlate(MINOR_PROFILE, pc);
    if (sMin > best.score) best = { score: sMin, pc, mode: "minor" };
  }

  const camelot = best.mode === "major" ? CAMELOT_MAJOR[best.pc] : CAMELOT_MINOR[best.pc];
  const name = best.mode === "major" ? NOTE_NAMES[best.pc] : `${NOTE_NAMES[best.pc]}m`;
  return { pitchClass: best.pc, mode: best.mode, name, camelot };
}
