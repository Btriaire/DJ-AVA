import { BaseModule } from "./BaseModule";

const dbr = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`;

export class CompModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private comp: DynamicsCompressorNode;

  constructor(ctx: AudioContext) {
    super(
      "comp",
      "COMP",
      "Compresseur — colle et donne du punch",
      [
        { key: "thresh", label: "Seuil", min: -60, max: 0, def: -24, fmt: dbr },
        { key: "ratio", label: "Ratio", min: 1, max: 20, def: 4, fmt: (v) => `${v.toFixed(1)}:1` },
        { key: "gain", label: "Gain", min: 0, max: 24, def: 0, fmt: (v) => `+${Math.round(v)} dB` },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.comp.threshold.value = -24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;

    this.input.connect(this.comp);
    this.comp.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "thresh") {
      this.comp.threshold.value = value;
    } else if (key === "ratio") {
      this.comp.ratio.value = value;
    } else if (key === "gain") {
      this.output.gain.value = Math.pow(10, value / 20);
    }
  }

  private updateFromParams(): void {
    this.onParamChange("thresh", this.params.thresh);
    this.onParamChange("ratio", this.params.ratio);
    this.onParamChange("gain", this.params.gain);
  }

  dispose(): void {
    this.input.disconnect();
    this.comp.disconnect();
  }
}
