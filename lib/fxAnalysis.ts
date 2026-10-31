// Analyses made once when a song's stems are prepared, so the effects can use them:
// the spectrum of every stem and of the mix (EQ Lab), the loudness (level matching), the ends of sung phrases (echo throws).
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ffmpegPath, isCached, MODEL_STEMS, stemPath, type StemModel, type StemOpts } from "./stems";

export const FX_BANDS = [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000];
export interface FxMap { version: 1; spectra: Record<string, number[]>; lufs: number; phraseEnds: number[] }
const SR = 44100;

export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error("FFT length not a power of two");
  for (let i = 1, j = 0; i < n; i++) { // bit-reversal permutation
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let s = 1; s < n; s *= 2) {
    const m = s * 2;
    const wm = Math.PI / s;
    for (let k = 0; k < s; k++) {
      const wr = Math.cos(wm * k);
      const wi = Math.sin(wm * k);
      for (let j = k; j < n; j += m) {
        const t = j + s;
        const tre = re[t] * wr - im[t] * wi;
        const tim = re[t] * wi + im[t] * wr;
        re[t] = re[j] - tre;
        im[t] = im[j] - tim;
        re[j] += tre;
        im[j] += tim;
      }
    }
  }
}

export function bandPowers(x: Float32Array, start: number, n = 8192): number[] {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    re[i] = x[start + i] * w;
    im[i] = 0;
  }
  fft(re, im);
  const powers = new Array(n / 2).fill(0);
  for (let k = 1; k < n / 2; k++) {
    powers[k] = (re[k] * re[k] + im[k] * im[k]) / (n * n);
  }
  const bands = new Array(15).fill(0);
  for (let i = 0; i < 15; i++) {
    const f = FX_BANDS[i];
    const lower = f / Math.pow(2, 1 / 6);
    const upper = f * Math.pow(2, 1 / 6);
    let k = Math.max(1, Math.ceil((lower * n) / SR));
    if (k * SR / n >= upper) bands[i] = powers[Math.min(n / 2 - 1, Math.round((f * n) / SR))]; // narrow low band: its nearest bin
    for (; k < n / 2 && (k * SR) / n < upper; k++) bands[i] += powers[k];
  }
  return bands;
}

export function spectrumOf(x: Float32Array): number[] {
  const acc = new Array(15).fill(0);
  let kept = 0;
  for (let i = 0; i + 8192 <= x.length; i += SR / 2) {
    let e = 0;
    for (let k = i; k < i + 8192; k++) e += x[k] * x[k];
    if (Math.sqrt(e / 8192) <= 0.003) continue; // the stem is silent here
    bandPowers(x, i).forEach((p, b) => (acc[b] += p));
    kept++;
  }
  return kept ? acc.map((p) => 10 * Math.log10(p / kept + 1e-12)) : new Array(15).fill(-120);
}

export function loudness(x: Float32Array): number {
  const blocks: number[] = [];
  for (let i = 0; i + SR * 0.4 <= x.length; i += SR * 0.1) {
    let sum = 0;
    for (let j = 0; j < SR * 0.4; j++) sum += x[i + j] * x[i + j];
    blocks.push(sum / (SR * 0.4));
  }
  const absGate = blocks.filter(b => -0.691 + 10 * Math.log10(b) > -70);
  if (absGate.length === 0) return -70;
  const meanMs = absGate.reduce((sum, b) => sum + b, 0) / absGate.length;
  const relGate = absGate.filter(b => b > meanMs / 10);
  if (relGate.length === 0) return -70;
  const finalMs = relGate.reduce((sum, b) => sum + b, 0) / relGate.length;
  return -0.691 + 10 * Math.log10(finalMs);
}

export function phraseEnds(voice: Float32Array): number[] {
  const hop = Math.round(SR * 0.05);
  const db: number[] = [];
  for (let i = 0; i + hop <= voice.length; i += hop) {
    let e = 0;
    for (let k = i; k < i + hop; k++) e += voice[k] * voice[k];
    db.push(20 * Math.log10(Math.sqrt(e / hop) + 1e-9));
  }
  if (!db.length) return [];
  const thr = Math.max(...db) - 28;
  // active runs [start, end) in frames, gaps under 0.35 s merged
  const runs: [number, number][] = [];
  db.forEach((v, i) => {
    if (v <= thr) return;
    const last = runs[runs.length - 1];
    if (last && i - last[1] < 7) last[1] = i + 1;
    else runs.push([i, i + 1]);
  });
  const ends: number[] = [];
  runs.forEach(([a, b], k) => {
    const next = runs[k + 1]?.[0] ?? Infinity;
    if (b - a >= 16 && (next - b >= 8 || next === Infinity)) ends.push(Math.round(b * 0.05 * 100) / 100);
  });
  return ends;
}

async function decode(path: string): Promise<Float32Array | null> {
  return new Promise((resolve) => {
    const ffmpeg = spawn(ffmpegPath(), ["-v", "error", "-i", path, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"], { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const buffer = Buffer.concat(chunks);
      const array = new Float32Array(buffer.length / 2);
      for (let i = 0; i < array.length; i++) {
        array[i] = buffer.readInt16LE(i * 2) / 32768;
      }
      resolve(array);
    });
    ffmpeg.on("error", () => resolve(null));
  });
}

// the cached analyses only (nothing computed): for lists of songs
export function readFx(hash: string, model: StemModel, opts?: StemOpts): FxMap | null {
  try {
    const f = JSON.parse(readFileSync(join(dirname(stemPath(hash, model, "drums", opts)), "fx.json"), "utf8")) as FxMap;
    return f.version === 1 ? f : null;
  } catch {
    return null;
  }
}

export async function analyseFx(hash: string, model: StemModel, opts?: StemOpts): Promise<FxMap | null> {
  if (!isCached(hash, model, opts)) {
    return null;
  }
  const cacheFile = join(dirname(stemPath(hash, model, "drums", opts)), "fx.json");
  try {
    const cache = JSON.parse(await readFile(cacheFile, "utf8")) as FxMap;
    if (cache.version === 1) {
      return cache;
    }
  } catch {}
  const spectra: Record<string, number[]> = {};
  let mix: Float32Array | null = null;
  let ends: number[] = [];
  for (const stem of MODEL_STEMS[model]) {
    const x = await decode(stemPath(hash, model, stem, opts));
    if (!x) {
      return null;
    }
    spectra[stem] = spectrumOf(x);
    if (!mix || x.length > mix.length) {
      const newMix = new Float32Array(x.length);
      if (mix) {
        newMix.set(mix);
      }
      mix = newMix;
    }
    for (let i = 0; i < x.length; i++) {
      mix[i] += x[i];
    }
    if (stem === "vocals") {
      ends = phraseEnds(x);
    }
  }
  if (!mix) {
    return null;
  }
  spectra.mix = spectrumOf(mix);
  const lufs = Math.round(loudness(mix) * 10) / 10;
  const fxMap: FxMap = { version: 1, spectra, lufs, phraseEnds: ends };
  await writeFile(cacheFile, JSON.stringify(fxMap), "utf8").catch(() => undefined); // a read-only cache still answers
  return fxMap;
}

export function fxAnalysisTest(): void {
  const sine = new Float32Array(SR * 2).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / SR));
  const sp = spectrumOf(sine);
  if (sp.indexOf(Math.max(...sp)) !== FX_BANDS.indexOf(1000)) throw new Error("fx spectrum");
  if (Math.abs(loudness(sine) - -9.7) > 1) throw new Error("fx loudness");
  // 1.5 s sung, 1 s silence, 1.5 s sung, 0.5 s silence -> two phrase ends
  const v = new Float32Array(SR * 4.5).map((_, i) => {
    const t = i / SR;
    const on = t < 1.5 || (t >= 2.5 && t < 4);
    const r = Math.sin(i * 12.9898) * 43758.5453;
    return on ? 0.3 * (2 * (r - Math.floor(r)) - 1) : 0;
  });
  const e = phraseEnds(v);
  if (e.length !== 2 || Math.abs(e[0] - 1.5) > 0.1 || Math.abs(e[1] - 4) > 0.1) throw new Error(`fx phrases ${e.join(",")}`);
}
