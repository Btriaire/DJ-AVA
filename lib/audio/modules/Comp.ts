import { BaseModule } from "./BaseModule";

const dbr = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`;
const ms = (v: number) => `${Math.round(v * 1000)} ms`;

export class CompModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private comp: DynamicsCompressorNode;
  private makeupGain: GainNode;
  private ctx: AudioContext;

  constructor(ctx: AudioContext) {
    super(
      "comp",
      "COMP",
      "Compresseur analogique studio VCA — colle, punch et contrôle dynamique précis",
      [
        { key: "thresh", label: "Seuil", min: -60, max: 0, def: -22, fmt: dbr },
        { key: "ratio", label: "Ratio", min: 1, max: 20, def: 4.5, fmt: (v) => `${v.toFixed(1)}:1` },
        { key: "attack", label: "Attaque", min: 0.0005, max: 0.08, def: 0.005, fmt: ms },
        { key: "release", label: "Relâche", min: 0.02, max: 0.8, def: 0.22, fmt: ms },
        { key: "gain", label: "Makeup", min: 0, max: 18, def: 2, fmt: (v) => `+${Math.round(v)} dB` },
      ]
    );

    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.makeupGain = ctx.createGain();

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.comp.knee.value = 6;
    this.input.connect(this.comp);
    this.comp.connect(this.makeupGain);
    this.makeupGain.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    const t = this.ctx.currentTime;
    if (key === "thresh") {
      this.comp.threshold.setTargetAtTime(value, t, 0.01);
    } else if (key === "ratio") {
      this.comp.ratio.setTargetAtTime(value, t, 0.01);
    } else if (key === "attack") {
      this.comp.attack.setTargetAtTime(value, t, 0.01);
    } else if (key === "release") {
      this.comp.release.setTargetAtTime(value, t, 0.01);
    } else if (key === "gain") {
      this.makeupGain.gain.setTargetAtTime(Math.pow(10, value / 20), t, 0.01);
    }
  }

  private updateFromParams(): void {
    this.onParamChange("thresh", this.params.thresh);
    this.onParamChange("ratio", this.params.ratio);
    this.onParamChange("attack", this.params.attack);
    this.onParamChange("release", this.params.release);
    this.onParamChange("gain", this.params.gain);
  }

  dispose(): void {
    this.input.disconnect();
    this.comp.disconnect();
    this.makeupGain.disconnect();
    this.output.disconnect();
  }
}
