import type { Deck } from "./Deck";
import type { DJEngine } from "./engine";
import type { DrumVoice } from "./DrumMachine";
import type { DjKnobs } from "./DjSynth";
import type { SfxId } from "./SoundFX";
import { RACK_DEF, type RackModuleId } from "./Rack";
import type { StemNotes } from "../stemNotes";
import { voiceStateAt } from "../djForce";
import { SCALES } from "./theory";
import { applyAny, getModulePreset, snapshotAny, type ModulePreset, type PresetModuleId } from "../modulePresets";
import { jitterMs, nextGridTime, patternAllows, quantizeTime, snapToScale } from "./rhythmMath";

// The detected rhythm of a song (drum attacks, bass notes, synth notes) as a source of events. They are never
// played themselves: each one is sent, a little ahead of time, to the modules the user connected to it.
export type RhythmSource = "drums" | "bass" | "synth" | "beat" | "bar" | "voice" | "kick" | "snare" | "hat";
export type RouteKind = "synth" | "drum" | "rack" | "synth2" | "sampler" | "pad" | "seqrec" | "filter" | "duck" | "sfx" | "djknob" | "keypad" | "keyfx" | "plugin" | "voices" | "rackpreset";
export interface RhythmRoute {
  id: string;
  source: RhythmSource;
  kind: RouteKind; // plugin: a plug-in instrument by id ("dx7"), played with the detected notes; keypad: a key of the DJ keyboard ("0".."15"); keyfx: "impact" | "brake" | "scratch" | "drop"; filter: "self:lp" | "self:hp" | "other:lp" | "other:hp" (a pulse on a deck filter); duck: "self" | "other" (the fader dips: pumping); sfx: a sound-effect id; djknob: a DJ synth knob pulse; synth2: the classic synth; sampler: the super sampler (arg unused); pad: a sampler pad ("0".."n"); seqrec: writes the notes into the synth step sequencer when it is armed; synth: the DJ synth plays a note in harmony; drum: a drum voice; rack: a pulse on a rack parameter
  arg?: string; // rackpreset: "moduleId:presetName"; drum: the voice; rack: "moduleId:paramKey"
  amount: number;
  level?: number; // Vol: gain 0..4 (-inf..+12 dB), 1 = unity // 0..1
  grid?: number; // snap each event to the beat grid: 1 = beat, 2 = eighth, 4 = sixteenth (off when absent)
  transpose?: number; // semitones added to the notes (synth, sampler, sequencer targets)
  gate?: number; // note length factor (1 = as detected)
  swing?: number; // 0..0.6: the odd lines of the grid come late by swing x a step
  humanize?: number; // ms of steady pseudo-random shift
  nudge?: number; // ms, fixed shift
  pattern?: string; // 'x' and '.' per grid step: only the 'x' steps play (needs a grid)
  avoidVoice?: boolean; // silent while the voice sings
  snapKey?: boolean; // note targets: the note goes to the nearest note of the DJ synth key
  accent?: boolean; // louder on the first beat of a bar, softer elsewhere
  alt?: string; // rackpreset: name of a second preset of the same module; the hits alternate between arg's preset and this one
  hold?: boolean; // rackpreset: the preset stays until the link is turned off (otherwise it goes back after `len` beats)
  len?: number; // rackpreset: beats before the module goes back (default 1)
  density?: number; // 0..1: share of the events kept (steady: the same events are always dropped)
  on: boolean;
}
interface Ev { t: number; source: RhythmSource; vel: number; dur: number; midi?: number }

const LOOKAHEAD = 0.3;
const TICK_MS = 50;
const PULSE_SEC = 0.14;

export function buildEvents(n: StemNotes | null | undefined, d?: Deck): Ev[] {
  const out: Ev[] = [];
  n?.drums?.forEach(([t, v, c]) => {
    out.push({ t, source: "drums", vel: v, dur: 0.08 });
    // from rev 2 each hit has a class; "drums" stays the whole kit
    if (c !== undefined) out.push({ t, source: c === 0 ? "kick" : c === 1 ? "snare" : "hat", vel: v, dur: 0.08 });
  });
  n?.bass?.forEach(([s, e, m, v]) => out.push({ t: s, source: "bass", vel: v, dur: Math.max(0.05, e - s), midi: m }));
  n?.other?.forEach(([s, e, m, v]) => out.push({ t: s, source: "synth", vel: v, dur: Math.max(0.05, e - s), midi: m }));
  if (d && d.bpm > 0 && d.duration > 0) {
    // the beat grid of the track: every beat, and the first beat of each bar (four beats)
    const spb = 60 / d.bpm;
    const off = d.beatGridOffset % spb;
    for (let k = 0, t = off; t < d.duration; k++, t = off + k * spb) {
      out.push({ t, source: "beat", vel: 0.7, dur: spb * 0.5 });
      if (k % 4 === 0) out.push({ t, source: "bar", vel: 1, dur: spb * 2 });
    }
  }
  const v = d?.stemMap?.voice;
  const step = d?.stemMap?.voiceStep;
  if (v && step) {
    // the start of each sung note: the contour goes from silence (-1) or another pitch to a new one
    for (let i = 0, last = -1; i < v.length; i++) {
      const m = v[i] >= 0 ? Math.round(v[i]) : -1;
      if (m >= 0 && m !== last) {
        // the note lasts as long as the voice holds that pitch (at least 0.25 s, so it can be heard)
        let j = i + 1;
        while (j < v.length && v[j] >= 0 && Math.round(v[j]) === m) j++;
        // the median of the contour over the note, in fractional semitones: the pads sit on the singer's real tuning, not on the nearest note
        const run = Array.from(v.slice(i, j)).sort((a, b) => a - b);
        out.push({ t: i * step, source: "voice", vel: 1, dur: Math.max(0.25, (j - i) * step), midi: run[run.length >> 1] });
      }
      last = m;
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export class RhythmBus {
  routes: RhythmRoute[] = [];
  private events: Ev[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private until = 0;
  private lastNow = 0;
  private lastPos = 0;
  private wasPlaying = false;
  private hash = "";
  private bassMidi = 36; // the last bass note heard: the root the drums borrow when they play the synth

  constructor(private engine: DJEngine, readonly deck: Deck) {}

  readonly lastFire = new Map<string, number>(); // route id -> performance.now() of its last event, for the activity light
  bpm = 0; // tempo the beat events were built with
  notes: StemNotes | null = null; // the notes the events come from (identity check: a new track must reload)
  private pulses = new Map<string, number>(); // rack pulse generation per parameter, so a later hit is not cut short by an earlier reset

  load(n: StemNotes | null | undefined) {
    this.notes = n ?? null;
    this.events = buildEvents(n, this.deck);
    this.bpm = this.deck.bpm;
    this.hash = this.deck.stemHash;
    this.until = 0;
  }

  enabled = true; // master switch for all the links of this deck
  get ready(): boolean { return this.events.length > 0; }
  // the events no longer match the deck: another track, notes that arrived, a tempo that was found
  get stale(): boolean { return this.notes !== this.deck.stemNotes || this.bpm !== this.deck.bpm || this.hash !== this.deck.stemHash; }

  start() {
    if (this.timer) return; // already running: the routes and events are read live, a restart would fire the last 0.3 s twice
    if (!this.ready) return;
    this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.wasPlaying = false;
    for (const k of [...this.held.keys()]) this.release(k);
  }

  private pump() {
    const d = this.deck;
    if (d.stemHash !== this.hash) { this.stop(); return; } // another track: the owner loads its notes again
    const live = this.enabled ? this.routes.filter((r) => r.on) : [];
    for (const [k, h] of this.held) if (!live.some((r) => r.id === h.route)) this.release(k); // a held preset goes back when its link is off
    const now = this.engine.ctx.currentTime;
    if (!d.playing || !live.length) { this.wasPlaying = false; return; }
    const pos = d.position();
    const rate = d.playRate;
    const loop = d.loopRange;
    if (this.wasPlaying && Math.abs(this.predict(this.lastPos, this.lastNow, now, rate, loop) - pos) > 0.04) this.until = now; // seek or loop jump
    if (!this.wasPlaying) this.until = now;
    this.wasPlaying = true;
    this.lastNow = now;
    this.lastPos = pos;
    const end = now + LOOKAHEAD;
    let tAudio = Math.max(this.until, now);
    let p = this.predict(pos, now, tAudio, rate, loop);
    for (let guard = 0; tAudio < end - 1e-4 && guard < 16; guard++) {
      let pEnd = p + (end - tAudio) * rate;
      if (loop && pEnd > loop[1]) pEnd = loop[1];
      for (let i = this.firstAtOrAfter(p); i < this.events.length && this.events[i].t < pEnd; i++) {
        const e = this.events[i];
        const at = tAudio + (e.t - p) / rate;
        if (e.source === "bass" && e.midi !== undefined) this.bassMidi = e.midi;
        for (const r of live) {
          if (r.source !== e.source) continue;
          if (r.density !== undefined && r.density < 1 && (e.t * 7.31) % 1 > r.density) continue;
          if (r.avoidVoice && voiceStateAt(this.deck.stemMap, e.t) === "sung") continue;
          if (r.grid && r.pattern && this.deck.bpm > 0 && !patternAllows(r.pattern, e.t, this.deck.beatGridOffset, 60 / this.deck.bpm / r.grid)) continue;
          this.fire(r, e, this.snap(r, e, at, rate), (e.dur * (r.gate ?? 1)) / rate);
        }
      }
      tAudio += (pEnd - p) / rate;
      p = loop && pEnd >= loop[1] ? loop[0] : pEnd;
    }
    this.until = end;
  }

  // the event moves to the nearest line of the beat grid; if that is already past, to the next one
  private other(): Deck { return this.deck === this.engine.deckA ? this.engine.deckB : this.engine.deckA; }

  private snap(r: RhythmRoute, e: Ev, at: number, rate: number): number {
    const d = this.deck;
    const now = this.engine.ctx.currentTime;
    let a = at;
    if (r.grid && d.bpm) {
      const step = 60 / d.bpm / r.grid;
      const sw = r.grid >= 2 ? r.swing ?? 0 : 0;
      a = at + (quantizeTime(e.t, d.beatGridOffset, step, sw) - e.t) / rate;
      if (a < now) a = at + (nextGridTime(e.t, d.beatGridOffset, step, sw) - e.t) / rate;
    }
    const ms = (r.nudge ?? 0) + (r.humanize ? jitterMs(e.t, r.humanize) : 0);
    return Math.max(now, a + Math.max(-60, Math.min(60 + 30, ms)) / 1000);
  }

  // the note a target plays: the song's note (or the bass root for a drum hit), moved with the deck's key, transposed, then put in key if asked
  private noteFor(r: RhythmRoute, e: Ev): number {
    const d = this.deck;
    const shift = d.keyLock ? d.keyShift : 12 * Math.log2(d.playRate);
    const raw = (e.midi ?? this.bassMidi + 12) + shift + (r.transpose ?? 0);
    // the pads follow the song's pitch to the cent (a tempo change bends it by a fraction of a semitone)
    // detected notes sit on the A440 grid; the pads add the song's own tuning, the sung contour already has it
    const tune = r.kind === "voices" && e.source !== "voice" ? (d.stemNotes?.tuning ?? 0) : 0;
    let m = r.kind === "voices" && !r.snapKey ? raw + tune : Math.round(raw);
    if (r.snapKey) {
      const js = this.engine.djSynth;
      m = snapToScale(m, js.root, SCALES.find((x) => x.id === js.scale)?.steps ?? []);
    }
    return m;
  }

  private beatRel(k: number): number { return Math.max(0.18, Math.min(0.7, (this.deck.bpm > 0 ? 60 / this.deck.bpm : 0.5) * k)); }
  private bases = new Map<string, number>();
  private flips = new Map<string, boolean>(); // rackpreset links that alternate: which preset comes next
  // rack module presets in force: the module as it was before the first hit, and the link that holds it
  private held = new Map<string, { id: PresetModuleId; base: ModulePreset; route: string; gen: number }>();
  private release(key: string) {
    const h = this.held.get(key);
    if (!h) return;
    this.held.delete(key);
    applyAny(this.engine, this.deck.rack, h.id, h.base, 200);
  }
  private presetHit(r: RhythmRoute, id: PresetModuleId, p: ModulePreset, at: number) {
    const key = `m${id}`;
    const beat = this.deck.bpm > 0 ? 60 / this.deck.bpm : 0.5;
    setTimeout(() => {
      let h = this.held.get(key);
      if (!h) { h = { id, base: snapshotAny(this.engine, this.deck.rack, id), route: r.id, gen: 0 }; this.held.set(key, h); }
      h.route = r.id;
      const gen = ++h.gen;
      applyAny(this.engine, this.deck.rack, id, p, 80);
      if (!r.hold) setTimeout(() => { if (this.held.get(key)?.gen === gen) this.release(key); }, (r.len ?? 1) * beat * 1000);
    }, Math.max(0, (at - this.engine.ctx.currentTime) * 1000));
  }
  // a parameter pulse: jumps to `peak` at the hit, then eases back to where it was (the value before the first pulse
  // of a burst, so overlapping pulses never leave it displaced)
  private pulse(key: string, get: () => number, set: (v: number) => void, peakOf: (base: number) => number, at: number, rel: number) {
    const gen = (this.pulses.get(key) ?? 0) + 1;
    this.pulses.set(key, gen);
    setTimeout(() => {
      if (this.pulses.get(key) !== gen) return;
      const base = this.bases.get(key) ?? get();
      this.bases.set(key, base);
      const peak = peakOf(base);
      set(peak);
      const t0 = performance.now();
      const step = () => {
        if (this.pulses.get(key) !== gen) return;
        const x = (performance.now() - t0) / (rel * 1000);
        if (x >= 1) { set(base); this.bases.delete(key); return; }
        set(base + (peak - base) * (1 - x) ** 2);
        setTimeout(step, 16);
      };
      setTimeout(step, 16);
    }, Math.max(0, (at - this.engine.ctx.currentTime) * 1000));
  }

  private fire(r: RhythmRoute, e: Ev, at: number, dur: number) {
    let acc = 1;
    if (r.accent && this.deck.bpm > 0) {
      const spb = 60 / this.deck.bpm;
      acc = Math.round((e.t - this.deck.beatGridOffset) / spb) % 4 === 0 ? 1.3 : 0.75;
    }
    const amt = r.amount * (r.level ?? 1); // Force x Vol: the strength of the link and its loudness
    const loud = e.vel * amt * 2.4 * acc; // pads can go past 1; notes are velocities, capped
    const vel = Math.min(1, loud);
    if (vel >= 0.05) this.lastFire.set(r.id, performance.now());
    if (vel < 0.05) return;
    const eng = this.engine;
    if (r.kind === "synth") {
      // the notes of the song keep their pitch; a drum hit plays the root of the moment, an octave up, so it stays in key
      const midi = this.noteFor(r, e);
      eng.djSynth.noteOn(midi, vel, at, Math.max(0.06, dur));
    } else if (r.kind === "synth2" || r.kind === "sampler" || r.kind === "seqrec") {
      const midi = this.noteFor(r, e);
      const wait = Math.max(0, (at - eng.ctx.currentTime) * 1000);
      if (r.kind === "synth2") {
        eng.synth.noteOn(midi, vel, at); // starts on the audio clock; only the release rides on a timer
        setTimeout(() => eng.synth.noteOff(midi), wait + Math.max(60, dur * 1000));
      } else if (r.kind === "sampler") eng.superSampler.playStep(midi, Math.max(0.06, dur), at, vel);
      else setTimeout(() => eng.synthSeq.recordNote(midi), wait);
    } else if (r.kind === "duck") {
      const d = r.arg === "other" ? this.other() : this.deck;
      const beat = this.deck.bpm > 0 ? 60 / this.deck.bpm : 0.5;
      // a real pump: deep, and as long as half a beat so the recovery is heard
      d.duckAt(at, Math.min(0.95, 0.3 + amt * e.vel * 0.8), Math.max(0.15, Math.min(0.5, beat * 0.55)));
    } else if (r.kind === "filter" && r.arg) {
      const [who, kind] = r.arg.split(":");
      const d = who === "other" ? this.other() : this.deck;
      const mag = Math.min(1, 0.35 + amt * e.vel * 0.9);
      this.pulse(`f${who}${r.id}`, () => d.filterX, (v) => d.setFilter(v), () => (kind === "lp" ? -mag : mag), at, this.beatRel(0.9));
    } else if (r.kind === "sfx" && r.arg) {
      setTimeout(() => eng.soundFx.trigger(r.arg as SfxId, Math.min(1.5, 0.25 + amt * e.vel * 1.2)), Math.max(0, (at - eng.ctx.currentTime) * 1000));
    } else if (r.kind === "djknob" && r.arg) {
      const k = r.arg as keyof DjKnobs;
      this.pulse(`k${r.id}`, () => eng.djSynth.knobs[k], (v) => eng.djSynth.setKnob(k, v), (base) => Math.min(1, base + 0.25 + amt * e.vel * 0.75), at, this.beatRel(1.2));
    } else if (r.kind === "voices") {
      const style = r.arg === "strings" || r.arg === "dream" ? r.arg : "choir";
      eng.padVoices.play(style, this.noteFor(r, e), Math.min(4, loud), at, dur);
    } else if (r.kind === "plugin" && r.arg) {
      const midi = this.noteFor(r, e);
      setTimeout(() => eng.plugins.get(r.arg!)?.play(midi, vel, Math.max(0.08, dur)), Math.max(0, (at - eng.ctx.currentTime) * 1000));
    } else if (r.kind === "keypad" && r.arg) {
      const i = Number(r.arg);
      const wait = Math.max(0, (at - eng.ctx.currentTime) * 1000);
      const lv = Math.min(1.5, 0.25 + amt * e.vel * 1.2);
      setTimeout(() => { eng.keyPad.levelFor(lv, dur + 0.6); eng.keyPad.trigger(i); }, wait);
      setTimeout(() => eng.keyPad.release(i), wait + Math.max(80, dur * 1000));
    } else if (r.kind === "keyfx" && r.arg) {
      const wait = Math.max(0, (at - eng.ctx.currentTime) * 1000);
      const lv = Math.min(1.5, 0.25 + amt * e.vel * 1.2);
      setTimeout(() => eng.keyPad.levelFor(lv, 1.2), wait);
      if (r.arg === "impact") eng.keyPad.impact(at);
      else if (r.arg === "brake") setTimeout(() => eng.keyPad.brake(1), wait);
      else if (r.arg === "scratch") setTimeout(() => eng.keyPad.scratch(), wait);
      else if (r.arg === "drop") setTimeout(() => eng.keyPad.dropHQ(), wait);
    } else if (r.kind === "pad" && r.arg) {
      eng.sampler.playAt(Number(r.arg), at, vel);
    } else if (r.kind === "drum" && r.arg) {
      eng.drums.hit(r.arg as DrumVoice, vel, at);
    } else if (r.kind === "rackpreset" && r.arg) {
      const i = r.arg.indexOf(":");
      const id = r.arg.slice(0, i);
      const p = getModulePreset(id, r.arg.slice(i + 1));
      const b = p && r.alt ? getModulePreset(id, r.alt) : undefined;
      const flip = this.flips.get(r.id) ?? false;
      if (b) this.flips.set(r.id, !flip);
      const pick = b && flip ? b : p;
      if (pick) this.presetHit(r, id as PresetModuleId, pick, at);
    } else if (r.kind === "rack" && r.arg) {
      const [id, key] = r.arg.split(":");
      const def = RACK_DEF.get(id as RackModuleId)?.params.find((p) => p.key === key);
      if (!def) return;
      const rack = this.deck.rack;
      this.pulse(`r${r.id}`, () => def.def, (v) => rack.setParam(id as RackModuleId, key, v), () => def.def + (def.max - def.def) * Math.min(1, 0.3 + amt * e.vel), at, this.beatRel(0.9));
    }
  }

  private predict(pos: number, now: number, t: number, rate: number, loop: [number, number] | null): number {
    let x = pos + (t - now) * rate;
    if (loop && x >= loop[1]) {
      const len = loop[1] - loop[0];
      if (len > 0) x = loop[0] + ((x - loop[0]) % len);
    }
    return x;
  }

  private firstAtOrAfter(t: number): number {
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.events[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
