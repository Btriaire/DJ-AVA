import type { ChordColor } from "./stemJam";

type Note = [number, number, number, number];

export type HarmonyStyleId = "piano" | "cordes" | "tenebreux" | "flamenco";
export interface HarmonyNote { midi: number; delay: number; dur: number; vel: number; kind: "pluck" | "pad" }
export interface BarChord { root: number; minor: boolean; rest: boolean; strength: number; bass: number; seventh: boolean }
export interface HarmonyOpts { bars?: number; dur?: number; phrase?: number; seed?: number; bass?: number }

export const HARMONY_STYLES: { id: HarmonyStyleId; label: string; hint: string; instrument: string | null; trim: number }[] = [
  { id: "piano", label: "Piano Steinway", hint: "basse et accords, réponse au 3e temps", instrument: "sfz_steinway", trim: 0.79 },
  { id: "cordes", label: "Cordes orchestrales", hint: "accord tenu sur toute la mesure", instrument: "mk_string_ensemble_1", trim: 0.95 },
  { id: "tenebreux", label: "Ténébreux", hint: "nappe synthétique sombre et grave", instrument: null, trim: 0.88 },
  { id: "flamenco", label: "Guitare flamenco", hint: "rumba 3-3-2, grattages rapides", instrument: "mk_acoustic_guitar_nylon", trim: 0.42 }
];

export function strongestChords(other: Note[], bass: Note[], pcs: number[], barLen: number, offset: number, duration: number): BarChord[] {
  const out: BarChord[] = [];
  const nb = Math.max(0, Math.ceil((duration - offset) / barLen));
  if (barLen <= 0 || nb === 0) return out;

  const tonic = { root: pcs[0], minor: ((pcs[2] - pcs[0] + 12) % 12) === 3 };
  let prev: { root: number; minor: boolean } | null = null;
  const totals: number[] = [];

  for (let i = 0; i < nb; i++) {
    const start = offset + i * barLen;
    const end = start + barLen;
    const wo: number[] = Array(12).fill(0);
    const wb: number[] = Array(12).fill(0);

    for (const note of other) {
      const overlap = Math.min(note[1], end) - Math.max(note[0], start);
      if (overlap > 0) {
        const pc = note[2] % 12;
        wo[pc] += overlap * note[3];
      }
    }

    for (const note of bass) {
      const overlap = Math.min(note[1], end) - Math.max(note[0], start);
      if (overlap > 0) {
        const pc = note[2] % 12;
        wb[pc] += overlap * note[3];
      }
    }

    const tot = wo.reduce((a, b) => a + b, 0) + wb.reduce((a, b) => a + b, 0);

    if (tot < 0.08 * barLen) {
      const c = prev ?? tonic;
      out.push({ root: c.root, minor: c.minor, rest: true, strength: 0, bass: c.root, seventh: false });
      continue;
    }

    const score = (k: number, q: number) => {
      const o = (k + 7 - q) % 12;
      let raw = 2 * wo[k] + wo[(k + q) % 12] + wo[(k + 7) % 12] + 3 * wb[k] + wb[(k + q) % 12] + wb[(k + 7) % 12] - 0.5 * (wo[o] + wb[o]);
      if (pcs.includes(k) && pcs.includes((k + q) % 12) && pcs.includes((k + 7) % 12)) raw *= 1.2;
      return raw;
    };

    let bestScore = -Infinity;
    let bestK = 0;
    let bestQ = 3;

    for (let k = 0; k < 12; k++) {
      for (const q of [3, 4]) {
        const s = score(k, q);
        if (s > bestScore) {
          bestScore = s;
          bestK = k;
          bestQ = q;
        }
      }
    }

    let chosen = { root: bestK, minor: bestQ === 3 };
    if (prev && score(prev.root, prev.minor ? 3 : 4) >= 0.9 * bestScore) chosen = prev;
    prev = chosen;
    totals[i] = tot;

    const qt = wb.reduce((a, b) => a + b, 0);
    let bassPc = chosen.root;
    if (qt > 0) {
      const bb = wb.indexOf(Math.max(...wb));
      if (wb[bb] > 0.5 * qt && (bb === (chosen.root + (chosen.minor ? 3 : 4)) % 12 || bb === (chosen.root + 7) % 12)) bassPc = bb;
    }

    const sv = (chosen.root + (chosen.minor ? 10 : pcs.includes((chosen.root + 11) % 12) ? 11 : 10)) % 12;
    const wt = wo.reduce((a, b) => a + b, 0);
    const seventh = wt > 0 && wo[sv] > 0.12 * wt;

    out.push({ root: chosen.root, minor: chosen.minor, rest: false, strength: 0, bass: bassPc, seventh });
  }

  const nonRestTotals = totals.filter((t) => t > 0);
  if (nonRestTotals.length > 0) {
    nonRestTotals.sort((a, b) => a - b);
    const ref = nonRestTotals[Math.floor(0.9 * nonRestTotals.length)];
    for (let i = 0; i < out.length; i++) {
      if (!out[i].rest) out[i].strength = Math.min(1, totals[i] / ref);
    }
  }

  return out;
}

export function chordNotes(root: number, minor: boolean, color: ChordColor, pcs: number[]): number[] {
  const r = 48 + root;
  const notes = [r, r + (minor ? 3 : 4), r + 7];
  if (color !== "triad") {
    const seventh = minor ? 10 : pcs.includes((root + 11) % 12) ? 11 : 10;
    notes.push(r + seventh);
  }
  if (color === "ninth") notes.push(r + 14);
  return notes;
}

export function chordLabel(root: number, minor: boolean, flat: boolean): string {
  const SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const FLAT = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
  const names = flat ? FLAT : SHARP;
  return names[root] + (minor ? "m" : "");
}

export function harmonyStep(style: HarmonyStyleId, step: number, chord: number[], upper: number[], beat: number, opts: HarmonyOpts = {}): HarmonyNote[] {
  const notes: HarmonyNote[] = [];
  const fifth = chord[2] - chord[0];
  const third = chord[1] - chord[0];
  const rootPc = chord[0] % 12;
  const bassPc = opts.bass ?? rootPc;
  const bass = 36 + bassPc;
  const up = (pc: number, from: number) => from + ((pc - from) % 12 + 12) % 12;
  const second = bassPc === rootPc ? bass + fifth : up(rootPc, bass + 1);
  const phrase = opts.phrase ?? 0;
  const seed = opts.seed ?? 0;

  const h = (i: number) => Math.abs(Math.sin(seed * 12.9898 + step * 78.233 + i * 37.719) * 43758.5453) % 1;
  const hv = (vel: number, i: number) => Math.min(1, vel * (0.94 + 0.12 * h(i)));

  if (style === "piano") {
    const padDur = opts.dur ?? 4 * beat * (opts.bars ?? 1);
    if (phrase % 2 === 0) {
      if (step === 0) {
        notes.push({ midi: bass, delay: 0.012 * h(0), dur: 3.8 * beat, vel: hv(0.7, 0), kind: "pluck" });
        notes.push({ midi: second, delay: 0.012 * h(1), dur: 3.8 * beat, vel: hv(0.5, 1), kind: "pluck" });
        for (let i = 0; i < upper.length; i++) notes.push({ midi: upper[i], delay: 0.012 * h(i + 2), dur: 1.9 * beat, vel: hv(0.62, i + 2), kind: "pluck" });
      } else if (step === 4) {
        for (let i = 0; i < upper.length; i++) notes.push({ midi: upper[i], delay: 0.012 * h(i), dur: 1.9 * beat, vel: hv(0.5, i), kind: "pluck" });
      } else if (step === 6) {
        const highest = Math.max(...upper);
        notes.push({ midi: highest, delay: 0.012 * h(0), dur: 0.9 * beat, vel: hv(0.4, 0), kind: "pluck" });
      }
    } else {
      if (step === 0) {
        notes.push({ midi: bass, delay: 0, dur: 3.8 * beat, vel: hv(0.7, 0), kind: "pluck" });
        notes.push({ midi: second, delay: 0, dur: 3.8 * beat, vel: hv(0.5, 1), kind: "pluck" });
      }
      const steps = [0, 2, 3, 4, 6];
      if (steps.includes(step)) {
        const a = steps.indexOf(step);
        notes.push({ midi: upper[a % upper.length], delay: 0.012 * h(a + 2), dur: 1.5 * beat, vel: hv(0.52, a + 2), kind: "pluck" });
      }
    }
  } else if (style === "cordes") {
    const padDur = opts.dur ?? 4 * beat * (opts.bars ?? 1);
    if (step === 0) {
      notes.push({ midi: bass, delay: 0, dur: padDur, vel: hv(0.55, 0), kind: "pad" });
      notes.push({ midi: bass + 12, delay: 0.03 * h(1), dur: padDur, vel: hv(0.5, 1), kind: "pad" });
      for (let i = 0; i < upper.length; i++) notes.push({ midi: upper[i], delay: 0.03 * h(i + 2), dur: padDur, vel: hv(0.55, i + 2), kind: "pad" });
    }
  } else if (style === "tenebreux") {
    const padDur = opts.dur ?? 4 * beat * (opts.bars ?? 1);
    if (step === 0) {
      notes.push({ midi: bass, delay: 0, dur: padDur, vel: hv(0.8, 0), kind: "pad" });
      notes.push({ midi: second, delay: 0, dur: padDur, vel: hv(0.6, 1), kind: "pad" });
      notes.push({ midi: up(chord[1] % 12, bass + 12), delay: 0, dur: padDur, vel: hv(0.5, 2), kind: "pad" });
      for (let i = 3; i < chord.length; i++) {
        const note = up(chord[i] % 12, bass + 12);
        const vel = note > 72 ? 0.4 : 0.4;
        notes.push({ midi: note > 72 ? note - 12 : note, delay: 0, dur: padDur, vel: hv(vel, i), kind: "pad" });
      }
    }
  } else if (style === "flamenco") {
    const g = 40 + ((chord[0] - 40) % 12 + 12) % 12;
    let strings = [g, g + fifth, g + 12, g + 12 + third, g + 12 + fifth, chord[4] ? g + 24 + (chord[4] - chord[0] - 12) : chord[3] ? g + 12 + (chord[3] - chord[0]) : g + 24];
    if (bassPc !== rootPc) {
      const cand = up(bassPc, g);
      strings = [cand, ...strings.filter((s) => s > cand)];
    }
    const off = 0.008 * h(0);

    if (step === 0 || step === 3 || step === 6 || step === 5 || step === 7) {
      const steps = [0, 3, 6, 5, 7];
      const a = steps.indexOf(step);
      const baseVel = [0.95, 0.8, 0.75, 0.45, 0.45][a];
      const baseDur = [1.5, 1.5, 0.35, 0.4, 0.4][a] * beat;
      const baseDelay = [0, 0, 0, 0, 0][a] + off;

      if (step === 6) {
        for (let j = 0; j < 3; j++) {
          const baseDelayJ = j * beat / 8;
          for (let i = 0; i < strings.slice(-4).length; i++) notes.push({ midi: strings.slice(-4)[i], delay: baseDelayJ + i * 0.008, dur: 0.35 * beat, vel: hv(0.75 + 0.1 * j, i), kind: "pluck" });
        }
      } else if (step === 5 || step === 7) {
        for (let i = 0; i < strings.slice(-3).reverse().length; i++) notes.push({ midi: strings.slice(-3).reverse()[i], delay: i * 0.01 + off, dur: 0.4 * beat, vel: hv(0.45, i), kind: "pluck" });
      } else {
        for (let i = 0; i < strings.length; i++) notes.push({ midi: strings[i], delay: i * 0.012 + off, dur: baseDur, vel: hv(baseVel, i), kind: "pluck" });
      }
    }

    if (phrase === 3 && step === 4) {
      for (let j = 0; j < 2; j++) {
        const baseDelay = j * beat / 8;
        for (let i = 0; i < strings.slice(-3).length; i++) notes.push({ midi: strings.slice(-3)[i], delay: baseDelay + i * 0.008, dur: 0.3 * beat, vel: hv(0.6 + 0.1 * j, i), kind: "pluck" });
      }
    }
  }

  return notes;
}

export function darkNote(ctx: BaseAudioContext, dest: AudioNode, midi: number, at: number, dur: number, vel: number): void {
  const f = 440 * 2 ** ((midi - 69) / 12);
  const saw1 = new OscillatorNode(ctx, { type: "sawtooth", frequency: f * 2 ** (-9 / 1200) });
  const saw2 = new OscillatorNode(ctx, { type: "sawtooth", frequency: f * 2 ** (9 / 1200) });
  const sine = new OscillatorNode(ctx, { type: "sine", frequency: f / 2 });
  const sineGain = new GainNode(ctx, { gain: 0.6 });
  const filter = new BiquadFilterNode(ctx, { type: "lowpass", Q: 1.5 });
  const env = new GainNode(ctx, { gain: 0 });
  const panL = new StereoPannerNode(ctx, { pan: -0.6 });
  const panR = new StereoPannerNode(ctx, { pan: 0.6 });

  sine.connect(sineGain);
  saw1.connect(panL).connect(filter);
  saw2.connect(panR).connect(filter);
  sineGain.connect(filter);
  filter.connect(env);
  env.connect(dest);

  const end = at + Math.max(0.5, dur) + 1.25;
  filter.frequency.setValueAtTime(200, at);
  filter.frequency.linearRampToValueAtTime(800, at + dur * 0.5);
  filter.frequency.linearRampToValueAtTime(250, at + dur + 1.2);
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(vel * 0.16, at + 0.5);
  env.gain.setValueAtTime(vel * 0.16, at + Math.max(0.5, dur));
  env.gain.linearRampToValueAtTime(0, at + Math.max(0.5, dur) + 1.2);

  saw1.start(at);
  saw2.start(at);
  sine.start(at);
  saw1.stop(end);
  saw2.stop(end);
  sine.stop(end);
}
