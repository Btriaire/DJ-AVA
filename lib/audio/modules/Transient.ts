import { BaseModule } from "./BaseModule";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export class TransientModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private fastComp: DynamicsCompressor;
  private slowComp: DynamicsCompressor;
  private fastGain: GainNode;
  private slowGain: GainNode;

  constructor(ctx: AudioContext) {
    super(
      "transient",
      "TRANSIENT",
      "Contrôleur de transitoire — resserre les attaques ou prolonge la sustain",
      [
        { key: "attack", label: "Attaque", min: 0, max: 1, def: 0.5, fmt: pct },
        { key: "sustain", label: "Sustain", min: 0, max: 1, def: 0.3, fmt: pct },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.fastComp = ctx.createDynamicsCompressor();
    this.slowComp = ctx.createDynamicsCompressor();
    this.fastGain = ctx.createGain();
    this.slowGain = ctx.createGain();

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    // Fast compressor (attack control)
    this.fastComp.threshold.value = -24;
    this.fastComp.ratio.value = 4;
    this.fastComp.attack.value = 0.0005;
    this.fastComp.release.value = 0.1;
    this.fastGain.gain.value = 1;

    // Slow compressor (sustain control)
    this.slowComp.threshold.value = -24;
    this.slowComp.ratio.value = 2;
    this.slowComp.attack.value = 0.06;
    this.slowComp.release.value = 0.3;
    this.slowGain.gain.value = 1;

    // Parallel: both comps in parallel, sum at output
    this.input.connect(this.fastComp);
    this.fastComp.connect(this.fastGain);
    this.fastGain.connect(this.output);

    this.input.connect(this.slowComp);
    this.slowComp.connect(this.slowGain);
    this.slowGain.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "attack") {
      // attack: 0 = subtle, 1 = aggressive transient control
      this.fastGain.gain.value = 0.5 + value * 2.5;
      this.fastComp.attack.value = 0.01 / (0.5 + value * 2);
    } else if (key === "sustain") {
      // sustain: 0 = dry, 1 = full sustain boost
      this.slowGain.gain.value = value * 1.5;
    }
  }

  private updateFromParams(): void {
    this.onParamChange("attack", this.params.attack);
    this.onParamChange("sustain", this.params.sustain);
  }

  dispose(): void {
    this.input.disconnect();
    this.fastComp.disconnect();
    this.slowComp.disconnect();
    this.fastGain.disconnect();
    this.slowGain.disconnect();
  }
}
