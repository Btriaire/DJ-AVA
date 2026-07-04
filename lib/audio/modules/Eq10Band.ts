import { BaseModule, type ParamDef } from "./BaseModule";

const EQ_FREQS = [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600];
const eqLabel = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`);
const dbr = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`;

export class Eq10BandModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private filters: BiquadFilterNode[] = [];

  constructor(ctx: AudioContext) {
    const paramDefs: ParamDef[] = EQ_FREQS.map((f, i) => ({
      key: `g${i}`,
      label: eqLabel(f),
      min: -18,
      max: 18,
      def: 0,
      fmt: dbr,
    }));

    super(
      "eq10band",
      "EQ 10 BANDES",
      "Égaliseur graphique 10 bandes — curseur vertical par fréquence",
      paramDefs
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    EQ_FREQS.forEach((freq) => {
      const f = ctx.createBiquadFilter();
      f.type = "peaking";
      f.frequency.value = freq;
      f.Q.value = 0.707;
      f.gain.value = 0;
      this.filters.push(f);
    });

    this.build(ctx);
  }

  build(ctx: AudioContext): void {
    let prev: AudioNode = this.input;
    this.filters.forEach((f) => {
      prev.connect(f);
      prev = f;
    });
    prev.connect(this.output);

    this.updateFromParams();
  }

  protected onParamChange(key: string, value: number): void {
    const match = key.match(/g(\d+)/);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (this.filters[idx]) {
        this.filters[idx].gain.value = value;
      }
    }
  }

  private updateFromParams(): void {
    Object.entries(this.params).forEach(([key, value]) => {
      this.onParamChange(key, value);
    });
  }

  dispose(): void {
    this.input.disconnect();
    this.filters.forEach((f) => f.disconnect());
  }
}
