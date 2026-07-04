import { BaseModule } from "./BaseModule";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export class MultibandModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private loLP: BiquadFilterNode;
  private loComp: DynamicsCompressor;
  private midLP: BiquadFilterNode;
  private midHP: BiquadFilterNode;
  private midComp: DynamicsCompressor;
  private hiHP: BiquadFilterNode;
  private hiComp: DynamicsCompressor;

  constructor(ctx: AudioContext) {
    super(
      "multiband",
      "MULTI-BAND",
      "Compresseur multifrequence — contrôle grave/médium/aigu indépendamment",
      [
        { key: "lo", label: "Grave", min: 0, max: 1, def: 0.4, fmt: pct },
        { key: "mid", label: "Médium", min: 0, max: 1, def: 0.3, fmt: pct },
        { key: "hi", label: "Aigu", min: 0, max: 1, def: 0.5, fmt: pct },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Low band: LP @ 250 Hz
    this.loLP = ctx.createBiquadFilter();
    this.loLP.type = "lowpass";
    this.loLP.frequency.value = 250;
    this.loComp = ctx.createDynamicsCompressor();

    // Mid band: HP @ 250 Hz, LP @ 4k
    this.midHP = ctx.createBiquadFilter();
    this.midHP.type = "highpass";
    this.midHP.frequency.value = 250;
    this.midLP = ctx.createBiquadFilter();
    this.midLP.type = "lowpass";
    this.midLP.frequency.value = 4000;
    this.midComp = ctx.createDynamicsCompressor();

    // High band: HP @ 4k
    this.hiHP = ctx.createBiquadFilter();
    this.hiHP.type = "highpass";
    this.hiHP.frequency.value = 4000;
    this.hiComp = ctx.createDynamicsCompressor();

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    // Low band
    this.input.connect(this.loLP);
    this.loLP.connect(this.loComp);
    this.loComp.connect(this.output);

    // Mid band
    this.input.connect(this.midHP);
    this.midHP.connect(this.midLP);
    this.midLP.connect(this.midComp);
    this.midComp.connect(this.output);

    // High band
    this.input.connect(this.hiHP);
    this.hiHP.connect(this.hiComp);
    this.hiComp.connect(this.output);

    // Initialize compressors
    [this.loComp, this.midComp, this.hiComp].forEach((comp) => {
      comp.threshold.value = -24;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
    });

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    const compMap = { lo: this.loComp, mid: this.midComp, hi: this.hiComp };
    const comp = compMap[key as keyof typeof compMap];
    if (comp) {
      // value 0 = subtle, 1 = aggressive
      comp.ratio.value = 1 + value * 14; // 1:1 to 15:1
      comp.threshold.value = -12 - value * 24; // -12 to -36 dB
    }
  }

  private updateFromParams(): void {
    this.onParamChange("lo", this.params.lo);
    this.onParamChange("mid", this.params.mid);
    this.onParamChange("hi", this.params.hi);
  }

  dispose(): void {
    this.input.disconnect();
    this.loLP.disconnect();
    this.loComp.disconnect();
    this.midHP.disconnect();
    this.midLP.disconnect();
    this.midComp.disconnect();
    this.hiHP.disconnect();
    this.hiComp.disconnect();
  }
}
