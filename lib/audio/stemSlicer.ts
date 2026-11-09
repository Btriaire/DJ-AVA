import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { JamModule, jamChanged, type PadDef } from "./jamModules";
import { nextGrid } from "./stemJam";
import { slicePeaks } from "../drumPrep";
import { PHRASE_FRACS } from "./loopLevels";
import { pickSlices, poolSlices, type Slice } from "./stemSlices";
import { stemSamplePad } from "./stemSamplePad";
import type { PadSample } from "@/lib/stemSamples";

export class StemSlicer extends JamModule {
  slices: Slice[] = [];
  state: "idle" | "ready" | "none" = "idle";
  level = 0.9;
  repeat = false;
  latch = false;
  fracIdx = 0;
  source: "notes" | "samples" = "notes";

  private cur: GainNode | null = null;
  private lastBuf: AudioBuffer | null = null;
  private lastDeck: Deck | null = null;
  private lastPool: PadSample[] | null = null;
  private dirty = false;
  private waves = new Map<number, number[]>();
  private reps = new Map<number, { timer: ReturnType<typeof setInterval>; next: number }>();

  protected closed(): void { this.stopReps(); }
  constructor(engine: DJEngine, private tag: "bass" | "other") {
    super(engine, tag);
    this.gateModule(tag === "bass" ? "bassslice" : "otherslice");
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

    if (buf !== this.lastBuf || d !== this.lastDeck || pool !== this.lastPool || this.dirty) {
      this.lastBuf = buf;
      this.lastDeck = d;
      this.lastPool = pool;
      this.dirty = false;
      this.waves.clear();
      this.stopReps();
      this.slices = buf ? (this.source === "samples" ? poolSlices(pool ?? []) : pickSlices(buf.getChannelData(0), buf.sampleRate)) : [];
      this.state = !buf ? "idle" : this.slices.length > 0 ? "ready" : "none";
      jamChanged();
    }
  }

  slice(i: number): Slice | null {
    return this.slices[i] || null;
  }

  playSlice(i: number, at?: number, frac = 1): void {
    const seg = this.slices[i];
    if (!seg) return;

    const d = this.deck();
    const ctx = this.engine.ctx;
    const when = at ?? (d.playing && d.bpm > 0 ? nextGrid(d, 0.25).at : ctx.currentTime + 0.01);

    if (this.cur) {
      this.cur.gain.cancelScheduledValues(when);
      this.cur.gain.setValueAtTime(this.cur.gain.value, when);
      this.cur.gain.linearRampToValueAtTime(0, when + 0.015);
    }

    const len = Math.max(0.06, seg.dur * frac);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(this.level, when + 0.003);
    g.gain.setValueAtTime(this.level, when + len - 0.03);
    g.gain.linearRampToValueAtTime(0, when + len);

    const src = ctx.createBufferSource();
    src.buffer = this.lastBuf;
    src.playbackRate.value = d.playRate;
    src.connect(g);
    g.connect(this.bus);

    src.start(when, Math.max(0, seg.t - 0.003), len + 0.04);

    this.hit(when);
    this.cur = g;
  }

  repeatSlice(i: number, on: boolean): void {
    this.stopReps();

    if (on) {
      const d = this.deck();
      const ctx = this.engine.ctx;
      const seg = this.slices[i];
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
        label: `${this.tag === "bass" ? "BAS" : "AUT"} ${i + 1}`,
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
    return pads;
  }

  protected keep(): string[] {
    return ["level", "repeat", "latch", "fracIdx", "source"];
  }

  protected resetFields(): void {
    this.stopReps();
    this.level = 0.9;
    this.repeat = false;
    this.latch = false;
    this.fracIdx = 0;
    this.source = "notes";
  }

  warning(): string | null {
    if (!this.deck().stemHash) {
      return this.tag === "bass"
        ? "Prépare les stems du morceau pour jouer sa basse."
        : "Prépare les stems du morceau pour jouer ses autres sons.";
    }
    if (this.state === "none") {
      if (this.source === "samples") {
        return `Aucun sample de ${this.tag === "bass" ? "basse" : "ce stem"} : ouvre le Stem Sample Pad sur la platine ${this.deck() === this.engine.deckA ? "A" : "B"} (samples préparés dans Préparation).`;
      }
      return "Aucune note nette trouvée dans ce stem.";
    }
    return null;
  }
}

const bassCache = new WeakMap<DJEngine, StemSlicer>();
const otherCache = new WeakMap<DJEngine, StemSlicer>();

function make(
  cache: WeakMap<DJEngine, StemSlicer>,
  engine: DJEngine,
  tag: "bass" | "other",
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
