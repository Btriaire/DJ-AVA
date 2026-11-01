// The effects of one row of the Stem Sample Pad (one stem): every pad of the row plays into `input`, the effects run
// in series (filters, drive, crush, air, transposition, gate, width) and in parallel sends (echo, reverb, harmony,
// stutter); `output` goes on to the stem's chain. Wiring by Claude, settings by MaRuche.
import * as Tone from "tone";

export type PadFxId = "echo" | "reverb" | "air" | "filter" | "highpass" | "drive" | "crush" | "gate" | "harmony" | "trans" | "stutter" | "wide";
export const PAD_FX: { id: PadFxId; label: string; title: string; def: number }[] = [
  { id: "echo", label: "Écho", title: "Répétitions calées sur le tempo (croche pointée) ; le bouton dose le retour", def: 0.45 },
  { id: "reverb", label: "Réverb", title: "La boucle dans une grande salle ; le bouton dose la salle", def: 0.4 },
  { id: "air", label: "Air", title: "De l'air et de la brillance dans les aigus", def: 0.6 },
  { id: "filter", label: "Filtre", title: "Passe-bas : étouffe le son ; le bouton ferme le filtre", def: 0.5 },
  { id: "highpass", label: "Passe-haut", title: "Retire les graves : le son devient fin", def: 0.5 },
  { id: "drive", label: "Drive", title: "Saturation chaude, plus de mordant", def: 0.4 },
  { id: "crush", label: "Crush", title: "Son lo-fi, grain numérique", def: 0.5 },
  { id: "gate", label: "Gate", title: "Hache le son en doubles croches calées sur le tempo", def: 0.8 },
  { id: "harmony", label: "Harmonie", title: "Ajoute la même boucle au-dessus ; le bouton choisit tierce, quarte ou quinte", def: 0.66 },
  { id: "trans", label: "Trans", title: "Transpose la boucle de -12 à +12 demi-tons", def: 0.5 },
  { id: "stutter", label: "Stutter", title: "Bégaiement : répète des doubles croches", def: 0.5 },
  { id: "wide", label: "Largeur", title: "Élargit la stéréo", def: 0.6 },
];

export function harmonyInterval(a: number): number {
  return a < 0.34 ? 3 : a < 0.67 ? 5 : 7;
}
export function transSemis(a: number): number {
  return Math.round(-12 + a * 24);
}

export class PadFx {
  readonly input: GainNode;
  readonly output: GainNode;
  on = Object.fromEntries(PAD_FX.map((f) => [f.id, false])) as Record<PadFxId, boolean>;
  amount = Object.fromEntries(PAD_FX.map((f) => [f.id, f.def])) as Record<PadFxId, number>;

  // series
  protected highpass: BiquadFilterNode;
  protected lowpass: BiquadFilterNode;
  protected drive: WaveShaperNode;
  protected crush: WaveShaperNode;
  protected air: BiquadFilterNode;
  protected transDry: GainNode; // the untransposed path (muted while Trans is on)
  protected transShift: Tone.PitchShift; // the transposed path
  protected transWet: GainNode;
  protected gate: GainNode;
  protected wideDelay: DelayNode; // delays the right channel (Haas width)
  // sends, taken after the gate
  protected echoSend: GainNode;
  protected echoDelay: DelayNode;
  protected echoFeedback: GainNode;
  protected echoTone: BiquadFilterNode;
  protected reverbSend: GainNode;
  protected reverb: ConvolverNode;
  protected harmonySend: GainNode;
  protected harmonyShift: Tone.PitchShift;
  protected stutterSend: GainNode;
  protected stutterDelay: DelayNode;
  protected stutterFeedback: GainNode;
  private lastBpm = 0;

  constructor(protected ctx: AudioContext, protected bpm: () => number) {
    const c = ctx;
    this.input = c.createGain();
    this.output = c.createGain();
    this.highpass = c.createBiquadFilter();
    this.highpass.type = "highpass";
    this.highpass.frequency.value = 10;
    this.lowpass = c.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 20000;
    this.drive = c.createWaveShaper();
    this.crush = c.createWaveShaper();
    this.air = c.createBiquadFilter();
    this.air.type = "highshelf";
    this.air.frequency.value = 9000;
    this.air.gain.value = 0;
    this.transDry = c.createGain();
    this.transShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.08 });
    this.transWet = c.createGain();
    this.transWet.gain.value = 0;
    this.gate = c.createGain();
    const split = c.createChannelSplitter(2), merge = c.createChannelMerger(2);
    this.wideDelay = c.createDelay(0.05);
    this.wideDelay.delayTime.value = 0;

    // series: input -> hp -> lp -> drive -> crush -> air -> (dry | transposed) -> gate -> width -> output
    this.input.connect(this.highpass).connect(this.lowpass).connect(this.drive).connect(this.crush).connect(this.air);
    this.air.connect(this.transDry).connect(this.gate);
    Tone.connect(this.air, this.transShift);
    this.transShift.connect(this.transWet);
    this.transWet.connect(this.gate);
    this.gate.connect(split);
    split.connect(merge, 0, 0);
    split.connect(this.wideDelay, 1).connect(merge, 0, 1);
    merge.connect(this.output);

    // sends from after the gate, back into the output
    this.echoSend = c.createGain();
    this.echoDelay = c.createDelay(4);
    this.echoFeedback = c.createGain();
    this.echoTone = c.createBiquadFilter();
    this.echoTone.type = "lowpass";
    this.echoTone.frequency.value = 6000;
    this.gate.connect(this.echoSend).connect(this.echoDelay).connect(this.echoTone).connect(this.output);
    this.echoTone.connect(this.echoFeedback).connect(this.echoDelay);
    this.reverbSend = c.createGain();
    this.reverb = c.createConvolver();
    this.gate.connect(this.reverbSend).connect(this.reverb).connect(this.output);
    this.harmonySend = c.createGain();
    this.harmonyShift = new Tone.PitchShift({ pitch: 7, windowSize: 0.08 });
    this.gate.connect(this.harmonySend);
    Tone.connect(this.harmonySend, this.harmonyShift);
    this.harmonyShift.connect(this.output);
    this.stutterSend = c.createGain();
    this.stutterDelay = c.createDelay(2);
    this.stutterFeedback = c.createGain();
    this.gate.connect(this.stutterSend).connect(this.stutterDelay).connect(this.output);
    this.stutterDelay.connect(this.stutterFeedback).connect(this.stutterDelay);

    this.init();
  }

  // ---- written by MaRuche: init, apply, setFx, setAmount, tick, reset, helpers ----
  private lastScheduledBoundary = 0; // the gate's last sixteenth already on the audio clock
  private init(): void {
    this.drive.curve = this.identity();
    this.crush.curve = this.identity();
    const buffer = this.ctx.createBuffer(2, this.ctx.sampleRate * 2.8, this.ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-6 * i / (this.ctx.sampleRate * 2.8));
      }
    }
    this.reverb.buffer = buffer;
    this.stutterFeedback.gain.value = 0.7;
    this.echoFeedback.gain.value = 0.2;
    for (const id of Object.keys(this.on)) {
      this.on[id as PadFxId] = false;
      this.apply(id as PadFxId);
    }
  }

  private identity(): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(new ArrayBuffer(1024 * 4));
    for (let i = 0; i < curve.length; i++) {
      curve[i] = (i / (curve.length - 1)) * 2 - 1;
    }
    return curve;
  }

  private set(p: AudioParam, v: number): void {
    p.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  private apply(id: PadFxId): void {
    const on = this.on[id], a = this.amount[id];
    switch (id) {
      case "echo":
        this.set(this.echoSend.gain, on ? 0.5 : 0);
        this.set(this.echoFeedback.gain, 0.2 + a * 0.6);
        break;
      case "reverb":
        this.set(this.reverbSend.gain, on ? a * 0.9 : 0);
        break;
      case "air":
        this.set(this.air.gain, on ? a * 12 : 0);
        break;
      case "filter":
        this.set(this.lowpass.frequency, on ? 18000 * (1 - a) ** 3 + 200 : 20000);
        break;
      case "highpass":
        this.set(this.highpass.frequency, on ? 30 + a * 2500 : 10);
        break;
      case "drive":
        if (on) {
          const k = 1 + a * 20;
          const curve = new Float32Array(1024);
          for (let i = 0; i < curve.length; i++) {
            const x = (i / (curve.length - 1)) * 2 - 1;
            curve[i] = Math.tanh(k * x) / Math.tanh(k);
          }
          this.drive.curve = curve;
        } else {
          this.drive.curve = this.identity();
        }
        break;
      case "crush":
        if (on) {
          const levels = 2 ** (2 + Math.round((1 - a) * 6));
          const curve = new Float32Array(1024);
          for (let i = 0; i < curve.length; i++) {
            const x = (i / (curve.length - 1)) * 2 - 1;
            curve[i] = Math.round(x * levels / 2) / (levels / 2);
          }
          this.crush.curve = curve;
        } else {
          this.crush.curve = this.identity();
        }
        break;
      case "gate":
        if (!on) {
          this.gate.gain.cancelScheduledValues(this.ctx.currentTime); // the sixteenths already scheduled are dropped
          this.set(this.gate.gain, 1);
          this.lastScheduledBoundary = 0;
        }
        break;
      case "harmony":
        this.set(this.harmonySend.gain, on ? 0.6 : 0);
        this.harmonyShift.pitch = harmonyInterval(a);
        break;
      case "trans":
        this.transShift.pitch = transSemis(a);
        this.set(this.transWet.gain, on ? 1 : 0);
        this.set(this.transDry.gain, on ? 0 : 1);
        break;
      case "stutter":
        this.set(this.stutterSend.gain, on ? 0.4 + a * 0.4 : 0);
        break;
      case "wide":
        this.set(this.wideDelay.delayTime, on ? a * 0.018 : 0);
        break;
    }
  }

  setFx(id: PadFxId, on: boolean): void {
    this.on[id] = on;
    this.apply(id);
  }

  setAmount(id: PadFxId, a: number): void {
    this.amount[id] = Math.max(0, Math.min(1, a));
    this.apply(id);
  }

  tick(): void {
    const bpm = this.bpm() || 120;
    const beat = 60 / bpm;
    if (Math.abs(bpm - this.lastBpm) > 0.05) {
      this.lastBpm = bpm;
      this.set(this.echoDelay.delayTime, 0.75 * beat);
      this.set(this.stutterDelay.delayTime, beat / 4);
    }
    if (this.on.gate) {
      const now = this.ctx.currentTime;
      const sixteenth = beat / 4;
      const nextBoundary = Math.ceil(now / sixteenth) * sixteenth;
      for (let k = 0; k < 8; k++) {
        const t = nextBoundary + k * sixteenth;
        if (t > now + 0.12) break;
        if (t > this.lastScheduledBoundary) {
          this.gate.gain.setTargetAtTime(1, t, 0.003);
          this.gate.gain.setTargetAtTime(1 - this.amount.gate, t + sixteenth / 2, 0.003);
          this.lastScheduledBoundary = t;
        }
      }
    }
  }

  reset(): void {
    for (const id of Object.keys(this.on)) {
      this.on[id as PadFxId] = false;
      this.apply(id as PadFxId);
    }
  }
}

