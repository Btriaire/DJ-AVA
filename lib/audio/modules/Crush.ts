import { BaseModule } from "./BaseModule";

export class CrushModule extends BaseModule {
  input: GainNode;
  output: GainNode;

  constructor(ctx: AudioContext) {
    super(
      "crush",
      "CRUSH",
      "Bit-crusher — réduction de résolution (lo-fi)",
      [{ key: "bits", label: "Bits", min: 1, max: 8, def: 4, fmt: (v) => `${Math.round(v)} bit` }]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.output);
    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    // Bit crushing happens in ScriptProcessor or AudioWorklet
    // For now, we store the param and apply it in the audio graph
    // In real implementation, this would use a custom AudioWorklet
  }

  private updateFromParams(): void {
    this.onParamChange("bits", this.params.bits);
  }

  dispose(): void {
    this.input.disconnect();
  }
}
