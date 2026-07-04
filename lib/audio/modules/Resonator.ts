import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

export class ResonatorModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private filter: Tone.Filter;

  constructor(ctx: AudioContext) {
    super(
      "resonator",
      "RESONATOR",
      "Résonateur — pic spectral aigu",
      [
        { key: "freq", label: "Fréquence", min: 100, max: 8000, def: 2000, fmt: (v) => `${Math.round(v)} Hz` },
        { key: "q", label: "Q", min: 1, max: 20, def: 10, fmt: (v) => `${v.toFixed(1)}` },
      ]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.filter = new Tone.Filter({ frequency: 2000, type: "peaking", rolloff: -12 });

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.filter);
    this.filter.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "freq") {
      this.filter.frequency.value = value;
    } else if (key === "q") {
      this.filter.Q.value = value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("freq", this.params.freq);
    this.onParamChange("q", this.params.q);
  }

  dispose(): void {
    this.filter.dispose();
    this.input.dispose();
    this.output.dispose();
  }
}
