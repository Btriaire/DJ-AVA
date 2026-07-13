import { BaseModule } from "./BaseModule";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALE_LABELS = ["CHRO", "MAJ", "MIN"];

export class AutotuneModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private compressor: DynamicsCompressorNode;

  constructor(ctx: AudioContext) {
    super(
      "autotune",
      "AUTO-TUNE",
      "Auto-Tune — correction de hauteur monophonique",
      [
        { key: "amount", label: "Dose", min: 0, max: 1, def: 0, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "retune", label: "Glisse", min: 0, max: 1, def: 0.2, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "key", label: "Tonalité", min: 0, max: 11, def: 0, fmt: (v) => NOTE_NAMES[Math.round(v) % 12] },
        { key: "scale", label: "Gamme", min: 0, max: 2, def: 0, fmt: (v) => SCALE_LABELS[Math.round(v)] },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -50;
    this.compressor.knee.value = 40;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.dryGain);
    this.input.connect(this.wetGain);
    this.wetGain.connect(this.compressor);
    this.dryGain.connect(this.output);
    this.compressor.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "amount") {
      this.wetGain.gain.value = value;
      this.dryGain.gain.value = 1 - value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("amount", this.params.amount);
  }

  dispose(): void {
    this.input.disconnect();
    this.dryGain.disconnect();
    this.wetGain.disconnect();
    this.compressor.disconnect();
    this.output.disconnect();
  }
}
