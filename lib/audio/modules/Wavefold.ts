import { BaseModule } from "./BaseModule";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export class WavefoldModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private waveshaper: WaveShaperNode;
  private toneFilter: BiquadFilterNode;

  constructor(ctx: AudioContext) {
    super(
      "wavefold",
      "WAVEFOLD",
      "Repli d'onde (Tchebychev) — harmoniques riches et métalliques",
      [
        { key: "fold", label: "Pli", min: 0, max: 1, def: 0.4, fmt: pct },
        { key: "tone", label: "Tone", min: 0, max: 1, def: 0.6, fmt: pct },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.waveshaper = ctx.createWaveShaper();
    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = "lowpass";

    this.setupWaveShaper();
    this.build(ctx);
  }

  private setupWaveShaper(): void {
    const samples = 44100;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i / samples) * 2 - 1;
      curve[i] = Math.sin(x * Math.PI * 2);
    }
    this.waveshaper.curve = curve;
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.waveshaper);
    this.waveshaper.connect(this.toneFilter);
    this.toneFilter.connect(this.output);

    this.toneFilter.frequency.value = 6000;

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "fold") {
      this.input.gain.value = 1 + value * 8;
    } else if (key === "tone") {
      this.toneFilter.frequency.value = 2000 + value * 10000;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("fold", this.params.fold);
    this.onParamChange("tone", this.params.tone);
  }

  dispose(): void {
    this.input.disconnect();
    this.waveshaper.disconnect();
    this.toneFilter.disconnect();
  }
}
