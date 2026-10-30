import { StepClock, type ClockInfo } from "./stepClock";

export type SlicePresetId = "orig" | "rev" | "stutter" | "half" | "double" | "skip" | "shuffle" | "gate";

export const SLICE_PRESETS: { id: SlicePresetId; label: string; title: string }[] = [
  { id: "orig", label: "ORIGINAL", title: "Rien ne change : le point de départ pour éditer les pas" },
  { id: "rev", label: "INVERSE", title: "La mesure rejouée de la fin au début, tranche par tranche" },
  { id: "stutter", label: "BÉGAIE", title: "Chaque temps répète sa première tranche : bégaiement" },
  { id: "half", label: "DEMI", title: "Chaque tranche deux fois : la mesure semble deux fois plus lente" },
  { id: "double", label: "DOUBLE", title: "Une tranche sur deux, deux fois : la mesure file deux fois plus vite" },
  { id: "skip", label: "SAUT", title: "La fin de chaque temps remplacée par la tranche d'avant : petit accroc" },
  { id: "shuffle", label: "ALÉA", title: "Tranches mélangées au hasard, nouveau tirage à chaque clic" },
  { id: "gate", label: "HACHE", title: "Une tranche sur deux devient silence : effet hachoir" },
];

export interface SliceDeck {
  playing: boolean;
  audioBuffer: AudioBuffer | null;
  stemsActive: boolean;
  stemReady: boolean;
  stemNames: string[];
  bpm: number | null;
  playbackRate: number;
  beatGridOffset: number;
  sliceInput: AudioNode;
  sliceGate: GainNode;
  position(): number;
  fxClock(): ClockInfo | null;
  getStemBuffer(i: number): AudioBuffer | null;
  stemSliceGate(i: number): GainNode | null;
  stemSliceInput(i: number): AudioNode | null;
}

export interface SlicerState {
  slices: 8 | 16;
  pattern: number[];
  barShift: number;
  target?: number;
}

export class Slicer {
  readonly ctx: BaseAudioContext;
  readonly deck: SliceDeck;
  readonly clock: StepClock;
  slicesN: 8 | 16 = 8;
  pattern: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  shift = 0;
  engagedFlag = false;
  momentary = false;
  holdIdx: number | null = null;
  gated = false;
  currentSlot = -1;
  onSlot: ((slot: number) => void) | null = null;
  scheduled: { src: AudioBufferSourceNode; start: number }[] = [];
  target = -1;
  private gateRef: GainNode | null = null;
  private inputRef: AudioNode | null = null;

  constructor(ctx: BaseAudioContext, deck: SliceDeck) {
    this.ctx = ctx;
    this.deck = deck;
    this.clock = new StepClock(ctx, () => deck.fxClock(), (n, t, d) => this.onClockStep(t, d));
    this.clock.stepsPerBeat = 2;
  }

  private stemOn(): boolean {
    return this.target >= 0 && this.deck.stemsActive && this.deck.stemReady && !!this.deck.getStemBuffer(this.target);
  }

  private buf(): AudioBuffer | null {
    return this.stemOn() ? this.deck.getStemBuffer(this.target) : this.deck.audioBuffer;
  }

  private gateNode(): GainNode {
    return (this.stemOn() ? this.deck.stemSliceGate(this.target) : null) ?? this.deck.sliceGate;
  }

  private inputNode(): AudioNode {
    return (this.stemOn() ? this.deck.stemSliceInput(this.target) : null) ?? this.deck.sliceInput;
  }

  private onClockStep(time: number, stepDur: number): void {
    if (!this.engagedFlag) return;
    if (!this.deck.playing || !this.buf() || !this.deck.bpm) {
      this.release();
      return;
    }

    if (!this.gated) {
      this.gated = true;
      const g = this.gateRef!.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setValueAtTime(1, Math.max(this.ctx.currentTime, time - 0.002));
      g.linearRampToValueAtTime(0, time);
    }

    const buf = this.buf()!;
    const rate = this.deck.playbackRate;
    const sliceTrack = (60 / this.deck.bpm) * 4 / this.slicesN;
    const posAt = this.deck.position() + (time - this.ctx.currentTime) * rate;
    const grid = Math.round((posAt - this.deck.beatGridOffset) / sliceTrack);
    const shiftSlices = Math.round(this.shift * this.slicesN / 4);
    const slot = (((grid - shiftSlices) % this.slicesN) + this.slicesN) % this.slicesN;

    this.currentSlot = slot;
    if (this.onSlot) {
      setTimeout(() => this.onSlot?.(slot), Math.max(0, (time - this.ctx.currentTime) * 1000));
    }

    const want = this.holdIdx !== null ? this.holdIdx : this.pattern[slot];
    if (want < 0) return;

    const base = this.deck.beatGridOffset + grid * sliceTrack;
    const startTrack = base + (want - slot) * sliceTrack;
    if (startTrack < 0 || startTrack + sliceTrack > buf.duration) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(1, time + 0.002);
    g.gain.setValueAtTime(1, time + stepDur - 0.002);
    g.gain.linearRampToValueAtTime(0, time + stepDur);

    src.connect(g);
    g.connect(this.inputRef!);
    src.start(time, startTrack, sliceTrack + 0.02);
    src.stop(time + stepDur + 0.01);

    const entry = { src, start: time };
    this.scheduled.push(entry);
    src.onended = () => {
      this.scheduled = this.scheduled.filter(e => e !== entry);
      src.disconnect();
      g.disconnect();
    };
  }

  engage(): boolean {
    if (this.engagedFlag) return true;
    const buf = this.buf();
    if (!this.deck.playing || !buf || !this.deck.bpm) return false;

    this.engagedFlag = true;
    this.momentary = false;
    this.gated = false;
    this.gateRef = this.gateNode();
    this.inputRef = this.inputNode();
    this.clock.stepsPerBeat = this.slicesN / 4;
    this.clock.start("grid");
    return true;
  }

  release(): void {
    if (!this.engagedFlag) return;

    this.engagedFlag = false;
    this.momentary = false;
    this.holdIdx = null;

    const rt = this.clock.nextGrid(this.clock.stepsPerBeat);
    this.clock.stop();

    for (const entry of this.scheduled) {
      if (entry.start >= rt) {
        try { entry.src.stop(); } catch {}
      }
    }

    const g = (this.gateRef ?? this.deck.sliceGate).gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    if (this.gated) {
      g.setValueAtTime(0, rt);
      g.linearRampToValueAtTime(1, rt + 0.003);
    } else {
      g.setValueAtTime(1, this.ctx.currentTime);
    }
    this.gated = false;
    this.currentSlot = -1;
  }

  toggle(): boolean {
    if (this.engagedFlag) {
      this.release();
      return false;
    }
    return this.engage();
  }

  holdSlice(i: number): void {
    const wasEngaged = this.engagedFlag;
    if (!wasEngaged && !this.engage()) return;
    this.momentary = !wasEngaged;
    this.holdIdx = Math.max(0, Math.min(i, this.slicesN - 1));
  }

  releaseHold(): void {
    this.holdIdx = null;
    if (this.momentary) {
      this.momentary = false;
      this.release();
    }
  }

  get slices(): 8 | 16 { return this.slicesN; }
  setSlices(n: 8 | 16): void {
    this.slicesN = n;
    this.pattern = Array(16).fill(0).map((_, i) => i < n ? i : -1);
    this.clock.stepsPerBeat = n / 4;
  }

  get barShift(): number { return this.shift; }
  setBarShift(n: number): void {
    this.shift = Math.max(0, Math.min(3, n));
  }

  get engaged(): boolean { return this.engagedFlag; }
  listen(cb: ((slot: number) => void) | null): void { this.onSlot = cb; }
  get holding(): number | null { return this.holdIdx; }

  cycleStep(slot: number, dir: 1 | -1 = 1): void {
    const v = this.pattern[slot];
    if (dir === 1) {
      this.pattern[slot] = v + 1 > this.slicesN - 1 ? -1 : v + 1;
    } else {
      this.pattern[slot] = v - 1 < -1 ? this.slicesN - 1 : v - 1;
    }
  }

  applyPreset(id: SlicePresetId): void {
    const N = this.slicesN;
    const g = N / 4;
    const pattern = [...this.pattern];

    switch (id) {
      case "orig":
        for (let i = 0; i < N; i++) pattern[i] = i;
        break;
      case "rev":
        for (let i = 0; i < N; i++) pattern[i] = N - 1 - i;
        break;
      case "stutter":
        for (let i = 0; i < N; i++) pattern[i] = Math.floor(i / g) * g;
        break;
      case "half":
        for (let i = 0; i < N; i++) pattern[i] = Math.floor(i / 2);
        break;
      case "double":
        for (let i = 0; i < N; i++) pattern[i] = (i * 2) % N;
        break;
      case "skip":
        for (let i = 0; i < N; i++) pattern[i] = i % 4 === 3 ? i - 1 : i;
        break;
      case "shuffle":
        for (let i = N - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pattern[i], pattern[j]] = [pattern[j], pattern[i]];
        }
        break;
      case "gate":
        for (let i = 0; i < N; i++) pattern[i] = i % 2 === 0 ? i : -1;
        break;
    }

    this.pattern = pattern;
  }

  exportState(): SlicerState {
    return {
      slices: this.slicesN,
      pattern: [...this.pattern],
      barShift: this.shift,
      target: this.target,
    };
  }

  importState(partial: Partial<SlicerState>): void {
    if (partial.slices !== undefined) this.setSlices(partial.slices);
    if (partial.pattern !== undefined) this.pattern = [...partial.pattern];
    if (partial.barShift !== undefined) this.setBarShift(partial.barShift);
    if (partial.target !== undefined) this.setTarget(partial.target);
  }

  panic(): void {
    this.release();
    for (const entry of this.scheduled) {
      try { entry.src.stop(); } catch {}
    }
    this.scheduled = [];
    const g = (this.gateRef ?? this.deck.sliceGate).gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(1, this.ctx.currentTime);
  }

  setTarget(i: number): void {
    if (this.engagedFlag) {
      this.release();
    }
    this.target = i;
  }
}

// runnable check: a stem target slices that stem (its buffer, gate and input) and falls back to the whole deck when the stems are off
export function slicerTest(): void {
  const node = (n: string) => ({ n, gain: { value: 1 } }) as unknown as GainNode;
  const mix = { duration: 10 } as AudioBuffer, drums = { duration: 10 } as AudioBuffer;
  const deck = {
    playing: true, audioBuffer: mix, bpm: 120, playbackRate: 1, beatGridOffset: 0, position: () => 0, fxClock: () => null,
    sliceInput: node("in"), sliceGate: node("gate"), stemsActive: true, stemReady: true, stemNames: ["drums"],
    getStemBuffer: (i: number) => (i === 0 ? drums : null), stemSliceGate: () => node("sgate"), stemSliceInput: () => node("sin"),
  } as unknown as SliceDeck;
  const s = new Slicer({ currentTime: 0 } as BaseAudioContext, deck) as unknown as { setTarget(i: number): void; buf(): AudioBuffer; gateNode(): { n: string }; inputNode(): { n: string } };
  s.setTarget(0);
  if (s.buf() !== drums || s.gateNode().n !== "sgate" || s.inputNode().n !== "sin") throw new Error("slicer stem target");
  (deck as { stemsActive: boolean }).stemsActive = false;
  if (s.buf() !== mix || s.gateNode().n !== "gate" || s.inputNode().n !== "in") throw new Error("slicer fallback");
}
