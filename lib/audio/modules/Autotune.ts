import { BaseModule } from "./BaseModule";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALE_LABELS = ["CHRO", "MAJ", "MIN"];

const AUTOTUNE_SCALES = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // chromatic
  [0, 2, 4, 5, 7, 9, 11],                 // major
  [0, 2, 3, 5, 7, 8, 10],                 // minor
];

export class AutotuneModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private workletNode: AudioWorkletNode | null = null;
  private ctx: AudioContext;

  constructor(ctx: AudioContext) {
    super(
      "autotune",
      "AUTO-TUNE",
      "Auto-Tune temps réel — correction de hauteur vocale par AudioWorklet",
      [
        { key: "amount", label: "Dose", min: 0, max: 1, def: 0.8, fmt: (v) => `${Math.round(v * 100)}%` },
        { key: "retune", label: "Vitesse", min: 0, max: 1, def: 0.2, fmt: (v) => (v < 0.05 ? "Robot" : `${Math.round(v * 100)}%`) },
        { key: "key", label: "Tonalité", min: 0, max: 11, def: 0, fmt: (v) => NOTE_NAMES[((Math.round(v) % 12) + 12) % 12] },
        { key: "scale", label: "Gamme", min: 0, max: 2, def: 0, fmt: (v) => SCALE_LABELS[Math.max(0, Math.min(2, Math.round(v)))] },
      ]
    );

    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.build(ctx);
  }

  private pushScale(): void {
    if (!this.workletNode) return;
    const k = ((Math.round(this.params.key) % 12) + 12) % 12;
    const scaleIdx = Math.max(0, Math.min(2, Math.round(this.params.scale)));
    const degrees = AUTOTUNE_SCALES[scaleIdx];
    const classes = degrees.map((d) => (d + k) % 12);
    this.workletNode.port.postMessage({ type: "scale", classes });
  }

  build(ctx: AudioContext): void {
    // Dry signal path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Initialize dry/wet mix
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;

    // Load actual AutotuneProcessor AudioWorklet
    if (ctx.audioWorklet) {
      ctx.audioWorklet
        .addModule("/autotune-worklet.js")
        .then(() => {
          this.workletNode = new AudioWorkletNode(ctx, "autotune", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          });
          this.input.connect(this.workletNode);
          this.workletNode.connect(this.wetGain);
          this.wetGain.connect(this.output);

          this.updateFromParams();
          this.pushScale();
        })
        .catch((e) => {
          console.warn("[AutotuneModule] worklet fallback:", e);
        });
    }
  }

  protected onParamChange(key: string, value: number): void {
    if (key === "amount") {
      const amp = this.workletNode?.parameters.get("amount");
      if (amp) amp.value = value;
      // Fade wet signal in proportionally
      this.wetGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
      this.dryGain.gain.setTargetAtTime(1 - value * 0.7, this.ctx.currentTime, 0.01);
    } else if (key === "retune") {
      const ret = this.workletNode?.parameters.get("retune");
      if (ret) ret.value = value;
    } else if (key === "key" || key === "scale") {
      this.pushScale();
    }
  }

  private updateFromParams(): void {
    this.onParamChange("amount", this.params.amount);
    this.onParamChange("retune", this.params.retune);
    this.pushScale();
  }

  dispose(): void {
    this.input.disconnect();
    this.dryGain.disconnect();
    if (this.workletNode) {
      this.workletNode.disconnect();
    }
    this.wetGain.disconnect();
    this.output.disconnect();
  }
}
