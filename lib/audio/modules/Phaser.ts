import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

// Phaser classique : LFO module la fréquence d'un all-pass filter = sweep spatial
// DJ standard pour les sweeps dramatiques et les effets de "whoosh"

export class PhaserModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private allPass: Tone.Filter;
  private lfo: Tone.LFO;
  private wetGain: Tone.Gain;
  private dryGain: Tone.Gain;

  constructor(ctx: AudioContext) {
    super(
      "phaser",
      "PHASER",
      "Sweep modulation — effet spatial DJ",
      [
        { key: "rate", label: "Rate", min: 0.1, max: 10, def: 2, fmt: (v) => `${v.toFixed(1)} Hz` },
        { key: "depth", label: "Depth", min: 0, max: 1, def: 0.8, fmt: (v) => `${Math.round(v * 100)}%` },
      ]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.dryGain = new Tone.Gain(1);
    this.wetGain = new Tone.Gain(0); // start at 0 mix
    this.allPass = new Tone.Filter({ type: "allpass", frequency: 1000 });
    this.lfo = new Tone.LFO({ frequency: 2, min: 200, max: 5000, type: "sine" });

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.dryGain);
    this.input.connect(this.allPass);
    this.allPass.connect(this.wetGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this.lfo.connect(this.allPass.frequency);
    this.lfo.start();
    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "rate") {
      this.lfo.frequency.value = value;
    } else if (key === "depth") {
      // depth : wet/dry mix starts at 0
      this.dryGain.gain.rampTo(1 - value, 0.05);
      this.wetGain.gain.rampTo(value, 0.05);
    }
  }

  private updateFromParams(): void {
    this.onParamChange("rate", this.params.rate);
    this.onParamChange("depth", this.params.depth);
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.dispose();
    this.input.dispose();
    this.output.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.allPass.dispose();
  }
}
