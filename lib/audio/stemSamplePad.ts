import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { nextGrid } from "./stemJam";
import type { PadSample } from "@/lib/stemSamples";

export const PAD_COLS = 5;

export class StemSamplePad {
  side: "A" | "B" = "A";
  quant = 4; // a 1-bar loop starts on a bar line, in phase with the song
  hold = false;
  level = 0.9;
  samples: Record<string, PadSample[]> | null = null;
  status: "idle" | "loading" | "ready" | "error" = "idle";
  private key = "";
  private voices = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();

  constructor(private engine: DJEngine) {
    setInterval(() => this.watch(), 500);
  }

  deck(): Deck {
    return this.side === "A" ? this.engine.deckA : this.engine.deckB;
  }

  private async watch(): Promise<void> {
    const d = this.deck();
    for (const v of this.voices.values()) v.src.playbackRate.setTargetAtTime(d.playRate, d.ctx.currentTime, 0.05); // loops follow a tempo change
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
      .map(({ stem, index, pads }) => ({ stem, index, pads: pads.slice(0, PAD_COLS) }));
  }

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
    const out = (d.stemsActive ? d.stemInput(row.index) : null) ?? this.engine.masterIn;
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
    src.buffer = buf;
    src.loop = s.kind === "loop";
    src.loopStart = s.start;
    src.loopEnd = s.end;
    src.playbackRate.value = this.deck().playRate;

    const gain = this.engine.ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(this.level, at + 0.005);

    src.connect(gain);
    gain.connect(out);

    src.start(at, s.start, s.kind === "loop" ? undefined : s.end - s.start);

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
