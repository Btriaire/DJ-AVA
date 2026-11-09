// Channel vocoder: the voice makes a chord of saws speak; the DSP runs in public/vocoder-worklet.js (MaRuche/Falken)
export type VocoderParam = "formant" | "release" | "noise" | "spread" | "gate";
export const VOCODER_DEFAULTS: Record<VocoderParam, number> = { formant: 0, release: 0.06, noise: 0.5, spread: 0.6, gate: -55 };

export type VocoderWave = "saw" | "square" | "noise" | "bell";
export type VocoderNotes = "chord" | "melody" | "both"; // what the voice makes speak: the song's chord, the sung melody, or both
export interface VocoderVariant {
  notes: VocoderNotes;
  id: string;
  label: string;
  hint: string;
  bands: number;
  wave: VocoderWave;
  octave: number;
  mono: boolean;
  detune: number;
  trim: number;
  params: Record<Exclude<VocoderParam, "gate">, number>;
}
export const VOCODER_VARIANTS: VocoderVariant[] = [
  { id: "studio", notes: "chord", label: "Studio", hint: "24 bandes, accord large, la référence", bands: 24, wave: "saw", octave: 0, mono: false, detune: 7, trim: 1, params: { formant: 0, release: 0.06, noise: 0.5, spread: 0.6 } },
  { id: "robot", notes: "melody", label: "Robot", hint: "10 bandes, une seule note carrée, voix de machine", bands: 10, wave: "square", octave: 0, mono: true, detune: 0, trim: 0.9, params: { formant: 0, release: 0.02, noise: 0.15, spread: 0 } },
  { id: "choeur", notes: "chord", label: "Chœur", hint: "accord très désaccordé, longue traîne, très large", bands: 20, wave: "saw", octave: 0, mono: false, detune: 16, trim: 1.05, params: { formant: 0, release: 0.2, noise: 0.25, spread: 1 } },
  { id: "talk", notes: "melody", label: "Talk", hint: "32 bandes, une note, très parlant, funk", bands: 32, wave: "saw", octave: 0, mono: true, detune: 3, trim: 1.3, params: { formant: 2, release: 0.04, noise: 0.6, spread: 0.2 } },
  { id: "murmure", notes: "chord", label: "Murmure", hint: "sans note : la voix devient un souffle chuchoté", bands: 32, wave: "noise", octave: 0, mono: false, detune: 0, trim: 0.47, params: { formant: 0, release: 0.08, noise: 1, spread: 0.8 } },
  { id: "cristal", notes: "chord", label: "Cristal", hint: "accord en cloches FM, une octave plus haut", bands: 24, wave: "bell", octave: 1, mono: false, detune: 4, trim: 0.47, params: { formant: 0, release: 0.3, noise: 0.2, spread: 1 } },
  { id: "grave", notes: "chord", label: "Grave", hint: "accord une octave plus bas, formants baissés, voix de géant", bands: 16, wave: "saw", octave: -1, mono: false, detune: 5, trim: 1.36, params: { formant: -5, release: 0.08, noise: 0.3, spread: 0.3 } },
];

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

export class Vocoder {
  readonly mod: GainNode;
  readonly out: GainNode;
  private readonly ctx: BaseAudioContext;
  private node: AudioWorkletNode | null = null;
  private on = false;
  private lastLevel = 0.8;
  private lastChord: number[] | null = null;
  private params: Record<VocoderParam, number> = { ...VOCODER_DEFAULTS };
  private variant: VocoderVariant = VOCODER_VARIANTS[0];
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.mod = ctx.createGain();
    this.out = ctx.createGain();
    this.out.gain.value = 0;

    if (!loaded.has(ctx)) {
      loaded.set(ctx, ctx.audioWorklet.addModule("/vocoder-worklet.js"));
    }

    loaded.get(ctx)?.then(() => {
      this.node = new AudioWorkletNode(ctx, "vocoder", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { bands: this.variant.bands }
      });

      this.mod.connect(this.node);
      this.node.connect(this.out);

      this.postVariant();
      if (this.on) {
        this.node.port.postMessage({ type: "run", on: true });
        this.out.gain.cancelScheduledValues(ctx.currentTime);
        this.out.gain.setTargetAtTime(this.lastLevel, ctx.currentTime, 0.02);
      }

      (Object.keys(this.params) as VocoderParam[]).forEach((k) => {
        this.node?.parameters.get(k)?.setTargetAtTime(this.params[k], ctx.currentTime, 0.02);
      });

      if (this.lastChord) {
        this.node.port.postMessage({ type: "chord", midis: this.lastChord, when: 0 });
      }
    }).catch((e) => console.error("Failed to start vocoder:", e));
  }

  private postVariant() {
    if (!this.node) return;
    const { bands, wave, octave, mono, detune, trim } = this.variant;
    this.node.port.postMessage({ type: "variant", variant: { bands, wave, octave, mono, detune, trim } });
  }

  start(): void {
    if (this.on) return;

    this.on = true;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }

    if (this.node) {
      this.node.port.postMessage({ type: "run", on: true });
      this.out.gain.cancelScheduledValues(this.ctx.currentTime);
      this.out.gain.setTargetAtTime(this.lastLevel, this.ctx.currentTime, 0.02);
    }
  }

  stop(when: number): void {
    if (!this.on) return;

    this.on = false;
    this.out.gain.setTargetAtTime(0, Math.max(when, this.ctx.currentTime), 0.02);

    this.stopTimer = setTimeout(() => {
      if (!this.on && this.node) {
        this.node.port.postMessage({ type: "run", on: false });
      }
    }, Math.max(0, when - this.ctx.currentTime + 0.15) * 1000);
  }

  setChord(midis: number[], when: number): void {
    this.lastChord = midis;
    if (this.node) {
      this.node.port.postMessage({ type: "chord", midis: midis.slice(0, 4), when });
    }
  }

  setLevel(v: number): void {
    this.lastLevel = v;
    if (this.on) {
      this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    }
  }

  setParam(name: VocoderParam, v: number): void {
    this.params[name] = v;
    if (this.node) {
      this.node.parameters.get(name)?.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    }
  }

  setVariant(v: VocoderVariant): void {
    if (v.id === this.variant.id) return;
    this.variant = v;
    if (!this.node) return;
    if (this.on) {
      this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      setTimeout(() => {
        this.postVariant();
        if (this.on) {
          this.out.gain.setTargetAtTime(this.lastLevel, this.ctx.currentTime, 0.02);
        }
      }, 50);
    } else {
      this.postVariant();
    }
  }

  get running(): boolean {
    return this.on;
  }
}
