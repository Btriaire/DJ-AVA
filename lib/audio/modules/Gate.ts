import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

export class GateModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private gate: Tone.Gate;

  constructor(ctx: AudioContext) {
    super(
      "gate",
      "GATE",
      "Portail — découpe le signal au rythme",
      [
        { key: "rate", label: "Rythme", min: 1, max: 16, def: 8, fmt: (v) => `1/${Math.round(v)}` },
        { key: "thresh", label: "Seuil", min: -60, max: 0, def: -30, fmt: (v) => `${Math.round(v)} dB` },
      ]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.gate = new Tone.Gate(-30, 0.1);

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.gate);
    this.gate.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "thresh") {
      this.gate.threshold.value = value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("thresh", this.params.thresh);
  }

  dispose(): void {
    this.gate.dispose();
    this.input.dispose();
    this.output.dispose();
  }
}
