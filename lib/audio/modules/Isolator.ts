import { BaseModule } from "./BaseModule";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export class IsolatorModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;
  private midGain: GainNode;
  private sideGain: GainNode;

  constructor(ctx: AudioContext) {
    super(
      "isolator",
      "ISO VOIX",
      "Isolateur de voix — garde le centre (karaoke retire la voix)",
      [{ key: "focus", label: "Focus", min: 0, max: 1, def: 0.7, fmt: pct }],
      [{ key: "karaoke", label: "KARAOKE" }]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);
    this.midGain = ctx.createGain();
    this.sideGain = ctx.createGain();

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    // M/S decode: M = (L+R)/2, S = (L-R)/2
    this.input.connect(this.splitter);

    const midSum = ctx.createGain();
    this.splitter.connect(midSum, 0);
    this.splitter.connect(midSum, 1);
    midSum.gain.value = 0.5;
    midSum.connect(this.midGain);

    const leftSide = ctx.createGain();
    this.splitter.connect(leftSide, 0);
    leftSide.gain.value = 0.5;

    const rightSideNeg = ctx.createGain();
    this.splitter.connect(rightSideNeg, 1);
    rightSideNeg.gain.value = -0.5;

    const sideMerge = ctx.createGain();
    leftSide.connect(sideMerge);
    rightSideNeg.connect(sideMerge);
    sideMerge.connect(this.sideGain);

    // Encode: L' = M+S, R' = M-S
    this.midGain.connect(this.merger, 0, 0);
    this.midGain.connect(this.merger, 0, 1);
    this.sideGain.connect(this.merger, 0, 0);

    const sideNeg = ctx.createGain();
    sideNeg.gain.value = -1;
    this.sideGain.connect(sideNeg);
    sideNeg.connect(this.merger, 0, 1);

    this.merger.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "focus") {
      this.midGain.gain.value = 1;
      this.sideGain.gain.value = 1 - value;
    }
  }

  protected onFlagChange(key: string, value: boolean): void {
    if (key === "karaoke") {
      this.midGain.gain.value = value ? 0 : 1;
      this.sideGain.gain.value = value ? 1 : 1 - this.params.focus;
    }
  }

  private updateFromParams(): void {
    if (this.flags.karaoke) {
      this.midGain.gain.value = 0;
      this.sideGain.gain.value = 1;
    } else {
      this.onParamChange("focus", this.params.focus);
    }
  }

  dispose(): void {
    this.input.disconnect();
    this.splitter.disconnect();
    this.midGain.disconnect();
    this.sideGain.disconnect();
    this.merger.disconnect();
  }
}
