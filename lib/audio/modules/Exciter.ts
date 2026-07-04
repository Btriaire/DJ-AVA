import { BaseModule } from "./BaseModule";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const hz = (v: number) => `${Math.round(v)} Hz`;

export class ExciterModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private dryGain: GainNode;
  private hp: BiquadFilterNode;
  private waveshaper: WaveShaperNode;
  private excGain: GainNode;
  private wetMix: GainNode;

  constructor(ctx: AudioContext) {
    super(
      "exciter",
      "EXCITER",
      "Excitant harmonique — ajoute des harmoniques riches au signal",
      [
        { key: "harm", label: "Harmoniques", min: 0, max: 1, def: 0.5, fmt: pct },
        { key: "freq", label: "Fréquence", min: 2000, max: 12000, def: 4000, fmt: hz },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.hp = ctx.createBiquadFilter();
    this.hp.type = "highpass";
    this.waveshaper = ctx.createWaveShaper();
    this.excGain = ctx.createGain();
    this.wetMix = ctx.createGain();

    this.setupWaveShaper();
    this.build(ctx);
  }

  private setupWaveShaper(): void {
    // Soft tanh distortion curve
    const samples = 44100;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i / samples) * 2 - 1;
      curve[i] = Math.tanh(x * 3) / Math.tanh(3);
    }
    this.waveshaper.curve = curve;
  }

  build(ctx: AudioContext): void {
    // Dry path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path: HP -> waveshaper -> excGain -> mix
    this.input.connect(this.hp);
    this.hp.connect(this.waveshaper);
    this.waveshaper.connect(this.excGain);
    this.excGain.connect(this.wetMix);
    this.wetMix.connect(this.output);

    // Initialize
    this.dryGain.gain.value = 1;
    this.excGain.gain.value = 0.4;
    this.hp.frequency.value = 4000;
    this.wetMix.gain.value = 0.3;

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "harm") {
      // harm: intensity of the waveshaper + wet mix
      this.excGain.gain.value = 0.1 + value * 0.9;
      this.wetMix.gain.value = 0.1 + value * 0.6;
    } else if (key === "freq") {
      // freq: highpass frequency
      this.hp.frequency.value = value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("harm", this.params.harm);
    this.onParamChange("freq", this.params.freq);
  }

  dispose(): void {
    this.input.disconnect();
    this.dryGain.disconnect();
    this.hp.disconnect();
    this.waveshaper.disconnect();
    this.excGain.disconnect();
    this.wetMix.disconnect();
  }
}
