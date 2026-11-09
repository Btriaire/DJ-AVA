import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { JamModule, jamChanged, type PadDef } from "./jamModules";
import { nextGrid } from "./stemJam";
import { slicePeaks } from "../drumPrep";
import { PHRASE_FRACS } from "./loopLevels";
import { pickSlices, poolSlices, type Slice } from "./stemSlices";
import { stemSamplePad } from "./stemSamplePad";
import type { PadSample } from "@/lib/stemSamples";
import { normGain } from "./padLoudness";
import { fadeOut, type ReleaseSec } from "./padRelease";

export type SliceTag = "bass" | "other" | "guitar" | "piano";
const PREFIX: Record<SliceTag, string> = { bass: "BAS", other: "AUT", guitar: "GUI", piano: "PNO" };
const NAME_FR: Record<SliceTag, string> = { bass: "basse", other: "autres sons", guitar: "guitare", piano: "piano" };
export const LIVE_PADS = 3; // pads that take LIVE captures, after the 8 found notes (and after Frein / Demi-tempo, keys unchanged)
export const LIVE_BEATS = [1, 2, 4, 8] as const; // how many beats a LIVE capture takes
const LIVE_BASE = 100; // slot index of the first LIVE pad (the found notes use 0..)
const LIVE_STORE = "djsynth.sliceLive.v1";

export class StemSlicer extends JamModule {
  slices: Slice[] = [];
  state: "idle" | "ready" | "none" = "idle";
  level = 0.9;
  repeat = false;
  latch = false;
  fracIdx = 0;
  source: "notes" | "samples" = "notes";
  normalize = true; // every pad at the same loudness (lib/audio/padLoudness.ts)
  release: ReleaseSec = 0; // RELEASE: the note keeps sounding and fades out over this time (lib/audio/padRelease.ts)
  liveBeats: (typeof LIVE_BEATS)[number] = 4; // a LIVE capture: the last beats played of this stem, on the grid
  private liveAll: Record<string, (Slice | null)[]> = (() => {
    try { return JSON.parse(localStorage.getItem(LIVE_STORE) ?? "{}") ?? {}; } catch { return {}; }
  })();

  private cur: GainNode | null = null;
  private lastBuf: AudioBuffer | null = null;
  private lastDeck: Deck | null = null;
  private lastPool: PadSample[] | null = null;
  private lastBeat = 0; // held parts are cut in whole beats: a tempo found after the stems recuts them
  private dirty = false;
  private waves = new Map<number, number[]>();
  private reps = new Map<number, { timer: ReturnType<typeof setInterval>; next: number }>();

  protected closed(): void { this.stopReps(); }
  constructor(engine: DJEngine, private tag: SliceTag) {
    super(engine, tag);
    this.gateModule(`${tag}slice`);
    setInterval(() => this.tick(), 100);
  }

  private samplePool(d: Deck): PadSample[] | null {
    const sp = stemSamplePad(this.engine);
    return sp.deck() === d ? sp.samples?.[this.tag] ?? null : null;
  }

  private tick(): void {
    const d = this.deck();
    this.route(d);
    const idx = this.stem(d);
    const buf = idx >= 0 ? d.getStemBuffer(idx) : null;
    const pool = this.source === "samples" ? this.samplePool(d) : null;

    const beat = this.tag !== "bass" && d.bpm > 0 ? Math.round((60 / d.bpm) * 1000) / 1000 : 0;
    if (buf !== this.lastBuf || d !== this.lastDeck || pool !== this.lastPool || beat !== this.lastBeat || this.dirty) {
      this.lastBeat = beat;
      this.lastBuf = buf;
      this.lastDeck = d;
      this.lastPool = pool;
      this.dirty = false;
      this.waves.clear();
      this.stopReps();
      // the bass plays notes; the other parts (pads, chords, guitar, piano) are held: longer slices, in whole beats
      const held = this.tag === "bass" ? undefined : { beat: d.bpm > 0 ? 60 / d.bpm : 0 }; // the exact beat (the rounded one only spots a change)
      this.slices = buf ? (this.source === "samples" ? poolSlices(pool ?? []) : pickSlices(buf.getChannelData(0), buf.sampleRate, 8, 0.2, 1.6, held)) : [];
      this.state = !buf ? "idle" : this.slices.length > 0 ? "ready" : "none";
      jamChanged();
    }
  }

  slice(i: number): Slice | null {
    if (i >= LIVE_BASE) return this.liveSlots()?.[i - LIVE_BASE] ?? null;
    return this.slices[i] || null;
  }

  // ---- LIVE: the last beats of this stem, cut on the grid at the playhead, onto one of the LIVE pads ----
  private liveKey(): string | null {
    const h = this.deck().stemHash;
    return h ? `${h}:${this.tag}` : null;
  }
  private liveSlots(): (Slice | null)[] | null {
    const k = this.liveKey();
    return k ? (this.liveAll[k] ??= Array(LIVE_PADS).fill(null)) : null;
  }
  private saveLive(): void {
    try {
      const keys = Object.keys(this.liveAll);
      for (const k of keys.slice(0, Math.max(0, keys.length - 120))) delete this.liveAll[k];
      localStorage.setItem(LIVE_STORE, JSON.stringify(this.liveAll));
    } catch { /* private window: kept for this visit */ }
  }
  // why a LIVE capture cannot be made now (null when it can)
  liveBlocked(): string | null {
    const d = this.deck();
    if (!this.lastBuf) return `Le stem ${NAME_FR[this.tag]} de ce morceau n'est pas chargé`;
    if (!(d.bpm > 0)) return "Tempo inconnu : analyse le morceau pour caler les temps";
    return null;
  }
  // the last `liveBeats` whole beats before the playhead (the first ones when the song has barely started)
  captureLive(k: number): string | null {
    const why = this.liveBlocked();
    if (why) return why;
    const d = this.deck();
    const beat = 60 / d.bpm;
    const off = d.beatGridOffset;
    const len = this.liveBeats * beat;
    let end = off + Math.floor((d.position() - off) / beat) * beat;
    if (end - len < Math.max(0, off - 1e-3)) end = Math.max(off, 0) + len;
    if (end > d.duration) return "Trop près de la fin du morceau";
    const slots = this.liveSlots();
    if (!slots) return "Morceau sans stems";
    slots[k] = { t: end - len, dur: len, score: 1, label: `Live ${this.liveBeats} t.` };
    this.waves.delete(LIVE_BASE + k);
    this.saveLive();
    jamChanged();
    return null;
  }
  clearLive(): void {
    const slots = this.liveSlots();
    if (!slots) return;
    for (let k = 0; k < LIVE_PADS; k++) { this.repeatSlice(LIVE_BASE + k, false); slots[k] = null; this.waves.delete(LIVE_BASE + k); }
    this.saveLive();
    jamChanged();
  }
  hasLive(): boolean { return !!this.liveSlots()?.some(Boolean); }
  liveNote: string | null = null; // why the last LIVE capture was refused (shown by the panel)

  playSlice(i: number, at?: number, frac = 1): void {
    const seg = this.slice(i);
    if (!seg) return;

    const d = this.deck();
    const ctx = this.engine.ctx;
    const when = at ?? (d.playing && d.bpm > 0 ? nextGrid(d, 0.25).at : ctx.currentTime + 0.01);

    if (this.cur) fadeOut(this.cur, when, this.release, 0.015); // the previous note: cut, or its release under the new one

    const len = Math.max(0.06, seg.dur * frac);
    const lvl = this.level * (this.normalize && this.lastBuf ? normGain(this.lastBuf, seg.t, seg.dur) : 1); // measured on the whole slice
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(lvl, when + 0.003);
    if (this.release > 0) {
      g.gain.setValueAtTime(lvl, when + len);
      g.gain.setTargetAtTime(0, when + len, this.release / 4.6); // the stem's own tail, fading out
    } else {
      g.gain.setValueAtTime(lvl, when + len - 0.03);
      g.gain.linearRampToValueAtTime(0, when + len);
    }

    const src = ctx.createBufferSource();
    src.buffer = this.lastBuf;
    src.playbackRate.value = d.playRate;
    src.connect(g);
    g.connect(this.bus);

    src.start(when, Math.max(0, seg.t - 0.003), len + this.release + 0.04);

    this.hit(when);
    this.cur = g;
  }

  repeatSlice(i: number, on: boolean): void {
    this.stopReps();

    if (on) {
      const d = this.deck();
      const ctx = this.engine.ctx;
      const seg = this.slice(i);
      if (!seg) return;

      const r = {
        timer: setInterval(() => {
          while (r.next < ctx.currentTime + 0.3) {
            this.playSlice(i, r.next, PHRASE_FRACS[this.fracIdx]);
            r.next += seg.dur * PHRASE_FRACS[this.fracIdx];
          }
        }, 80),
        next: d.playing && d.bpm > 0 ? nextGrid(d, 0.25).at : ctx.currentTime + 0.01,
      };

      this.reps.set(i, r);
    }
  }
  stopReps(): void {
    this.reps.forEach((v) => clearInterval(v.timer));
    this.reps.clear();
  }

  isRepeating(id: string): boolean {
    if (id.startsWith("live")) return this.reps.has(LIVE_BASE + parseInt(id.slice(4), 10));
    return id.startsWith("chop") && this.reps.has(parseInt(id.slice(4), 10));
  }

  setRepeat(v: boolean): void {
    this.repeat = v;
    if (!v) this.stopReps();
    jamChanged();
  }

  setLatch(v: boolean): void {
    this.latch = v;
    if (!v) {
      this.reps.forEach((_, i) => {
        if (!this.pressed.has(`chop${i}`)) this.repeatSlice(i, false);
      });
    }
    jamChanged();
  }

  setFrac(i: number): void {
    this.fracIdx = Math.max(0, Math.min(PHRASE_FRACS.length - 1, i));
    this.reps.forEach((v, i) => {
      clearInterval(v.timer);
      this.repeatSlice(i, true);
    });
    jamChanged();
  }

  setLevel(v: number): void {
    this.level = v;
    jamChanged();
  }

  setRelease(v: ReleaseSec): void {
    this.release = v;
    jamChanged();
  }

  setNormalize(v: boolean): void {
    this.normalize = v;
    jamChanged();
  }

  setLiveBeats(n: (typeof LIVE_BEATS)[number]): void {
    this.liveBeats = n;
    jamChanged();
  }

  setSource(v: "notes" | "samples"): void {
    this.source = v;
    this.stopReps();
    this.dirty = true;
    jamChanged();
  }

  waveOf(i: number): number[] | null {
    if (this.waves.has(i)) return this.waves.get(i) || null;
    const seg = this.slice(i);
    if (!seg) return null;
    const d = this.deck();
    const idx = this.stem(d);
    const buf = idx >= 0 ? d.getStemBuffer(idx) : null;
    if (!buf) return null;
    const len = Math.min(seg.dur, 0.9) + 0.04;
    const peaks = slicePeaks(buf.getChannelData(0), Math.max(0, Math.round((seg.t - 0.003) * buf.sampleRate)), Math.round(len * buf.sampleRate), 24);
    this.waves.set(i, peaks);
    return peaks;
  }

  pads(): PadDef[] {
    const pads: PadDef[] = [];
    for (let i = 0; i < 8; i++) {
      const seg = this.slice(i);
      pads.push({
        id: `chop${i}`,
        label: `${PREFIX[this.tag]} ${i + 1}`,
        sub: seg ? (seg.label ?? `${seg.t.toFixed(1)} s`) : "vide",
        mode: this.latch ? "toggle" : "hold",
        isOn: this.latch ? () => this.reps.has(i) : undefined,
        run: (on) => {
          if (this.repeat || this.latch) this.repeatSlice(i, on);
          else if (on) this.playSlice(i);
        },
      });
    }
    pads.push(
      {
        id: "brake",
        label: "Frein",
        mode: "hold",
        run: (on) => this.fx("brake", on),
      },
      {
        id: "half",
        label: "Demi-tempo",
        mode: "hold",
        run: (on) => this.fx("halftime", on),
      }
    );
    // LIVE pads: empty, a press takes the last beats of the stem; filled, they play like the found notes
    for (let k = 0; k < LIVE_PADS; k++) {
      const i = LIVE_BASE + k;
      const seg = this.slice(i);
      pads.push({
        id: `live${k}`,
        label: seg ? `LIVE ${k + 1}` : "● LIVE",
        sub: seg ? seg.label : `prend ${this.liveBeats} temps`,
        mode: seg && this.latch ? "toggle" : "hold",
        isOn: seg && this.latch ? () => this.reps.has(i) : undefined,
        run: (on) => {
          if (!this.slice(i)) {
            if (on) { this.liveNote = this.captureLive(k); if (this.liveNote) setTimeout(() => { this.liveNote = null; jamChanged(); }, 3500); }
            return;
          }
          if (this.repeat || this.latch) this.repeatSlice(i, on);
          else if (on) this.playSlice(i);
        },
      });
    }
    return pads;
  }

  protected keep(): string[] {
    return ["level", "repeat", "latch", "fracIdx", "source", "liveBeats", "normalize", "release"];
  }

  protected resetFields(): void {
    this.stopReps();
    this.level = 0.9;
    this.repeat = false;
    this.latch = false;
    this.fracIdx = 0;
    this.source = "notes";
    this.liveBeats = 4;
    this.normalize = true;
    this.release = 0;
  }

  warning(): string | null {
    if (!this.deck().stemHash) return `Prépare les stems du morceau pour jouer sa ${NAME_FR[this.tag] === "autres sons" ? "partie « autres »" : NAME_FR[this.tag]}.`;
    if ((this.tag === "guitar" || this.tag === "piano") && !this.deck().stemNames.includes(this.tag)) {
      return `Ce morceau n'a pas de stem ${NAME_FR[this.tag]} : prépare-le en 6 pistes (Préparation, 6 pistes).`;
    }
    if (this.state === "none") {
      if (this.source === "samples") {
        return `Aucun sample de ${NAME_FR[this.tag]} : ouvre le Stem Sample Pad sur la platine ${this.deck() === this.engine.deckA ? "A" : "B"} (samples préparés dans Préparation).`;
      }
      return "Aucune note nette trouvée dans ce stem.";
    }
    return null;
  }
}

const bassCache = new WeakMap<DJEngine, StemSlicer>();
const otherCache = new WeakMap<DJEngine, StemSlicer>();
const guitarCache = new WeakMap<DJEngine, StemSlicer>();
const pianoCache = new WeakMap<DJEngine, StemSlicer>();

function make(
  cache: WeakMap<DJEngine, StemSlicer>,
  engine: DJEngine,
  tag: SliceTag,
  storeKey: string
): StemSlicer {
  if (cache.has(engine)) return cache.get(engine)!;
  const mod = new StemSlicer(engine, tag);
  try {
    const saved = localStorage.getItem(storeKey);
    if (saved) mod.restore(JSON.parse(saved));
  } catch (e) {
    console.error(e);
  }
  cache.set(engine, mod);
  let lastSaved = JSON.stringify(mod.snapshot());
  setInterval(() => {
    const current = JSON.stringify(mod.snapshot());
    if (current !== lastSaved) {
      try {
        localStorage.setItem(storeKey, current);
        lastSaved = current;
      } catch (e) {
        console.error(e);
      }
    }
  }, 2000);
  return mod;
}

export function bassSlicer(engine: DJEngine): StemSlicer {
  return make(bassCache, engine, "bass", "djsynth.bassslice.v2");
}

export function otherSlicer(engine: DJEngine): StemSlicer {
  return make(otherCache, engine, "other", "djsynth.otherslice.v2");
}

export function guitarSlicer(engine: DJEngine): StemSlicer {
  return make(guitarCache, engine, "guitar", "djsynth.guitarslice.v1");
}

export function pianoSlicer(engine: DJEngine): StemSlicer {
  return make(pianoCache, engine, "piano", "djsynth.pianoslice.v1");
}

export function slicerFor(engine: DJEngine, tag: SliceTag): StemSlicer {
  return tag === "bass" ? bassSlicer(engine) : tag === "other" ? otherSlicer(engine) : tag === "guitar" ? guitarSlicer(engine) : pianoSlicer(engine);
}
