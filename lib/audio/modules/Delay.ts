import { BaseModule } from "./BaseModule";

export class DelayModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private delayL: DelayNode;
  private delayR: DelayNode;
  private feedbackL: GainNode;
  private feedbackR: GainNode;
  private filterL: BiquadFilterNode;
  private filterR: BiquadFilterNode;
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;

  constructor(ctx: AudioContext) {
    super(
      "delay",
      "DELAY",
      "Délai stéréo analogique & tape ping-pong avec filtre de boucle et saturation",
      [
        { key: "time", label: "Temps", min: 0.02, max: 1.2, def: 0.38, fmt: (v) => `${Math.round(v * 1000)} ms` },
        { key: "fb", label: "Feedback", min: 0, max: 0.95, def: 0.45, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "tone", label: "Amorti", min: 500, max: 16000, def: 6000, fmt: (v) => `${Math.round(v)} Hz` },
        { key: "mix", label: "Mix", min: 0, max: 1, def: 0.4, fmt: (v) => `${Math.round(v * 100)}%` },
      ],
      [{ key: "pingpong", label: "PING-PONG" }]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);

    this.delayL = ctx.createDelay(2.0);
    this.delayR = ctx.createDelay(2.0);
    this.feedbackL = ctx.createGain();
    this.feedbackR = ctx.createGain();

    // Warm analog tape damping filter in feedback loop
    this.filterL = ctx.createBiquadFilter();
    this.filterR = ctx.createBiquadFilter();
    this.filterL.type = "lowpass";
    this.filterR.type = "lowpass";

    this.build(ctx);
  }

  private wireFeedback(): void {
    this.filterL.disconnect();
    this.filterR.disconnect();

    const isPing = this.flags.pingpong;
    if (isPing) {
      // Cross-feedback for ping-pong bounce
      this.filterL.connect(this.delayR);
      this.filterR.connect(this.delayL);
    } else {
      // Parallel stereo feedback
      this.filterL.connect(this.delayL);
      this.filterR.connect(this.delayR);
    }
  }

  build(ctx: AudioContext): void {
    // Dry path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path: input -> splitter -> delay -> feedback -> filter -> merger -> wetGain -> output
    this.input.connect(this.splitter);
    this.splitter.connect(this.delayL, 0);
    this.splitter.connect(this.delayR, 1);

    this.delayL.connect(this.feedbackL);
    this.feedbackL.connect(this.filterL);

    this.delayR.connect(this.feedbackR);
    this.feedbackR.connect(this.filterR);

    this.wireFeedback();

    this.delayL.connect(this.merger, 0, 0);
    this.delayR.connect(this.merger, 0, 1);

    this.merger.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "time") {
      this.delayL.delayTime.value = value;
      // Slight offset for wider stereo field if not ping-pong
      this.delayR.delayTime.value = this.flags.pingpong ? value : value * 0.98;
    } else if (key === "fb") {
      this.feedbackL.gain.value = value;
      this.feedbackR.gain.value = value;
    } else if (key === "tone") {
      this.filterL.frequency.value = value;
      this.filterR.frequency.value = value;
    } else if (key === "mix") {
      const dryVal = Math.cos(value * 0.5 * Math.PI);
      const wetVal = Math.sin(value * 0.5 * Math.PI);
      this.dryGain.gain.value = dryVal;
      this.wetGain.gain.value = wetVal;
    }
  }

  protected onFlagChange(key: string, value: boolean): void {
    if (key === "pingpong") {
      this.wireFeedback();
      this.onParamChange("time", this.params.time);
    }
  }

  private updateFromParams(): void {
    this.onParamChange("time", this.params.time);
    this.onParamChange("fb", this.params.fb);
    this.onParamChange("tone", this.params.tone);
    this.onParamChange("mix", this.params.mix);
  }

  dispose(): void {
    this.input.disconnect();
    this.dryGain.disconnect();
    this.splitter.disconnect();
    this.delayL.disconnect();
    this.delayR.disconnect();
    this.feedbackL.disconnect();
    this.feedbackR.disconnect();
    this.filterL.disconnect();
    this.filterR.disconnect();
    this.merger.disconnect();
    this.wetGain.disconnect();
    this.output.disconnect();
  }
}
