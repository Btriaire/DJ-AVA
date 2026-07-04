import { BaseModule } from "./BaseModule";

const VOWELS = "AEIOU";

export class VoyelleModule extends BaseModule {
  input: GainNode;
  output: GainNode;
  private filters: BiquadFilterNode[] = [];

  constructor(ctx: AudioContext) {
    super(
      "voyelle",
      "VOYELLE",
      "Formant voyelle — morphing AEIOU",
      [
        { key: "morph", label: "Morph", min: 0, max: 1, def: 0.3, fmt: (v) => VOWELS[Math.round(v * 4)] },
        { key: "reso", label: "Résonance", min: 1, max: 20, def: 10, fmt: (v) => `${v.toFixed(1)}` },
      ]
    );

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Create 3 bandpass filters for vowel formants
    for (let i = 0; i < 3; i++) {
      const f = ctx.createBiquadFilter();
      f.type = "peaking";
      f.Q.value = 10;
      f.gain.value = 6;
      this.filters.push(f);
    }

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
    if (key === "morph") {
      const vowel = Math.round(value * 4);
      // Vowel formant frequencies (simplified)
      const formants = [
        [700, 1220, 2600], // A
        [400, 1600, 2250], // E
        [300, 2250, 2500], // I
        [500, 800, 2800],  // O
        [320, 700, 2600],  // U
      ];
      const f = formants[vowel];
      this.filters.forEach((fil, i) => {
        fil.frequency.value = f[i];
      });
    } else if (key === "reso") {
      this.filters.forEach((f) => {
        f.Q.value = value;
      });
    }
  }

  private updateFromParams(): void {
    this.onParamChange("morph", this.params.morph);
    this.onParamChange("reso", this.params.reso);
  }

  dispose(): void {
    this.input.disconnect();
    this.filters.forEach((f) => f.disconnect());
  }
}
