import { BaseModule } from "./BaseModule";

export class ReverbModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private preDelayNode: DelayNode;
  private convolver: ConvolverNode;
  private toneFilter: BiquadFilterNode;
  private ctx: AudioContext;

  constructor(ctx: AudioContext) {
    super(
      "reverb",
      "REVERB",
      "Réverbération pro convolution — acoustique riche, pré-délai et amortissement",
      [
        { key: "decay", label: "Taille", min: 0.2, max: 8, def: 3.2, fmt: (v) => `${v.toFixed(1)}s` },
        { key: "pre", label: "Pré-délai", min: 0, max: 0.15, def: 0.02, fmt: (v) => `${Math.round(v * 1000)} ms` },
        { key: "mix", label: "Mix", min: 0, max: 1, def: 0.35, fmt: (v) => `${Math.round(v * 100)}%` },
      ]
    );

    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.preDelayNode = ctx.createDelay(0.5);
    this.convolver = ctx.createConvolver();
    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = "lowpass";
    this.toneFilter.frequency.value = 10000;

    this.build(ctx);
  }

  // Generates a high-quality stereo diffuse impulse response with exponential decay and high-frequency absorption
  private generateImpulse(decayTime: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * decayTime));
    const buffer = this.ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Exponential energy decay with natural damping curve
      const env = Math.pow(1 - t, 2.2);
      // Diffuse uncorrelated stereo noise
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }
    return buffer;
  }

  build(ctx: AudioContext): void {
    // Dry signal path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet signal path: input -> pre-delay -> convolver -> tone filter -> wetGain -> output
    this.input.connect(this.preDelayNode);
    this.preDelayNode.connect(this.convolver);
    this.convolver.connect(this.toneFilter);
    this.toneFilter.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.convolver.buffer = this.generateImpulse(this.params.decay);
    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "decay") {
      this.convolver.buffer = this.generateImpulse(value);
    } else if (key === "pre") {
      this.preDelayNode.delayTime.value = value;
    } else if (key === "mix") {
      // Equal-power crossfade between dry and wet
      const dryVal = Math.cos(value * 0.5 * Math.PI);
      const wetVal = Math.sin(value * 0.5 * Math.PI);
      this.dryGain.gain.value = dryVal;
      this.wetGain.gain.value = wetVal;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("decay", this.params.decay);
    this.onParamChange("pre", this.params.pre);
    this.onParamChange("mix", this.params.mix);
  }

  dispose(): void {
    this.input.disconnect();
    this.dryGain.disconnect();
    this.preDelayNode.disconnect();
    this.convolver.disconnect();
    this.toneFilter.disconnect();
    this.wetGain.disconnect();
    this.output.disconnect();
  }
}
