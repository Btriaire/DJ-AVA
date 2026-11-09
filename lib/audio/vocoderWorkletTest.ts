// Checks the vocoder AudioWorklet DSP (public/vocoder-worklet.js) under Node: its VocoderCore runs without Web Audio
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VOCODER_VARIANTS, type VocoderVariant } from "./jamVocoder";

interface Params { formant: number; release: number; noise: number; spread: number; gate: number }
interface Core {
  setRun(on: boolean): void;
  setChord(midis: number[]): void;
  setVariant(v: VocoderVariant): void;
  process(input: Float32Array | null, outL: Float32Array, outR: Float32Array, p: Params): void;
}
type CoreCtor = new (sampleRate: number, bands: number) => Core;

const SR = 48000;
const BASE: Params = { formant: 0, release: 0.06, noise: 0.5, spread: 0.6, gate: -55 };

function loadCore(): CoreCtor {
  const src = readFileSync(join(process.cwd(), "public/vocoder-worklet.js"), "utf8");
  const box: { VocoderCore?: CoreCtor; bp4?: Bp4; bpCoefs?: BpCoefs } = {};
  new Function("exportsBox", src)(box);
  if (!box.VocoderCore || !box.bp4 || !box.bpCoefs) throw new Error("public/vocoder-worklet.js must set exportsBox.VocoderCore, exportsBox.bp4 and exportsBox.bpCoefs when exportsBox is defined");
  bp4 = box.bp4; bpCoefs = box.bpCoefs;
  return box.VocoderCore;
}
type Bp4 = (x: number, c: Float64Array, co: number, z: Float64Array, zo: number) => number;
type BpCoefs = (f: number, q: number, sr: number, c: Float64Array, co: number) => void;
let bp4: Bp4 | null = null, bpCoefs: BpCoefs | null = null;

// steady-state gain of bp4 for a sine at f (filter centred on f0, Q q)
function bpGain(f0: number, q: number, f: number): number {
  const c = new Float64Array(5), z = new Float64Array(4); bpCoefs!(f0, q, SR, c, 0);
  let peak = 0; for (let i = 0; i < SR; i++) { const y = bp4!(Math.sin((2 * Math.PI * f * i) / SR), c, 0, z, 0); if (i > SR / 2) peak = Math.max(peak, Math.abs(y)); }
  return peak;
}

function render(core: Core, mod: Float32Array, p: Params): { L: Float32Array; R: Float32Array } {
  const L = new Float32Array(mod.length), R = new Float32Array(mod.length);
  for (let i = 0; i + 128 <= mod.length; i += 128) core.process(mod.subarray(i, i + 128), L.subarray(i, i + 128), R.subarray(i, i + 128), p);
  return { L, R };
}

const rms = (x: Float32Array, from = 0) => { let s = 0; for (let i = from; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length - from)); };
// magnitude of one frequency in the second half of the signal
function mag(x: Float32Array, f: number): number {
  let re = 0, im = 0;
  for (let i = x.length >> 1; i < x.length; i++) { const w = (2 * Math.PI * f * i) / SR; re += x[i] * Math.cos(w); im += x[i] * Math.sin(w); }
  return Math.hypot(re, im) / (x.length >> 1);
}
const peakNear = (x: Float32Array, lo: number, hi: number) => { let m = 0; for (let f = lo; f <= hi; f += 10) m = Math.max(m, mag(x, f)); return m; };
function noiseSig(n: number, amp: number): Float32Array {
  const out = new Float32Array(n); let s = 12345, prev = 0;
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; const v = s / 2147483648 - 1; out[i] = amp * (v - prev); prev = v; }
  return out;
}

export function vocoderWorkletTest(): string[] {
  const fails: string[] = [];
  let Core: CoreCtor;
  try { Core = loadCore(); } catch (e) { return [`load: ${(e as Error).message}`]; }
  const make = (chord: number[] | null) => { const c = new Core(SR, 24); c.setRun(true); if (chord) c.setChord(chord); return c; };
  const n = SR; // 1 s

  // a) silence in, silence out (the gate closes)
  { const o = render(make([60, 64, 67]), new Float32Array(n), BASE); const r = rms(o.L, n / 2); if (!(r < 1e-4)) fails.push(`a) silence: RMS ${r} >= 1e-4`); }

  // b) a voiced buzz at 120 Hz makes the chord speak, finite and never clipping
  {
    const mod = new Float32Array(n); for (let i = 0; i < n; i += 400) mod[i] = 1;
    const o = render(make([57, 60, 64, 67]), mod, BASE);
    const r = rms(o.L, n / 2);
    let bad = false; for (let i = 0; i < n; i++) if (!Number.isFinite(o.L[i]) || !Number.isFinite(o.R[i]) || Math.abs(o.L[i]) > 1 || Math.abs(o.R[i]) > 1) { bad = true; break; }
    if (!(r > 0.01)) fails.push(`b) voiced: RMS ${r} <= 0.01`);
    if (bad) fails.push("b) voiced: non finite sample or |x| > 1");
  }

  // c) formants: a 1 kHz vowel puts the chord's energy near 1 kHz, not near 4 kHz (chord C3 major, saws rich up to 10 kHz)
  {
    const mod = new Float32Array(n); for (let i = 0; i < n; i++) mod[i] = 0.3 * Math.sin((2 * Math.PI * 1000 * i) / SR);
    const o = render(make([48, 52, 55]), mod, { ...BASE, noise: 0 });
    const a = peakNear(o.L, 900, 1100) + peakNear(o.R, 900, 1100), b = peakNear(o.L, 3800, 4200) + peakNear(o.R, 3800, 4200);
    if (!(a > 10 * b)) fails.push(`c) formants: energy near 1 kHz ${a} is not 10x the energy near 4 kHz ${b}`);
  }

  // d) consonants: hiss with no chord still comes through as noise, and only thanks to the noise knob
  {
    const mod = noiseSig(n, 0.3);
    const r1 = rms(render(make(null), mod, { ...BASE, noise: 1 }).L, n / 2);
    const r0 = rms(render(make(null), mod, { ...BASE, noise: 0 }).L, n / 2);
    if (!(r1 > 0.005)) fails.push(`d) consonants noise=1: RMS ${r1} <= 0.005`);
    if (!(r0 * 3 < r1)) fails.push(`d) consonants noise=0: RMS ${r0} not 3x below noise=1 ${r1}`);
  }

  // e) stopped: exact silence
  {
    const c = make([60, 64, 67]); c.setRun(false);
    const mod = new Float32Array(4096); for (let i = 0; i < mod.length; i += 400) mod[i] = 1;
    const o = render(c, mod, BASE);
    if (o.L.some((v) => v !== 0) || o.R.some((v) => v !== 0)) fails.push("e) run off: output not exactly zero");
  }

  // f) spread: 0 gives identical channels, 1 gives different ones
  {
    const mod = new Float32Array(n); for (let i = 0; i < n; i += 400) mod[i] = 1;
    const o0 = render(make([57, 60, 64]), mod, { ...BASE, spread: 0 });
    let d0 = 0; for (let i = 0; i < n; i++) d0 = Math.max(d0, Math.abs(o0.L[i] - o0.R[i]));
    const o1 = render(make([57, 60, 64]), mod, { ...BASE, spread: 1 });
    let d1 = 0; for (let i = 0; i < n; i++) d1 = Math.max(d1, Math.abs(o1.L[i] - o1.R[i]));
    if (d0 > 1e-6) fails.push(`f) spread 0: L and R differ by ${d0}`);
    if (!(d1 > 0.01)) fails.push(`f) spread 1: L and R too close (${d1})`);
  }

  // h) selectivity (4th-order bands): a 1 kHz vowel leaks at most 1/30 of its energy one octave up, at 2 kHz
  {
    const mod = new Float32Array(n); for (let i = 0; i < n; i++) mod[i] = 0.3 * Math.sin((2 * Math.PI * 1000 * i) / SR);
    const o = render(make([48, 52, 55]), mod, { ...BASE, noise: 0 });
    const a = peakNear(o.L, 950, 1050) + peakNear(o.R, 950, 1050), b = peakNear(o.L, 1950, 2050) + peakNear(o.R, 1950, 2050);
    if (!(a > 30 * b)) fails.push(`h) selectivity: energy near 1 kHz ${a} is not 30x the energy near 2 kHz ${b} (each band needs two band-pass biquads in cascade, transposed direct form II)`);
  }

  // i) the hiss never repeats: no correlation at a lag of one block (128) between the two halves of the noise output
  {
    const mod = noiseSig(n, 0.3);
    const o = render(make(null), mod, { ...BASE, noise: 1 });
    let num = 0, den = 0; for (let i = n / 2; i < n - 128; i++) { num += o.L[i] * o.L[i + 128]; den += o.L[i] * o.L[i]; }
    const corr = Math.abs(num) / (den + 1e-12);
    const mc = (() => { let nu = 0, de = 0; for (let i = n / 2; i < n - 128; i++) { nu += mod[i] * mod[i + 128]; de += mod[i] * mod[i]; } return Math.abs(nu) / (de + 1e-12); })();
    if (!(corr < 0.3 + mc)) fails.push(`i) noise repeats every 128 samples (correlation ${corr.toFixed(2)}): the noise generator state must persist across blocks`);
  }

  // j) the band filter itself: two RBJ band-pass stages (0 dB peak) in transposed direct form II
  {
    const q = 4.8, at = (r: number) => 1 / (1 + q * q * (r - 1 / r) ** 2); // one stage squared magnitude
    const g0 = bpGain(1000, q, 1000), g2 = bpGain(1000, q, 2000), e2 = at(2);
    if (Math.abs(g0 - 1) > 0.02) fails.push(`j) bp4 gain at its centre is ${g0.toFixed(4)}, expected 1 (two RBJ 0 dB peak band-pass stages)`);
    if (Math.abs(g2 - e2) > 0.1 * e2) fails.push(`j) bp4 gain one octave up is ${g2.toExponential(3)}, expected ${e2.toExponential(3)} (two cascaded stages, each y = b0*x + z1; z1 = b1*x - a1*y + z2; z2 = b2*x - a2*y)`);
  }

  // k) variants: a flat noise voice excites every band, so the carrier's own spectrum shows
  {
    const flat = new Float32Array(n); let st = 777; for (let i = 0; i < n; i++) { st = (st * 1103515245 + 12345) >>> 0; flat[i] = 0.3 * (st / 2147483648 - 1); }
    const base: VocoderVariant = { ...VOCODER_VARIANTS[0], wave: "saw", octave: 0, mono: false, detune: 0, trim: 1 };
    const run = (over: Partial<VocoderVariant>, chord: number[], bands = 24) => {
      const c = new Core(SR, bands); c.setRun(true); c.setVariant({ ...base, ...over }); c.setChord(chord);
      return render(c, flat, { ...BASE, noise: 0, spread: 0 }).L;
    };
    const C3 = 130.81, Cs4 = 277.18, C4 = 261.63;

    const poly = mag(run({}, [48, 61]), Cs4), mono = mag(run({ mono: true }, [61, 48]), Cs4);
    if (!(mono * 10 < poly)) fails.push(`k) mono must play only the lowest note of the chord: C#4 ${mono} with mono, ${poly} without`);

    const up = run({ octave: 1 }, [60]);
    if (!(mag(up, C4 * 2) > 5 * mag(up, C4))) fails.push(`k) octave +1: energy at the octave ${mag(up, C4 * 2)} is not 5x the original pitch ${mag(up, C4)}`);

    const sq = run({ wave: "square" }, [48]);
    if (!(mag(sq, C3 * 3) > 3 * mag(sq, C3 * 2))) fails.push(`k) square wave has odd harmonics: 3f ${mag(sq, C3 * 3)} is not 3x 2f ${mag(sq, C3 * 2)}`);
    const sw = run({ wave: "saw" }, [48]);
    if (!(mag(sw, C3 * 2) > 0.5 * mag(sw, C3 * 3))) fails.push(`k) saw wave keeps even harmonics: 2f ${mag(sw, C3 * 2)}, 3f ${mag(sw, C3 * 3)}`);

    const wh = run({ wave: "noise" }, []);
    if (!(rms(wh, n / 2) > 0.005)) fails.push(`k) noise wave must speak with no chord and the noise knob at 0: RMS ${rms(wh, n / 2)}`);
    const wc = run({ wave: "noise" }, [48]);
    if (wc.some((v, i) => v !== wh[i])) fails.push("k) noise wave must ignore the chord: same output with and without notes");

    const be = run({ wave: "bell" }, [60]);
    if (!(rms(be, n / 2) > 0.005)) fails.push(`k) bell wave: RMS ${rms(be, n / 2)}`);
    if (!(mag(be, C4 * 3) > 0.05 * mag(be, C4) || mag(be, C4 * 4) > 0.05 * mag(be, C4))) fails.push("k) bell wave must have FM sidebands at integer multiples");

    const tr = run({ trim: 0.5 }, [48]), tr1 = run({ trim: 1 }, [48]);
    if (Math.abs(rms(tr, n / 2) / rms(tr1, n / 2) - 0.5) > 0.1) fails.push(`k) trim 0.5 must halve the band output: ratio ${rms(tr, n / 2) / rms(tr1, n / 2)}`);
  }

  // l) every preset: distinct id, plays at a matching band count, sound and level close to the Studio one
  {
    const voice = new Float32Array(n); let st = 99;
    for (let i = 0; i < n; i++) { st = (st * 1103515245 + 12345) >>> 0; voice[i] = (i % 400 === 0 ? 1 : 0) + 0.02 * (st / 2147483648 - 1); }
    const level = (v: VocoderVariant) => {
      const c = new Core(SR, v.bands); c.setRun(true); c.setVariant(v); c.setChord([57, 60, 64, 67]);
      const o = render(c, voice, { ...BASE, ...v.params });
      let bad = false; for (let i = 0; i < n; i++) if (!Number.isFinite(o.L[i]) || Math.abs(o.L[i]) > 1) { bad = true; break; }
      if (bad) fails.push(`l) ${v.id}: non finite sample or |x| > 1`);
      return (rms(o.L, n / 2) + rms(o.R, n / 2)) / 2;
    };
    if (VOCODER_VARIANTS.length < 6) fails.push("l) at least 6 variants");
    if (new Set(VOCODER_VARIANTS.map((v) => v.id)).size !== VOCODER_VARIANTS.length) fails.push("l) variant ids must be distinct");
    if (VOCODER_VARIANTS[0].id !== "studio") fails.push("l) the first variant is studio");
    const ref = level(VOCODER_VARIANTS[0]);
    for (const v of VOCODER_VARIANTS) {
      const r = level(v), db = 20 * Math.log10((r + 1e-12) / (ref + 1e-12));
      if (Math.abs(db) > 12) fails.push(`l) ${v.id}: level ${db.toFixed(1)} dB from Studio (limit 12 dB on this synthetic voice, the trims are calibrated on a real vocal, Robot on the melody it plays by default)`);
    }
  }

  // g) speed: 10 s of audio must render well under 10 s (budget 1 s here, a real-time factor of 10)
  {
    const mod = new Float32Array(SR * 2); for (let i = 0; i < mod.length; i += 400) mod[i] = 1;
    const c = make([57, 60, 64, 67]); const t0 = performance.now(); render(c, mod, BASE); const ms = performance.now() - t0;
    if (ms > 200) fails.push(`g) speed: 2 s of audio took ${ms.toFixed(0)} ms (budget 200 ms)`);
  }
  return fails;
}
