// The four stem modules of the Console. Each one serves one stem of the deck on air and only plays in key and in time:
// BASS LAB (bass), VOX FX (vocals), SYNTH (the "other" stem), BEAT LAB (drums). One instance per engine, kept alive
// across panel re-renders; nothing is scheduled while a module is idle.
import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import type { FXRack } from "./FXRack";
import type { FxName } from "./fxTypes";
import { BEAT_DIVS } from "./fxTypes";
import { ChoirVoice, DrumKit, PolySynth, SubVoice } from "./jamVoices";
import { chordAt, degreeChord, heardShift, jamDeck, jamScale, jamStem, onJamTick, snapToScale, songToCtx, spb, type JamDeckPref, type JamRole } from "./stemJam";

export const beatIdx = (div: number) => Math.max(0, BEAT_DIVS.indexOf(div));
type Note = [number, number, number, number];

// first index whose start is >= t (notes are sorted by start)
function lowerBound<T extends number[]>(arr: T[], t: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid][0] < t) lo = mid + 1; else hi = mid; }
  return lo;
}

abstract class JamModule {
  pref: JamDeckPref = "auto";
  private routed: { node: AudioNode; to: AudioNode } | null = null;
  protected constructor(protected engine: DJEngine, readonly role: JamRole) {}

  deck(): Deck { return jamDeck(this.engine, this.pref); }
  // the panels change a setting through this (React's compiler does not let a render value be assigned to)
  set<K extends keyof this>(key: K, value: this[K]) { this[key] = value; }
  stem(deck = this.deck()): number { return jamStem(deck, this.role); }
  rack(deck = this.deck()): FXRack | null { const i = this.stem(deck); return i >= 0 ? deck.stemFxRack(i) : null; }
  // what the panel says: ready, no stems on this deck, or the deck is stopped
  status(): "ok" | "nostems" | "stopped" {
    const d = this.deck();
    if (this.stem(d) < 0) return "nostems";
    return d.playing ? "ok" : "stopped";
  }
  // an effect of the stem's DJ rack, on while held
  fx(name: FxName, on: boolean, div?: number, wet = 0.9) {
    const r = this.rack();
    if (!r) return;
    if (on) r.warm();
    if (div !== undefined) r.setBeat(name, beatIdx(div));
    r.setWet(name, on ? wet : 0);
  }
  // the module's instrument plays inside the stem's chain (filter, drive, FX, deck fader, crossfader)
  protected route(node: AudioNode, deck: Deck) {
    const i = this.stem(deck);
    const to = i >= 0 ? deck.stemInput(i) : null;
    if (this.routed?.to === to) return;
    if (this.routed) this.routed.node.disconnect(this.routed.to);
    this.routed = to ? { node, to } : null;
    if (to) node.connect(to);
  }
  protected notes(deck: Deck, list: Note[] | undefined, from: number, to: number): Note[] {
    if (!list?.length) return [];
    const out: Note[] = [];
    for (let k = lowerBound(list, from); k < list.length && list[k][0] < to; k++) out.push(list[k]);
    return out;
  }
  // grid steps of `div` beats whose song time falls in [from, to)
  protected steps(deck: Deck, div: number, from: number, to: number): { t: number; k: number }[] {
    if (!deck.bpm) return [];
    const unit = (60 / deck.bpm) * div, off = deck.beatGridOffset;
    const out: { t: number; k: number }[] = [];
    for (let k = Math.ceil((from - off) / unit); off + k * unit < to; k++) out.push({ t: off + k * unit, k });
    return out;
  }
}

// ---------------- BASS LAB ----------------
export class BassLab extends JamModule {
  readonly sub: SubVoice;
  subLevel = 0; // 0..1, the sub doubles the song's own bass notes
  subOctave: -12 | 0 = -12;
  pump = false; // the bass ducks on every kick of the song
  muted = false;
  private volBefore = 1;
  constructor(engine: DJEngine) {
    super(engine, "bass");
    this.sub = new SubVoice(engine.ctx);
    this.sub.out.gain.value = 0;
    onJamTick(engine, (deck, from, to) => this.tick(deck, from, to));
  }
  setSub(v: number) { this.subLevel = v; this.sub.out.gain.value = 0.9 * v; }
  get drive(): number { const d = this.deck(); return d.stemDriveAmt[this.stem(d)] ?? 0; }
  setDrive(v: number) { const d = this.deck(); d.setStemDrive(this.stem(d), v); }
  get tone(): number { const d = this.deck(); return d.stemFilterX[this.stem(d)] ?? 0; }
  setTone(x: number) { const d = this.deck(); d.setStemFilter(this.stem(d), x); }
  // bass swap: the stem fades out (or back) over one beat
  toggleMute() {
    const d = this.deck(), i = this.stem(d);
    if (i < 0) return;
    this.muted = !this.muted;
    if (this.muted) { this.volBefore = d.stemVol[i] || 1; d.rampStemVol(i, 0, spb(d)); }
    else d.rampStemVol(i, this.volBefore, spb(d));
  }
  // DROP: the sub dives an octave while the bass brakes
  drop(on: boolean) {
    const d = this.deck();
    if (on) this.sub.dive(d.ctx.currentTime, 1, spb(d));
    this.fx("brake", on, 1, 1);
  }
  private tick(deck: Deck, from: number, to: number) {
    if (deck !== this.deck()) return;
    const i = this.stem(deck);
    if (i < 0) return;
    if (this.subLevel > 0) {
      this.route(this.sub.out, deck);
      const shift = heardShift(deck), rate = Math.max(0.25, deck.playbackRate);
      for (const [s, e, m, v] of this.notes(deck, deck.stemNotes?.bass, from, to))
        this.sub.play(m + shift + this.subOctave, songToCtx(deck, s), Math.max(0.08, (e - s) / rate), Math.min(1, 0.5 + v));
    }
    if (this.pump) {
      const hits = deck.stemNotes?.drums ?? [];
      for (let k = lowerBound(hits, from); k < hits.length && hits[k][0] < to; k++)
        if ((hits[k][2] ?? 0) === 0) deck.duckStemAt(i, songToCtx(deck, hits[k][0]), 0.8, spb(deck) * 0.45);
    }
  }
}

// ---------------- VOX FX ----------------
export class VoxFx extends JamModule {
  readonly choir: ChoirVoice;
  harmony = false; // a sung third above the vocal melody, in key
  constructor(engine: DJEngine) {
    super(engine, "vocals");
    this.choir = new ChoirVoice(engine.ctx);
    onJamTick(engine, (deck, from, to) => this.tick(deck, from, to));
  }
  get level(): number { const d = this.deck(); return d.stemVol[this.stem(d)] ?? 1; }
  setLevel(v: number) { const d = this.deck(); d.setStemVol(this.stem(d), v); }
  get space(): number { const d = this.deck(); return d.stemReverbSend[this.stem(d)] ?? 0; }
  setSpace(v: number) { const d = this.deck(), i = this.stem(d); if (i < 0) return; if (v > 0 && (d.stemFxVol[i] ?? 0) < 0.7) d.setStemFxVol(i, 0.7); d.setStemReverbSend(i, v); }
  get echo(): number { const d = this.deck(); return d.stemDelaySend[this.stem(d)] ?? 0; }
  setEcho(v: number) { const d = this.deck(), i = this.stem(d); if (i < 0) return; if (v > 0 && (d.stemFxVol[i] ?? 0) < 0.7) d.setStemFxVol(i, 0.7); d.setStemDelaySend(i, v); }
  // RADIO: the voice thins out like a phone line (positive side of the stem filter = high-pass)
  get radio(): number { const d = this.deck(); return Math.max(0, d.stemFilterX[this.stem(d)] ?? 0); }
  setRadio(v: number) { const d = this.deck(); d.setStemFilter(this.stem(d), v * 0.85); }
  private tick(deck: Deck, from: number, to: number) {
    if (!this.harmony || deck !== this.deck() || this.stem(deck) < 0) return;
    const map = deck.stemMap, v = map?.voice, step = map?.voiceStep;
    if (!v || !step) return;
    this.route(this.choir.out, deck);
    const { pcs } = jamScale(deck);
    const shift = heardShift(deck), rate = Math.max(0.25, deck.playbackRate);
    for (let k = Math.max(1, Math.ceil(from / step)); k * step < to && k < v.length; k++) {
      const m = Math.round(v[k]);
      if (v[k] < 0 || m === Math.round(v[k - 1])) continue; // only where a new sung note starts
      let j = k;
      while (j < v.length && v[j] >= 0 && Math.round(v[j]) === m && j - k < 64) j++;
      const sung = snapToScale(m + shift, pcs);
      // a diatonic third above: two scale steps up
      let up = sung + 1, n = 0;
      while (n < 2) { if (pcs.includes(((up % 12) + 12) % 12)) n++; if (n < 2) up++; }
      this.choir.note(up, songToCtx(deck, k * step), Math.max(0.2, ((j - k) * step) / rate), 0.9);
    }
  }
}

// ---------------- SYNTH (on the "other" stem) ----------------
export type SynthMode = "off" | "arp" | "stab" | "pad";
export class HarmoSynth extends JamModule {
  readonly synth: PolySynth;
  mode: SynthMode = "off";
  rate: 0.5 | 0.25 = 0.25; // arp step in beats
  octave = 0; // -1, 0, +1
  degree: number | null = null; // a pad held: this degree's chord instead of the song's
  private lastPad = "";
  constructor(engine: DJEngine) {
    super(engine, "other");
    this.synth = new PolySynth(engine.ctx);
    onJamTick(engine, (deck, from, to) => this.tick(deck, from, to));
  }
  get level(): number { return this.synth.out.gain.value / 0.5; }
  setLevel(v: number) { this.synth.out.gain.value = 0.5 * v; }
  get tone(): number { return this.synth.tone; }
  setTone(v: number) { this.synth.setTone(v); }
  get otherLevel(): number { const d = this.deck(); return d.stemVol[this.stem(d)] ?? 1; }
  setOtherLevel(v: number) { const d = this.deck(); d.setStemVol(this.stem(d), v); }
  // a chord pad: on press its chord sounds at once, then the mode keeps playing it until release
  hold(degree: number | null) {
    this.degree = degree;
    const d = this.deck();
    if (degree === null || this.stem(d) < 0) return;
    this.route(this.synth.out, d);
    this.synth.chord(degreeChord(d, degree, 48 + 12 * this.octave), d.ctx.currentTime + 0.01, spb(d) * 0.5, 0.9, "stab");
  }
  private chord(deck: Deck, t: number): number[] {
    const base = 48 + 12 * this.octave;
    if (this.degree !== null) return degreeChord(deck, this.degree, base);
    return chordAt(deck, t).map((m) => m - 48 + base);
  }
  private tick(deck: Deck, from: number, to: number) {
    if (this.mode === "off" || deck !== this.deck() || this.stem(deck) < 0) return;
    this.route(this.synth.out, deck);
    const beat = spb(deck);
    if (this.mode === "arp") {
      for (const { t, k } of this.steps(deck, this.rate, from, to)) {
        const c = this.chord(deck, t);
        const seq = [...c, c[0] + 12, c[2] + 0, c[1] + 12]; // up the chord, a step past the octave, back
        this.synth.note(seq[((k % seq.length) + seq.length) % seq.length], songToCtx(deck, t), beat * this.rate * 0.9, k % 4 === 0 ? 1 : 0.75, "pluck");
      }
    } else if (this.mode === "stab") {
      for (const { t, k } of this.steps(deck, 0.5, from, to))
        if (k % 2 !== 0) this.synth.chord(this.chord(deck, t).map((m) => m + 12), songToCtx(deck, t), beat * 0.4, 0.9, "stab"); // offbeats
    } else {
      for (const { t, k } of this.steps(deck, 1, from, to)) {
        const c = this.chord(deck, t);
        const key = c.join();
        if (k % 4 === 0 || key !== this.lastPad) { this.lastPad = key; this.synth.chord(c, songToCtx(deck, t), beat * 4, 0.8, "pad"); }
      }
    }
  }
}

// ---------------- BEAT LAB ----------------
export type HatMode = "off" | "8" | "16";
export class BeatLab extends JamModule {
  readonly kit: DrumKit;
  kick = 0; // 0..1 layer on the song's kicks
  clap = 0; // on its snares
  hats: HatMode = "off";
  hatLevel = 0.7;
  swing = 0; // 0..0.5 of a 16th, on the off 16ths
  constructor(engine: DJEngine) {
    super(engine, "drums");
    this.kit = new DrumKit(engine.ctx);
    onJamTick(engine, (deck, from, to) => this.tick(deck, from, to));
  }
  get level(): number { const d = this.deck(); return d.stemVol[this.stem(d)] ?? 1; }
  setLevel(v: number) { const d = this.deck(); d.setStemVol(this.stem(d), v); }
  private tick(deck: Deck, from: number, to: number) {
    if ((this.kick <= 0 && this.clap <= 0 && this.hats === "off") || deck !== this.deck() || this.stem(deck) < 0) return;
    this.route(this.kit.out, deck);
    if (this.kick > 0 || this.clap > 0) {
      const hits = deck.stemNotes?.drums ?? [];
      for (let k = lowerBound(hits, from); k < hits.length && hits[k][0] < to; k++) {
        const [t, v, c] = hits[k];
        if (c === 0 && this.kick > 0) this.kit.kick(songToCtx(deck, t), Math.min(1, (0.6 + v) * this.kick));
        else if (c === 1 && this.clap > 0) this.kit.clap(songToCtx(deck, t), Math.min(1, (0.6 + v) * this.clap));
      }
    }
    if (this.hats !== "off") {
      const div = this.hats === "8" ? 0.5 : 0.25, sixteenth = spb(deck) * 0.25;
      for (const { t, k } of this.steps(deck, div, from, to)) {
        if (this.hats === "8") { if (k % 2 !== 0) this.kit.hat(songToCtx(deck, t), this.hatLevel, true); continue; } // open hat on the offbeat
        const swung = k % 2 !== 0 ? this.swing * sixteenth : 0;
        this.kit.hat(songToCtx(deck, t) + swung, this.hatLevel * (k % 4 === 2 ? 1 : 0.6), false);
      }
    }
  }
}

const cache = new WeakMap<DJEngine, { bass: BassLab; vox: VoxFx; synth: HarmoSynth; beat: BeatLab }>();
export function jamModules(engine: DJEngine) {
  let m = cache.get(engine);
  if (!m) { m = { bass: new BassLab(engine), vox: new VoxFx(engine), synth: new HarmoSynth(engine), beat: new BeatLab(engine) }; cache.set(engine, m); }
  return m;
}
