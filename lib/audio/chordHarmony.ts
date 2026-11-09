import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { JamModule, jamChanged, type PadDef } from "./jamModules";
import { heardShift, jamScale, onJamTick, songToCtx, voiceLead, type ChordColor } from "./stemJam";
import { SampledInstrument } from "./sampledInstrument";
import { HARMONY_STYLES, chordLabel, chordNotes, darkNote, harmonyStep, strongestChords, type BarChord, type HarmonyOpts, type HarmonyStyleId } from "./chordHarmonyNotes";
export { HARMONY_STYLES };

type Note = [number, number, number, number];
export type HarmonyColor = ChordColor | "auto";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export class ChordHarmony extends JamModule {
  style: HarmonyStyleId | null = null;
  level = 0.8;
  color: HarmonyColor = "auto";
  shift = 0;
  changes = 1;
  private sampled: SampledInstrument;
  private outGain: GainNode;
  private upper: number[] | null = null;
  private lastTo = -1;
  private holdUntil = -1;
  private sounding = false;
  private songs = new WeakMap<Deck, { notes: unknown; bpm: number; grid: number; key: string; bars: BarChord[]; offset: number; unit: number }>();
  private leadBar = NaN;
  private leadNotes: number[] = [];

  constructor(engine: DJEngine) {
    super(engine, "other");
    this.outGain = new GainNode(engine.ctx, { gain: 0 });
    this.outGain.connect(this.bus);
    this.sampled = new SampledInstrument(engine.ctx);
    this.sampled.out.connect(this.outGain);
    this.gateModule("session");
    onJamTick(engine, (d, from, to) => { if (this.active) this.tick(d, from, to); });
    setInterval(() => this.watch(), 100);
  }

  setStyle(s: HarmonyStyleId | null): void {
    this.style = s;
    this.lastTo = -1;
    this.holdUntil = -1;
    this.leadBar = NaN;
    this.upper = null;
    if (s) {
      const instrument = HARMONY_STYLES.find((st) => st.id === s)?.instrument;
      if (instrument) {
        void this.sampled.load(instrument).then(() => jamChanged());
      }
    }
    this.applyGain();
    jamChanged();
  }

  setLevel(v: number): void {
    const clamped = Math.max(0, Math.min(1.5, v));
    this.level = clamped;
    this.applyGain();
  }

  setColor(c: HarmonyColor): void {
    this.color = c;
    this.upper = null;
    this.leadBar = NaN;
    jamChanged();
  }

  setShift(n: number): void {
    this.shift = ((Math.round(n) % 4) + 4) % 4;
    this.restart();
  }

  setChanges(n: number): void {
    this.changes = n === 2 ? 2 : 1;
    this.restart();
  }

  private restart(): void {
    this.lastTo = -1;
    this.holdUntil = -1;
    this.leadBar = NaN;
    this.upper = null;
    jamChanged();
  }

  private applyGain(): void {
    if (!this.sounding) return;
    const trim = HARMONY_STYLES.find((st) => st.id === this.style)?.trim ?? 1;
    this.outGain.gain.setTargetAtTime(this.level * trim, this.engine.ctx.currentTime, 0.05);
  }

  protected routeTarget(deck: Deck): AudioNode | null {
    return super.routeTarget(deck) ?? deck.crowdInput();
  }

  pads(): PadDef[] {
    return [];
  }

  loading(): string | null {
    if (!this.style) return null;
    const instrument = HARMONY_STYLES.find((s) => s.id === this.style)?.instrument;
    if (!instrument) return null;
    if (this.sampled.failed) return "Échantillons indisponibles";
    if (!this.sampled.ready()) return `Chargement ${this.sampled.done}/${this.sampled.total}`;
    return null;
  }

  warning(): string | null {
    if (!this.style) return null;
    const d = this.deck();
    if (!d) return null;
    if (d.bpm <= 0) return "Tempo inconnu : l'harmonie attend l'analyse du morceau.";
    if (!d.stemNotes) return "Notes du morceau pas encore analysées : l'harmonie reste sur la tonique. Prépare ses stems.";
    if (d.playing && this.barAt(d, this.barIndex(d, d.position())).rest) return "Pas d'harmonie dans le morceau ici : silence.";
    return null;
  }

  chordLine(): string[] {
    if (!this.style) return [];
    const d = this.deck();
    if (!d || !d.playing) return [];
    const s = jamScale(d);
    const flat = (s.minor ? [2, 7, 0, 5, 10, 3] : [5, 10, 3, 8, 1, 6]).includes(s.root);
    const lines: string[] = [];
    for (let i = 0; i < 4; i++) {
      const b = this.barAt(d, this.barIndex(d, d.position()) + i);
      lines.push(b.rest ? "–" : this.nameOf(b, flat));
    }
    return lines;
  }

  chordSpans(d: Deck, from: number, to: number): { start: number; end: number; notes: number[] }[] {
    if (to <= from) {
      return [];
    }
    const c = this.bars(d);
    const pcs = jamScale(d).pcs;
    const out = [];
    const startBar = this.barIndex(d, from);
    const endBar = this.barIndex(d, to - 1e-6);
    const maxBars = Math.min(endBar - startBar + 1, 64);

    for (let n = startBar; n <= endBar && n < startBar + maxBars; n++) {
      const b = this.barAt(d, n);
      if (b.rest) {
        continue;
      }
      const start = Math.max(from, c.offset + n * c.unit);
      const end = Math.min(to, c.offset + (n + 1) * c.unit);
      if (end <= start) {
        continue;
      }
      const notes = this.notesOf(b, pcs);
      if (out.length > 0) {
        const last = out[out.length - 1];
        if (Math.abs(last.end - start) < 1e-6 && last.notes.join(",") === notes.join(",")) {
          last.end = end;
          continue;
        }
      }
      out.push({ start, end, notes });
    }
    return out;
  }

  private bars(d: Deck): { notes: unknown; bpm: number; grid: number; key: string; bars: BarChord[]; offset: number; unit: number } {
    const { stemNotes, bpm, beatGridOffset, key } = d;
    const keyStr = key ? `${key.pitchClass}${key.mode}` : "none";
    let c = this.songs.get(d);
    if (!c || c.notes !== stemNotes || c.bpm !== bpm || c.grid !== beatGridOffset || c.key !== keyStr || c.unit !== (4 * (bpm > 0 ? 60 / bpm : 0.5)) / this.changes) {
      const other = stemNotes?.other ?? [], bass = stemNotes?.bass ?? [];
      const pcs = (key?.mode === "major" ? MAJOR : MINOR).map((x) => (x + (key?.pitchClass ?? 0)) % 12);
      const beatLen = bpm > 0 ? 60 / bpm : 0.5;
      const barLen = 4 * beatLen;
      const unit = barLen / this.changes;
      const grid = beatGridOffset + this.shift * beatLen;
      const offset = grid - Math.ceil(grid / barLen) * barLen;
      let duration = 0;
      for (const n of other as Note[]) if (n[1] > duration) duration = n[1];
      for (const n of bass as Note[]) if (n[1] > duration) duration = n[1];
      c = { notes: stemNotes, bpm, grid: beatGridOffset, key: keyStr, bars: strongestChords(other as Note[], bass as Note[], pcs, unit, offset, duration), offset, unit };
      this.songs.set(d, c);
    }
    return c;
  }

  private barAt(d: Deck, n: number): BarChord {
    const c = this.bars(d);
    if (!c.bars.length || !d.stemNotes) { // notes not analysed yet: the tonic chord of the key, as the warning says
      const s = jamScale(d);
      return { root: s.pcs[0], minor: s.minor, rest: false, strength: 1, seventh: false, bass: s.pcs[0] };
    }
    const b = c.bars[Math.max(0, Math.min(c.bars.length - 1, n))];
    const sh = heardShift(d);
    return { ...b, root: (b.root + sh + 12) % 12, bass: (b.bass + sh + 12) % 12 };
  }

  private barIndex(d: Deck, t: number): number {
    const c = this.bars(d);
    return Math.floor((t - c.offset + 1e-6) / c.unit);
  }

  private notesOf(b: BarChord, pcs: number[]): number[] {
    const color: ChordColor = this.color === "auto" ? (b.seventh ? "seventh" : "triad") : this.color;
    return chordNotes(b.root, b.minor, color, pcs);
  }

  private nameOf(b: BarChord, flat: boolean): string {
    let suffix = "";
    if (this.color === "auto") {
      suffix = b.seventh ? "7" : "";
    } else {
      suffix = this.color === "seventh" ? "7" : this.color === "ninth" ? "9" : "";
    }
    let bass = "";
    if (b.bass !== b.root) bass = "/" + chordLabel(b.bass, false, flat);
    return chordLabel(b.root, b.minor, flat) + suffix + bass;
  }

  private watch(): void {
    const on = this.style !== null && this.deck()?.playing;
    if (on === this.sounding) return;
    this.sounding = on;
    if (on) {
      this.applyGain();
    } else {
      this.outGain.gain.setTargetAtTime(0, this.engine.ctx.currentTime, 0.12);
    }
  }

  private tick(d: Deck, from: number, to: number): void {
    const style = this.style;
    if (!style || d !== this.deck()) return;
    this.route(d);
    if (style !== "tenebreux" && !this.sampled.ready()) { this.lastTo = -1; return; } // not loaded yet: the first chord starts as soon as it is ready
    if (d.bpm <= 0) return;
    const c = this.bars(d);
    const rate = Math.max(0.25, d.playbackRate);
    const beat = 60 / d.bpm / rate;
    const eighth = (c.unit * this.changes) / 8;
    const U = 8 / this.changes;
    const maxRun = 4 * this.changes;
    const isPad = style === "cordes" || style === "tenebreux";
    const pcs = jamScale(d).pcs;
    const fresh = Math.abs(from - this.lastTo) > 0.001;
    this.lastTo = to;
    if (fresh) this.holdUntil = -1;

    const run = (n: number): number => {
      const first = this.barAt(d, n);
      let r = 0;
      while (r < maxRun) {
        const b = this.barAt(d, n + r);
        if (b.rest || b.root !== first.root || b.minor !== first.minor || b.bass !== first.bass) break;
        r++;
      }
      return r;
    };

    const play = (idx: number, step: number, at: number, opts: HarmonyOpts): void => {
      const b = this.barAt(d, idx);
      if (b.rest) return;
      if (idx !== this.leadBar) {
        this.leadBar = idx;
        const chord = this.notesOf(b, pcs);
        this.leadNotes = voiceLead(this.upper, chord.map((m) => m + 12));
        this.upper = this.leadNotes;
      }
      const bar = Math.floor(idx / this.changes);
      const notes = harmonyStep(style, step, this.notesOf(b, pcs), this.leadNotes, beat, { ...opts, bass: b.bass, phrase: ((bar % 4) + 4) % 4, seed: bar });
      for (const n of notes) {
        const vel = n.vel * (0.6 + 0.4 * b.strength);
        if (style === "tenebreux") {
          darkNote(this.engine.ctx, this.outGain, n.midi, at + n.delay, n.dur, vel);
        } else {
          this.sampled.note(n.midi, at + n.delay, n.dur, vel, n.kind);
        }
      }
      if (notes.length > 0) {
        this.hit(at);
      }
    };

    if (fresh && isPad) {
      const n = this.barIndex(d, from);
      const start = c.offset + n * c.unit;
      if (from - start > 1e-6) {
        const r = run(n);
        play(n, 0, songToCtx(d, from), { dur: (start + r * c.unit - from) / rate, bars: r / this.changes });
        this.holdUntil = n + r;
      }
    }

    for (let k = Math.ceil((from - c.offset) / eighth); c.offset + k * eighth < to; k++) {
      const s = c.offset + k * eighth;
      const idx = Math.floor(k / U);
      const at = songToCtx(d, s);
      if (isPad) {
        if (((k % U) + U) % U !== 0 || idx < this.holdUntil) continue;
        const r = Math.max(1, run(idx));
        this.holdUntil = idx + r;
        play(idx, 0, at, { bars: r / this.changes });
      } else {
        const step = ((k % 8) + 8) % 8;
        play(idx, step, at, {});
      }
    }
  }

  protected keep(): string[] {
    return ["level", "color", "shift", "changes"];
  }

  protected resetFields(): void {
    this.setStyle(null);
    this.setLevel(0.8);
    this.color = "auto";
    this.shift = 0;
    this.changes = 1;
  }
}

const chordHarmonyCache = new WeakMap<DJEngine, ChordHarmony>();
export function chordHarmony(engine: DJEngine): ChordHarmony {
  if (!chordHarmonyCache.has(engine)) {
    const m = new ChordHarmony(engine);
    try {
      const o = JSON.parse(localStorage.getItem("djsynth.harmony.v1") || "{}");
      m.restore(o);
      m.setLevel(m.level);
    } catch { }
    chordHarmonyCache.set(engine, m);
    setInterval(() => {
      try {
        const s = JSON.stringify(m.snapshot());
        if (s !== localStorage.getItem("djsynth.harmony.v1")) {
          localStorage.setItem("djsynth.harmony.v1", s);
        }
      } catch { }
    }, 2000);
  }
  return chordHarmonyCache.get(engine)!;
}
