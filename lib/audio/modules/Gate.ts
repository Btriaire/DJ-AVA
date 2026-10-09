import { BaseModule } from "./BaseModule";

export class GateModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private vca: GainNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private dcOffset: ConstantSourceNode;
  private ctx: AudioContext;

  constructor(ctx: AudioContext) {
    super(
      "gate",
      "GATE",
      "Trance & rhythmic gate — découpage rythmique tranchant et synchronisé",
      [
        { key: "rate", label: "Vitesse", min: 1, max: 20, def: 8, fmt: (v) => `${v.toFixed(1)} Hz` },
        { key: "depth", label: "Profondeur", min: 0, max: 1, def: 0.9, fmt: (v) => `${Math.round(v * 100)}%` },
      ]
    );

    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.vca = ctx.createGain();

    this.lfo = ctx.createOscillator();
    this.lfo.type = "square";
    this.lfoGain = ctx.createGain();

    this.dcOffset = ctx.createConstantSource();
    this.dcOffset.offset.value = 0.5;

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.vca);
    this.vca.connect(this.output);

    // Bipolar square wave (-1 to +1) scaled and offset to unipolar modulation (0 to 1)
    this.lfo.frequency.value = this.params.rate;
    this.lfoGain.gain.value = 0.5 * this.params.depth;

    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.vca.gain);
    this.dcOffset.connect(this.vca.gain);

    try {
      this.lfo.start();
      this.dcOffset.start();
    } catch {
      /* already started */
    }

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "rate") {
      this.lfo.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.01);
    } else if (key === "depth") {
      this.lfoGain.gain.setTargetAtTime(0.5 * value, this.ctx.currentTime, 0.01);
      this.dcOffset.offset.setTargetAtTime(1 - 0.5 * value, this.ctx.currentTime, 0.01);
    }
  }

  private updateFromParams(): void {
    this.onParamChange("rate", this.params.rate);
    this.onParamChange("depth", this.params.depth);
  }

  dispose(): void {
    try {
      this.lfo.stop();
      this.dcOffset.stop();
    } catch {}
    this.input.disconnect();
    this.vca.disconnect();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.dcOffset.disconnect();
    this.output.disconnect();
  }
}
