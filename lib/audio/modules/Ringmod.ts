import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

export class RingmodModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private osc: any; // Tone.Oscillator
  private mult: any; // Tone.Multiply
  private gain: any; // Tone.Gain

  constructor(ctx: AudioContext) {
    super(
      "ringmod",
      "RINGMOD",
      "Modulateur en anneau — effet métallique et inharmonique",
      [
        { key: "freq", label: "Fréquence", min: 20, max: 2000, def: 200, fmt: (v) => `${Math.round(v)} Hz` },
        { key: "depth", label: "Intensité", min: 0, max: 1, def: 0.5, fmt: (v) => `${Math.round(v * 100)}%` },
      ]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.osc = new Tone.Oscillator("sine");
    this.mult = new Tone.Multiply(0.5);
    this.gain = new Tone.Gain(0.5);

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.osc.start();
    this.input.connect(this.mult);
    this.osc.connect(this.mult);
    this.mult.connect(this.gain);
    this.gain.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "freq") {
      this.osc.frequency.value = value;
    } else if (key === "depth") {
      this.gain.gain.value = value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("freq", this.params.freq);
    this.onParamChange("depth", this.params.depth);
  }

  dispose(): void {
    this.osc.dispose();
    this.mult.dispose();
    this.gain.dispose();
    this.input.dispose();
    this.output.dispose();
  }
}
