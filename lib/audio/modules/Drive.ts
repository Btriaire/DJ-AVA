import { BaseModule } from "./BaseModule";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export class DriveModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private waveshaper: WaveShaperNode;
  private toneFilter: BiquadFilterNode;

  constructor(ctx: AudioContext) {
    super(
      "drive",
      "DRIVE",
      "Saturation analogique — chaleur et grain",
      [
        { key: "drive", label: "Drive", min: 0, max: 1, def: 0.4, fmt: pct },
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
      curve[i] = Math.tanh(x * 3) / Math.tanh(3);
    }
    this.waveshaper.curve = curve;
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.waveshaper);
    this.waveshaper.connect(this.toneFilter);
    this.toneFilter.connect(this.output);

    this.toneFilter.frequency.value = 6000;
    this.toneFilter.Q.value = 1;

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "drive") {
      this.input.gain.value = 1 + value * 10;
    } else if (key === "tone") {
      this.toneFilter.frequency.value = 2000 + value * 8000;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("drive", this.params.drive);
    this.onParamChange("tone", this.params.tone);
  }

  dispose(): void {
    this.input.disconnect();
    this.waveshaper.disconnect();
    this.toneFilter.disconnect();
  }
}
