// The four stem modules of the Console. Each one serves one stem of the deck on air and only plays in key and in time:
// BASS LAB (bass), VOX FX (vocals), SYNTH (the "other" stem), BEAT LAB (drums). One instance per engine, kept alive
// across panel re-renders; nothing is scheduled while a module is idle.
import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import type { FXRack } from "./FXRack";
import type { FxName } from "./fxTypes";
import { BEAT_DIVS } from "./fxTypes";
import { BassVoice, ChoirVoice, DrumKit, PolySynth, Riser, SubVoice, type BassCharacter, type SynthPatch } from "./jamVoices";
import { arpNoteAt, arpSequence, type ArpShape as ArpOrder } from "./jamArp";
import { progression, type ProgressionName } from "./jamProgressions";
import { SyncedSweep } from "./jamSweep";
import { StereoChorus } from "./jamChorus";
import { SampledInstrument } from "./sampledInstrument";
import { SampledKit } from "./sampledKit";
import { drumKit } from "@/lib/drumKits";
import { compHit, voiceFor, type CompName } from "./jamComp";
import { humanize } from "./jamHuman";
import { instrument } from "@/lib/sampleFont";
import { fillNote, isFillBar, type FillEvery } from "./jamFill";
import { degreeNames } from "./stemJam";
import { captureBars } from "./jamCapture";
import { degreeShifts } from "./jamMelody";
import { nextSungAt } from "./jamVoiceNext";
import { Vocoder } from "./jamVocoder";
import { harmonyNotes, type HarmonyMode } from "./jamHarmony";
import { voiceNotes, type VoiceNote } from "./jamVoiceNotes";
import { chordHits, cleanNotes, monoBass } from "./jamReplay";
import { envelope, levelAt, percentile } from "./jamPrecision";
import { chordAt, chordDegreeAt, degreeChord, heardShift, voiceLead, type ChordColor, jamDeck, jamScale, jamStem, nextGrid, onJamTick, snapToScale, songToCtx, spb, type JamDeckPref, type JamRole } from "./stemJam";

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

const SLOTS = "djsynth.jam.slots.v1";
function loadSlots(role: string): (Record<string, unknown> | null)[] {
  try { const all = JSON.parse(localStorage.getItem(SLOTS) ?? "{}") as Record<string, (Record<string, unknown> | null)[]>; const l = all[role]; if (Array.isArray(l) && l.length === 4) return l; } catch { /* no scenes yet */ }
  return [null, null, null, null];
}
function saveSlots(role: string, slots: (Record<string, unknown> | null)[]) {
  try { const all = JSON.parse(localStorage.getItem(SLOTS) ?? "{}") as Record<string, unknown>; all[role] = slots; localStorage.setItem(SLOTS, JSON.stringify(all)); } catch { /* storage blocked: scenes last the session */ }
}

// the original stem's loudness envelope, made once per stem buffer (5 ms frames), shared by the modules
export const SOFT_BED = 0.35; // DOUCE + REMPLACER: the original stays at 35 % under the module

// the original stem's loudness envelope (moved)
const levelCache = new WeakMap<AudioBuffer, { env: Float32Array; ref: number }>();

abstract class JamModule {
  pref: JamDeckPref = "auto";
  readonly bus: GainNode; // the module's instruments meet here, then go into the stem's chain
  private routedTo: AudioNode | null = null;
  private pending = new Map<FxName, { timer: ReturnType<typeof setTimeout>; releaseAfter: boolean; div: number }>();
  private hitTimes: number[] = []; // audio times of the last notes played, for the panel's activity light
  protected constructor(protected engine: DJEngine, readonly role: JamRole) {
    this.bus = engine.ctx.createGain();
    this.initSoft();
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
    if (this.routedTo) this.out.disconnect(this.routedTo);
    this.routedTo = to;
    if (to) this.out.connect(to);
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
  // the real loudness 0..1 of every stem the module owns right after song time t: the replays breathe like the song
  protected dyn(deck: Deck, t: number): number {
    const buffers = this.swapStems(deck).map(i => deck.getStemBuffer(i)).filter(b => b !== null);
    if (buffers.length === 0) return 1;
    let cached = levelCache.get(buffers[0]);
    if (!cached) {
      const envs = buffers.map(buffer => {
        const env = envelope(buffer.getChannelData(0), buffer.sampleRate);
        if (buffer.numberOfChannels > 1) {
          const env1 = envelope(buffer.getChannelData(1), buffer.sampleRate);
          for (let i = 0; i < env.length; i++) env[i] = (env[i] + env1[i]) / 2;
        }
        return env;
      });
      const minLength = Math.min(...envs.map(env => env.length));
      const combinedEnv = new Float32Array(minLength);
      for (let i = 0; i < minLength; i++) {
        combinedEnv[i] = envs.reduce((sum, env) => sum + env[i], 0);
      }
      const ref = percentile(combinedEnv, 0.95);
      cached = { env: combinedEnv, ref };
      levelCache.set(buffers[0], cached);
    }
    return levelAt(cached.env, 0.005, t, cached.ref);
  }
  // REMPLACER: the module takes the stem over: the original fades out over one bar while the module replays its part
  swapped = false;
  private swapBefore: number[] = [];

  toggleSwap() {
    const d = this.deck(), list = this.swapStems(d);
    if (!list.length) return;
    this.swapped = !this.swapped;
    if (this.swapped) {
      this.swapBefore = list.map(i => Math.max(0.2, d.stemVol[i] || 1));
      list.forEach((i, k) => d.rampStemVol(i, this.soft ? SOFT_BED * this.swapBefore[k] : 0, (this.soft ? 8 : 4) * spb(d)));
    } else {
      list.forEach((i, k) => d.rampStemVol(i, this.swapBefore[k] ?? 1, this.soft ? 8 * spb(d) : 4 * spb(d)));
    }
    this.onSwap(this.swapped);
    jamChanged();
  }

  // DOUCE: the module's sound rounded (gentle low-pass, slow glue compressor) and, with REMPLACER, the original kept underneath
  soft = false;
  protected softCutoff = 2800; // Hz of the low-pass when DOUCE is on (each module sets its own)
  out!: GainNode;        // what route() connects to the stem
  private softTone!: BiquadFilterNode;
  private softGlue!: DynamicsCompressorNode;
  private softSpace: [number, number][] = []; // reverb send and FX return of each swap stem before DOUCE
  initSoft(): void {
    this.softTone = this.engine.ctx.createBiquadFilter();
    this.softTone.type = "lowpass";
    this.softTone.frequency.value = 20000;
    this.softTone.Q.value = 0.5;

    this.softGlue = this.engine.ctx.createDynamicsCompressor();
    this.softGlue.threshold.value = 0;
    this.softGlue.ratio.value = 1;
    this.softGlue.knee.value = 12;
    this.softGlue.attack.value = 0.003;
    this.softGlue.release.value = 0.15;

    this.out = this.engine.ctx.createGain();
    this.out.gain.value = 1;

    this.bus.connect(this.softTone);
    this.softTone.connect(this.softGlue);
    this.softGlue.connect(this.out);
  }
  setSoft(on: boolean): void {
    const was = this.soft;
    this.soft = on;
    const ctx = this.engine.ctx;
    this.softTone.frequency.setTargetAtTime(on ? this.softCutoff : 20000, ctx.currentTime, 0.08);
    this.softGlue.threshold.setTargetAtTime(on ? -30 : 0, ctx.currentTime, 0.08);
    this.softGlue.ratio.setTargetAtTime(on ? 4 : 1, ctx.currentTime, 0.08);
    this.out.gain.setTargetAtTime(on ? 0.85 : 1, ctx.currentTime, 0.08);

    // the module and the original share the deck's reverb, so they sit in the same room
    if (on && !was) {
      const d = this.deck();
      const list = this.swapStems(d);
      this.softSpace = list.map(i => [d.stemReverbSend[i] ?? 0, d.stemFxVol[i] ?? 0.4]);
      list.forEach(i => {
        d.setStemFxVol(i, Math.max(d.stemFxVol[i] ?? 0.4, 0.7));
        d.setStemReverbSend(i, Math.max(d.stemReverbSend[i] ?? 0, 0.22));
      });
    } else if (!on && was) {
      const d = this.deck();
      const list = this.swapStems(d);
      this.softSpace.forEach((saved, k) => {
        d.setStemReverbSend(list[k], saved[0]);
        d.setStemFxVol(list[k], saved[1]);
      });
      this.softSpace = [];
    }

    if (this.swapped) {
      const d = this.deck();
      const list = this.swapStems(d);
      list.forEach((i, k) => {
        const before = this.swapBefore[k] ?? 1;
        d.rampStemVol(i, on ? SOFT_BED * before : 0, 8 * spb(d));
      });
    }
    jamChanged();
  }

  // the stems REMPLACER fades out: the module's own stem (the Synth adds guitar and piano with 6 stems)
  protected swapStems(d: Deck): number[] { const i = this.stem(d); return i < 0 ? [] : [i]; }

  // the hook where each module starts its reprise when it takes the stem over
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected onSwap(on: boolean): void {}
  // the settings kept between sessions (what is playing right now is not: nothing starts by itself at the next launch)
  protected abstract keep(): string[];
  snapshot(): Record<string, unknown> {
    const o: Record<string, unknown> = { pref: this.pref, soft: this.soft };
    for (const k of this.keep()) o[k] = (this as unknown as Record<string, unknown>)[k];
    return o;
  }
  restore(o: Record<string, unknown> | undefined) {
    if (!o) return;
    for (const k of ["pref", ...this.keep()]) if (k in o && typeof o[k] === typeof (this as unknown as Record<string, unknown>)[k]) (this as unknown as Record<string, unknown>)[k] = o[k];
    if (typeof o.soft === "boolean") this.setSoft(o.soft);
  }
  // RÀZ: every held effect off, every setting back to its default
  reset() {
    if (this.swapped) this.toggleSwap(); // RAZ brings the original stem back
    if (this.soft) this.setSoft(false);
    for (const id of [...this.pressed]) this.press(id, false);
    this.pressed.clear();
    this.resetFields();
    jamChanged();
  }
  protected abstract resetFields(): void;
  // SCENES A-D: the whole module (sound and what plays) saved in one click, recalled on the next bar
  protected sceneKeys(): string[] { return this.keep(); }
  protected afterScene(): void {}
  private slotList: (Record<string, unknown> | null)[] | null = null;
  private get slots(): (Record<string, unknown> | null)[] { return (this.slotList ??= loadSlots(this.role)); } // read once, after the constructor set role
  private armed: number | null = null;
  slotNames(): (string | null)[] { return this.slots.map((o, i) => (o ? "ABCD"[i] : null)); }
  armedSlot(): number | null { return this.armed; }
  saveSlot(i: number) {
    const o: Record<string, unknown> = {};
    for (const k of this.sceneKeys()) o[k] = JSON.parse(JSON.stringify((this as unknown as Record<string, unknown>)[k] ?? null));
    this.slots[i] = o;
    saveSlots(this.role, this.slots);
    jamChanged();
  }
  clearSlot(i: number) { this.slots[i] = null; saveSlots(this.role, this.slots); jamChanged(); }
  loadSlot(i: number) {
    const o = this.slots[i];
    if (!o) return;
    const apply = () => {
      for (const k of this.sceneKeys()) if (k in o && o[k] !== null) (this as unknown as Record<string, unknown>)[k] = o[k];
      this.afterScene();
      this.armed = null;
      jamChanged();
    };
    const d = this.deck();
    if (!d.playing || !d.bpm) return apply();
    this.armed = i;
    jamChanged();
    const wait = (nextGrid(d, 4).at - d.ctx.currentTime) * 1000; // on the next bar
    setTimeout(apply, Math.max(0, wait - 15));
  }
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
export type BassLine = "off" | "follow" | "root" | "offbeat" | "octaves" | "bounce" | "gallop" | "acid";
// a generated bass line: per sixteenth of the bar, which chord tone ("R" root, "O" octave up, "5" fifth, "3" third)
const LINES: Record<Exclude<BassLine, "off" | "follow" | "acid">, Record<number, "R" | "O" | "5" | "3">> = {
  root: { 0: "R", 4: "R", 8: "R", 12: "R" },
  offbeat: { 2: "R", 6: "R", 10: "R", 14: "R" }, // the house bass between the kicks
  octaves: { 0: "R", 2: "O", 4: "R", 6: "O", 8: "R", 10: "O", 12: "R", 14: "O" },
  bounce: { 0: "R", 3: "O", 6: "R", 8: "5", 10: "R", 13: "3", 14: "O" },
  gallop: { 0: "R", 2: "R", 3: "R", 4: "R", 6: "R", 7: "R", 8: "R", 10: "R", 11: "R", 12: "O", 14: "R", 15: "R" }, // eighth + two sixteenths
};
// the acid line: tone, s = slides from the note before (no new attack), a = accent
const ACID: Record<number, [ "R" | "O" | "5" | "3", string]> = {
  0: ["R", "a"], 2: ["O", "s"], 3: ["R", ""], 5: ["5", ""], 6: ["O", "a"], 8: ["R", ""], 10: ["3", "s"], 11: ["R", ""], 13: ["O", "as"], 14: ["R", ""],
};
export class BassLab extends JamModule {
  protected softCutoff = 1500; // the buzz of the synth bass rounded off with DOUCE
  readonly sub: SubVoice;
  readonly lineSynth: BassVoice;
  subLevel = 0; // 0..1, the sub doubles the song's own bass notes
  subOctave: -12 | 0 = -12;
  line: BassLine = "off"; // a bass line made from the song's chords, in key (with SWAP it replaces the bass)
  lineLevel = 0.8;
  lineTone = 0.3;
  lineEnv = 0.5;
  fillEvery: FillEvery = 0; // a turnaround on the last beat of every 4th or 8th bar
  private linePump: GainNode;
  readonly sampledBass: SampledInstrument;
  lineVoice = ""; // "" = the synth bass (its character), else a real bass id ("electric_bass_finger"...)
  private played: { start: number; end: number; midi: number }[] = []; // the line notes scheduled, in song seconds, for the lane
  pump = false; // the bass ducks on every kick of the song (on every beat when its kicks were never analysed)
  pumpDepth = 0.8;
  wobble = 0; // 0..1 depth of the synced wobble
  wobbleDiv = 0.25;
  private swapLine = false; // REMPLACER turned the REPRISE on, so it turns it off again
  private monoCache: WeakMap<object, Note[]> = new WeakMap();
  constructor(engine: DJEngine) {
    super(engine, "bass");
    this.sub = new SubVoice(engine.ctx);
    this.sub.out.gain.value = 0;
    this.sub.out.connect(this.bus);
    this.lineSynth = new BassVoice(engine.ctx);
    this.linePump = new GainNode(engine.ctx, { gain: 1 }); // the line breathes with PUMP like the stem
    this.lineSynth.out.connect(this.linePump).connect(this.bus);
    this.sampledBass = new SampledInstrument(engine.ctx);
    this.sampledBass.out.connect(this.linePump);
    onJamTick(engine, (deck, from, to) => this.tick(deck, from, to));
  }
  setSub(v: number) { this.subLevel = v; this.sub.out.gain.value = 0.9 * v; }
  protected keep() { return ["subOctave", "lineLevel", "lineTone", "lineEnv", "pumpDepth", "wobbleDiv", "characterName", "fillEvery", "lineVoice"]; }
  protected sceneKeys() { return [...this.keep(), "subLevel", "line", "pump", "wobble"]; }
  protected afterScene() { this.setSub(this.subLevel); this.setLineLevel(this.lineLevel); this.setLineTone(this.lineTone); this.setLineEnv(this.lineEnv); this.setWobble(this.wobble, this.wobbleDiv); }
  protected resetFields() {
    this.setSub(0); this.setWobble(0); this.subOctave = -12; this.line = "off"; this.setLineLevel(0.8); this.pump = false;
    this.setDrive(0); this.setTone(0);
  }
  warning(): string | null {
    const n = this.deck().stemNotes;
    if (!n && this.deck().analysisPending) return "Analyse des notes du morceau en cours : la basse suit dès qu'elle est prête (quelques secondes).";
    if (this.subLevel > 0 && !n?.bass?.length) return "Notes de basse non analysées : le SUB reste muet sur ce morceau.";
    if (this.line === "follow" && !n?.bass?.length) return "Notes de basse non analysées : la REPRISE reste muette sur ce morceau.";
    return null;
  }
  setWobble(v: number, div = this.wobbleDiv) { this.wobble = v; this.wobbleDiv = div; this.fx("wobble", v > 0.02, div, v, 0); }
  pads(): PadDef[] {
    return [
      { id: "pump", label: "PUMP", sub: "sur les kicks", mode: "toggle", isOn: () => this.pump, run: (on) => { this.pump = on; } },
      { id: "swap", label: "SWAP", sub: "basse remplacée", mode: "toggle", isOn: () => this.swapped, run: () => this.toggleSwap() },
      { id: "drop", label: "DROP", sub: "plongée", mode: "hold", run: (on) => this.drop(on) },
      { id: "r8", label: "ROLL", sub: "1/8", mode: "hold", run: (on) => this.fx("roll", on, 0.125, 1) },
      { id: "r16", label: "ROLL", sub: "1/16", mode: "hold", run: (on) => this.fx("roll", on, 0.0625, 1) },
      { id: "wob", label: "WOB MAX", sub: "1/8", mode: "hold", run: (on) => (on ? this.fx("wobble", true, 0.125, 1) : this.setWobble(this.wobble)) },
    ];
  }
  setLineLevel(v: number) { this.lineLevel = v; this.lineSynth.out.gain.value = 0.6 * v; }
  setLineTone(v: number) { this.lineTone = v; this.lineSynth.setTone(v); }
  // a real bass for the line (loaded on first use; the synth bass plays meanwhile or offline), "" for the synth bass
  setLineVoice(id: string) { this.lineVoice = id; if (id) void this.sampledBass.load(id).then(() => jamChanged()); jamChanged(); }
  lineVoiceStatus(): string | null {
    if (!this.lineVoice) return null;
    const label = instrument(this.lineVoice)?.label ?? "Basse";
    if (this.sampledBass.ready()) return `${label} prête`;
    if (this.sampledBass.failed) return `${label} indisponible (réseau ?) : la basse synthé joue à sa place`;
    return this.sampledBass.current ? `Chargement : ${label} ${this.sampledBass.done}/${this.sampledBass.total}` : `${label} : se charge à la première note`;
  }
  // every line note goes through here: the real bass when chosen and loaded, else the synth bass
  private lineNote(midi: number, at: number, len: number, vel: number, opts: { slide?: boolean; accent?: boolean } = {}) {
    if (this.lineVoice && this.sampledBass.current !== this.lineVoice) void this.sampledBass.load(this.lineVoice).then(() => jamChanged());
    if (this.lineVoice && this.sampledBass.ready()) {
      // any instrument can play the line: below its range the note goes up an octave (a cello, a piano), held instruments hold the long notes
      const inst = instrument(this.lineVoice);
      let m = midi;
      while (inst && m < inst.lo) m += 12;
      const kind = inst?.pad && len > 0.35 ? "pad" : "pluck";
      this.sampledBass.note(m, at, len, Math.min(1, vel * (opts.accent ? 1.1 : 0.95)), kind);
    } else this.lineSynth.note(midi, at, len, vel, opts);
  }
  get character(): BassCharacter { return this.lineSynth.character; }
  setCharacter(c: BassCharacter) { this.lineSynth.setCharacter(c); }
  // kept between sessions through this field
  get characterName(): string { return this.lineSynth.character; }
  set characterName(v: string) { if (["acid", "reese", "808", "funk", "moog", "fm", "hoover", "donk", "berlin"].includes(v)) this.lineSynth.setCharacter(v as BassCharacter); }
  // the lane above the pads: the song's bass notes and the line notes played, around the playhead
  laneData(): { pos: number; beat: number; notes: { start: number; end: number; midi: number; kind: "song" | "line" }[] } | null {
    const d = this.deck();
    if (this.stem(d) < 0) return null;
    const pos = d.position(), beat = d.bpm ? 60 / d.bpm : 0.5;
    const from = pos - beat, to = pos + 3 * beat, shift = heardShift(d);
    const out: { start: number; end: number; midi: number; kind: "song" | "line" }[] = [];
    const bass = d.stemNotes?.bass ?? [];
    for (let k = Math.max(0, lowerBound(bass, from - 4)); k < bass.length && bass[k][0] < to; k++) if (bass[k][1] > from) out.push({ start: bass[k][0], end: bass[k][1], midi: bass[k][2] + shift, kind: "song" });
    this.played = this.played.filter((n) => n.end > pos - 2 * beat);
    for (const n of this.played) if (n.start < to && n.end > from) out.push({ ...n, kind: "line" });
    return { pos, beat: d.bpm ? beat : 0, notes: out };
  }
  setLineEnv(v: number) { this.lineEnv = v; this.lineSynth.setEnv(v); }
  get drive(): number { const d = this.deck(); return d.stemDriveAmt[this.stem(d)] ?? 0; }
  setDrive(v: number) { const d = this.deck(); d.setStemDrive(this.stem(d), v); }
  get tone(): number { const d = this.deck(); return d.stemFilterX[this.stem(d)] ?? 0; }
  setTone(x: number) { const d = this.deck(); d.setStemFilter(this.stem(d), x); }
  // REMPLACER: the bass stem fades out while the REPRISE replays its part (or the chosen line takes over)
  protected onSwap(on: boolean): void {
    if (on && this.line === "off") { this.line = "follow"; this.swapLine = true; }
    else if (!on && this.swapLine) { if (this.line === "follow") this.line = "off"; this.swapLine = false; }
  }
  // the stem and the generated line duck together on a kick
  private duck(deck: Deck, i: number, at: number, beat: number) {
    deck.duckStemAt(i, at, this.pumpDepth, beat * 0.45);
    const g = this.linePump.gain;
    g.setValueAtTime(1, Math.max(deck.ctx.currentTime, at - 0.002));
    g.linearRampToValueAtTime(1 - this.pumpDepth, at + 0.005);
    g.setTargetAtTime(1, at + 0.006, beat * 0.15);
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
    if (this.subLevel <= 0 && this.line === "off" && !this.pump) return; // idle: nothing to schedule
    if (this.subLevel > 0 || this.line !== "off") this.route(deck);
    const shift = heardShift(deck), rate = Math.max(0.25, deck.playbackRate), beat = spb(deck);
    if (this.subLevel > 0)
      for (const [s, e, m, v] of this.notes(deck, deck.stemNotes?.bass, from, to)) {
        const at = songToCtx(deck, s);
        this.sub.play(m + shift + this.subOctave, at, Math.max(0.08, (e - s) / rate), Math.min(1, 0.5 + v));
        this.hit(at);
      }
    if (this.line === "follow") {
      // REPRISE: the song's own bass part, same notes and rhythm, on the synth bass (with SWAP it changes the bass sound)
      const key = deck.stemNotes;
      let mono = key ? this.monoCache.get(key) : undefined;
      if (!mono) { mono = monoBass(key?.bass ?? []); if (key) this.monoCache.set(key, mono); }
      for (const [s0, e0, m, v] of this.notes(deck, mono, from, to)) {
        let midi = m + shift;
        while (midi > 55) midi -= 12;
        while (midi < 28) midi += 12;
        const at = songToCtx(deck, s0);
        this.lineNote(midi, at, Math.max(0.08, (e0 - s0) / rate), Math.min(1, (0.3 + 0.7 * this.dyn(deck, s0)) * (0.75 + 0.25 * v)));
        this.played.push({ start: s0, end: e0, midi });
        this.hit(at);
      }
    } else if (this.line !== "off") {
      for (const { t, k } of this.steps(deck, 0.25, from, to)) {
        const i16 = step16(k);
        const acid = this.line === "acid" ? ACID[i16] : undefined;
        const c = chordAt(deck, t);
        const fill = isFillBar(barOf(deck, t), this.fillEvery) ? fillNote(c.map((m) => 36 + (((m - c[0]) + 120) % 120) + (((c[0] % 12) + 12) % 12)), i16) : null;
        if (fill) {
          const at = songToCtx(deck, t);
          this.lineNote(fill.midi, at, beat * 0.22, fill.accent ? 1 : 0.85, { accent: fill.accent });
          this.played.push({ start: t, end: t + beat * 0.22 * Math.max(0.25, deck.playbackRate), midi: fill.midi });
          this.hit(at);
          continue;
        }
        const tone = acid ? acid[0] : this.line === "acid" ? undefined : LINES[this.line][i16];
        if (!tone) continue;
        const root = 36 + (((c[0] % 12) + 12) % 12); // C2..B2
        const midi = tone === "O" ? root + 12 : tone === "5" ? root + (c[2] - c[0]) : tone === "3" ? root + (c[1] - c[0]) : root;
        const at = songToCtx(deck, t);
        const len = this.line === "acid" ? beat * 0.24 : this.line === "gallop" ? beat * 0.2 : beat * (this.line === "octaves" ? 0.4 : 0.6);
        this.lineNote(midi, at, len, i16 % 4 === 0 ? 1 : 0.85, acid ? { slide: acid[1].includes("s"), accent: acid[1].includes("a") } : {});
        this.played.push({ start: t, end: t + len * Math.max(0.25, deck.playbackRate), midi });
        this.hit(at);
      }
    }
    if (this.pump) {
      const hits = deck.stemNotes?.drums ?? [];
      if (hits.length) {
        for (let k = lowerBound(hits, from); k < hits.length && hits[k][0] < to; k++)
          if ((hits[k][2] ?? 0) === 0) this.duck(deck, i, songToCtx(deck, hits[k][0]), beat);
      } else for (const { t } of this.steps(deck, 1, from, to)) this.duck(deck, i, songToCtx(deck, t), beat); // no kicks known: every beat
    }
  }
}

// ---------------- VOX FX ----------------
export class VoxFx extends JamModule {
  protected softCutoff = 4500; // the words stay clear with DOUCE
  readonly choir: ChoirVoice;
  readonly sampledChoir: SampledInstrument;
  harmony = false;
  doubled = false;
  harmonyVoice = "choir_aahs"; // an instrument id of the "Voix" family, "" for the synthetic choir
  chop: { start: number; slice: number; beats: number } | null = null;
  chopBeats: 2 | 4 | 8 = 4;
  chopMode: "slices" | "melody" = "slices";
  melodySlice = 0; // the slice the melody mode plays: the last one played in "slices" mode


  get level(): number { const d = this.deck(); return d.stemVol[this.stem(d)] ?? 1; }
  setLevel(v: number) { const d = this.deck(); d.setStemVol(this.stem(d), v); }

  setHarmonyVoice(id: string) {
    this.harmonyVoice = id;
    if (id) void this.sampledChoir.load(id).then(jamChanged);
    jamChanged();
  }

  harmonyStatus(): string | null {
    if (!this.harmonyVoice) return null;
    const inst = instrument(this.harmonyVoice);
    if (!inst) return null;
    if (this.sampledChoir.failed) return `${inst.label} indisponible : la voix de synthèse chante à sa place`;
    if (this.sampledChoir.ready()) return `${inst.label} prêt`;
    if (this.sampledChoir.current === this.harmonyVoice) return `Chargement : ${inst.label} ${this.sampledChoir.done}/${this.sampledChoir.total}`;
    return `${inst.label} : se charge à la première note`;
  }



  warning(): string | null {
    if (this.harmony && !this.deck().stemMap?.voice?.length && this.deck().analysisPending) return "Analyse de la voix en cours : HARMONIE chante dès qu'elle est prête (quelques secondes).";
    return this.harmony && !this.deck().stemMap?.voice?.length ? "Mélodie de la voix non analysée : HARMONIE reste muette sur ce morceau." : null;
  }

  capture() {
    const d = this.deck();
    if (!d.bpm || this.stem(d) < 0) return;
    const beat = 60 / d.bpm, bar = beat * 4;
    const end = Math.max(this.chopBeats * beat, d.beatGridOffset + Math.floor((d.position() - d.beatGridOffset) / bar) * bar);
    this.chop = { start: end - this.chopBeats * beat, slice: (this.chopBeats * beat) / 8, beats: this.chopBeats };
    jamChanged();
  }

  slicePitchClass(): number {
    const d = this.deck();
    if (!this.chop || !d.stemMap?.voice?.length || !d.stemMap.voiceStep) return jamScale(d).root;
    const { voice, voiceStep } = d.stemMap;
    const start = this.chop.start + this.melodySlice * this.chop.slice;
    const end = start + this.chop.slice;
    const values: number[] = [];
    for (let k = Math.ceil(start / voiceStep); k * voiceStep < end && k < voice.length; k++) {
      const t = k * voiceStep;
      if (t >= start && t < end && voice[k] >= 0) values.push(voice[k]);
    }
    if (!values.length) return jamScale(d).root;
    const median = values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    return ((median + heardShift(d)) % 12 + 12) % 12;
  }

  melodyShift(i: number): number {
    if (!this.chop) return 0;
    return degreeShifts(jamScale(this.deck()).pcs, this.slicePitchClass())[i];
  }

  chopPads(): PadDef[] {
    const pcs = this.slicePitchClass();
    const shifts = this.chopMode === "melody" ? degreeShifts(jamScale(this.deck()).pcs, pcs) : [];
    return Array.from({ length: 8 }, (_, i) => ({
      id: `chop${i}`,
      label: String(i + 1),
      sub: this.chopMode === "melody" ?
        ["Do","Do#","Ré","Mib","Mi","Fa","Fa#","Sol","Lab","La","Sib","Si"][((pcs + shifts[i]) % 12 + 12) % 12] :
        this.chop ? `${((i * this.chop.beats) / 8).toFixed(1).replace(".0", "")} t` : "vide",
      mode: "hold" as const,
      run: (on: boolean) => { if (on) this.playChop(i); }
    }));
  }

  playChop(i: number) {
    const d = this.deck(), si = this.stem(d), buf = si >= 0 ? d.getStemBuffer(si) : null;
    if (!buf || !this.chop) return;
    this.route(d);
    const ctx = d.ctx, rate = Math.max(0.25, d.playbackRate);
    const q = jamSettings.quant > 0 ? Math.min(jamSettings.quant, 0.25) : 0;
    const at = q > 0 && d.playing ? nextGrid(d, q).at : ctx.currentTime + 0.005;
    let len: number, shift: number;
    if (this.chopMode === "melody") {
      shift = this.melodyShift(i);
      len = this.chop.slice / (rate * 2 ** (shift / 12));
      i = this.melodySlice;
    } else {
      shift = 0;
      len = this.chop.slice / rate;
      this.melodySlice = i;
    }
    const src = new AudioBufferSourceNode(ctx, { buffer: buf, playbackRate: rate * 2 ** (shift / 12) });
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

  nextPhrase(): string | null {
    const d = this.deck();
    if (!this.harmony || !d.stemMap?.voice?.length || !d.stemMap.voiceStep) return null;
    const t = nextSungAt(d.stemMap.voice, d.stemMap.voiceStep, d.position());
    if (t === null) return null;
    const pos = d.position();
    if (t - pos < 0.05) return "La voix chante : harmonie en cours";
    return `Prochaine phrase chantée dans ${Math.ceil((t - pos) / Math.max(0.25, d.playbackRate))} s`;
  }

  // REMPLACER: the choir sings the melody itself (unison) while the voice fades out
  protected onSwap(on: boolean): void {
    if (on) { this.harmony = true; this.harmonyMode = "unison"; }
    else { this.harmonyMode = "third"; this.harmony = false; }
  }
  setChopMode(mode: "slices" | "melody") {
    this.chopMode = mode;
    jamChanged();
  }

  get space(): number { const d = this.deck(); return d.stemReverbSend[this.stem(d)] ?? 0; }
  setSpace(v: number) { const d = this.deck(), i = this.stem(d); if (i < 0) return; if (v > 0 && (d.stemFxVol[i] ?? 0) < 0.7) d.setStemFxVol(i, 0.7); d.setStemReverbSend(i, v); }
  get echo(): number { const d = this.deck(); return d.stemDelaySend[this.stem(d)] ?? 0; }
  setEcho(v: number) { const d = this.deck(), i = this.stem(d); if (i < 0) return; if (v > 0 && (d.stemFxVol[i] ?? 0) < 0.7) d.setStemFxVol(i, 0.7); d.setStemDelaySend(i, v); }
  get radio(): number { const d = this.deck(); return Math.max(0, d.stemFilterX[this.stem(d)] ?? 0); }
  setRadio(v: number) { const d = this.deck(); d.setStemFilter(this.stem(d), v * 0.85); }

  vocoder: Vocoder;
  vocoderOn = false;
  vocoderLevel = 0.8;
  harmonyMode: HarmonyMode = "third";
  private vocTap: AudioNode | null = null;
  private vocChord: number[] | null = null;
  private played: { start: number; end: number; midi: number }[] = [];


  private wireVocoder(deck: Deck) {
    const i = this.stem(deck);
    const tap = i >= 0 ? deck.stemPreTap(i) : null;
    if (tap === this.vocTap) return;
    if (this.vocTap) this.vocTap.disconnect(this.vocoder.mod);
    this.vocTap = tap;
    if (tap) tap.connect(this.vocoder.mod);
  }

  setVocoder(on: boolean) {
    this.vocoderOn = on;
    this.route(this.deck());
    if (on) {
      this.wireVocoder(this.deck());
      this.vocoder.start();
      this.vocoder.setLevel(this.vocoderLevel);
      const d = this.deck();
      if (!this.vocChord) {
        const line = d.position();
        this.vocChord = voiceLead(null, degreeChord(d, chordDegreeAt(d, line), 60, "seventh"));
      }
      this.vocoder.setChord(this.vocChord, d.ctx.currentTime);
    } else {
      this.vocoder.stop(this.deck().ctx.currentTime);
      if (this.vocTap) this.vocTap.disconnect(this.vocoder.mod);
      this.vocTap = null;
    }
    jamChanged();
  }

  setVocoderLevel(v: number) {
    this.vocoderLevel = v;
    if (this.vocoderOn) this.vocoder.setLevel(v);
  }





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
      { id: "harmony", label: "HARMONIE", sub: this.harmonyMode === "third" ? "tierce" : this.harmonyMode === "fifth" ? "quinte" : this.harmonyMode === "chord" ? "accord" : "dessous", mode: "toggle", isOn: () => this.harmony, run: (on) => { this.harmony = on; } },
    ];
  }
  readonly harmBus: GainNode;
  private segCache = new WeakMap<number[], VoiceNote[]>();
  private appliedLevel = -1;
  harmonyLevel = 1; // 0..2, the harmony bus level (x1.6)

  private segs(deck: Deck): VoiceNote[] {
    const voice = deck.stemMap?.voice;
    if (!voice) return [];
    const step = deck.stemMap?.voiceStep ?? 0.1;
    if (this.segCache.has(voice)) return this.segCache.get(voice)!;
    const notes = voiceNotes(voice, step);
    this.segCache.set(voice, notes);
    return notes;
  }

  protected keep() { return ["harmonyMode", "chopBeats", "harmonyVoice", "chopMode", "vocoderLevel", "harmonyLevel"]; }

  protected resetFields() {
    this.harmony = false;
    this.harmonyMode = "third";
    this.chop = null;
    this.chopBeats = 4;
    this.chopMode = "slices";
    this.melodySlice = 0;
    this.harmonyVoice = "choir_aahs";
    if (this.vocoderOn) this.setVocoder(false);
    this.vocoderLevel = 0.8;
    if (this.doubled) { this.doubled = false; this.fx("double", false, undefined, 0, 0); }
    this.setLevel(1);
    this.setSpace(0);
    this.setEcho(0);
    this.setRadio(0);
    this.harmonyLevel = 1;
    this.setHarmonyLevel(1);
  }

  constructor(engine: DJEngine) {
    super(engine, "vocals");
    this.choir = new ChoirVoice(engine.ctx);
    this.sampledChoir = new SampledInstrument(engine.ctx);
    this.harmBus = new GainNode(engine.ctx, { gain: 1.6 });
    this.choir.out.connect(this.harmBus);
    this.sampledChoir.out.connect(this.harmBus);
    this.harmBus.connect(this.bus);
    this.vocoder = new Vocoder(engine.ctx);
    this.vocoder.out.connect(this.bus);
    onJamTick(engine, (deck, from, to) => this.tick(deck, from, to));
  }

  setHarmonyLevel(v: number) {
    this.harmonyLevel = v;
    this.appliedLevel = v;
    this.harmBus.gain.setTargetAtTime(1.6 * v, this.deck().ctx.currentTime, 0.02);
  }

  laneData(): { pos: number; beat: number; notes: { start: number; end: number; midi: number; kind: "song" | "line" }[] } | null {
    const d = this.deck();
    if (this.stem(d) < 0) return null;
    const pos = d.position(), beat = d.bpm ? 60 / d.bpm : 0.5;
    const from = pos - beat, to = pos + 3 * beat, shift = heardShift(d);
    const out: { start: number; end: number; midi: number; kind: "song" | "line" }[] = [];
    const segments = this.segs(d);
    for (const seg of segments) {
      const start = seg.k0 * d.stemMap!.voiceStep!;
      const end = seg.k1 * d.stemMap!.voiceStep!;
      if (start >= to || end <= from) continue;
      out.push({ start, end, midi: seg.midi + shift, kind: "song" });
    }
    this.played = this.played.filter(n => n.end > pos - 2 * beat);
    for (const n of this.played) if (n.start < to && n.end > from) out.push({ ...n, kind: "line" });
    return { pos, beat: d.bpm ? beat : 0, notes: out };
  }

  private tick(deck: Deck, from: number, to: number) {
    if (deck !== this.deck() || this.stem(deck) < 0) return;
    if (this.appliedLevel !== this.harmonyLevel) {
      this.setHarmonyLevel(this.harmonyLevel);
    }
    if (this.vocoderOn) {
      this.wireVocoder(deck);
      this.route(deck);
      if (deck.bpm) {
        const beatLen = 60 / deck.bpm;
        for (let b = Math.ceil((from - deck.beatGridOffset) / beatLen); b * beatLen + deck.beatGridOffset < to; b++) {
          const line = deck.beatGridOffset + b * beatLen;
          const chord = voiceLead(this.vocChord, degreeChord(deck, chordDegreeAt(deck, line), 60, "seventh"));
          this.vocChord = chord;
          this.vocoder.setChord(chord, songToCtx(deck, line));
          this.hit(songToCtx(deck, line));
        }
      }
    }
    if (!this.harmony) return;
    const segments = this.segs(deck);
    if (!segments.length) return;
    this.route(deck);
    const { pcs } = jamScale(deck);
    const shift = heardShift(deck), rate = Math.max(0.25, deck.playbackRate);
    if (this.harmonyVoice && this.sampledChoir.current !== this.harmonyVoice) {
      void this.sampledChoir.load(this.harmonyVoice).then(jamChanged);
    }
    const step = deck.stemMap!.voiceStep!;
    let i = 0;
    while (i < segments.length && segments[i].k0 * step < from) i++;
    for (; i < segments.length && segments[i].k0 * step < to; i++) {
      const seg = segments[i];
      const sung = snapToScale(seg.midi + shift, pcs);
      const at = songToCtx(deck, seg.k0 * step);
      const len = Math.max(0.15, ((seg.k1 - seg.k0) * step) / rate);
      const notes = harmonyNotes(sung, pcs, this.harmonyMode);
      for (const note of notes) {
        if (this.harmonyVoice && this.sampledChoir.ready()) {
          this.sampledChoir.note(note, at, len, (notes.length === 1 ? 0.85 : 0.7) * (0.4 + 0.6 * this.dyn(deck, seg.k0 * step)), "pad");
        } else {
          this.choir.note(note, at, len, 0.4 + 0.6 * this.dyn(deck, seg.k0 * step));
        }
        this.played.push({ start: seg.k0 * step, end: seg.k1 * step, midi: note });
      }
      this.hit(at);
    }
  }
}

// ---------------- SYNTH (on the "other" stem) ----------------
export type SynthMode = "off" | "arp" | "stab" | "pad" | "comp" | "replay";
export type ArpShape = ArpOrder;
const GATE = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1]; // the trance gate, per sixteenth
export class HarmoSynth extends JamModule {
  readonly synth: PolySynth;
  mode: SynthMode = "off";
  shape: ArpShape = "up";
  arpOctaves: 1 | 2 = 1;
  gateLen = 0.9; // 0.2..1 of the step, how long each arp note sounds
  sweepDepth = 0; // the synced filter sweep on the synth
  sweepDiv = 1; // one sweep every this many beats
  readonly sweep: SyncedSweep;
  readonly chorus: StereoChorus;
  readonly riser: Riser;
  readonly sampled: SampledInstrument;
  voice = "synth:pluck"; // "synth:<patch>" or "inst:<real instrument id>"
  // REPRISE: the song's own part replayed, its cleaned notes or its chord strikes at their exact times
  replayStyle: "notes" | "chords" = "chords";
  private replayCache: WeakMap<object, { notes: Note[]; hits: { t: number; dur: number; vel: number }[] }> = new WeakMap();

  private replayData(deck: Deck): { notes: Note[]; hits: { t: number; dur: number; vel: number }[] } {
    const other = deck.stemNotes?.other ?? [];
    const c = cleanNotes(other);
    return { notes: c, hits: chordHits(c) };
  }

  protected onSwap(on: boolean): void {
    if (on && this.mode === "off") this.mode = "replay";
  }
  // with 6 stems, guitar and piano are part of what the Synth replays
  protected swapStems(d: Deck): number[] { const i = this.stem(d); return i < 0 ? [] : [i, d.stemIndex("guitar"), d.stemIndex("piano")].filter((k) => k >= 0); }
  comp: CompName = "charleston"; // the accompaniment rhythm of the "comp" mode
  human = 0.35; // 0..1 timing and velocity looseness
  width = 0; // stereo chorus 0..1
  riserBars: 2 | 4 | 8 = 4;
  rate: 0.5 | 0.25 = 0.25; // arp step in beats
  octave = 0; // -1, 0, +1
  color: ChordColor = "triad";
  echo = 0; // 0..1 the synth's own echo, a dotted eighth
  pumpOn = false; // the synth breathes on the kicks
  degree: number | null = null; // a pad held: this degree's chord instead of the song's
  private voicing: number[] | null = null; // the last chord played, for the voice leading
  private echoIn: GainNode;
  private delay: DelayNode;
  private pumpGain: GainNode;
  // the chord loop: REC catches the pads pressed over the next 4 bars, then the synth plays them round and round
  loop: number[] = [-1, -1, -1, -1];
  loopState: "off" | "armed" | "rec" | "play" = "off";
  private loopStart = 0; // bar where the recording started
  private lastPad = "";
  constructor(engine: DJEngine) {
    super(engine, "other");
    const ctx = engine.ctx;
    this.synth = new PolySynth(ctx);
    // synth -> synced sweep -> pump -> bus, and a dotted-eighth echo (filtered feedback) beside it
    this.pumpGain = new GainNode(ctx, { gain: 1 });
    this.sweep = new SyncedSweep(ctx);
    this.synth.out.connect(this.sweep.input);
    this.sampled = new SampledInstrument(ctx);
    this.sampled.out.connect(this.sweep.input); // real instruments share the sweep, chorus, pump and echo
    this.chorus = new StereoChorus(ctx);
    this.sweep.output.connect(this.chorus.input);
    this.chorus.output.connect(this.pumpGain).connect(this.bus);
    this.riser = new Riser(ctx);
    this.riser.out.connect(this.bus);
    this.echoIn = new GainNode(ctx, { gain: 0 });
    this.delay = new DelayNode(ctx, { maxDelayTime: 2, delayTime: 0.375 });
    const fb = new GainNode(ctx, { gain: 0.38 }), tone = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 3200 });
    this.pumpGain.connect(this.echoIn).connect(this.delay).connect(tone).connect(fb).connect(this.delay);
    tone.connect(this.bus);
    onJamTick(engine, (deck, from, to) => this.tick(deck, from, to));
  }
  get level(): number { return this.synth.out.gain.value / 0.5; }
  setLevel(v: number) { this.synth.out.gain.value = 0.5 * v; }
  get tone(): number { return this.synth.tone; }
  setTone(v: number) { this.synth.setTone(v); }
  get otherLevel(): number { const d = this.deck(); return d.stemVol[this.stem(d)] ?? 1; }
  setOtherLevel(v: number) { const d = this.deck(); d.setStemVol(this.stem(d), v); }
  get patch(): SynthPatch { return this.synth.patch; }
  setPatch(p: SynthPatch) { this.synth.patch = p; }
  setEcho(v: number) { this.echo = v; this.echoIn.gain.value = 0.55 * v; }
  setWidth(v: number) { this.width = v; this.chorus.setWidth(v); }
  // the sound: one of the synth patches, or a real instrument (loaded on first use, cached on disk by the app)
  setVoice(id: string) {
    this.voice = id;
    if (id.startsWith("synth:")) this.setPatch(id.slice(6) as SynthPatch);
    else this.ensureVoice();
    jamChanged();
  }
  private ensureVoice() {
    if (!this.voice.startsWith("inst:")) return;
    const id = this.voice.slice(5);
    if (this.sampled.current !== id) void this.sampled.load(id).then(() => jamChanged());
  }
  // who plays the notes: the real instrument once loaded, the synth meanwhile (or when it could not load)
  private player(): { note: PolySynth["note"]; chord: PolySynth["chord"] } {
    return this.voice.startsWith("inst:") && this.sampled.ready() ? this.sampled : this.synth;
  }
  voiceStatus(): string | null {
    if (!this.voice.startsWith("inst:")) return null;
    const label = instrument(this.voice.slice(5))?.label ?? "Instrument";
    if (this.sampled.ready()) return `${label} prêt`;
    if (this.sampled.failed) return `${label} indisponible (réseau ?) : le synthé joue à sa place`;
    if (this.sampled.current) return `Chargement : ${label} ${this.sampled.done}/${this.sampled.total}`;
    return `${label} : se charge au premier accord`;
  }
  // RISER: noise and a climbing saw from the next bar, landing on the bar after riserBars bars
  playRiser(on: boolean) {
    const d = this.deck();
    if (!on) { this.riser.stop(d.ctx.currentTime); return; }
    if (this.stem(d) < 0 || !d.bpm) return;
    this.route(d);
    const at = d.playing ? nextGrid(d, 4).at : d.ctx.currentTime + 0.02;
    this.riser.play(at, this.riserBars * 4 * spb(d), 48 + jamScale(d).root);
    this.hit(at);
  }
  setSweep(depth: number, div = this.sweepDiv) { this.sweepDepth = depth; this.sweepDiv = div; this.sweep.setDepth(depth); this.sweep.setRate(SyncedSweep.rateFor(this.deck().bpm, div)); }
  // a ready-made progression goes into the chord loop and plays at once, from the next bar
  loadProgression(name: ProgressionName) {
    this.loop = progression(name, jamScale(this.deck()).minor);
    this.loopStart = barOf(this.deck(), this.deck().position()) + 1;
    this.loopState = "play";
    jamChanged();
  }
  // the song's own chords over the next 4 bars go into the chord loop (read ahead from the analysed notes)
  captureSong(): void {
    const d = this.deck();
    if (this.stem(d) < 0 || !d.bpm) return;
    const barLen = 240 / d.bpm;
    const next = barOf(d, d.position()) + 1;
    this.loop = captureBars((t) => chordDegreeAt(d, t), d.beatGridOffset + next * barLen, barLen);
    this.loopStart = next;
    this.loopState = "play";
    jamChanged();
  }
  // what the chord strip shows: the chord now, the next three (one per beat... per bar), the notes sounding, the key
  chordView(): { now: string; next: string[]; pcs: number[]; key: string } | null {
    const d = this.deck();
    if (this.stem(d) < 0) return null;
    const names = degreeNames(d), pos = d.position(), beat = d.bpm ? 60 / d.bpm : 0.5;
    const suffix = this.color === "seventh" ? "7" : this.color === "ninth" ? "9" : "";
    const nameAt = (t: number) => names[this.degreeAt(d, t)] + suffix;
    const next: string[] = [];
    for (let k = 1; next.length < 3 && k <= 32; k++) { const n = nameAt(pos + k * beat); if (n !== (next[next.length - 1] ?? nameAt(pos))) next.push(n); }
    const k = d.effectiveKey;
    return { now: nameAt(pos), next, pcs: this.chord(d, pos).map((m) => ((m % 12) + 12) % 12), key: k ? `${["Do", "Do#", "Ré", "Mib", "Mi", "Fa", "Fa#", "Sol", "Lab", "La", "Sib", "Si"][k.pitchClass]} ${k.mode === "minor" ? "mineur" : "majeur"}` : "tonalité inconnue" };
  }
  private degreeAt(d: Deck, t: number): number {
    if (this.degree !== null) return this.degree;
    if (this.loopState === "play") {
      const bar = ((barOf(d, t) - this.loopStart) % 4 + 4) % 4;
      for (let b = 0; b < 4; b++) { const deg = this.loop[(bar - b + 4) % 4]; if (deg >= 0) return deg; }
    }
    return chordDegreeAt(d, t);
  }
  pads(names: string[] = []): PadDef[] {
    return ["I", "II", "III", "IV", "V", "VI", "VII"].map((r, i) => ({ id: `deg${i}`, label: names[i] ?? r, sub: r, mode: "hold" as const, run: (on: boolean) => { if (on) this.hold(i); else if (this.degree === i) this.hold(null); } }));
  }
  protected keep() { return ["shape", "rate", "octave", "color", "echo", "patchName", "arpOctaves", "gateLen", "sweepDiv", "width", "riserBars", "voice", "comp", "human"]; }
  protected sceneKeys() { return [...this.keep(), "mode", "pumpOn", "sweepDepth"]; }
  protected afterScene() { this.setEcho(this.echo); this.setSweep(this.sweepDepth, this.sweepDiv); this.setWidth(this.width); this.ensureVoice(); }
  // the sound, kept between sessions through this field (the synth itself holds the live one)
  get patchName(): string { return this.synth.patch; }
  set patchName(v: string) { if (["pluck", "supersaw", "organ", "keys", "brass"].includes(v)) this.synth.patch = v as SynthPatch; }
  protected resetFields() {
    this.mode = "off"; this.shape = "up"; this.rate = 0.25; this.octave = 0; this.degree = null;
    this.loop = [-1, -1, -1, -1]; this.loopState = "off"; this.setLevel(1); this.setTone(0.55); this.setOtherLevel(1);
    this.color = "triad"; this.setEcho(0); this.pumpOn = false; this.setPatch("pluck");
    this.arpOctaves = 1; this.gateLen = 0.9; this.setSweep(0, 1); this.setWidth(0); this.riserBars = 4;
  }
  warning(): string | null {
    if (this.mode !== "off" && !this.deck().stemNotes && this.deck().analysisPending) return "Analyse des accords du morceau en cours : le synthé les suit dès qu'elle est prête (quelques secondes).";
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
    this.ensureVoice();
    if (this.loopState === "rec") this.loop[this.loopBar()] = degree;
    this.route(d);
    const at = d.ctx.currentTime + 0.01;
    const shift = 12 * this.octave;
    this.voicing = voiceLead(this.voicing ? this.voicing.map((m) => m - shift) : null, degreeChord(d, degree, 48, this.color)).map((m) => m + shift);
    this.player().chord(this.voicing, at, spb(d) * 0.5, 0.9, "stab", 0.008);
    this.hit(at);
  }
  // the chord to play at t: the pad held, else the loop's bar, else the song's own chord; in the chosen colour
  private chord(deck: Deck, t: number): number[] {
    const base = 48 + 12 * this.octave;
    if (this.degree !== null) return degreeChord(deck, this.degree, base, this.color);
    if (this.loopState === "play") {
      const bar = ((barOf(deck, t) - this.loopStart) % 4 + 4) % 4;
      for (let b = 0; b < 4; b++) { const deg = this.loop[(bar - b + 4) % 4]; if (deg >= 0) return degreeChord(deck, deg, base, this.color); } // a silent bar keeps the last chord
    }
    return degreeChord(deck, chordDegreeAt(deck, t), base, this.color);
  }
  // stabs and pads move each voice the least from the chord before
  private voiced(deck: Deck, t: number): number[] {
    const c = this.chord(deck, t);
    const shift = 12 * this.octave;
    const v = voiceLead(this.voicing ? this.voicing.map((m) => m - shift) : null, c.map((m) => m - shift)).map((m) => m + shift);
    this.voicing = v;
    return v;
  }
  private arpNote(c: number[], k: number): number {
    const order = this.shape === "gate" ? "up" : this.shape;
    return arpNoteAt(arpSequence([...c].sort((x, y) => x - y), order, this.arpOctaves), k, this.shape === "random");
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
    this.ensureVoice();
    const beat = spb(deck);
    this.delay.delayTime.setTargetAtTime(Math.min(1.9, beat * 0.75), deck.ctx.currentTime, 0.05); // dotted eighth at the deck's tempo
    if (this.sweepDepth > 0) this.sweep.setRate(1 / (beat * this.sweepDiv)); // one sweep every sweepDiv beats, at the heard tempo
    if (this.pumpOn) {
      const hits = deck.stemNotes?.drums ?? [];
      const kicks = hits.length ? this.notes(deck, hits as unknown as Note[], from, to).filter((h) => (h[2] ?? 0) === 0).map((h) => h[0]) : this.steps(deck, 1, from, to).map((x) => x.t);
      for (const kt of kicks) {
        const at = songToCtx(deck, kt), g = this.pumpGain.gain;
        g.setValueAtTime(1, Math.max(deck.ctx.currentTime, at - 0.002));
        g.linearRampToValueAtTime(0.3, at + 0.008);
        g.setTargetAtTime(1, at + 0.01, beat * 0.18);
      }
    }
    if (this.mode === "arp") {
      for (const { t, k } of this.steps(deck, this.shape === "gate" ? 0.25 : this.rate, from, to)) {
        const c = this.chord(deck, t), at = songToCtx(deck, t);
        if (this.shape === "gate") { if (GATE[step16(k)]) { this.player().chord(c, at, beat * 0.2, step16(k) % 4 === 0 ? 0.95 : 0.7, "pluck"); this.hit(at); } continue; }
        const h = humanize(k, 0, this.human);
        this.player().note(this.arpNote(c, k), at + Math.max(0, h.dt), beat * this.rate * this.gateLen, (k % 4 === 0 ? 1 : 0.75) * h.vel, "pluck");
        this.hit(at);
      }
    } else if (this.mode === "stab") {
      for (const { t, k } of this.steps(deck, 0.5, from, to))
        if (k % 2 !== 0) { const h = humanize(k, 1, this.human), at = songToCtx(deck, t) + Math.max(0, h.dt); this.player().chord(this.voiced(deck, t).map((m) => m + 12), at, beat * 0.4, 0.9 * h.vel, "stab", 0.006); this.hit(at); } // offbeats
    } else if (this.mode === "comp") {
      // COMP: an accompaniment rhythm, its hits voiced from the chord (full, upper notes, or the bass), strummed up or down
      for (const { t, k } of this.steps(deck, 0.25, from, to)) {
        const hit = compHit(this.comp, k);
        if (!hit) continue;
        const h = humanize(k, 2, this.human), at = songToCtx(deck, t) + Math.max(0, h.dt);
        const notes = voiceFor(this.voiced(deck, t), hit.voicing);
        this.player().chord(notes, at, (hit.len * beat) / 4, hit.vel * h.vel, hit.len >= 4 ? "pad" : "pluck", 0.012, hit.dir);
        this.hit(at);
      }
    } else if (this.mode === "replay") {
      const rate = Math.max(0.25, deck.playbackRate);
      const key = deck.stemNotes;
      let data = key ? this.replayCache.get(key) : undefined;
      if (!data) { data = this.replayData(deck); if (key) this.replayCache.set(key, data); }
      const { notes, hits } = data;
      if (this.replayStyle === "notes") {
        for (let k = lowerBound(notes, from); k < notes.length && notes[k][0] < to; k++) {
          const [start, end, midi, vel] = notes[k];
          const at = songToCtx(deck, start);
          this.player().note(midi + heardShift(deck), at, Math.max(0.08, (end - start) / rate), Math.min(1, (0.3 + 0.7 * this.dyn(deck, start)) * (0.75 + 0.25 * vel)), end - start > 0.6 ? "pad" : "pluck");
          this.hit(at);
        }
      } else {
        let k = 0;
        for (let hi = hits.length; k < hi; ) { const mid = (k + hi) >> 1; if (hits[mid].t < from) k = mid + 1; else hi = mid; } // first hit at or after from
        while (k < hits.length && hits[k].t < to) {
          const hit = hits[k];
          const at = songToCtx(deck, hit.t);
          this.player().chord(this.voiced(deck, hit.t), at, Math.max(0.08, hit.dur / rate), Math.min(1, (0.3 + 0.7 * this.dyn(deck, hit.t)) * (0.8 + 0.2 * hit.vel)), hit.dur > 0.6 ? "pad" : "pluck", 0.006);
          this.hit(at);
          k++;
        }
      }
    } else {
      for (const { t, k } of this.steps(deck, 1, from, to)) {
        const key = this.chord(deck, t).join();
        if (k % 4 === 0 || key !== this.lastPad) { this.lastPad = key; const at = songToCtx(deck, t); this.player().chord(this.voiced(deck, t), at, beat * 4, 0.8, "pad", 0.025); this.hit(at); }
      }
    }
  }
}

// ---------------- BEAT LAB ----------------
export type HatMode = "off" | "8" | "16";
export type SeqRow = "kick" | "snare" | "clap" | "hat" | "open" | "tom" | "perc";
export const SEQ_ROWS: SeqRow[] = ["kick", "snare", "clap", "hat", "open", "tom", "perc"];
export const SEQ_PRESETS: Record<"four" | "house" | "break" | "trap" | "techno" | "disco" | "funk" | "boombap" | "garage" | "dnb" | "reggaeton" | "dubstep" | "electro" | "rock" | "bossa" | "clear", Record<SeqRow, number[]>> = {
  four: { kick: [0, 4, 8, 12], snare: [], clap: [], hat: [], open: [], tom: [], perc: [2, 6, 10, 14] },
  house: { kick: [0, 4, 8, 12], snare: [], clap: [4, 12], hat: [0, 4, 8, 12], open: [2, 6, 10, 14], tom: [], perc: [3, 7, 11, 15] },
  break: { kick: [0, 7, 10], snare: [4, 12], clap: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [15], tom: [14, 15], perc: [] },
  trap: { kick: [0, 11], snare: [], clap: [8], hat: [0, 2, 4, 5, 6, 8, 10, 12, 13, 14, 15], open: [], tom: [], perc: [6, 14] },
  techno: { kick: [0, 4, 8, 12], snare: [], clap: [4, 12], hat: [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15], open: [2, 6, 10, 14], tom: [], perc: [7, 15] },
  disco: { kick: [0, 4, 8, 12], snare: [4, 12], clap: [], hat: [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15], open: [2, 6, 10, 14], tom: [], perc: [] },
  funk: { kick: [0, 3, 7, 10], snare: [4, 12], clap: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [15], tom: [], perc: [] },
  boombap: { kick: [0, 3, 10], snare: [4, 12], clap: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [], tom: [], perc: [14] },
  garage: { kick: [0, 9], snare: [4, 12], clap: [], hat: [2, 6, 10, 14], open: [], tom: [], perc: [3, 11] },
  dnb: { kick: [0, 10], snare: [4, 12], clap: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [], tom: [], perc: [] },
  reggaeton: { kick: [0, 4, 8, 12], snare: [3, 6, 11, 14], clap: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [], tom: [], perc: [] },
  dubstep: { kick: [0, 7], snare: [8], clap: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [], tom: [14, 15], perc: [] },
  electro: { kick: [0, 6, 10], snare: [], clap: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [], tom: [], perc: [2, 7, 10, 15] },
  rock: { kick: [0, 8, 10], snare: [4, 12], clap: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [], tom: [14, 15], perc: [] },
  bossa: { kick: [0, 3, 8, 11], snare: [], clap: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [], tom: [], perc: [0, 3, 6, 10, 12] },
  clear: { kick: [], snare: [], clap: [], hat: [], open: [], tom: [], perc: [] },
};
export class BeatLab extends JamModule {
  protected softCutoff = 7000; // the hats and cymbals keep their air with DOUCE
  readonly kit: DrumKit;
  readonly sampledKit: SampledKit;
  replay = false; // REPRISE: every drum hit of the song replayed on the chosen kit (on with REMPLACER) // a real drum machine, played instead of the synthetic kit once loaded
  kitSound = ""; // "" = the synthetic kit, else a drum machine id
  kick = 0; // 0..1 layer on the song's kicks
  clap = 0; // on its snares
  hats: HatMode = "off";
  hatLevel = 0.7;
  swing = 0; // 0..0.5 of a 16th, on the off 16ths
  // the 16-step sequencer: its own kit pattern over the song, on the grid of the bar
  seq = false;
  pattern: Record<SeqRow, boolean[]> = { kick: Array(16).fill(false), snare: Array(16).fill(false), clap: Array(16).fill(false), hat: Array(16).fill(false), open: Array(16).fill(false), tom: Array(16).fill(false), perc: Array(16).fill(false) };
  seqLevel = 0.8;
  constructor(engine: DJEngine) {
    super(engine, "drums");
    this.kit = new DrumKit(engine.ctx);
    this.kit.out.connect(this.bus);
    this.sampledKit = new SampledKit(engine.ctx);
    this.sampledKit.out.connect(this.bus);
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
  protected keep() { return ["hatLevel", "swing", "seqLevel", "pattern", "kitSound"]; }
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
    this.drum("kick", at, 1, this.kickHz(d));
    this.drum("clap", at, 0.8);
    this.drum("open", at, 0.9);
    this.hit(at);
  }
  // the kick sings the key's root, between E1 and D#2 (41 to 78 Hz)
  private kickHz(deck: Deck): number { const r = jamScale(deck).root; return 440 * Math.pow(2, (28 + ((r - 4 + 12) % 12) - 69) / 12); }
  private tick(deck: Deck, from: number, to: number) {
    if ((!this.replay && this.kick <= 0 && this.clap <= 0 && this.hats === "off" && !this.seq) || deck !== this.deck() || this.stem(deck) < 0) return;
    this.route(deck);
    const hz = this.kickHz(deck);
    if (this.seq) {
      const sixteenth = spb(deck) * 0.25;
      for (const { t, k } of this.steps(deck, 0.25, from, to)) {
        const i = step16(k), acc = i % 4 === 0 ? 1 : 0.8, v = this.seqLevel * acc;
        const at = songToCtx(deck, t) + (k % 2 !== 0 ? this.swing * sixteenth : 0);
        let any = false;
        for (const row of SEQ_ROWS) {
          if (this.pattern[row][i]) {
            switch (row) {
              case "kick":
                this.drum("kick", at, v, hz);
                break;
              case "snare":
                this.drum("snare", at, v);
                break;
              case "clap":
                this.drum("clap", at, v);
                break;
              case "hat":
                this.drum("hat", at, v * 0.8);
                break;
              case "open":
                this.drum("open", at, v * 0.8);
                break;
              case "tom":
                this.drum("tom", at, v * 0.9);
                break;
              case "perc":
                this.drum("perc", at, v * 0.8);
                break;
            }
            any = true;
          }
        }
        if (any) this.hit(at);
      }
    }
    if (this.replay || this.kick > 0 || this.clap > 0) {
      const hits = deck.stemNotes?.drums ?? [];
      for (let k = lowerBound(hits, from); k < hits.length && hits[k][0] < to; k++) {
        const [t, v, c] = hits[k];
        const at = songToCtx(deck, t);
        if (this.replay) { // each hit on its own sound, at its strength; no KICK+ / CLAP+ on top (they would double it)
          if (c === 0) this.drum("kick", at, Math.min(1, 0.25 + 0.75 * this.dyn(deck, t)), hz);
          else if (c === 1) this.drum("snare", at, Math.min(1, 0.25 + 0.75 * this.dyn(deck, t)));
          else if (c === 2) this.drum("hat", at, Math.min(1, 0.2 + 0.6 * this.dyn(deck, t)));
          this.hit(at);
        } else if (c === 0 && this.kick > 0) { this.drum("kick", at, Math.min(1, (0.6 + v) * this.kick), hz); this.hit(at); }
        else if (c === 1 && this.clap > 0) { this.drum("clap", at, Math.min(1, (0.6 + v) * this.clap)); this.hit(at); }
      }
    }
    if (this.hats !== "off") {
      const div = this.hats === "8" ? 0.5 : 0.25, sixteenth = spb(deck) * 0.25;
      for (const { t, k } of this.steps(deck, div, from, to)) {
        const at = songToCtx(deck, t);
        if (this.hats === "8") { if (k % 2 !== 0) { this.drum("open", at, this.hatLevel); this.hit(at); } continue; } // open hat on the offbeat
        const swung = k % 2 !== 0 ? this.swing * sixteenth : 0;
        this.drum("hat", at + swung, this.hatLevel * (k % 4 === 2 ? 1 : 0.6));
        this.hit(at + swung);
      }
    }
  }
  protected onSwap(on: boolean): void { this.replay = on; }
  setKitSound(id: string): void {
    this.kitSound = id;
    if (id !== "") {
      void this.sampledKit.load(id).then(() => jamChanged());
    }
    jamChanged();
  }
  kitStatus(): string | null {
    if (this.kitSound === "") return null;
    const kit = drumKit(this.kitSound);
    if (!kit) return null;
    if (this.sampledKit.failed && this.sampledKit.current === this.kitSound) {
      return `${kit.label} indisponible : la batterie de synthèse joue à sa place`;
    }
    if (this.sampledKit.ready() && this.sampledKit.current === this.kitSound) {
      return `${kit.label} prête`;
    }
    if (this.sampledKit.current === this.kitSound) {
      return `Chargement : ${kit.label}`;
    }
    return `${kit.label} : se charge au premier coup`;
  }
  restore(o: Record<string, unknown> | undefined): void {
    super.restore(o);
    for (const row of SEQ_ROWS) {
      if (!this.pattern[row]) {
        this.pattern[row] = Array(16).fill(false);
      } else {
        this.pattern[row] = this.pattern[row].map(step => !!step).concat(Array(16).fill(false)).slice(0, 16);
      }
    }
  }
  private drum(part: "kick" | "snare" | "clap" | "hat" | "open" | "tom" | "rim" | "perc" | "cymbal", at: number, v: number, hz = 50): void {
    if (this.kitSound && this.sampledKit.current !== this.kitSound) {
      void this.sampledKit.load(this.kitSound).then(() => jamChanged());
    }
    if (this.kitSound && this.sampledKit.ready() && this.sampledKit.current === this.kitSound) {
      if (this.sampledKit.has(part)) {
        this.sampledKit.play(part, at, v);
      } else {
        switch (part) {
          case "snare":
            this.sampledKit.play("clap", at, v);
            break;
          case "rim":
            this.sampledKit.play("snare", at, v);
            break;
        }
      }
    } else {
      switch (part) {
        case "kick":
          this.kit.kick(at, v, hz);
          break;
        case "clap":
          this.kit.clap(at, v);
          break;
        case "snare":
        case "rim":
          this.kit.clap(at, v * 0.9);
          break;
        case "hat":
          this.kit.hat(at, v, false);
          break;
        case "open":
          this.kit.hat(at, v, true);
          break;
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
      four.bass.setLineLevel(four.bass.lineLevel); four.bass.setLineTone(four.bass.lineTone); four.bass.setLineEnv(four.bass.lineEnv);
      four.synth.setEcho(four.synth.echo); four.synth.setWidth(four.synth.width);
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
