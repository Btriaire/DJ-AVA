// The four stem modules of the Console. Each one serves one stem of the deck on air and only plays in key and in time:
// BASS LAB (bass), VOX FX (vocals), SYNTH (the "other" stem), BEAT LAB (drums). One instance per engine, kept alive
// across panel re-renders; nothing is scheduled while a module is idle.
import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import type { FXRack } from "./FXRack";
import type { FxName } from "./fxTypes";
import { BEAT_DIVS } from "./fxTypes";
import { BassVoice, ChoirVoice, DrumKit, PolySynth, SubVoice } from "./jamVoices";
import { chordAt, degreeChord, heardShift, jamDeck, jamScale, jamStem, nextGrid, onJamTick, snapToScale, songToCtx, spb, type JamDeckPref, type JamRole } from "./stemJam";

export const beatIdx = (div: number) => Math.max(0, BEAT_DIVS.indexOf(div));
// shared by the four modules: a pad or a throw starts on the next grid line of this many beats (0 = at once)
export const jamSettings = { quant: 1 as 0 | 0.25 | 1 | 4 };
export function setJamQuant(q: 0 | 0.25 | 1 | 4) { jamSettings.quant = q; jamChanged(); }

// a pad of a module, the same for the screen and the computer keyboard
export interface PadDef { id: string; label: string; sub?: string; mode: "hold" | "toggle"; run: (on: boolean) => void; isOn?: () => boolean }
// the panels re-render at once when a pad or a setting changes (keyboard included)
const listeners = new Set<() => void>();
export function onJamChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function jamChanged() { listeners.forEach((f) => f()); }
type Note = [number, number, number, number];

// first index whose start is >= t (notes are sorted by start)
function lowerBound<T extends number[]>(arr: T[], t: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid][0] < t) lo = mid + 1; else hi = mid; }
  return lo;
}

abstract class JamModule {
  pref: JamDeckPref = "auto";
  readonly bus: GainNode; // the module's instruments meet here, then go into the stem's chain
  private routedTo: AudioNode | null = null;
  private pending = new Map<FxName, { timer: ReturnType<typeof setTimeout>; releaseAfter: boolean; div: number }>();
  private hitTimes: number[] = []; // audio times of the last notes played, for the panel's activity light
  protected constructor(protected engine: DJEngine, readonly role: JamRole) {
    this.bus = engine.ctx.createGain();
  }

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
  // an effect of the stem's DJ rack, on while held; it starts on the next grid line (jamSettings.quant), and a tap
  // released before that line still plays one division so a quick hit is never lost
  fx(name: FxName, on: boolean, div?: number, wet = 0.9, quant: number = jamSettings.quant) {
    const r = this.rack();
    if (!r) return;
    const apply = (v: boolean) => {
      if (v) r.warm();
      if (div !== undefined) r.setBeat(name, beatIdx(div));
      r.setWet(name, v ? wet : 0);
    };
    const p = this.pending.get(name);
    if (!on) {
      if (p) p.releaseAfter = true;
      else apply(false);
      return;
    }
    if (p) { clearTimeout(p.timer); this.pending.delete(name); }
    const d = this.deck();
    const wait = quant > 0 && d.playing ? (nextGrid(d, quant).at - d.ctx.currentTime) * 1000 : 0;
    if (wait < 15) return apply(true);
    const entry = { releaseAfter: false, div: div ?? 1, timer: setTimeout(() => {
      this.pending.delete(name);
      apply(true);
      if (entry.releaseAfter) setTimeout(() => apply(false), Math.max(0.25, entry.div) * spb(d) * 1000);
    }, wait) };
    this.pending.set(name, entry);
  }
  // the bus plays inside the stem's chain (filter, drive, FX, deck fader, crossfader); follows deck changes
  protected route(deck: Deck) {
    const i = this.stem(deck);
    const to = i >= 0 ? deck.stemInput(i) : null;
    if (this.routedTo === to) return;
    if (this.routedTo) this.bus.disconnect(this.routedTo);
    this.routedTo = to;
    if (to) this.bus.connect(to);
  }
  readonly pressed = new Set<string>();
  abstract pads(): PadDef[];
  // stems prepared but not playing: the module can switch them on itself
  // stems loaded but off, or ready on disk for this song (prepared earlier): one click plays them, like the deck's STEMS button
  canEnableStems(): boolean { const d = this.deck(); return (d.stemReady && !d.stemsActive) || (!d.stemReady && d.stemCached && d.stemStatus !== "working"); }
  stemsLoading(): boolean { return this.deck().stemStatus === "working"; }
  async enableStems() {
    const d = this.deck();
    if (!d.stemReady) { jamChanged(); await d.ensureStems(); }
    if (d.stemReady && !d.stemsActive) d.setStemsActive(true);
    jamChanged();
  }
  // a line under the title when something asked for cannot work on this song (its notes were never analysed)
  warning(): string | null { return null; }
  // the settings kept between sessions (what is playing right now is not: nothing starts by itself at the next launch)
  protected abstract keep(): string[];
  snapshot(): Record<string, unknown> {
    const o: Record<string, unknown> = { pref: this.pref };
    for (const k of this.keep()) o[k] = (this as unknown as Record<string, unknown>)[k];
    return o;
  }
  restore(o: Record<string, unknown> | undefined) {
    if (!o) return;
    for (const k of ["pref", ...this.keep()]) if (k in o && typeof o[k] === typeof (this as unknown as Record<string, unknown>)[k]) (this as unknown as Record<string, unknown>)[k] = o[k];
  }
  // RÀZ: every held effect off, every setting back to its default
  reset() {
    for (const id of [...this.pressed]) this.press(id, false);
    this.pressed.clear();
    this.resetFields();
    jamChanged();
  }
  protected abstract resetFields(): void;
  padActive(p: PadDef): boolean { return p.isOn ? p.isOn() : this.pressed.has(p.id); }
  // a pad pressed on screen or on the keyboard: hold pads run while pressed, toggle pads flip on each press
  press(id: string, on: boolean, list: PadDef[] = this.pads()) {
    const p = list.find((x) => x.id === id);
    if (!p) return;
    if (p.mode === "toggle") {
      if (!on) return;
      const next = !this.padActive(p);
      if (!p.isOn) { if (next) this.pressed.add(id); else this.pressed.delete(id); }
      p.run(next);
    } else {
      if (on === this.pressed.has(id)) return;
      if (on) this.pressed.add(id); else this.pressed.delete(id);
      p.run(on);
    }
    jamChanged();
  }
  protected hit(at: number) { this.hitTimes.push(at); if (this.hitTimes.length > 24) this.hitTimes.shift(); }
  // true while a note this module played is sounding its attack (the panel lights its LED)
  lit(): boolean { const now = this.engine.ctx.currentTime; return this.hitTimes.some((t) => now >= t && now - t < 0.09); }
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

// bar index and song time of a grid line, for patterns that think in bars of 16 sixteenths
const barOf = (deck: Deck, t: number) => (deck.bpm ? Math.floor((t - deck.beatGridOffset + 1e-6) / ((60 / deck.bpm) * 4)) : 0);
const step16 = (k: number) => ((k % 16) + 16) % 16;

// ---------------- BASS LAB ----------------
export type BassLine = "off" | "root" | "offbeat" | "octaves" | "bounce";
// a generated bass line: per sixteenth of the bar, which chord tone ("R" root, "O" octave up, "5" fifth, "3" third)
const LINES: Record<Exclude<BassLine, "off">, Record<number, "R" | "O" | "5" | "3">> = {
  root: { 0: "R", 4: "R", 8: "R", 12: "R" },
  offbeat: { 2: "R", 6: "R", 10: "R", 14: "R" }, // the house bass between the kicks
  octaves: { 0: "R", 2: "O", 4: "R", 6: "O", 8: "R", 10: "O", 12: "R", 14: "O" },
  bounce: { 0: "R", 3: "O", 6: "R", 8: "5", 10: "R", 13: "3", 14: "O" },
};
export class BassLab extends JamModule {
  readonly sub: SubVoice;
  readonly lineSynth: BassVoice;
  subLevel = 0; // 0..1, the sub doubles the song's own bass notes
  subOctave: -12 | 0 = -12;
  line: BassLine = "off"; // a bass line made from the song's chords, in key (with SWAP it replaces the bass)
  lineLevel = 0.8;
  pump = false; // the bass ducks on every kick of the song
  muted = false;
  wobble = 0; // 0..1 depth of the synced wobble
  wobbleDiv = 0.25;
  private volBefore = 1;
  constructor(engine: DJEngine) {
    super(engine, "bass");
    this.sub = new SubVoice(engine.ctx);
    this.sub.out.gain.value = 0;
    this.sub.out.connect(this.bus);
    this.lineSynth = new BassVoice(engine.ctx);
    this.lineSynth.out.connect(this.bus);
    onJamTick(engine, (deck, from, to) => this.tick(deck, from, to));
  }
  setSub(v: number) { this.subLevel = v; this.sub.out.gain.value = 0.9 * v; }
  protected keep() { return ["subOctave", "lineLevel", "wobbleDiv"]; }
  protected resetFields() {
    this.setSub(0); this.setWobble(0); this.subOctave = -12; this.line = "off"; this.setLineLevel(0.8); this.pump = false;
    if (this.muted) this.toggleMute();
    this.setDrive(0); this.setTone(0);
  }
  warning(): string | null {
    const n = this.deck().stemNotes;
    if (this.subLevel > 0 && !n?.bass?.length) return "Notes de basse non analysées : le SUB reste muet sur ce morceau.";
    if (this.pump && !n?.drums?.length) return "Coups de batterie non analysés : PUMP ne trouve pas les kicks.";
    return null;
  }
  setWobble(v: number, div = this.wobbleDiv) { this.wobble = v; this.wobbleDiv = div; this.fx("wobble", v > 0.02, div, v, 0); }
  pads(): PadDef[] {
    return [
      { id: "pump", label: "PUMP", sub: "sur les kicks", mode: "toggle", isOn: () => this.pump, run: (on) => { this.pump = on; } },
      { id: "swap", label: "SWAP", sub: "basse coupée", mode: "toggle", isOn: () => this.muted, run: () => this.toggleMute() },
      { id: "drop", label: "DROP", sub: "plongée", mode: "hold", run: (on) => this.drop(on) },
      { id: "r8", label: "ROLL", sub: "1/8", mode: "hold", run: (on) => this.fx("roll", on, 0.125, 1) },
      { id: "r16", label: "ROLL", sub: "1/16", mode: "hold", run: (on) => this.fx("roll", on, 0.0625, 1) },
      { id: "wob", label: "WOB MAX", sub: "1/8", mode: "hold", run: (on) => (on ? this.fx("wobble", true, 0.125, 1) : this.setWobble(this.wobble)) },
    ];
  }
  setLineLevel(v: number) { this.lineLevel = v; this.lineSynth.out.gain.value = 0.6 * v; }
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
    this.fx("brake", on, 1, 1, 0);
  }
  private tick(deck: Deck, from: number, to: number) {
    if (deck !== this.deck()) return;
    const i = this.stem(deck);
    if (i < 0) return;
    if (this.subLevel > 0 || this.line !== "off") this.route(deck);
    const shift = heardShift(deck), rate = Math.max(0.25, deck.playbackRate), beat = spb(deck);
    if (this.subLevel > 0)
      for (const [s, e, m, v] of this.notes(deck, deck.stemNotes?.bass, from, to)) {
        const at = songToCtx(deck, s);
        this.sub.play(m + shift + this.subOctave, at, Math.max(0.08, (e - s) / rate), Math.min(1, 0.5 + v));
        this.hit(at);
      }
    if (this.line !== "off") {
      const pat = LINES[this.line];
      for (const { t, k } of this.steps(deck, 0.25, from, to)) {
        const tone = pat[step16(k)];
        if (!tone) continue;
        const c = chordAt(deck, t);
        const root = 36 + (((c[0] % 12) + 12) % 12); // C2..B2
        const midi = tone === "O" ? root + 12 : tone === "5" ? root + (c[2] - c[0]) : tone === "3" ? root + (c[1] - c[0]) : root;
        const at = songToCtx(deck, t);
        this.lineSynth.note(midi, at, beat * (this.line === "octaves" ? 0.4 : 0.6), step16(k) % 4 === 0 ? 1 : 0.85);
        this.hit(at);
      }
    }
    if (this.pump) {
      const hits = deck.stemNotes?.drums ?? [];
      for (let k = lowerBound(hits, from); k < hits.length && hits[k][0] < to; k++)
        if ((hits[k][2] ?? 0) === 0) deck.duckStemAt(i, songToCtx(deck, hits[k][0]), 0.8, beat * 0.45);
    }
  }
}

// ---------------- VOX FX ----------------
export class VoxFx extends JamModule {
  readonly choir: ChoirVoice;
  harmony = false; // a sung third above the vocal melody, in key
  harmonyUp: 2 | 4 = 2; // scale steps above the voice: a third, or a fifth
  doubled = false;
  // CHOPS: a captured phrase of the vocal stem (song seconds), cut in 8 slices played on pads, in time
  chop: { start: number; slice: number; beats: number } | null = null;
  chopBeats: 2 | 4 | 8 = 4;
  constructor(engine: DJEngine) {
    super(engine, "vocals");
    this.choir = new ChoirVoice(engine.ctx);
    this.choir.out.connect(this.bus);
    onJamTick(engine, (deck, from, to) => this.tick(deck, from, to));
  }
  get level(): number { const d = this.deck(); return d.stemVol[this.stem(d)] ?? 1; }
  setLevel(v: number) { const d = this.deck(); d.setStemVol(this.stem(d), v); }
  pads(): PadDef[] {
    const t = (id: string, label: string, sub: string, fx: FxName, div: number | undefined, wet: number): PadDef => ({ id, label, sub, mode: "hold", run: (on) => this.fx(fx, on, div, wet) });
    return [
      t("echo", "ÉCHO", "1/4", "echo", 0.25, 1),
      t("dub", "DUB", "1/2", "dub", 0.5, 1),
      t("freeze", "FREEZE", "figé", "freeze", undefined, 0.9),
      t("gate", "GATE", "1/16", "gate", 0.0625, 1),
      t("vowel", "VOYELLE", "wah", "vowel", undefined, 0.9),
      t("reverse", "REVERSE", "1 temps", "reverse", 1, 1),
      { id: "double", label: "DOUBLE", sub: "voix large", mode: "toggle", isOn: () => this.doubled, run: (on) => { this.doubled = on; this.fx("double", on, undefined, 0.7, 0); } },
      { id: "harmony", label: "HARMONIE", sub: this.harmonyUp === 4 ? "quinte" : "tierce", mode: "toggle", isOn: () => this.harmony, run: (on) => { this.harmony = on; } },
    ];
  }
  protected keep() { return ["harmonyUp", "chopBeats"]; }
  protected resetFields() {
    this.harmony = false; this.harmonyUp = 2; this.chop = null; this.chopBeats = 4;
    if (this.doubled) { this.doubled = false; this.fx("double", false, undefined, 0, 0); }
    this.setLevel(1); this.setSpace(0); this.setEcho(0); this.setRadio(0);
  }
  warning(): string | null {
    return this.harmony && !this.deck().stemMap?.voice?.length ? "Mélodie de la voix non analysée : HARMONIE reste muette sur ce morceau." : null;
  }
  // the bars just played of the vocal stem become the phrase (ends on the last bar line, so it is in time)
  capture() {
    const d = this.deck();
    if (!d.bpm || this.stem(d) < 0) return;
    const beat = 60 / d.bpm, bar = beat * 4;
    const end = Math.max(this.chopBeats * beat, d.beatGridOffset + Math.floor((d.position() - d.beatGridOffset) / bar) * bar);
    this.chop = { start: end - this.chopBeats * beat, slice: (this.chopBeats * beat) / 8, beats: this.chopBeats };
    jamChanged();
  }
  chopPads(): PadDef[] {
    return Array.from({ length: 8 }, (_, i) => ({ id: `chop${i}`, label: String(i + 1), sub: this.chop ? `${((i * this.chop.beats) / 8).toFixed(1).replace(".0", "")} t` : "vide", mode: "hold" as const, run: (on: boolean) => { if (on) this.playChop(i); } }));
  }
  // one slice of the phrase, at the deck's speed, on the next grid line; it goes through the voice's chain and effects
  playChop(i: number) {
    const d = this.deck(), si = this.stem(d), buf = si >= 0 ? d.getStemBuffer(si) : null;
    if (!buf || !this.chop) return;
    this.route(d);
    const ctx = d.ctx, rate = Math.max(0.25, d.playbackRate);
    const q = jamSettings.quant > 0 ? Math.min(jamSettings.quant, 0.25) : 0;
    const at = q > 0 && d.playing ? nextGrid(d, q).at : ctx.currentTime + 0.005;
    const len = this.chop.slice / rate;
    const src = new AudioBufferSourceNode(ctx, { buffer: buf, playbackRate: rate });
    const env = new GainNode(ctx, { gain: 0 });
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 0.004);
    env.gain.setValueAtTime(1, at + len - 0.008);
    env.gain.linearRampToValueAtTime(0, at + len);
    src.connect(env).connect(this.bus);
    src.start(at, this.chop.start + i * this.chop.slice, this.chop.slice + 0.01);
    src.stop(at + len + 0.02);
    this.hit(at);
  }
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
    this.route(deck);
    const { pcs } = jamScale(deck);
    const shift = heardShift(deck), rate = Math.max(0.25, deck.playbackRate);
    for (let k = Math.max(1, Math.ceil(from / step)); k * step < to && k < v.length; k++) {
      const m = Math.round(v[k]);
      if (v[k] < 0 || m === Math.round(v[k - 1])) continue; // only where a new sung note starts
      let j = k;
      while (j < v.length && v[j] >= 0 && Math.round(v[j]) === m && j - k < 64) j++;
      const sung = snapToScale(m + shift, pcs);
      // a third (2 scale steps) or a fifth (4) above the voice
      let up = sung, n = 0;
      while (n < this.harmonyUp) { up++; if (pcs.includes(((up % 12) + 12) % 12)) n++; }
      const at = songToCtx(deck, k * step);
      this.choir.note(up, at, Math.max(0.2, ((j - k) * step) / rate), 0.9);
      this.hit(at);
    }
  }
}

// ---------------- SYNTH (on the "other" stem) ----------------
export type SynthMode = "off" | "arp" | "stab" | "pad";
export type ArpShape = "up" | "down" | "updown" | "random" | "gate";
const GATE = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1]; // the trance gate, per sixteenth
export class HarmoSynth extends JamModule {
  readonly synth: PolySynth;
  mode: SynthMode = "off";
  shape: ArpShape = "up";
  rate: 0.5 | 0.25 = 0.25; // arp step in beats
  octave = 0; // -1, 0, +1
  degree: number | null = null; // a pad held: this degree's chord instead of the song's
  // the chord loop: REC catches the pads pressed over the next 4 bars, then the synth plays them round and round
  loop: number[] = [-1, -1, -1, -1];
  loopState: "off" | "armed" | "rec" | "play" = "off";
  private loopStart = 0; // bar where the recording started
  private lastPad = "";
  constructor(engine: DJEngine) {
    super(engine, "other");
    this.synth = new PolySynth(engine.ctx);
    this.synth.out.connect(this.bus);
    onJamTick(engine, (deck, from, to) => this.tick(deck, from, to));
  }
  get level(): number { return this.synth.out.gain.value / 0.5; }
  setLevel(v: number) { this.synth.out.gain.value = 0.5 * v; }
  get tone(): number { return this.synth.tone; }
  setTone(v: number) { this.synth.setTone(v); }
  get otherLevel(): number { const d = this.deck(); return d.stemVol[this.stem(d)] ?? 1; }
  setOtherLevel(v: number) { const d = this.deck(); d.setStemVol(this.stem(d), v); }
  pads(names: string[] = []): PadDef[] {
    return ["I", "II", "III", "IV", "V", "VI", "VII"].map((r, i) => ({ id: `deg${i}`, label: names[i] ?? r, sub: r, mode: "hold" as const, run: (on: boolean) => { if (on) this.hold(i); else if (this.degree === i) this.hold(null); } }));
  }
  protected keep() { return ["shape", "rate", "octave"]; }
  protected resetFields() {
    this.mode = "off"; this.shape = "up"; this.rate = 0.25; this.octave = 0; this.degree = null;
    this.loop = [-1, -1, -1, -1]; this.loopState = "off"; this.setLevel(1); this.setTone(0.55); this.setOtherLevel(1);
  }
  warning(): string | null {
    return this.mode !== "off" && !this.deck().stemNotes?.other?.length ? "Accords du morceau non analysés : le synthé reste sur l'accord de la tonique (les pads marchent)." : null;
  }
  // REC (from the next bar), then PLAY; a press while playing clears the loop
  loopButton() {
    if (this.loopState === "off") { this.loop = [-1, -1, -1, -1]; this.loopState = "armed"; }
    else this.loopState = "off";
  }
  // which bar of the loop is playing now, for the panel (-1 when not looping)
  loopBar(): number {
    if (this.loopState !== "rec" && this.loopState !== "play") return -1;
    const d = this.deck();
    return ((barOf(d, d.position()) - this.loopStart) % 4 + 4) % 4;
  }
  // a chord pad: on press its chord sounds at once, then the mode keeps playing it until release
  hold(degree: number | null) {
    this.degree = degree;
    const d = this.deck();
    if (degree === null || this.stem(d) < 0) return;
    if (this.loopState === "rec") this.loop[this.loopBar()] = degree;
    this.route(d);
    const at = d.ctx.currentTime + 0.01;
    this.synth.chord(degreeChord(d, degree, 48 + 12 * this.octave), at, spb(d) * 0.5, 0.9, "stab");
    this.hit(at);
  }
  private chord(deck: Deck, t: number): number[] {
    const base = 48 + 12 * this.octave;
    if (this.degree !== null) return degreeChord(deck, this.degree, base);
    if (this.loopState === "play") {
      const bar = ((barOf(deck, t) - this.loopStart) % 4 + 4) % 4;
      for (let b = 0; b < 4; b++) { const deg = this.loop[(bar - b + 4) % 4]; if (deg >= 0) return degreeChord(deck, deg, base); } // a silent bar keeps the last chord
    }
    return chordAt(deck, t).map((m) => m - 48 + base);
  }
  private arpNote(c: number[], k: number): number | null {
    const up = [c[0], c[1], c[2], c[0] + 12];
    const seq = this.shape === "down" ? [...up].reverse() : this.shape === "updown" ? [...up, c[2], c[1]] : up;
    if (this.shape === "random") return up[(Math.imul(k + 7, 2654435761) >>> 0) % up.length];
    return seq[((k % seq.length) + seq.length) % seq.length];
  }
  private tick(deck: Deck, from: number, to: number) {
    if (deck !== this.deck() || this.stem(deck) < 0) return;
    // the loop recorder follows the bars even when the synth is silent
    if (this.loopState === "armed" || this.loopState === "rec") {
      const bar = barOf(deck, to);
      if (this.loopState === "armed" && bar > barOf(deck, from)) { this.loopState = "rec"; this.loopStart = bar; }
      else if (this.loopState === "rec" && bar >= this.loopStart + 4) this.loopState = this.loop.some((x) => x >= 0) ? "play" : "off";
    }
    if (this.mode === "off") return;
    this.route(deck);
    const beat = spb(deck);
    if (this.mode === "arp") {
      for (const { t, k } of this.steps(deck, this.shape === "gate" ? 0.25 : this.rate, from, to)) {
        const c = this.chord(deck, t), at = songToCtx(deck, t);
        if (this.shape === "gate") { if (GATE[step16(k)]) { this.synth.chord(c, at, beat * 0.2, step16(k) % 4 === 0 ? 0.95 : 0.7, "pluck"); this.hit(at); } continue; }
        const n = this.arpNote(c, k);
        if (n === null) continue;
        this.synth.note(n, at, beat * this.rate * 0.9, k % 4 === 0 ? 1 : 0.75, "pluck");
        this.hit(at);
      }
    } else if (this.mode === "stab") {
      for (const { t, k } of this.steps(deck, 0.5, from, to))
        if (k % 2 !== 0) { const at = songToCtx(deck, t); this.synth.chord(this.chord(deck, t).map((m) => m + 12), at, beat * 0.4, 0.9, "stab"); this.hit(at); } // offbeats
    } else {
      for (const { t, k } of this.steps(deck, 1, from, to)) {
        const c = this.chord(deck, t);
        const key = c.join();
        if (k % 4 === 0 || key !== this.lastPad) { this.lastPad = key; const at = songToCtx(deck, t); this.synth.chord(c, at, beat * 4, 0.8, "pad"); this.hit(at); }
      }
    }
  }
}

// ---------------- BEAT LAB ----------------
export type HatMode = "off" | "8" | "16";
export type SeqRow = "kick" | "clap" | "hat" | "open";
export const SEQ_ROWS: SeqRow[] = ["kick", "clap", "hat", "open"];
// starting patterns for the sequencer, as the sixteenths that play
export const SEQ_PRESETS: Record<"four" | "house" | "break" | "trap" | "clear", Record<SeqRow, number[]>> = {
  four: { kick: [0, 4, 8, 12], clap: [], hat: [], open: [] },
  house: { kick: [0, 4, 8, 12], clap: [4, 12], hat: [0, 4, 8, 12], open: [2, 6, 10, 14] },
  break: { kick: [0, 7, 10], clap: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [15] },
  trap: { kick: [0, 11], clap: [8], hat: [0, 2, 4, 5, 6, 8, 10, 12, 13, 14, 15], open: [] },
  clear: { kick: [], clap: [], hat: [], open: [] },
};
export class BeatLab extends JamModule {
  readonly kit: DrumKit;
  kick = 0; // 0..1 layer on the song's kicks
  clap = 0; // on its snares
  hats: HatMode = "off";
  hatLevel = 0.7;
  swing = 0; // 0..0.5 of a 16th, on the off 16ths
  // the 16-step sequencer: its own kit pattern over the song, on the grid of the bar
  seq = false;
  pattern: Record<SeqRow, boolean[]> = { kick: Array(16).fill(false), clap: Array(16).fill(false), hat: Array(16).fill(false), open: Array(16).fill(false) };
  seqLevel = 0.8;
  constructor(engine: DJEngine) {
    super(engine, "drums");
    this.kit = new DrumKit(engine.ctx);
    this.kit.out.connect(this.bus);
    onJamTick(engine, (deck, from, to) => this.tick(deck, from, to));
  }
  get level(): number { const d = this.deck(); return d.stemVol[this.stem(d)] ?? 1; }
  setLevel(v: number) { const d = this.deck(); d.setStemVol(this.stem(d), v); }
  pads(): PadDef[] {
    const f = (id: string, label: string, sub: string, fx: FxName, div: number): PadDef => ({ id, label, sub, mode: "hold", run: (on) => this.fx(fx, on, div, 1) });
    return [
      f("r4", "ROLL", "1/4", "roll", 0.25), f("r8", "ROLL", "1/8", "roll", 0.125), f("r16", "ROLL", "1/16", "roll", 0.0625), f("r32", "ROLL", "1/32", "roll", 0.03125),
      f("half", "HALF", "demi-tempo", "halftime", 1), f("build", "BUILD", "montée", "build", 1), f("scatter", "SCATTER", "1/8", "scatter", 0.125), f("stop", "STOP", "frein", "brake", 1),
    ];
  }
  protected keep() { return ["hatLevel", "swing", "seqLevel", "pattern"]; }
  protected resetFields() {
    this.kick = 0; this.clap = 0; this.hats = "off"; this.hatLevel = 0.7; this.swing = 0; this.seq = false; this.seqLevel = 0.8;
    this.setPreset("clear"); this.setLevel(1);
  }
  warning(): string | null {
    return (this.kick > 0 || this.clap > 0) && !this.deck().stemNotes?.drums?.length ? "Coups de batterie non analysés : KICK+ et CLAP+ restent muets (le séquenceur marche)." : null;
  }
  toggleStep(row: SeqRow, i: number) { this.pattern[row][i] = !this.pattern[row][i]; jamChanged(); }
  setPreset(name: keyof typeof SEQ_PRESETS) {
    const p = SEQ_PRESETS[name];
    for (const row of SEQ_ROWS) this.pattern[row] = Array.from({ length: 16 }, (_, i) => p[row].includes(i));
    jamChanged();
  }
  // the sixteenth of the bar playing now, -1 when the deck is stopped
  currentStep(): number {
    const d = this.deck();
    if (!d.playing || !d.bpm) return -1;
    return step16(Math.floor((d.position() - d.beatGridOffset) / ((60 / d.bpm) * 0.25)));
  }
  // an accent played right away on the next sixteenth (the macro's drop)
  impact() {
    const d = this.deck();
    if (this.stem(d) < 0) return;
    this.route(d);
    const at = d.playing ? nextGrid(d, 0.25).at : d.ctx.currentTime + 0.01;
    this.kit.kick(at, 1, this.kickHz(d));
    this.kit.clap(at, 0.8);
    this.kit.hat(at, 0.9, true);
    this.hit(at);
  }
  // the kick sings the key's root, between E1 and D#2 (41 to 78 Hz)
  private kickHz(deck: Deck): number { const r = jamScale(deck).root; return 440 * Math.pow(2, (28 + ((r - 4 + 12) % 12) - 69) / 12); }
  private tick(deck: Deck, from: number, to: number) {
    if ((this.kick <= 0 && this.clap <= 0 && this.hats === "off" && !this.seq) || deck !== this.deck() || this.stem(deck) < 0) return;
    this.route(deck);
    const hz = this.kickHz(deck);
    if (this.seq) {
      const sixteenth = spb(deck) * 0.25;
      for (const { t, k } of this.steps(deck, 0.25, from, to)) {
        const i = step16(k), acc = i % 4 === 0 ? 1 : 0.8, v = this.seqLevel * acc;
        const at = songToCtx(deck, t) + (k % 2 !== 0 ? this.swing * sixteenth : 0);
        let any = false;
        if (this.pattern.kick[i]) { this.kit.kick(at, v, hz); any = true; }
        if (this.pattern.clap[i]) { this.kit.clap(at, v); any = true; }
        if (this.pattern.hat[i]) { this.kit.hat(at, v * 0.8, false); any = true; }
        if (this.pattern.open[i]) { this.kit.hat(at, v * 0.8, true); any = true; }
        if (any) this.hit(at);
      }
    }
    if (this.kick > 0 || this.clap > 0) {
      const hits = deck.stemNotes?.drums ?? [];
      for (let k = lowerBound(hits, from); k < hits.length && hits[k][0] < to; k++) {
        const [t, v, c] = hits[k];
        const at = songToCtx(deck, t);
        if (c === 0 && this.kick > 0) { this.kit.kick(at, Math.min(1, (0.6 + v) * this.kick), hz); this.hit(at); }
        else if (c === 1 && this.clap > 0) { this.kit.clap(at, Math.min(1, (0.6 + v) * this.clap)); this.hit(at); }
      }
    }
    if (this.hats !== "off") {
      const div = this.hats === "8" ? 0.5 : 0.25, sixteenth = spb(deck) * 0.25;
      for (const { t, k } of this.steps(deck, div, from, to)) {
        const at = songToCtx(deck, t);
        if (this.hats === "8") { if (k % 2 !== 0) { this.kit.hat(at, this.hatLevel, true); this.hit(at); } continue; } // open hat on the offbeat
        const swung = k % 2 !== 0 ? this.swing * sixteenth : 0;
        this.kit.hat(at + swung, this.hatLevel * (k % 4 === 2 ? 1 : 0.6), false);
        this.hit(at + swung);
      }
    }
  }
}

// ---------------- the macro: BUILD over 2, 4 or 8 bars then DROP on the bar; BREAK takes drums and bass out ----------------
export class JamMacro {
  phase: "idle" | "build" | "break" = "idle";
  bars: 2 | 4 | 8 = 4;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startSong = 0;
  private dropSong = 0;
  private dropScheduled = false;
  private saved: { echo: number; tone: number; mode: SynthMode; rate: 0.5 | 0.25; drums: number; bass: number } | null = null;
  constructor(private engine: DJEngine, private m: { bass: BassLab; vox: VoxFx; synth: HarmoSynth; beat: BeatLab }) {}

  setBars(n: 2 | 4 | 8) { this.bars = n; }
  private deck(): Deck { return this.m.beat.deck(); }
  private nextBarSong(d: Deck): number {
    const bar = (60 / (d.bpm || 120)) * 4;
    return d.beatGridOffset + (Math.floor((d.position() - d.beatGridOffset) / bar) + 1) * bar;
  }
  // 0..1 of the build, for the panel
  progress(): number {
    if (this.phase !== "build") return 0;
    const pos = this.deck().position();
    return Math.min(1, Math.max(0, (pos - this.startSong) / Math.max(0.1, this.dropSong - this.startSong)));
  }
  // BUILD: from the next bar, the drums build up, the voice echoes more and more, the bass thins to a high-pass,
  // the synth arpeggiates faster; then everything comes back at once on the DROP, with an impact
  build() {
    const d = this.deck();
    if (this.phase !== "idle" || !d.playing || !d.bpm) return;
    const { bass, vox, synth } = this.m;
    this.saved = { echo: vox.echo, tone: bass.tone, mode: synth.mode, rate: synth.rate, drums: 0, bass: 0 };
    this.startSong = this.nextBarSong(d);
    this.dropSong = this.startSong + this.bars * 4 * (60 / d.bpm);
    this.dropScheduled = false;
    this.phase = "build";
    this.timer = setInterval(() => this.step(), 50);
  }
  // DROP now: the build ends on the next bar
  dropNow() {
    if (this.phase !== "build") return;
    const d = this.deck();
    this.dropSong = Math.min(this.dropSong, this.nextBarSong(d));
  }
  private step() {
    const d = this.deck();
    if (this.phase !== "build" || !d.playing || !this.saved) { this.finish(false); return; }
    const pos = d.position();
    if (pos < this.startSong) return;
    const p = this.progress();
    const { bass, vox, synth, beat } = this.m;
    beat.fx("build", true, 1, 0.3 + 0.7 * p, 0);
    vox.setEcho(this.saved.echo + (0.85 - this.saved.echo) * p);
    bass.setTone(this.saved.tone + (0.7 - this.saved.tone) * p);
    if (synth.mode === "off") synth.set("mode", "arp");
    synth.set("rate", p > 0.5 ? 0.25 : 0.5);
    // the drop is scheduled on the audio clock a little ahead, so it lands exactly on the bar
    if (!this.dropScheduled && (this.dropSong - pos) / Math.max(0.25, d.playbackRate) < 0.12) {
      this.dropScheduled = true;
      const wait = Math.max(0, (songToCtx(d, this.dropSong) - d.ctx.currentTime) * 1000);
      setTimeout(() => this.finish(true), wait);
    }
  }
  private finish(drop: boolean) {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const s = this.saved;
    const { bass, vox, synth, beat } = this.m;
    beat.fx("build", false, 1, 0, 0);
    if (s) {
      vox.setEcho(s.echo);
      bass.setTone(s.tone);
      synth.set("mode", s.mode);
      synth.set("rate", s.rate);
    }
    if (drop) { beat.impact(); const d = this.deck(); bass.sub.dive(d.ctx.currentTime, 1, spb(d)); }
    this.saved = null;
    this.phase = "idle";
  }
  // BREAK: drums and bass fade out over a beat; pressed again, they come back on the next bar with an impact
  toggleBreak() {
    const d = this.deck(), b = this.m.beat.stem(d), ba = this.m.bass.stem(d);
    if (b < 0) return;
    if (this.phase === "idle") {
      this.saved = { echo: 0, tone: 0, mode: this.m.synth.mode, rate: this.m.synth.rate, drums: d.stemVol[b] || 1, bass: ba >= 0 ? d.stemVol[ba] || 1 : 1 };
      d.rampStemVol(b, 0, spb(d));
      if (ba >= 0) d.rampStemVol(ba, 0, spb(d));
      if (this.m.synth.mode === "off") this.m.synth.set("mode", "pad");
      this.phase = "break";
    } else if (this.phase === "break" && this.saved) {
      const s = this.saved;
      const wait = d.playing ? Math.max(0, (songToCtx(d, this.nextBarSong(d)) - d.ctx.currentTime) * 1000) : 0;
      this.phase = "idle";
      this.saved = null;
      setTimeout(() => {
        d.rampStemVol(b, s.drums, 0.02);
        if (ba >= 0) d.rampStemVol(ba, s.bass, 0.02);
        this.m.synth.set("mode", s.mode);
        this.m.beat.impact();
      }, Math.max(0, wait - 20));
    }
  }
}

const cache = new WeakMap<DJEngine, { bass: BassLab; vox: VoxFx; synth: HarmoSynth; beat: BeatLab; macro: JamMacro }>();
const STORE = "djsynth.jam.v1";
export function jamModules(engine: DJEngine) {
  let m = cache.get(engine);
  if (!m) {
    const four = { bass: new BassLab(engine), vox: new VoxFx(engine), synth: new HarmoSynth(engine), beat: new BeatLab(engine) };
    m = { ...four, macro: new JamMacro(engine, four) };
    cache.set(engine, m);
    // the settings of the last session come back; saved again every 2 s when they changed
    let saved = "";
    try {
      const o = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, Record<string, unknown>> & { quant?: number; bars?: number };
      four.bass.restore(o.bass); four.vox.restore(o.vox); four.synth.restore(o.synth); four.beat.restore(o.beat);
      four.bass.setLineLevel(four.bass.lineLevel);
      if (o.quant === 0 || o.quant === 0.25 || o.quant === 1 || o.quant === 4) jamSettings.quant = o.quant;
      if (o.bars === 2 || o.bars === 4 || o.bars === 8) m.macro.setBars(o.bars);
      saved = localStorage.getItem(STORE) ?? "";
    } catch { /* first launch or storage blocked: the defaults stay */ }
    const mm = m;
    setInterval(() => {
      const now = JSON.stringify({ bass: four.bass.snapshot(), vox: four.vox.snapshot(), synth: four.synth.snapshot(), beat: four.beat.snapshot(), quant: jamSettings.quant, bars: mm.macro.bars });
      if (now === saved) return;
      saved = now;
      try { localStorage.setItem(STORE, now); } catch { /* storage full or blocked: the settings last the session */ }
    }, 2000);
  }
  return m;
}
