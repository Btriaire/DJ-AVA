import { BaseModule } from "./BaseModule";
import * as Tone from "tone";

export class DelayModule extends BaseModule {
  input: Tone.Gain;
  output: Tone.Gain;
  private delay: Tone.Delay;
  private feedback: Tone.Gain;
  private wet: Tone.Gain;

  constructor(ctx: AudioContext) {
    super(
      "delay",
      "DELAY",
      "Délai/écho — répétitions synchronisées au tempo",
      [
        { key: "time", label: "Temps", min: 0.01, max: 1.2, def: 0.5, fmt: (v) => `${(v * 1000).toFixed(0)} ms` },
        { key: "fb", label: "Feedback", min: 0, max: 0.9, def: 0.3, fmt: (v) => `${Math.round(v * 100)}%` },
      ],
      [{ key: "pingpong", label: "Ping-Pong" }]
    );

    this.input = new Tone.Gain();
    this.output = new Tone.Gain();
    this.delay = new Tone.Delay(0.5);
    this.feedback = new Tone.Gain(0.3);
    this.wet = new Tone.Gain(0.5);

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.output);
    this.input.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "time") {
      this.delay.delayTime.value = value;
    } else if (key === "fb") {
      this.feedback.gain.value = value;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("time", this.params.time);
    this.onParamChange("fb", this.params.fb);
  }

  dispose(): void {
    this.delay.dispose();
    this.feedback.dispose();
    this.wet.dispose();
    this.input.dispose();
    this.output.dispose();
  }
}
