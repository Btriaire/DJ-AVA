// The brain of the 15-band EQ Lab: gestures that move every band at once, linked bands,
// curves suggested from the live spectrum, and tempo-synced movements, morphs and loops.
import { EQ_FREQS, type EqView } from "./Rack";

export const N = EQ_FREQS.length;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const oct = (f: number) => Math.log2(f / 1000); // octaves from 1 kHz
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const smooth3 = (a: number[]) => a.map((_, i) => mean(a.slice(Math.max(0, i - 1), Math.min(N, i + 2))));

// ---------- gestures: one knob moves all 15 bands ----------
export type GestureId = "tilt" | "smile" | "bass" | "air" | "presence" | "scoop";
export const GESTURES: { id: GestureId; label: string; title: string }[] = [
  { id: "tilt", label: "Pente", title: "Penche tout le son : sombre à gauche, brillant à droite" },
  { id: "smile", label: "Sourire", title: "Graves et aigus ensemble, médium en retrait" },
  { id: "bass", label: "Graves", title: "Toute la base du son, sous 160 Hz" },
  { id: "air", label: "Air", title: "Le haut du spectre, au-dessus de 6 kHz" },
  { id: "presence", label: "Présence", title: "La zone de la voix, 1 à 4 kHz" },
  { id: "scoop", label: "Creux", title: "Le bas-médium boueux, 200 à 600 Hz" },
];
export function gestureShape(id: GestureId): number[] {
  return EQ_FREQS.map((f) => {
    switch (id) {
      case "tilt": return clamp(oct(f) * 2.5, -9, 9);
      case "smile": return 6 * Math.pow(Math.abs(oct(f)) / 4, 1.2) - 3;
      case "bass": return f <= 160 ? 9 : f <= 250 ? 4 : 0;
      case "air": return f >= 10000 ? 9 : f >= 6300 ? 6 : f >= 4000 ? 2 : 0;
      case "presence": return 7 * Math.exp(-Math.pow(oct(f) - 1.3, 2) / 0.8);
      case "scoop": return -8 * Math.exp(-Math.pow(oct(f) + 1.6, 2) / 0.5);
    }
  });
}

// ---------- linked bands: moving one moves the others by the same amount ----------
export function linkedMove(gains: number[], i: number, db: number, linked: Set<number>): number[] {
  const d = db - gains[i];
  return gains.map((g, j) => (j === i ? clamp(db, -18, 18) : linked.has(i) && linked.has(j) ? clamp(g + d, -18, 18) : g));
}

// ---------- smart curves from the live spectrum ----------
// energy (dB) per band from an analyser's byte spectrum (default range -100..-30 dB)
export function bandEnergies(bytes: Uint8Array, sampleRate: number): number[] {
  const hz = sampleRate / (2 * bytes.length);
  return EQ_FREQS.map((f) => {
    const lo = Math.max(1, Math.floor(f / Math.cbrt(2) / hz)), hi = Math.max(lo, Math.ceil((f * Math.cbrt(2)) / hz));
    let p = 0;
    for (let k = lo; k <= Math.min(hi, bytes.length - 1); k++) p += Math.pow(10, (-100 + (bytes[k] * 70) / 255) / 10);
    return 10 * Math.log10(p / (hi - lo + 1) + 1e-12);
  });
}
// listen to a curve's input for `ms` and average its band energies (in power)
export async function measure(view: EqView, sampleRate: number, ms = 1500): Promise<number[]> {
  const acc = new Array(N).fill(0);
  const bytes = new Uint8Array(new ArrayBuffer(view.spectrumBins));
  let n = 0;
  for (const t0 = performance.now(); performance.now() - t0 < ms; n++) {
    view.spectrum("pre", bytes);
    bandEnergies(bytes, sampleRate).forEach((e, i) => (acc[i] += Math.pow(10, e / 10)));
    await new Promise((r) => setTimeout(r, 50));
  }
  return acc.map((p) => 10 * Math.log10(p / Math.max(1, n) + 1e-12));
}
// "Équilibrer": halfway toward a balanced mix (-3 dB per octave)
export function balanceCurve(e: number[]): number[] {
  const dev = e.map((v, i) => v - -3 * oct(EQ_FREQS[i]));
  const m = mean(dev);
  const g = smooth3(dev.map((d) => clamp(-(d - m) / 2, -6, 6)));
  const gm = mean(g);
  return g.map((v) => v - gm);
}
// "Copier le son de l'autre deck": bring this tonal balance toward the other one
export function matchCurve(self: number[], other: number[]): number[] {
  const so = mean(self), oo = mean(other);
  return smooth3(other.map((v, i) => (v - oo) - (self[i] - so))).map((v) => clamp(v * 0.7, -8, 8));
}
// "Dégager": cut a stem where the focus (e.g. the voice) is strongest, 250 Hz..6.3 kHz
export function unmaskCurve(focus: number[], stem: number[]): number[] {
  const top = Math.max(...focus), fm = mean(focus);
  return EQ_FREQS.map((f, i) => {
    if (f < 250 || f > 6300 || focus[i] < top - 6 || stem[i] < -70) return 0;
    return clamp(-(3 + clamp(focus[i] - fm, 0, 6) / 2), -7, 0);
  });
}
// "Place pour l'autre deck": clear the lows (and some low-mids) where the other deck sits
export function makeRoomCurve(self: number[], other: number[]): number[] {
  return EQ_FREQS.map((f, i) => {
    if (f <= 160) return -Math.min(15, Math.max(0, other[i] - self[i] + 9));
    if (f >= 250 && f <= 630) return -Math.min(4, Math.max(0, other[i] - self[i] + 3));
    return 0;
  });
}

// ---------- movements: automation synced to the deck tempo ----------
export type MoveId = "sweepUp" | "sweepDown" | "breathe" | "wobble" | "bassOut" | "bassIn";
export const MOVES: { id: MoveId; label: string; title: string }[] = [
  { id: "sweepUp", label: "Montée", title: "Le bas disparaît peu à peu jusqu'au drop, sur la durée choisie" },
  { id: "sweepDown", label: "Descente", title: "Le haut se ferme peu à peu, le son s'assombrit" },
  { id: "breathe", label: "Respiration", title: "Le son penche du sombre au brillant et revient, en boucle" },
  { id: "wobble", label: "Wobble", title: "Une bosse de médium qui monte et descend à chaque temps" },
  { id: "bassOut", label: "Basses dehors", title: "Les graves partent en douceur, pour laisser ceux de l'autre deck" },
  { id: "bassIn", label: "Basses dedans", title: "Les graves coupés reviennent en douceur" },
];
const LOOPED: MoveId[] = ["breathe", "wobble"];
export function moveOffset(id: MoveId, p: number, beatPhase: number): number[] {
  const tilt = gestureShape("tilt");
  return EQ_FREQS.map((f, i) => {
    const o = oct(f);
    switch (id) {
      case "sweepUp": { const c = -5.3 + p * 5.6; return o < c ? -18 * Math.min(1, (c - o) * 1.5) : 0; }
      case "sweepDown": { const c = 4 - p * 5; return o > c ? -18 * Math.min(1, (o - c) * 1.5) : 0; }
      case "breathe": return tilt[i] * Math.sin(2 * Math.PI * p) * 0.8;
      case "wobble": { const m = -1 + 2.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * beatPhase)); return 10 * Math.exp(-Math.pow(o - m, 2) / 0.15); }
      case "bassOut": return f <= 160 ? -18 * p : 0;
      case "bassIn": return f <= 160 ? -18 * (1 - p) : 0;
    }
  });
}

// ---------- the lab, one per deck ----------
export interface LabClock { bpm: number; songTime: number }
type LoopState = "off" | "armed" | "rec" | "play";
interface Job {
  type: "morph" | "move" | "loop";
  curve: number;
  start: number; // beats
  len: number; // beats
  base: number[];
  target?: number[];
  move?: MoveId;
  frames?: { phase: number; gains: number[] }[];
  state?: LoopState;
  done?: boolean; // a finished sweep or bassOut: held as it ended, until stopMove restores the curve
}

export class EqLab {
  private jobs = new Map<string, Job>();
  private amounts = new Map<number, Partial<Record<GestureId, number>>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private view: (curve: number) => EqView, private clock: () => LabClock | null) {}

  read(curve: number): number[] {
    const v = this.view(curve);
    return EQ_FREQS.map((_, i) => v.getGain(i));
  }
  apply(curve: number, gains: number[]) {
    const v = this.view(curve);
    gains.forEach((g, i) => v.setGain(i, clamp(g, -18, 18)));
  }
  gesture(curve: number, id: GestureId): number {
    return this.amounts.get(curve)?.[id] ?? 0;
  }
  setGesture(curve: number, id: GestureId, amount: number) {
    const a = clamp(amount, -1, 1), old = this.gesture(curve, id), shape = gestureShape(id);
    this.apply(curve, this.read(curve).map((g, i) => g + (a - old) * shape[i]));
    this.amounts.set(curve, { ...this.amounts.get(curve), [id]: a });
  }
  resetGestures(curve: number) {
    this.amounts.delete(curve);
  }

  morph(curve: number, target: number[], bars: number) {
    this.start({ type: "morph", curve, target, ...this.span(bars) });
  }
  startMove(curve: number, id: MoveId, bars: number) {
    this.stopMove(curve);
    this.start({ type: "move", curve, move: id, ...this.span(bars) });
  }
  stopMove(curve: number) {
    const j = this.jobs.get(`${curve}:move`);
    if (!j) return;
    this.jobs.delete(`${curve}:move`);
    if (j.move !== "bassOut") this.apply(curve, j.base); // stopping opens the sound again; the lows sent out stay out
  }
  moving(curve: number): MoveId | null {
    return this.jobs.get(`${curve}:move`)?.move ?? null;
  }
  record(curve: number, bars: number) {
    const { pos } = this.beats();
    this.start({ type: "loop", curve, start: Math.ceil(pos / 4) * 4, len: Math.max(1, bars) * 4, state: "armed", frames: [] });
  }
  stopLoop(curve: number) {
    this.jobs.delete(`${curve}:loop`);
  }
  loopState(curve: number): LoopState {
    return this.jobs.get(`${curve}:loop`)?.state ?? "off";
  }

  private span(bars: number): { start: number; len: number } {
    return { start: this.beats().pos, len: bars > 0 ? bars * 4 : 0.75 };
  }
  private start(j: Omit<Job, "base"> & { base?: number[] }) {
    this.jobs.set(`${j.curve}:${j.type}`, { ...j, base: this.read(j.curve) });
    if (!this.timer) this.timer = setInterval(() => this.tick(), 30);
  }
  private beats(): { pos: number } {
    const c = this.clock();
    if (!c || !(c.bpm > 0)) return { pos: (performance.now() / 1000) * 2 }; // 120 BPM on wall time
    return { pos: (c.songTime * c.bpm) / 60 };
  }
  private tick() {
    const { pos } = this.beats();
    for (const [key, j] of this.jobs) {
      if (j.done) continue;
      const p = (pos - j.start) / j.len;
      if (j.type === "morph") {
        const x = clamp(p, 0, 1);
        this.apply(j.curve, j.base.map((b, i) => b + (j.target![i] - b) * x));
        if (x >= 1) this.jobs.delete(key);
      } else if (j.type === "move") {
        const looped = LOOPED.includes(j.move!);
        const x = looped ? ((p % 1) + 1) % 1 : clamp(p, 0, 1);
        const off = moveOffset(j.move!, x, ((pos % 1) + 1) % 1);
        if (!looped && x >= 1 && j.move === "bassIn") {
          this.apply(j.curve, j.base.map((b, i) => (EQ_FREQS[i] <= 160 ? 0 : b))); // the lows come back flat
          this.jobs.delete(key);
          continue;
        }
        this.apply(j.curve, j.base.map((b, i) => b + off[i]));
        if (!looped && x >= 1) j.done = true; // sweeps and bassOut stay where they ended
      } else if (j.state === "armed") {
        if (pos >= j.start) j.state = "rec";
      } else if (j.state === "rec") {
        j.frames!.push({ phase: p, gains: this.read(j.curve) });
        if (p >= 1) j.state = "play";
      } else if (j.frames!.length) {
        const ph = ((p % 1) + 1) % 1;
        let f = j.frames![0];
        for (const fr of j.frames!) if (fr.phase <= ph) f = fr;
        this.apply(j.curve, f.gains);
      }
    }
    if (![...this.jobs.values()].some((j) => !j.done) && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// self-check
export function eqLabTest(): void {
  for (const g of GESTURES) if (gestureShape(g.id).length !== N) throw new Error("eqlab shape");
  const lm = linkedMove([0, 2, 4, ...new Array(N - 3).fill(0)], 1, 5, new Set([1, 2]));
  if (lm[1] !== 5 || lm[2] !== 7 || lm[0] !== 0) throw new Error("eqlab link");
  const e = EQ_FREQS.map((_, i) => -40 - i);
  if (matchCurve(e, e).some((v) => Math.abs(v) > 1e-9)) throw new Error("eqlab match");
  const up = moveOffset("sweepUp", 1, 0);
  if (Math.abs(up[0] + 18) > 1e-9 || up[EQ_FREQS.indexOf(10000)] !== 0) throw new Error("eqlab sweep");
  const flat = bandEnergies(new Uint8Array(1024).fill(128), 48000);
  if (Math.max(...flat) - Math.min(...flat) > 1e-6) throw new Error("eqlab energies");
  // a mix with too much bass gets the bass cut
  const boomy = EQ_FREQS.map((f) => -3 * oct(f) + (f <= 100 ? 10 : 0));
  if (!(balanceCurve(boomy)[1] < -2)) throw new Error("eqlab balance");
}

// one lab per deck; the clock counts beats on the song position (base BPM), so movements follow the song
const labs = new WeakMap<object, EqLab>();
const seen: object[] = []; // the decks whose EQ panel showed, to find "the other deck"
export function otherDeckOf<T extends object>(deck: T): T | null {
  return (seen.find((d) => d !== deck) as T | undefined) ?? null;
}
export function eqLabFor(deck: { rack: { eqView(c: number): EqView }; bpm: number; playing: boolean; position(): number }): EqLab {
  let l = labs.get(deck);
  if (!seen.includes(deck)) seen.push(deck);
  if (!l) {
    l = new EqLab((c) => deck.rack.eqView(c), () => (deck.playing && deck.bpm > 0 ? { bpm: deck.bpm, songTime: deck.position() } : null));
    labs.set(deck, l);
  }
  return l;
}
