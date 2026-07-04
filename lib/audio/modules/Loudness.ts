import { BaseModule, type ParamDef } from "./BaseModule";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export class LoudnessModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private stage1: DynamicsCompressorNode;
  private makeupGain: GainNode;
  private limiter: DynamicsCompressorNode;

  constructor(ctx: AudioContext) {
    super(
      "loudness",
      "LOUDNESS",
      "Maximiseur de loudness LUFS avec punch et coupe-pic",
      [
        { key: "target", label: "Cible", min: 0, max: 1, def: 0.5, fmt: (v) => `${Math.round(-14 + v * 8)} LUFS` },
        { key: "punch", label: "Punch", min: 0, max: 1, def: 0.5, fmt: pct },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.stage1 = ctx.createDynamicsCompressor();
    this.makeupGain = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    // 1. Stage 1: soft compression for body
    this.stage1.threshold.value = -30;
    this.stage1.ratio.value = 8;
    this.stage1.attack.value = 0.003;
    this.stage1.release.value = 0.25;

    // 2. Makeup gain + punch
    this.makeupGain.gain.value = 1;

    // 3. Limiter: hard ceiling at -0.5 dB
    this.limiter.threshold.value = -0.5;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;

    this.input.connect(this.stage1);
    this.stage1.connect(this.makeupGain);
    this.makeupGain.connect(this.limiter);
    this.limiter.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "target") {
      // target adjusts threshold and ratio
      const threshold = -40 + value * 18;
      const ratio = 4 + value * 12;
      this.stage1.threshold.value = threshold;
      this.stage1.ratio.value = ratio;
      // makeup gain compensates for compression
      const makeup = Math.pow(10, -threshold / 20 / ratio);
      this.makeupGain.gain.value = makeup;
    } else if (key === "punch") {
      // punch adjusts attack/release times and makeup
      const punchFactor = 0.5 + value * 2.5;
      this.stage1.attack.value = 0.01 / punchFactor;
      this.stage1.release.value = 0.4 / punchFactor;
      this.makeupGain.gain.value = 1 + value * 6;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("target", this.params.target);
    this.onParamChange("punch", this.params.punch);
  }

  dispose(): void {
    this.input.disconnect();
    this.stage1.disconnect();
    this.makeupGain.disconnect();
    this.limiter.disconnect();
  }
}
