import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { nextGrid } from "./stemJam";
import type { PadSample } from "@/lib/stemSamples";
import { pageCount, poolPage } from "@/lib/padPages";
import { PadFx, type PadFxId } from "./padFx";

// a sample played backwards (cached per stem buffer)
const reversed = new WeakMap<AudioBuffer, AudioBuffer>();
function reverseOf(ctx: BaseAudioContext, b: AudioBuffer): AudioBuffer {
  let r = reversed.get(b);
  if (!r) {
    r = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let c = 0; c < b.numberOfChannels; c++) r.getChannelData(c).set(b.getChannelData(c).slice().reverse());
    reversed.set(b, r);
  }
  return r;
}

export const PAD_COLS = 5;

export class StemSamplePad {
  side: "A" | "B" = "A";
  quant = 4; // a 1-bar loop starts on a bar line, in phase with the song
  hold = false;
  level = 0.9;
  samples: Record<string, PadSample[]> | null = null;
  status: "idle" | "loading" | "ready" | "error" = "idle";
  deep = false; // the samples come from the in-depth analysis (Préparation > Stems Pad)
  private pages: Record<string, number> = {}; // the page of each stem's pool shown on its 5 pads
  private key = "";
  private voices = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();

  // per row (stem): its effects chain, where it plays, and its playback modifiers
  private fx = new Map<string, PadFx>();
  private routed = new Map<string, AudioNode>();
  mods: Record<string, { reverse: boolean; half: boolean }> = {};
  fxOf(stem: string): PadFx {
    let f = this.fx.get(stem);
    if (!f) {
      const d = () => this.deck();
      f = new PadFx(this.engine.ctx, () => (d().bpm > 0 ? d().bpm * d().playRate : 0));
      this.fx.set(stem, f);
    }
    return f;
  }
  modsOf(stem: string): { reverse: boolean; half: boolean } { return (this.mods[stem] ??= { reverse: false, half: false }); }
  setMod(stem: string, m: "reverse" | "half", on: boolean) { this.modsOf(stem)[m] = on; }
  setFx(stem: string, id: PadFxId, on: boolean) { this.fxOf(stem).setFx(id, on); }
  setFxAmount(stem: string, id: PadFxId, a: number) { this.fxOf(stem).setAmount(id, a); }
  resetFx(stem: string) { this.fxOf(stem).reset(); this.mods[stem] = { reverse: false, half: false }; }
  // the row's chain input, its output (re)plugged where the row plays (the stem's chain, or the master without stems)
  private rowIn(stem: string, out: AudioNode): AudioNode {
    const f = this.fxOf(stem);
    if (this.routed.get(stem) !== out) {
      try { f.output.disconnect(); } catch { /* not connected yet */ }
      f.output.connect(out);
      this.routed.set(stem, out);
    }
    return f.input;
  }

  constructor(private engine: DJEngine) {
    setInterval(() => { for (const f of this.fx.values()) f.tick(); }, 30); // gate pattern and tempo-synced delays
    setInterval(() => this.watch(), 500);
  }

  deck(): Deck {
    return this.side === "A" ? this.engine.deckA : this.engine.deckB;
  }

  private async watch(): Promise<void> {
    const d = this.deck();
    for (const [k, v] of this.voices) { // loops follow a tempo change (half speed kept)
      const half = this.modsOf(k.slice(0, k.lastIndexOf(":"))).half;
      v.src.playbackRate.setTargetAtTime(d.playRate * (half ? 0.5 : 1), d.ctx.currentTime, 0.05);
    }
    if (!d.stemHash || d.bpm <= 0) {
      this.samples = null;
      this.status = "idle";
      this.key = "";
      return;
    }

    const newKey = `${d.stemHash}|${d.stemModel}|${d.stemOptsQS()}|${d.bpm.toFixed(1)}|${d.beatGridOffset.toFixed(2)}`;
    if (newKey === this.key) return;

    this.stopAll();
    this.key = newKey;
    this.status = "loading";

    try {
      const response = await fetch(`/api/stems/samples?hash=${d.stemHash}&model=${d.stemModel}${d.stemOptsQS()}&bpm=${d.bpm.toFixed(1)}&offset=${d.beatGridOffset.toFixed(2)}`);
      const data = await response.json();
      if (this.key === newKey) {
        this.samples = data.samples?.stems || null;
        this.deep = !!data.deep;
        this.pages = {};
        this.status = this.samples ? "ready" : "error";
      }
    } catch (error) {
      if (this.key === newKey) {
        this.status = "error";
      }
    }
  }

  rows(): { stem: string; index: number; pads: PadSample[] }[] {
    const d = this.deck();
    if (!this.samples) return [];

    return d.stemNames
      .map((stem, index) => ({ stem, index, pads: this.samples?.[stem] || [] }))
      .filter(({ pads }) => pads.length > 0)
      .map(({ stem, index, pads }) => ({ stem, index, pads: poolPage(pads, this.pages[stem] ?? 0, PAD_COLS) }));
  }

  // REFRESH: the next 5 samples of the pool on a stem's pads (every stem when none is given); what plays keeps playing
  refresh(stem?: string): void {
    for (const r of this.rows()) {
      if (stem && r.stem !== stem) continue;
      this.pages[r.stem] = (this.pages[r.stem] ?? 0) + 1;
    }
  }
  // how many different pages a stem's pool gives (1 = REFRESH brings nothing new)
  pagesOf(stem: string): number { return pageCount(this.samples?.[stem] ?? []); }
  pageOf(stem: string): number { const n = this.pagesOf(stem); return n ? ((this.pages[stem] ?? 0) % n) + 1 : 0; }

  isOn(stem: string, col: number): boolean {
    return this.voices.has(`${stem}:${col}`);
  }

  press(stem: string, col: number, on: boolean): void {
    const d = this.deck();
    const row = this.rows().find(r => r.stem === stem);
    if (!row) return;

    const s = row.pads[col];
    const buf = d.getStemBuffer(row.index);
    if (!buf) return;

    const key = `${stem}:${col}`;
    const out = this.rowIn(stem, (d.stemsActive ? d.stemInput(row.index) : null) ?? this.engine.masterIn);
    // the next grid line of `beats` beats, or right now when the deck is stopped or the grid is off
    const when = (beats: number) => (beats > 0 && d.playing && d.bpm > 0 ? nextGrid(d, beats).at : this.engine.ctx.currentTime + 0.01);

    if (s.kind === "loop") {
      if (!this.hold) {
        if (on) {
          if (this.voices.has(key)) {
            this.stop(key, when(this.quant));
          } else {
            this.start(key, s, buf, when(this.quant), out);
          }
        }
      } else {
        if (on) {
          this.start(key, s, buf, when(this.quant), out);
        } else {
          this.stop(key, when(this.quant));
        }
      }
    } else {
      if (on) {
        this.stop(key, this.engine.ctx.currentTime + 0.01);
        this.start(key, s, buf, when(0.25), out);
      }
    }
  }

  private start(key: string, s: PadSample, buf: AudioBuffer, at: number, out: AudioNode): void {
    const src = this.engine.ctx.createBufferSource();
    const mod = this.modsOf(key.slice(0, key.lastIndexOf(":")));
    const dur = buf.duration;
    // backwards: the same slice read from the reversed buffer; half speed: twice as long, an octave down
    const a = mod.reverse ? dur - s.end : s.start, b = mod.reverse ? dur - s.start : s.end;
    src.buffer = mod.reverse ? reverseOf(this.engine.ctx, buf) : buf;
    src.loop = s.kind === "loop";
    src.loopStart = a;
    src.loopEnd = b;
    src.playbackRate.value = this.deck().playRate * (mod.half ? 0.5 : 1);

    const gain = this.engine.ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(this.level, at + 0.005);

    src.connect(gain);
    gain.connect(out);

    src.start(at, a, s.kind === "loop" ? undefined : b - a); // a duration in the sample's own time, whatever the speed

    if (this.voices.has(key)) {
      this.stop(key, at);
    }

    this.voices.set(key, { src, gain });

    if (s.kind === "shot") {
      src.onended = () => {
        if (this.voices.get(key)?.src === src) {
          this.voices.delete(key);
        }
      };
    }
  }

  private stop(key: string, at: number): void {
    const voice = this.voices.get(key);
    if (!voice) return;

    voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
    voice.gain.gain.linearRampToValueAtTime(0, at + 0.01);
    voice.src.stop(at + 0.02);
    this.voices.delete(key);
  }

  stopAll(): void {
    const now = this.engine.ctx.currentTime;
    this.voices.forEach((_, key) => this.stop(key, now));
  }

  setLevel(v: number): void {
    this.level = v;
    const now = this.engine.ctx.currentTime;
    this.voices.forEach(({ gain }) => gain.gain.setTargetAtTime(v, now, 0.02));
  }
}

const cache = new WeakMap<DJEngine, StemSamplePad>();

export function stemSamplePad(engine: DJEngine): StemSamplePad {
  if (!cache.has(engine)) {
    cache.set(engine, new StemSamplePad(engine));
  }
  return cache.get(engine)!;
}
