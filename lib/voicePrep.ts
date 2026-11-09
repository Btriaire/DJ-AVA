// Prépa voix: analyses faites une fois sur le stem voix, pour jouer dessus pendant le morceau
// (phrases, syllabes découpées sur les vraies attaques, sifflantes, souffles, niveau par phrase).
import { fft } from "./fft";

export interface VoiceFrames { hop: number; db: number[]; hi: number[] } // hop en secondes ; db = niveau RMS ; hi = part de puissance au-dessus de 4 kHz (0..1)
export interface VoicePhrase { start: number; end: number; level: number } // level 0..1 : niveau moyen de la phrase par rapport au pic de la voix
export interface VoiceSeg { t: number; dur: number; level: number } // une syllabe
export interface VoiceMark { t: number; dur: number }
export interface VoicePrep { version: 3; duration: number; phrases: VoicePhrase[]; segs: VoiceSeg[]; chops: VoiceSeg[]; breaths: VoiceMark[]; sibilants: VoiceMark[] }

const maxOf = (a: number[]) => a.reduce((m, v) => (v > m ? v : m), -Infinity); // pas Math.max(...a) : plante sur les très longs tableaux

export function voiceFrames(x: Float32Array, sr: number): VoiceFrames {
    const H = Math.round(sr * 0.01);
    const db: number[] = [];
    const hi: number[] = [];
    const re = new Float64Array(1024);
    const im = new Float64Array(1024);

    for (let i = 0; i + 1024 <= x.length; i += H) {
        let sumSq = 0;
        for (let j = 0; j < 1024; j++) {
            const sample = x[i + j];
            sumSq += sample * sample;
            re[j] = sample * (0.5 - 0.5 * Math.cos(2 * Math.PI * j / 1023));
            im[j] = 0;
        }
        const rms = Math.sqrt(sumSq / 1024);
        db.push(20 * Math.log10(rms + 1e-9));

        fft(re, im);

        let powerSum = 0;
        let hiPowerSum = 0;
        for (let k = 1; k <= 511; k++) {
            const power = re[k] * re[k] + im[k] * im[k];
            powerSum += power;
            if (k * sr / 1024 >= 4000) {
                hiPowerSum += power;
            }
        }
        hi.push(powerSum === 0 ? 0 : hiPowerSum / powerSum);
    }

    return { hop: 0.01, db, hi };
}

export function findSibilants(f: VoiceFrames): VoiceMark[] {
    const maxDb = maxOf(f.db);
    const sibilants: VoiceMark[] = [];
    let startIdx = -1;

    for (let i = 0; i < f.db.length; i++) {
        if (f.db[i] > maxDb - 40 && f.hi[i] > 0.6 && startIdx === -1) {
            startIdx = i;
        } else if ((f.db[i] <= maxDb - 40 || f.hi[i] <= 0.6) && startIdx !== -1) {
            if (i - startIdx >= 4) {
                sibilants.push({
                    t: Math.round(startIdx * f.hop * 1000) / 1000,
                    dur: Math.round((i - startIdx) * f.hop * 1000) / 1000
                });
            }
            startIdx = -1;
        }
    }

    if (startIdx !== -1 && f.db.length - startIdx >= 4) {
        sibilants.push({
            t: Math.round(startIdx * f.hop * 1000) / 1000,
            dur: Math.round((f.db.length - startIdx) * f.hop * 1000) / 1000
        });
    }

    return sibilants;
}

export function findBreaths(f: VoiceFrames, phrases: VoicePhrase[]): VoiceMark[] {
  const maxDb = f.db.reduce((a, b) => Math.max(a, b), -Infinity);
  const marks: VoiceMark[] = [];
  let start = -1;

  for (let i = 0; i <= f.db.length; i++) {
    const candidate = i < f.db.length && f.db[i] <= maxDb - 35 && f.db[i] > maxDb - 58 && f.hi[i] >= 0.25 && f.hi[i] <= 0.8;

    if (candidate) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      const t = start * f.hop;
      const end = i * f.hop;
      const dur = end - t;
      if (dur >= 0.12 && dur <= 0.7 && phrases.some((p) => (end <= p.start && end >= p.start - 0.8) || (t >= p.end && t <= p.end + 0.8))) {
        marks.push({ t: Math.round(t * 1000) / 1000, dur: Math.round(dur * 1000) / 1000 });
      }
      start = -1;
    }
  }

  return marks;
}

export function findSyllables(f: VoiceFrames, phrases: VoicePhrase[]): VoiceSeg[] {
  const maxDb = maxOf(f.db);
  const segs: VoiceSeg[] = [];

  function levelOf(from: number, to: number): number {
    let sumDb = 0;

    for (let i = from; i < to; i++) {
      sumDb += f.db[i];
    }

    const avgDb = sumDb / (to - from);
    return Math.min(1, Math.max(0, 1 + (avgDb - maxDb) / 35));
  }

  for (const phrase of phrases) {
    const i0 = Math.round(phrase.start / f.hop);
    const i1 = Math.min(Math.round(phrase.end / f.hop), f.db.length);
    const e: number[] = [];

    for (let i = i0; i < i1; i++) {
      const start = Math.max(i0, i - 4);
      const end = Math.min(i1, i + 4);
      let sum = 0;

      for (let j = start; j < end; j++) {
        sum += f.db[j];
      }

      e.push(sum / (end - start));
    }

    const boundaries: number[] = [];

    for (let k = 4; k < e.length - 4; k++) {
      const leftMax = Math.max(...e.slice(Math.max(0, k - 8), k));
      const rightMax = Math.max(...e.slice(k, Math.min(e.length, k + 8)));
      const isBoundary = e[k] <= Math.min(...e.slice(Math.max(0, k - 4), Math.min(e.length, k + 4))) &&
                         leftMax - e[k] >= 1.5 &&
                         rightMax - e[k] >= 1.5;

      if (isBoundary) {
        boundaries.push(i0 + k);
      }
    }

    const filteredBoundaries: number[] = [];
    let lastBoundary = -Infinity;

    for (const boundary of boundaries) {
      if (boundary - lastBoundary >= 9) {
        filteredBoundaries.push(boundary);
        lastBoundary = boundary;
      } else if (e[boundary - i0] < e[lastBoundary - i0]) {
        filteredBoundaries.pop();
        filteredBoundaries.push(boundary);
        lastBoundary = boundary;
      }
    }

    const boundariesWithEdges = [i0, ...filteredBoundaries, i1];

    for (let j = 0; j < boundariesWithEdges.length - 1; j++) {
      const start = boundariesWithEdges[j];
      const end = boundariesWithEdges[j + 1];
      const dur = (end - start) * f.hop;

      if (dur >= 0.09 && dur <= 2.0) {
        const level = levelOf(start, end);

        segs.push({
          t: Math.round(start * f.hop * 1000) / 1000,
          dur: Math.round(dur * 1000) / 1000,
          level: Math.round(level * 100) / 100
        });
      } else if (dur > 2.0) {
        const n = Math.ceil(dur / 0.8);
        const chunkDur = dur / n;

        for (let k = 0; k < n; k++) {
          const chunkStart = start + k * Math.round(chunkDur / f.hop);
          const chunkEnd = start + (k + 1) * Math.round(chunkDur / f.hop);
          const level = levelOf(chunkStart, chunkEnd);

          segs.push({
            t: Math.round(chunkStart * f.hop * 1000) / 1000,
            dur: Math.round(chunkDur * 1000) / 1000,
            level: Math.round(level * 100) / 100
          });
        }
      }
    }
  }

  return segs;
}

export function pickChops(segs: VoiceSeg[], n = 8): VoiceSeg[] {
  const candidates = segs.filter(seg => seg.dur >= 0.12 && seg.dur <= 0.9);
  const scoredCandidates = candidates.map(seg => ({ seg, score: seg.level * Math.min(seg.dur, 0.5) }));
  scoredCandidates.sort((a, b) => b.score - a.score);

  const selected: VoiceSeg[] = [];

  for (const candidate of scoredCandidates) {
    if (selected.every(s => Math.abs(s.t - candidate.seg.t) >= 1.0)) {
      selected.push(candidate.seg);

      if (selected.length >= n) {
        break;
      }
    }
  }

  selected.sort((a, b) => a.t - b.t);
  return selected;
}

function voiceGate(db: number[]): { peak: number; floor: number; on: number; off: number } {
  const validDb = db.filter(v => v > -100);
  if (validDb.length === 0) {
    return { peak: -100, floor: -100, on: -100, off: -100 };
  }
  const sorted = [...validDb].sort((a, b) => a - b);
  const peak = sorted[Math.floor(sorted.length * 0.99)];
  const floor = sorted[Math.floor(sorted.length * 0.10)];
  const on = Math.min(Math.max(floor + 12, peak - 35), peak - 20);
  const off = Math.min(on - 6, Math.max(floor + 6, peak - 45));
  return { peak, floor, on, off };
}

function smooth(db: number[], windowSize: number): number[] {
  const result = new Array(db.length);
  for (let i = 0; i < db.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - Math.floor(windowSize / 2)); j < Math.min(db.length, i + Math.floor(windowSize / 2) + 1); j++) {
      sum += db[j];
      count++;
    }
    result[i] = sum / count;
  }
  return result;
}

function bestSplit(s: number[], a: number, b: number): number {
  if (b - a < 200) {
    return Math.round((a + b) / 2);
  }
  let minW = Infinity;
  let minI = Math.round((a + b) / 2);
  for (let i = a + 100; i < b - 100; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - 10); j < Math.min(s.length, i + 10); j++) {
      sum += s[j];
      count++;
    }
    const w = sum / count;
    if (w < minW) {
      minW = w;
      minI = i;
    }
  }
  return minI;
}

function splitPhrase(s: number[], a: number, b: number, maxLen: number): { a: number; b: number }[] {
  if (b - a <= maxLen) {
    return [{ a, b }];
  }
  const splitPoint = bestSplit(s, a, b);
  return [...splitPhrase(s, a, splitPoint, maxLen), ...splitPhrase(s, splitPoint, b, maxLen)];
}

export function findPhrases(f: VoiceFrames): VoicePhrase[] {
  const { peak, on, off } = voiceGate(f.db);
  const s = smooth(f.db, 5);
  const raw: { a: number; b: number }[] = [];
  let inPhrase = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (!inPhrase && s[i] > on) {
      inPhrase = true;
      start = i;
    } else if (inPhrase && s[i] <= off) {
      inPhrase = false;
      raw.push({ a: start, b: i });
    }
  }
  if (inPhrase) {
    raw.push({ a: start, b: s.length });
  }
  const merged: { a: number; b: number }[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (merged.length === 0) {
      merged.push(raw[i]);
    } else {
      const last = merged[merged.length - 1];
      if (raw[i].a - last.b < 30) {
        last.b = raw[i].b;
      } else {
        merged.push(raw[i]);
      }
    }
  }
  const filtered = merged.filter(seg => seg.b - seg.a >= 30);
  const phrases: VoicePhrase[] = [];
  for (const seg of filtered) {
    const splits = splitPhrase(s, seg.a, seg.b, 1200);
    for (const split of splits) {
      let sum = 0;
      for (let j = split.a; j < split.b; j++) {
        sum += Math.max(f.db[j], peak - 60);
      }
      const level = Math.min(Math.max(1 + (sum / (split.b - split.a) - peak) / 35, 0), 1);
      phrases.push({
        start: Math.round(split.a * f.hop * 1000) / 1000,
        end: Math.round(split.b * f.hop * 1000) / 1000,
        level: Math.round(level * 100) / 100
      });
    }
  }
  return phrases;
}

function similar(f: VoiceFrames, a: VoiceSeg, b: VoiceSeg): boolean {
  if (Math.abs(a.dur - b.dur) >= 0.25) {
    return false;
  }
  const aStart = Math.round(a.t / f.hop);
  const aEnd = Math.round((a.t + a.dur) / f.hop);
  const bStart = Math.round(b.t / f.hop);
  const bEnd = Math.round((b.t + b.dur) / f.hop);
  const aDb = new Array(32);
  const bDb = new Array(32);
  for (let i = 0; i < 32; i++) {
    const aIdx = Math.round(aStart + (aEnd - aStart) * i / 32);
    const bIdx = Math.round(bStart + (bEnd - bStart) * i / 32);
    aDb[i] = f.db[aIdx];
    bDb[i] = f.db[bIdx];
  }
  const aMean = aDb.reduce((sum, val) => sum + val, 0) / 32;
  const bMean = bDb.reduce((sum, val) => sum + val, 0) / 32;
  const aVar = aDb.reduce((sum, val) => sum + (val - aMean) ** 2, 0) / 32;
  const bVar = bDb.reduce((sum, val) => sum + (val - bMean) ** 2, 0) / 32;
  if (aVar < 1e-6 || bVar < 1e-6) {
    return Math.abs(aMean - bMean) < 1;
  }
  let cov = 0;
  for (let i = 0; i < 32; i++) {
    cov += (aDb[i] - aMean) * (bDb[i] - bMean);
  }
  cov /= 32;
  const corr = cov / Math.sqrt(aVar * bVar);
  return corr > 0.92;
}

export function pickPhraseChops(f: VoiceFrames, phrases: VoicePhrase[], n = 8): VoiceSeg[] {
  const candidates: VoiceSeg[] = [];
  for (const phrase of phrases) {
    if (phrase.level >= 0.25) {
      const dur = phrase.end - phrase.start;
      if (dur > 8) {
        const s = smooth(f.db, 5);
        const splits = splitPhrase(s, Math.round(phrase.start / f.hop), Math.round(phrase.end / f.hop), 800);
        for (const split of splits) {
          const chopDur = split.b - split.a;
          if (chopDur >= 100 && chopDur <= 800) {
            candidates.push({
              t: Math.round(split.a * f.hop * 1000) / 1000,
              dur: Math.round(chopDur * f.hop * 1000) / 1000,
              level: phrase.level
            });
          }
        }
      } else if (dur >= 1) {
        candidates.push({
          t: phrase.start,
          dur,
          level: phrase.level
        });
      }
    }
  }
  candidates.sort((a, b) => {
    const aScore = a.level * (a.dur >= 1.5 && a.dur <= 6 ? 1 : 0.75);
    const bScore = b.level * (b.dur >= 1.5 && b.dur <= 6 ? 1 : 0.75);
    return bScore - aScore;
  });
  const selected: VoiceSeg[] = [];
  for (const candidate of candidates) {
    let overlap = false;
    for (const seg of selected) {
      if (!(candidate.t + candidate.dur <= seg.t || candidate.t >= seg.t + seg.dur)) {
        overlap = true;
        break;
      }
    }
    if (!overlap) {
      let similarToSelected = false;
      for (const seg of selected) {
        if (similar(f, candidate, seg)) {
          similarToSelected = true;
          break;
        }
      }
      if (!similarToSelected) {
        selected.push(candidate);
        if (selected.length >= n) {
          break;
        }
      }
    }
  }
  if (selected.length < n) {
    for (const candidate of candidates) {
      let overlap = false;
      for (const seg of selected) {
        if (!(candidate.t + candidate.dur <= seg.t || candidate.t >= seg.t + seg.dur)) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        selected.push(candidate);
        if (selected.length >= n) {
          break;
        }
      }
    }
  }
  if (selected.length < n) {
    const smallCandidates: VoiceSeg[] = [];
    for (const phrase of phrases) {
      const dur = phrase.end - phrase.start;
      if (dur >= 0.5 && dur <= 1) {
        smallCandidates.push({
          t: phrase.start,
          dur,
          level: phrase.level
        });
      }
    }
    for (const candidate of smallCandidates) {
      let overlap = false;
      for (const seg of selected) {
        if (!(candidate.t + candidate.dur <= seg.t || candidate.t >= seg.t + seg.dur)) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        selected.push(candidate);
        if (selected.length >= n) {
          break;
        }
      }
    }
  }
  selected.sort((a, b) => a.t - b.t);
  return selected;
}

export function summarizeVoice(x: Float32Array, sr: number): VoicePrep {
  const f = voiceFrames(x, sr);
  const phrases = findPhrases(f);
  return {
    version: 3,
    duration: x.length / sr,
    phrases,
    segs: findSyllables(f, phrases),
    chops: pickPhraseChops(f, phrases),
    breaths: findBreaths(f, phrases),
    sibilants: findSibilants(f)
  };
}

export function voicePrepTest(): void {
  const sr = 44100;
  const frac = (v: number) => v - Math.floor(v);
  const n = (k: number) => frac(Math.sin(k * 12.9898) * 43758.5453) * 2 - 1;
  const voice = (x: Float32Array, t0: number, dur: number, amp: number) => {
    const i0 = Math.round(t0 * sr);
    const i1 = Math.round((t0 + dur) * sr);
    for (let i = i0; i < i1; i++) {
      const t = i / sr;
      x[i] += amp * (Math.sin(2 * Math.PI * 200 * t) + 0.5 * Math.sin(2 * Math.PI * 400 * t) + 0.25 * Math.sin(2 * Math.PI * 600 * t)) / 1.75;
    }
  };
  const syllables = (x: Float32Array, t0: number, n: number, amp: number) => {
    for (let k = 0; k < n; k++) {
      const t = t0 + k * 0.30;
      voice(x, t, 0.25, amp * (0.6 + 0.4 * ((k % 3) / 2)));
    }
  };
  const testA = () => {
    const x = new Float32Array(12 * sr).fill(0);
    syllables(x, 1.0, 8, 0.5);
    voice(x, 6.0, 0.6, 0.5);
    voice(x, 6.8, 0.8, 0.5);
    const f = voiceFrames(x, sr);
    const phrases = findPhrases(f);
    if (phrases.length !== 2) {
      throw new Error(`Test a) failed: expected 2 phrases, got ${phrases.length}`);
    }
    if (Math.abs(phrases[0].start - 1.0) > 0.1 || Math.abs(phrases[0].end - 3.35) > 0.15) {
      throw new Error(`Test a) failed: phrase 0 start or end out of bounds`);
    }
    if (Math.abs(phrases[1].start - 6.0) > 0.1 || Math.abs(phrases[1].end - 7.6) > 0.15) {
      throw new Error(`Test a) failed: phrase 1 start or end out of bounds`);
    }
  };
  const testB = () => {
    const x = new Float32Array(12 * sr).fill(0);
    syllables(x, 1.0, 8, 0.5);
    voice(x, 6.0, 0.6, 0.5);
    voice(x, 6.8, 0.8, 0.5);
    const f = voiceFrames(x, sr);
    const phrases = findPhrases(f);
    const chops = pickPhraseChops(f, phrases, 2);
    if (chops.length !== 2) {
      throw new Error(`Test b) failed: expected 2 chops, got ${chops.length}`);
    }
    if (Math.abs(chops[0].t - 1.0) > 0.1 || chops[0].dur < 2.2) {
      throw new Error(`Test b) failed: chop 0 t or dur out of bounds`);
    }
    if (chops[1].dur < 1.4) {
      throw new Error(`Test b) failed: chop 1 dur out of bounds`);
    }
  };
  const testC = () => {
    const x = new Float32Array(12 * sr).fill(0);
    for (let i = 0; i < x.length; i++) {
      x[i] += 0.012 * n(i);
    }
    voice(x, 1.0, 2.0, 0.5);
    voice(x, 7.0, 2.0, 0.5);
    const f = voiceFrames(x, sr);
    const phrases = findPhrases(f);
    if (phrases.length !== 2) {
      throw new Error(`Test c) failed: expected 2 phrases, got ${phrases.length}`);
    }
  };
  const testD = () => {
    const x = new Float32Array(30 * sr).fill(0);
    syllables(x, 1.0, 70, 0.5);
    const f = voiceFrames(x, sr);
    const phrases = findPhrases(f);
    for (const phrase of phrases) {
      if (phrase.end - phrase.start > 12) {
        throw new Error(`Test d) failed: phrase longer than 12 s`);
      }
    }
    const chops = pickPhraseChops(f, phrases);
    for (const chop of chops) {
      if (chop.dur > 8 || chop.dur < 1) {
        throw new Error(`Test d) failed: chop dur out of bounds`);
      }
    }
  };
  const testE = () => {
    const x = new Float32Array(20 * sr).fill(0);
    syllables(x, 1, 6, 0.5);
    syllables(x, 5, 6, 0.5);
    voice(x, 10, 1.8, 0.4);
    const f = voiceFrames(x, sr);
    const phrases = findPhrases(f);
    const chops = pickPhraseChops(f, phrases, 2);
    let found = false;
    for (const chop of chops) {
      if (Math.abs(chop.t - 10) < 0.1) {
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error(`Test e) failed: no chop near 10 s`);
    }
  };
  const testF = () => {
    const x = new Float32Array(9 * sr).fill(0);
    voice(x, 1.0, 1.5, 0.5);
    for (let i = Math.round(7.5 * sr); i < Math.round(7.62 * sr); i++) {
      x[i] += 0.4 * (n(i) - n(i - 1));
    }
    const prep = summarizeVoice(x, sr);
    let found = false;
    for (const sibilant of prep.sibilants) {
      if (Math.abs(sibilant.t - 7.5) < 0.1) {
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error(`Test f) failed: no sibilant near 7.5 s`);
    }
  };
  testA();
  testB();
  testC();
  testD();
  testE();
  testF();
}
