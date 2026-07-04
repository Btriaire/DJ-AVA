import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

export class RobotModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private crush: any; // Tone.BitCrusher
  private shift: any; // Tone.PitchShift

  constructor(ctx: AudioContext) {
    super(
      "robot",
      "ROBOT",
      "Voix robotique — bitcrush + décalage + médium",
      [
        { key: "carrier", label: "Fréquence", min: 0, max: 1, def: 0, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "grit", label: "Grit", min: 1, max: 8, def: 4, fmt: (v) => `${Math.round(v)} bits` },
        { key: "tone", label: "Tone", min: 0, max: 2400, def: 1200, fmt: (v) => `${Math.round(v)} Hz` },
      ]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.crush = new Tone.BitCrusher(4);
    this.shift = new Tone.PitchShift(0);

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.crush);
    this.crush.connect(this.shift);
    this.shift.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "carrier") {
      this.shift.pitch = -12 + value * 24;
    } else if (key === "grit") {
      this.crush.bits.value = value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("carrier", this.params.carrier);
    this.onParamChange("grit", this.params.grit);
  }

  dispose(): void {
    this.input.dispose();
    this.crush.dispose();
    this.shift.dispose();
    this.output.dispose();
  }
}
