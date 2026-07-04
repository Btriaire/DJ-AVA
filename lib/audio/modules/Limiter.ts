import { BaseModule } from "./BaseModule";

const dbr = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`;

export class LimiterModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private limiter: DynamicsCompressor;

  constructor(ctx: AudioContext) {
    super(
      "limiter",
      "LIMITER",
      "Limiteur — coupe-pic de sécurité",
      [{ key: "ceil", label: "Plafond", min: -12, max: 0, def: -1, fmt: dbr }]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.limiter.threshold.value = -0.5;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;

    this.input.connect(this.limiter);
    this.limiter.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "ceil") {
      const ceil = Math.pow(10, value / 20);
      this.output.gain.value = Math.max(0.1, Math.min(1, ceil));
    }
  }

  private updateFromParams(): void {
    this.onParamChange("ceil", this.params.ceil);
  }

  dispose(): void {
    this.input.disconnect();
    this.limiter.disconnect();
  }
}
