import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

export class ReverbModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private reverb: any; // Tone.Reverb
  private wet: any; // Tone.Gain

  constructor(ctx: AudioContext) {
    super(
      "reverb",
      "REVERB",
      "Réverbération — espace et profondeur",
      [
        { key: "decay", label: "Décroissance", min: 0.1, max: 10, def: 3.5, fmt: (v) => `${v.toFixed(1)}s` },
        { key: "pre", label: "Pré-délai", min: 0, max: 0.5, def: 0, fmt: (v) => `${(v * 1000).toFixed(0)} ms` },
      ]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.reverb = new Tone.Reverb(3.5);
    this.wet = new Tone.Gain(0.25);

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.output);
    this.input.connect(this.reverb);
    this.reverb.connect(this.wet);
    this.wet.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "decay") {
      this.reverb.decay = value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("decay", this.params.decay);
  }

  dispose(): void {
    this.reverb.dispose();
    this.wet.dispose();
    this.input.dispose();
    this.output.dispose();
  }
}
