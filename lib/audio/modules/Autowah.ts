import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

export class AutowahModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private filter: any; // Tone.Filter
  private osc: any; // Tone.LFO

  constructor(ctx: AudioContext) {
    super(
      "autowah",
      "AUTO-WAH",
      "Wah automatique — filtre oscillant",
      [
        { key: "base", label: "Base", min: 20, max: 400, def: 120, fmt: (v) => `${Math.round(v)} Hz` },
        { key: "sens", label: "Sensibilité", min: -60, max: 0, def: -18, fmt: (v) => `${Math.round(v)} dB` },
        { key: "q", label: "Q", min: 0.5, max: 10, def: 5, fmt: (v) => `${v.toFixed(1)}` },
      ]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.filter = new Tone.Filter({ frequency: 120, type: "bandpass", rolloff: -12 });
    this.osc = new Tone.LFO({ frequency: 2, min: 100, max: 500 });

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.osc.start();
    this.osc.connect(this.filter.frequency);
    this.input.connect(this.filter);
    this.filter.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "base") {
      this.filter.frequency.value = value;
    } else if (key === "q") {
      this.filter.Q.value = value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("base", this.params.base);
    this.onParamChange("q", this.params.q);
  }

  dispose(): void {
    this.osc.dispose();
    this.filter.dispose();
    this.input.dispose();
    this.output.dispose();
  }
}
