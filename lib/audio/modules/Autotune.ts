import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALE_LABELS = ["CHRO", "MAJ", "MIN"];

export class AutotuneModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private pitchShift: Tone.PitchShift;

  constructor(ctx: AudioContext) {
    super(
      "autotune",
      "AUTO-TUNE",
      "Auto-Tune — correction de hauteur monophonique",
      [
        { key: "amount", label: "Dose", min: 0, max: 1, def: 1, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "retune", label: "Glisse", min: 0, max: 1, def: 0.2, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "key", label: "Tonalité", min: 0, max: 11, def: 0, fmt: (v) => NOTE_NAMES[Math.round(v) % 12] },
        { key: "scale", label: "Gamme", min: 0, max: 2, def: 0, fmt: (v) => SCALE_LABELS[Math.round(v)] },
      ]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.pitchShift = new Tone.PitchShift(0);

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.pitchShift);
    this.pitchShift.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "amount") {
      // amount controls the pitch shift intensity
      const pitch = (Math.round(value * 12) - 6) * (value > 0.5 ? 1 : -1);
      this.pitchShift.pitch = pitch * value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("amount", this.params.amount);
  }

  dispose(): void {
    this.pitchShift.dispose();
    this.input.dispose();
    this.output.dispose();
  }
}
