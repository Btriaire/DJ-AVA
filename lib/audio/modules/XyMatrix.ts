import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

// XY pad : X contrôle Effect A (ex. LP cutoff), Y contrôle Effect B (ex. mix/wet)
// Via 2D touch, DJ peut tweaker 2 params simultanément = très live

export class XyMatrixModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private lpFilter: Tone.Filter;
  private lpFeedback: Tone.Gain;
  private hpFilter: Tone.Filter;
  private wetGain: Tone.Gain;
  private dryGain: Tone.Gain;

  constructor(ctx: AudioContext) {
    super(
      "xymatrix",
      "XY MATRIX",
      "Pad tactile 2D : X = filtre, Y = wet/dry",
      [
        { key: "x", label: "X", min: 0, max: 1, def: 0.5, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "y", label: "Y", min: 0, max: 1, def: 0, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "res", label: "Resonance", min: 1, max: 30, def: 1, fmt: (v) => `Q${v.toFixed(1)}` },
      ]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.dryGain = new Tone.Gain(1);
    this.wetGain = new Tone.Gain(0); // start at 0 mix
    this.lpFilter = new Tone.Filter({ type: "lowpass", frequency: 5000, rolloff: -24 });
    this.hpFilter = new Tone.Filter({ type: "highpass", frequency: 100, rolloff: -24 });
    this.lpFeedback = new Tone.Gain(0);

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    // wet path: input → HP → LP (with feedback) → wet mixer
    this.input.connect(this.hpFilter);
    this.hpFilter.connect(this.lpFilter);
    this.lpFilter.connect(this.lpFeedback);
    this.lpFeedback.connect(this.lpFilter); // feedback
    this.lpFilter.connect(this.wetGain);

    // dry path
    this.input.connect(this.dryGain);

    // mix
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "x") {
      // X axis: sweep LP cutoff 200Hz → 16kHz
      const freq = 200 + value * 15800;
      this.lpFilter.frequency.rampTo(freq, 0.05);
      this.lpFeedback.gain.value = Math.max(0, value - 0.5) * 0.4; // feedback on upper range
    } else if (key === "y") {
      // Y axis: wet/dry mix, starts at 0 (dry)
      this.dryGain.gain.rampTo(1 - value, 0.05);
      this.wetGain.gain.rampTo(value, 0.05);
    } else if (key === "res") {
      this.lpFilter.Q.value = value;
      this.hpFilter.Q.value = value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("x", this.params.x);
    this.onParamChange("y", this.params.y);
    this.onParamChange("res", this.params.res);
  }

  dispose(): void {
    this.input.dispose();
    this.output.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.lpFilter.dispose();
    this.hpFilter.dispose();
    this.lpFeedback.dispose();
  }
}
