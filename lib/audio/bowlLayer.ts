import { rand } from "./ambienceNoise";

export interface BowlPartial {
  freq: number;
  amp: number;
  decay: number;
  beat: number;
}

export function bowlPartials(f0: number, random: () => number = Math.random): BowlPartial[] {
  const inharmonics = [1, 2.71, 5.15, 8.4];
  const amps = [1, 0.5, 0.25, 0.12];
  const decays = [12, 7.5, 4.5, 2.5];
  const partials: BowlPartial[] = [];

  for (let i = 0; i < inharmonics.length; i++) {
    const freq = f0 * inharmonics[i] * (1 + (random() - 0.5) * 0.008);
    const amp = amps[i] * (0.8 + random() * 0.2);
    const decay = decays[i] * (0.85 + random() * 0.3);
    const beat = 0.3 + random() * 2.2;
    partials.push({ freq, amp, decay, beat });
  }

  return partials;
}

export function bowlSelfCheck(): string[] {
  const errors: string[] = [];
  const partials = bowlPartials(220);

  if (partials.length !== 4) {
    errors.push("bowlPartials(220) should return 4 elements");
  }

  for (const partial of partials) {
    if (!Number.isFinite(partial.freq) || !Number.isFinite(partial.amp) || !Number.isFinite(partial.decay)) {
      errors.push("bowlPartials(220) returned non-finite values");
      break;
    }
  }

  for (let i = 1; i < partials.length; i++) {
    if (partials[i].freq <= partials[i - 1].freq) {
      errors.push("bowlPartials(220) frequencies should be increasing");
      break;
    }
  }

  for (let i = 1; i < partials.length; i++) {
    if (partials[i].amp >= partials[i - 1].amp) {
      errors.push("bowlPartials(220) amplitudes should be decreasing");
      break;
    }
  }

  if (Math.abs(partials[0].freq - 220) > 2.2) {
    errors.push("bowlPartials(220) first partial frequency should be close to 220");
  }

  return errors;
}

export class BowlLayer {
  private ctx: AudioContext;
  private output: GainNode;
  private root: number = 60;
  private level: number = 0;
  private timeoutId: number | null = null;
  private whiteNoiseBuffer: AudioBuffer;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    this.output.connect(out);

    this.whiteNoiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.03, this.ctx.sampleRate);
    const data = this.whiteNoiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  setLevel(v: number): void {
    this.level = v;
    this.output.gain.setTargetAtTime(v * 1.2, this.ctx.currentTime, 0.4);

    if (v > 0.001 && this.timeoutId === null) {
      this.timeoutId = window.setTimeout(() => this.scheduleStrike(), 1200);
    } else if (v <= 0.001 && this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  setRoot(midi: number): void {
    this.root = midi;
  }

  private scheduleStrike(): void {
    if (this.level > 0.001) {
      this.strike();
      this.timeoutId = window.setTimeout(() => this.scheduleStrike(), rand(6, 14) * 1000);
    }
  }

  private strike(): void {
    const v = rand(0.5, 1);
    const f0 = 440 * Math.pow(2, (this.root + 12 - 69) / 12);
    const heights = [0, 0, 0, 7, 12];
    const f = f0 * Math.pow(2, heights[Math.floor(rand(0, heights.length))] / 12);
    const partials = bowlPartials(f, () => rand(0, 1));

    for (const partial of partials) {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const env = this.ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.value = partial.freq + partial.beat / 2;
      osc2.frequency.value = partial.freq - partial.beat / 2;

      env.gain.setValueAtTime(0, this.ctx.currentTime);
      env.gain.linearRampToValueAtTime(partial.amp * v * 0.35, this.ctx.currentTime + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.006 + partial.decay);

      osc1.connect(env);
      osc2.connect(env);
      env.connect(this.output);

      osc1.start(this.ctx.currentTime);
      osc2.start(this.ctx.currentTime);
      osc1.stop(this.ctx.currentTime + partial.decay + 0.5);
      osc2.stop(this.ctx.currentTime + partial.decay + 0.5);
    }

    const noise = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const noiseEnv = this.ctx.createGain();

    noise.buffer = this.whiteNoiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 2800;
    filter.Q.value = 1.2;

noiseEnv.gain.setValueAtTime(0, this.ctx.currentTime);
    noiseEnv.gain.linearRampToValueAtTime(0.12 * v, this.ctx.currentTime + 0.001);
    noiseEnv.gain.setTargetAtTime(0.0001, this.ctx.currentTime + 0.001, 0.03);

    noise.connect(filter);
    filter.connect(noiseEnv);
    noiseEnv.connect(this.output);

    noise.start(this.ctx.currentTime);
    noise.stop(this.ctx.currentTime + 0.04);
  }

  dispose(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
    }
    this.output.disconnect();
  }
}
