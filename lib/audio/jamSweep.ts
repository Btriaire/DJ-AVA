// Tempo-synced filter sweep on a module bus (MaRuche/Falken)
export class SyncedSweep {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly lfo: OscillatorNode;
  private readonly lfoGain: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.lfo = ctx.createOscillator();
    this.lfoGain = ctx.createGain();

    this.filter.type = 'lowpass';
    this.filter.Q.value = 3;
    this.filter.frequency.value = 18000;

    this.lfo.type = 'sine';
    this.lfo.start();

    this.input.connect(this.filter);
    this.filter.connect(this.output);
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);

    this.center = 2200;
    this.depth = 0;
    this.shape = 'sine';
    this.setRate(1);
  }

  center: number;
  setCenter(hz: number): void {
    this.center = hz;
    if (this.depth > 0) {
      this.filter.frequency.setTargetAtTime(hz, 0, 0.02);
    }
  }

  depth: number;
  setDepth(v: number): void {
    this.depth = v;
    const gain = this.center * 0.9 * v;
    this.lfoGain.gain.setTargetAtTime(gain, 0, 0.02);
    if (v === 0) {
      this.filter.frequency.setTargetAtTime(18000, 0, 0.02);
    } else if (this.depth > 0) {
      this.filter.frequency.setTargetAtTime(this.center, 0, 0.02);
    }
  }

  shape: 'sine' | 'triangle' | 'square' | 'sawtooth';
  setShape(s: 'sine' | 'triangle' | 'square' | 'sawtooth'): void {
    this.shape = s;
    this.lfo.type = s;
  }

  setRate(hz: number): void {
    const clamped = Math.max(0.05, Math.min(30, hz));
    this.lfo.frequency.setTargetAtTime(clamped, 0, 0.05);
  }

  static rateFor(bpm: number, beats: number): number {
    return bpm === 0 ? 1 : bpm / 60 / beats;
  }
}

export function selfTest(): void {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };
  assert(SyncedSweep.rateFor(120, 1) === 2, 'rateFor(120, 1) should be 2');
  assert(SyncedSweep.rateFor(120, 4) === 0.5, 'rateFor(120, 4) should be 0.5');
  assert(SyncedSweep.rateFor(0, 1) === 1, 'rateFor(0, 1) should be 1');
}
