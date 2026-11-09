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
export const LIVE_BARS = [1, 2, 4] as const;

// samples taken LIVE from a stem onto an empty pad, kept per song (stems hash) and per stem: slot -> sample
type LiveSlots = Record<string, (PadSample | null)[]>;
const LIVE_KEY = "djsynth.livePads.v1";
function loadLive(): Record<string, LiveSlots> {
  try {
    const v = JSON.parse(localStorage.getItem(LIVE_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function saveLive(all: Record<string, LiveSlots>): void {
  try {
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete all[k]; // the last 60 songs are enough
    localStorage.setItem(LIVE_KEY, JSON.stringify(all));
  } catch {
    // private window or full storage: the live pads still play for this visit
  }
}

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
  liveBars: (typeof LIVE_BARS)[number] = 1; // how many bars a LIVE capture takes
  private liveAll: Record<string, LiveSlots> = typeof window === "undefined" ? {} : loadLive();

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

  // one row per stem: its found samples on the first pads, the LIVE ones on the pads left empty. A stem with no found
  // sample still gets its row once its stems are loaded, so it can be sampled live.
  rows(): { stem: string; index: number; pads: (PadSample | undefined)[] }[] {
    const d = this.deck();
    const live = this.liveOf();
    return d.stemNames
      .map((stem, index) => {
        const found = poolPage(this.samples?.[stem] ?? [], this.pages[stem] ?? 0, PAD_COLS);
        const pads = Array.from({ length: PAD_COLS }, (_, col) => found[col] ?? live?.[stem]?.[col] ?? undefined);
        return { stem, index, pads, loaded: !!d.getStemBuffer(index) };
      })
      .filter(({ pads, loaded }) => loaded || pads.some(Boolean))
      .map(({ stem, index, pads }) => ({ stem, index, pads }));
  }

  // ---- LIVE: the last bars of a stem, cut on the grid at the playhead, onto an empty pad ----
  private liveOf(): LiveSlots | null {
    const h = this.deck().stemHash;
    return h ? (this.liveAll[h] ??= {}) : null;
  }
  isLive(stem: string, col: number): boolean {
    const found = poolPage(this.samples?.[stem] ?? [], this.pages[stem] ?? 0, PAD_COLS);
    return !found[col] && !!this.liveOf()?.[stem]?.[col];
  }
  // why a LIVE capture cannot be made right now (null when it can)
  liveBlocked(stem: string): string | null {
    const d = this.deck();
    const i = d.stemNames.indexOf(stem);
    if (i < 0 || !d.getStemBuffer(i)) return "Les stems de ce morceau ne sont pas chargés";
    if (!(d.bpm > 0)) return "Tempo inconnu : analyse le morceau pour caler les mesures";
    return null;
  }
  // the last `liveBars` whole bars before the playhead (or from the start of the song when it has barely started)
  captureLive(stem: string, col: number): string | null {
    const why = this.liveBlocked(stem);
    if (why) return why;
    const d = this.deck();
    const bar = (4 * 60) / d.bpm;
    const off = d.beatGridOffset;
    const pos = d.position();
    const len = this.liveBars * bar;
    let end = off + Math.floor((pos - off) / bar) * bar;
    if (end - len < Math.max(0, off - 1e-3)) end = Math.max(off, 0) + len; // too early in the song: its first bars
    const start = end - len;
    if (end > d.duration) return "Trop près de la fin du morceau";
    const slots = this.liveOf();
    if (!slots) return "Morceau sans stems";
    const row = (slots[stem] ??= Array(PAD_COLS).fill(null));
    row[col] = { start, end, kind: "loop", bars: this.liveBars, score: 1, label: `Live ${this.liveBars} mes.` };
    saveLive(this.liveAll);
    return null;
  }
  clearLive(stem: string, col: number): void {
    const row = this.liveOf()?.[stem];
    if (!row) return;
    this.stop(`${stem}:${col}`, this.engine.ctx.currentTime + 0.01);
    row[col] = null;
    saveLive(this.liveAll);
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
    if (!s || !buf) return;

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
