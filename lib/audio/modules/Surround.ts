import { BaseModule } from "./BaseModule";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export class SurroundModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;
  private midGain: GainNode;
  private sideGain: GainNode;
  private sideNeg: GainNode;

  constructor(ctx: AudioContext) {
    super(
      "surround",
      "SURROUND",
      "Élargisseur stéréo M/S — augmente la largeur ou renforce le centre",
      [
        { key: "width", label: "Largeur", min: 0, max: 2, def: 1.5, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "depth", label: "Centre", min: 0, max: 1, def: 0, fmt: pct },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.splitter = ctx.createChannelSplitter(2);
    this.merger = ctx.createChannelMerger(2);
    this.midGain = ctx.createGain();
    this.sideGain = ctx.createGain();
    this.sideNeg = ctx.createGain();
    this.sideNeg.gain.value = -1;

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    // M/S decode: L+R=M, L-R=S
    // splitter gives [L, R]
    // adder: M = (L+R)/2, S = (L-R)/2
    // then apply width/depth, encode back L' = M+S, R' = M-S
    this.input.connect(this.splitter);

    // Left path (L) and right path (R)
    const left = this.splitter;
    const right = this.splitter;

    // Mid = (L + R) / 2
    // Sum L+R
    const midSum = ctx.createGain();
    left.connect(midSum, 0);
    right.connect(midSum, 1);
    midSum.gain.value = 0.5; // (L+R)/2
    midSum.connect(this.midGain);

    // Side = (L - R) / 2
    // L branch
    const leftSide = ctx.createGain();
    left.connect(leftSide, 0);
    leftSide.gain.value = 0.5;

    // R branch (negated)
    const rightSideNeg = ctx.createGain();
    right.connect(rightSideNeg, 1);
    rightSideNeg.gain.value = -0.5;
    rightSideNeg.connect(this.sideNeg);

    // Combine for Side
    leftSide.connect(this.sideGain);
    this.sideNeg.connect(this.sideGain);

    // Encode back: L' = M + S, R' = M - S
    this.midGain.connect(this.merger, 0, 0); // M -> L
    this.midGain.connect(this.merger, 0, 1); // M -> R
    this.sideGain.connect(this.merger, 0, 0); // S -> L (positive)
    this.sideGain.connect(this.sideNeg, 0); // S -> R (negated)
    this.sideNeg.connect(this.merger, 0, 1);

    this.merger.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "width") {
      // width: 0 = mono (all mid), 1 = normal, 2 = super wide
      this.sideGain.gain.value = value;
    } else if (key === "depth") {
      // depth: 0 = normal, 1 = all mid (mono)
      this.midGain.gain.value = Math.max(0.01, 1 - value * 0.5);
    }
  }

  private updateFromParams(): void {
    this.onParamChange("width", this.params.width);
    this.onParamChange("depth", this.params.depth);
  }

  dispose(): void {
    this.input.disconnect();
    this.splitter.disconnect();
    this.midGain.disconnect();
    this.sideGain.disconnect();
    this.sideNeg.disconnect();
    this.merger.disconnect();
  }
}
