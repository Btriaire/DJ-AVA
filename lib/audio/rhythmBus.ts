import type { Deck } from "./Deck";
import type { DJEngine } from "./engine";
import type { DrumVoice } from "./DrumMachine";
import { RACK_DEF, type RackModuleId } from "./Rack";
import type { StemNotes } from "../stemNotes";

// The detected rhythm of a song (drum attacks, bass notes, synth notes) as a source of events. They are never
// played themselves: each one is sent, a little ahead of time, to the modules the user connected to it.
export type RhythmSource = "drums" | "bass" | "synth";
export type RouteKind = "synth" | "drum" | "rack";
export interface RhythmRoute {
  id: string;
  source: RhythmSource;
  kind: RouteKind; // synth: the DJ synth plays a note in harmony; drum: a drum voice; rack: a pulse on a rack parameter
  arg?: string; // drum: the voice; rack: "moduleId:paramKey"
  amount: number; // 0..1
  on: boolean;
}
interface Ev { t: number; source: RhythmSource; vel: number; dur: number; midi?: number }

const LOOKAHEAD = 0.3;
const TICK_MS = 50;
const PULSE_SEC = 0.14;

export function buildEvents(n: StemNotes | null | undefined): Ev[] {
  if (!n) return [];
  const out: Ev[] = [];
  n.drums?.forEach(([t, v]) => out.push({ t, source: "drums", vel: v, dur: 0.08 }));
  n.bass?.forEach(([s, e, m, v]) => out.push({ t: s, source: "bass", vel: v, dur: Math.max(0.05, e - s), midi: m }));
  n.other?.forEach(([s, e, m, v]) => out.push({ t: s, source: "synth", vel: v, dur: Math.max(0.05, e - s), midi: m }));
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

  notes: StemNotes | null = null; // the notes the events come from (identity check: a new track must reload)
  private pulses = new Map<string, number>(); // rack pulse generation per parameter, so a later hit is not cut short by an earlier reset

  load(n: StemNotes | null | undefined) {
    this.notes = n ?? null;
    this.events = buildEvents(n);
    this.hash = this.deck.stemHash;
    this.until = 0;
  }

  get ready(): boolean { return this.events.length > 0; }

  start() {
    this.stop();
    if (!this.ready) return;
    this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.wasPlaying = false;
  }

  private pump() {
    const d = this.deck;
    if (d.stemHash !== this.hash) { this.stop(); return; } // another track: the owner loads its notes again
    const live = this.routes.filter((r) => r.on);
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
        for (const r of live) if (r.source === e.source) this.fire(r, e, at, e.dur / rate);
      }
      tAudio += (pEnd - p) / rate;
      p = loop && pEnd >= loop[1] ? loop[0] : pEnd;
    }
    this.until = end;
  }

  private fire(r: RhythmRoute, e: Ev, at: number, dur: number) {
    const vel = Math.min(1, e.vel * r.amount * 1.4);
    if (vel < 0.05) return;
    const eng = this.engine;
    if (r.kind === "synth") {
      // the notes of the song keep their pitch; a drum hit plays the root of the moment, an octave up, so it stays in key
      const shift = this.deck.keyLock ? this.deck.keyShift : 12 * Math.log2(this.deck.playRate);
      const midi = (e.midi ?? this.bassMidi + 12) + shift;
      eng.djSynth.noteOn(midi, vel, at, Math.max(0.06, dur));
    } else if (r.kind === "drum" && r.arg) {
      eng.drums.hit(r.arg as DrumVoice, vel, at);
    } else if (r.kind === "rack" && r.arg) {
      const [id, key] = r.arg.split(":");
      const def = RACK_DEF.get(id as RackModuleId)?.params.find((p) => p.key === key);
      if (!def) return;
      const rack = this.deck.rack;
      const peak = def.def + (def.max - def.def) * Math.min(1, r.amount * e.vel * 1.4);
      // a pulse: the parameter jumps with the hit and falls back to its default (setParam is immediate, so it waits for the hit)
      const gen = (this.pulses.get(r.arg) ?? 0) + 1;
      this.pulses.set(r.arg, gen);
      setTimeout(() => rack.setParam(id as RackModuleId, key, peak), Math.max(0, (at - eng.ctx.currentTime) * 1000));
      setTimeout(() => { if (this.pulses.get(r.arg!) === gen) rack.setParam(id as RackModuleId, key, def.def); }, Math.max(0, (at - eng.ctx.currentTime + PULSE_SEC) * 1000));
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
