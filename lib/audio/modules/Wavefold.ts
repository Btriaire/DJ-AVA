import { BaseModule } from "./BaseModule";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export class WavefoldModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private preGain: GainNode;
  private waveshaper: WaveShaperNode;
  private toneFilter: BiquadFilterNode;
  private dcBlock: BiquadFilterNode;
  private makeupGain: GainNode;

  constructor(ctx: AudioContext) {
    super(
      "wavefold",
      "WAVEFOLD",
      "Repli d'onde harmonique — saturation de type Buchla / synthétiseur côte Ouest",
      [
        { key: "fold", label: "Repli", min: 0, max: 1, def: 0.45, fmt: pct },
        { key: "tone", label: "Chaleur", min: 0, max: 1, def: 0.65, fmt: pct },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.preGain = ctx.createGain();
    this.waveshaper = ctx.createWaveShaper();
    this.waveshaper.oversample = "4x"; // Quad-oversampling anti-aliasing
    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = "lowpass";
    this.dcBlock = ctx.createBiquadFilter();
    this.dcBlock.type = "highpass";
    this.dcBlock.frequency.value = 18;
    this.makeupGain = ctx.createGain();

    this.build(ctx);
  }

  private updateFoldCurve(fold: number): void {
    const samples = 2048;
    const curve = new Float32Array(samples);
    // West-Coast multi-stage folding formula: sin(x * folds) with soft inflection
    const folds = 1 + fold * 5;
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      // Buchla-style wave folding
      curve[i] = Math.sin(x * Math.PI * folds) * 0.85;
    }
    this.waveshaper.curve = curve;
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.preGain);
    this.preGain.connect(this.waveshaper);
    this.waveshaper.connect(this.toneFilter);
    this.toneFilter.connect(this.dcBlock);
    this.dcBlock.connect(this.makeupGain);
    this.makeupGain.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "fold") {
      this.preGain.gain.value = 1 + value * 3;
      this.updateFoldCurve(value);
      this.makeupGain.gain.value = 1 / (1 + value * 0.4);
    } else if (key === "tone") {
      this.toneFilter.frequency.value = 800 * Math.pow(20, value);
    }
  }

  private updateFromParams(): void {
    this.onParamChange("fold", this.params.fold);
    this.onParamChange("tone", this.params.tone);
  }

  dispose(): void {
    this.input.disconnect();
    this.preGain.disconnect();
    this.waveshaper.disconnect();
    this.toneFilter.disconnect();
    this.dcBlock.disconnect();
    this.makeupGain.disconnect();
    this.output.disconnect();
  }
}
