import { BaseModule } from "./BaseModule";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export class DriveModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private preGain: GainNode;
  private waveshaper: WaveShaperNode;
  private toneFilter: BiquadFilterNode;
  private dcBlock: BiquadFilterNode;
  private makeupGain: GainNode;

  constructor(ctx: AudioContext) {
    super(
      "drive",
      "DRIVE",
      "Saturation analogique tube & bande — chaleur harmonique et grain vintage",
      [
        { key: "drive", label: "Drive", min: 0, max: 1, def: 0.4, fmt: pct },
        { key: "tone", label: "Couleur", min: 0, max: 1, def: 0.6, fmt: pct },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.preGain = ctx.createGain();
    this.waveshaper = ctx.createWaveShaper();
    this.waveshaper.oversample = "4x"; // Quad-oversampling anti-aliasing
    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = "lowpass";
    this.dcBlock = ctx.createBiquadFilter();
    this.dcBlock.type = "highpass";
    this.dcBlock.frequency.value = 18;
    this.makeupGain = ctx.createGain();

    this.build(ctx);
  }

  private updateDriveCurve(drive: number): void {
    const samples = 2048;
    const curve = new Float32Array(samples);
    // Asymmetric warm tube saturation curve: tanh + even harmonic spice
    const k = 1 + drive * 40;
    const asymmetry = 0.15 * drive;
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      const shaped = Math.tanh(k * x) / Math.tanh(k) + asymmetry * (x * x - 1) * Math.sign(x);
      curve[i] = Math.max(-1, Math.min(1, shaped));
    }
    this.waveshaper.curve = curve;
  }

  build(ctx: AudioContext): void {
    this.input.connect(this.preGain);
    this.preGain.connect(this.waveshaper);
    this.waveshaper.connect(this.toneFilter);
    this.toneFilter.connect(this.dcBlock);
    this.dcBlock.connect(this.makeupGain);
    this.makeupGain.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "drive") {
      this.preGain.gain.value = 1 + value * 8;
      this.updateDriveCurve(value);
      // Auto-compensate level so bypass A/B is transparent and doesn't blast
      this.makeupGain.gain.value = 1 / (1 + value * 0.75);
    } else if (key === "tone") {
      // 800 Hz to 18 kHz sweep
      this.toneFilter.frequency.value = 800 * Math.pow(22.5, value);
    }
  }

  private updateFromParams(): void {
    this.onParamChange("drive", this.params.drive);
    this.onParamChange("tone", this.params.tone);
  }

  dispose(): void {
    this.input.disconnect();
    this.preGain.disconnect();
    this.waveshaper.disconnect();
    this.toneFilter.disconnect();
    this.dcBlock.disconnect();
    this.makeupGain.disconnect();
    this.output.disconnect();
  }
}
