import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

// Comb Filter : delay + feedback crée des notches spectrales = texture DJ ultra
// Sweep le délai = sweep vocal robotic/alien effect

export class CombFilterModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private delay: Tone.Delay;
  private feedback: Tone.Gain;
  private wetGain: Tone.Gain;
  private dryGain: Tone.Gain;
  private lfo: Tone.LFO;

  constructor(ctx: AudioContext) {
    super(
      "combfilter",
      "COMB",
      "Filtre à peigne — notches spectrales DJ",
      [
        { key: "time", label: "Temps", min: 0.5, max: 50, def: 10, fmt: (v) => `${v.toFixed(1)} ms` },
        { key: "fb", label: "Feedback", min: 0, max: 0.95, def: 0.5, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "lfoRate", label: "LFO", min: 0, max: 5, def: 0, fmt: (v) => `${v.toFixed(2)} Hz` },
      ]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.dryGain = new Tone.Gain(1);
    this.wetGain = new Tone.Gain(0); // start at 0 mix
    this.delay = new Tone.Delay(0.01);
    this.feedback = new Tone.Gain(0.5);
    this.lfo = new Tone.LFO({ frequency: 0, min: 0.001, max: 0.05, type: "sine" });

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    // comb: input → delay + feedback loop → wet mix
    this.input.connect(this.dryGain);
    this.input.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wetGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this.lfo.connect(this.delay.delayTime);
    this.lfo.start();
    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "time") {
      this.delay.delayTime.rampTo(value / 1000, 0.05); // ms → seconds
    } else if (key === "fb") {
      this.feedback.gain.value = value;
    } else if (key === "lfoRate") {
      this.lfo.frequency.value = value;
      // auto-mix : plus de LFO = plus de wet
      if (value > 0) {
        this.wetGain.gain.rampTo(Math.min(0.8, value / 5), 0.1);
      }
    }
  }

  private updateFromParams(): void {
    this.onParamChange("time", this.params.time);
    this.onParamChange("fb", this.params.fb);
    this.onParamChange("lfoRate", this.params.lfoRate);
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.dispose();
    this.input.dispose();
    this.output.dispose();
    this.dryGain.dispose();
    this.wetGain.dispose();
    this.delay.dispose();
    this.feedback.dispose();
  }
}
