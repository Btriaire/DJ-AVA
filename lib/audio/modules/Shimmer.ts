import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

export class ShimmerModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private reverb: any; // Tone.Reverb
  private pitchShift: any; // Tone.PitchShift
  private wet: any; // Tone.Gain

  constructor(ctx: AudioContext) {
    super(
      "shimmer",
      "SHIMMER",
      "Shimmer — réverbération cristalline avec décalage de hauteur",
      [
        { key: "decay", label: "Décroissance", min: 0.1, max: 10, def: 5, fmt: (v) => `${v.toFixed(1)}s` },
        { key: "shimmer", label: "Shimmer", min: 0, max: 1, def: 0.6, fmt: (v) => `${Math.round(v * 100)}%` },
      ]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.reverb = new Tone.Reverb(5);
    this.pitchShift = new Tone.PitchShift(12);
    this.wet = new Tone.Gain(0.4);

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.output);
    this.input.connect(this.reverb);
    this.reverb.connect(this.pitchShift);
    this.pitchShift.connect(this.wet);
    this.wet.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "decay") {
      this.reverb.decay = value;
    } else if (key === "shimmer") {
      this.wet.gain.value = value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("decay", this.params.decay);
    this.onParamChange("shimmer", this.params.shimmer);
  }

  dispose(): void {
    this.reverb.dispose();
    this.pitchShift.dispose();
    this.wet.dispose();
    this.input.dispose();
    this.output.dispose();
  }
}
