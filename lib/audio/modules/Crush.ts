import { BaseModule } from "./BaseModule";

export class CrushModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private waveshaper: WaveShaperNode;
  private antiAliasFilter: BiquadFilterNode;
  private makeupGain: GainNode;

  constructor(ctx: AudioContext) {
    super(
      "crush",
      "CRUSH",
      "Bit-crusher matériel — quantification numérique lo-fi & réduction de résolution",
      [
        { key: "bits", label: "Résolution", min: 1, max: 12, def: 4, fmt: (v) => `${Math.round(v)} bits` },
        { key: "tone", label: "Filtre Lo-Fi", min: 1000, max: 18000, def: 8000, fmt: (v) => `${Math.round(v)} Hz` },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.waveshaper = ctx.createWaveShaper();
    this.waveshaper.oversample = "none"; // Voluntary grit without smoothing
    this.antiAliasFilter = ctx.createBiquadFilter();
    this.antiAliasFilter.type = "lowpass";
    this.makeupGain = ctx.createGain();

    this.build(ctx);
  }

  private updateCrushCurve(bits: number): void {
    const samples = 4096;
    const curve = new Float32Array(samples);
    const steps = Math.pow(2, Math.max(1, Math.min(16, bits)));
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    this.waveshaper.curve = curve;
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.waveshaper);
    this.waveshaper.connect(this.antiAliasFilter);
    this.antiAliasFilter.connect(this.makeupGain);
    this.makeupGain.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "bits") {
      this.updateCrushCurve(value);
    } else if (key === "tone") {
      this.antiAliasFilter.frequency.value = value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("bits", this.params.bits);
    this.onParamChange("tone", this.params.tone);
  }

  dispose(): void {
    this.input.disconnect();
    this.waveshaper.disconnect();
    this.antiAliasFilter.disconnect();
    this.makeupGain.disconnect();
    this.output.disconnect();
  }
}
