// The effects of one row of the Stem Sample Pad (one stem): every pad of the row plays into `input`, the effects run
// in series (filters, drive, crush, air, transposition, gate, width) and in parallel sends (echo, reverb, harmony,
// stutter); `output` goes on to the stem's chain. Wiring by Claude, settings by MaRuche.
import * as Tone from "tone";

export type PadFxId = "echo" | "reverb" | "air" | "filter" | "highpass" | "drive" | "crush" | "gate" | "harmony" | "trans" | "stutter" | "wide"
  | "phaser" | "chorus" | "flanger" | "vinyl" | "ring" | "autopan" | "pump" | "octave";
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
  { id: "phaser", label: "Phaser", title: "Le son tourne en vagues creuses, calées sur la mesure", def: 0.5 },
  { id: "chorus", label: "Chorus", title: "Plusieurs copies légèrement désaccordées : un son large et doux", def: 0.5 },
  { id: "flanger", label: "Flanger", title: "Balayage métallique d'avion à réaction", def: 0.5 },
  { id: "vinyl", label: "Vinyle", title: "Vieux disque : craquements, pleurage et aigus adoucis", def: 0.5 },
  { id: "ring", label: "Ring", title: "Modulation en anneau : son de cloche ou de robot ; le bouton règle la fréquence", def: 0.3 },
  { id: "autopan", label: "Auto-pan", title: "Le son se promène de gauche à droite au tempo", def: 0.7 },
  { id: "pump", label: "Pompe", title: "Le son se creuse sur chaque temps puis remonte, comme sous une grosse caisse", def: 0.7 },
  { id: "octave", label: "Octave -1", title: "Ajoute la même boucle une octave plus bas", def: 0.5 },
];
// the mini-EQ of a row: 4 bands, gains in dB
export const PAD_EQ_BANDS: { label: string; type: BiquadFilterType; freq: number }[] = [
  { label: "Grave", type: "lowshelf", freq: 100 },
  { label: "Bas-méd.", type: "peaking", freq: 400 },
  { label: "Présence", type: "peaking", freq: 2500 },
  { label: "Aigu", type: "highshelf", freq: 8000 },
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
  // modulation stage between the gate and the stereo width (Tone nodes, wet 0 when off), then the mini-EQ
  protected phaser: Tone.Phaser;
  protected chorus: Tone.Chorus;
  protected flanger: Tone.Chorus; // a chorus with a very short delay and feedback
  protected wow: Tone.Vibrato; // vinyl wow
  protected autopan: Tone.AutoPanner;
  protected ringDry: GainNode;
  protected ringMod: GainNode; // gain driven by ringOsc
  protected ringWet: GainNode;
  protected ringOsc: OscillatorNode;
  protected pump: GainNode;
  protected vinylTone: BiquadFilterNode; // vinyl: aigus adoucis
  protected crackle: AudioBufferSourceNode;
  protected crackleGain: GainNode;
  protected octaveSend: GainNode;
  protected octaveShift: Tone.PitchShift;
  readonly eq: BiquadFilterNode[];
  readonly analyser: AnalyserNode; // what the row plays before its effects (for the smart EQ)
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
    // modulation: gate -> phaser -> chorus -> flanger -> wow -> autopan -> ring (dry + modulated) -> pump -> vinyl tone -> EQ -> width
    this.phaser = new Tone.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 350, wet: 0 });
    this.chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.6, wet: 0 }).start();
    this.flanger = new Tone.Chorus({ frequency: 0.25, delayTime: 1.2, depth: 0.9, feedback: 0.6, wet: 0 }).start();
    this.wow = new Tone.Vibrato({ frequency: 0.6, depth: 0, wet: 0 });
    this.autopan = new Tone.AutoPanner({ frequency: 1, depth: 1, wet: 0 }).start();
    Tone.connect(this.gate, this.phaser);
    this.phaser.chain(this.chorus, this.flanger, this.wow, this.autopan);
    this.ringDry = c.createGain();
    this.ringMod = c.createGain();
    this.ringMod.gain.value = 0;
    this.ringWet = c.createGain();
    this.ringWet.gain.value = 0;
    this.ringOsc = c.createOscillator();
    this.ringOsc.frequency.value = 200;
    this.ringOsc.connect(this.ringMod.gain);
    this.ringOsc.start();
    this.autopan.connect(this.ringDry);
    this.autopan.connect(this.ringMod);
    this.ringMod.connect(this.ringWet);
    this.pump = c.createGain();
    this.ringDry.connect(this.pump);
    this.ringWet.connect(this.pump);
    this.vinylTone = c.createBiquadFilter();
    this.vinylTone.type = "lowpass";
    this.vinylTone.frequency.value = 20000;
    this.pump.connect(this.vinylTone);
    this.eq = PAD_EQ_BANDS.map((b) => {
      const f = c.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.freq;
      f.Q.value = 0.9;
      f.gain.value = 0;
      return f;
    });
    let last: AudioNode = this.vinylTone;
    for (const f of this.eq) last = last.connect(f);
    last.connect(split);
    // vinyl crackle: a looped noise of sparse clicks, into the output
    const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.8 : (Math.random() * 2 - 1) * 0.01;
    this.crackle = c.createBufferSource();
    this.crackle.buffer = buf;
    this.crackle.loop = true;
    this.crackleGain = c.createGain();
    this.crackleGain.gain.value = 0;
    this.crackle.connect(this.crackleGain).connect(this.output);
    this.crackle.start();
    // octave below: a send after the gate
    this.octaveSend = c.createGain();
    this.octaveSend.gain.value = 0;
    this.octaveShift = new Tone.PitchShift({ pitch: -12, windowSize: 0.1 });
    this.gate.connect(this.octaveSend);
    Tone.connect(this.octaveSend, this.octaveShift);
    this.octaveShift.connect(this.output);
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 4096;
    this.input.connect(this.analyser);
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
      default:
        this.applyMore(id);
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
    this.tickPump();
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

  private applyMore(id: PadFxId): void {
    const on = this.on[id], a = this.amount[id];
    switch (id) {
      case 'phaser':
        this.phaser.wet.value = on ? 0.6 + a * 0.4 : 0;
        this.phaser.octaves = 1 + a * 4;
        this.phaser.frequency.value = this.bpm() > 0 ? this.bpm() / 240 : 0.5;
        break;
      case 'chorus':
        this.chorus.wet.value = on ? 0.5 : 0;
        this.chorus.depth = 0.2 + a * 0.8;
        break;
      case 'flanger':
        this.flanger.wet.value = on ? 0.5 : 0;
        this.flanger.feedback.value = 0.3 + a * 0.6;
        this.flanger.frequency.value = 0.1 + a * 0.6;
        break;
      case 'vinyl':
        this.wow.wet.value = on ? 1 : 0;
        this.wow.depth.value = on ? 0.05 + a * 0.25 : 0;
        this.set(this.vinylTone.frequency, on ? 9000 - a * 6000 : 20000);
        this.set(this.crackleGain.gain, on ? 0.1 + a * 0.5 : 0);
        break;
      case 'ring':
        this.set(this.ringOsc.frequency, 30 + a * a * 1200);
        this.set(this.ringWet.gain, on ? 0.8 : 0);
        this.set(this.ringDry.gain, on ? 0.35 : 1);
        break;
      case 'autopan':
        this.autopan.wet.value = on ? 1 : 0;
        this.autopan.frequency.value = this.bpm() > 0 ? (this.bpm() / 60) * (a < 0.5 ? 0.5 : 1) : 1;
        break;
      case 'pump':
        if (!on) {
          this.set(this.pump.gain, 1);
          this.pump.gain.cancelScheduledValues(this.ctx.currentTime);
        }
        break;
      case 'octave':
        this.set(this.octaveSend.gain, on ? 0.3 + a * 0.6 : 0);
        break;
      default:
        break;
    }
  }

  private pumpNext = 0;
  private tickPump(): void {
    if (this.on.pump) {
      const beat = 60 / (this.bpm() || 120);
      const now = this.ctx.currentTime;
      const nextBeat = Math.ceil(now / beat) * beat;
      // every beat of the next 150 ms not scheduled yet: the dip lands ON the beat
      for (let t = nextBeat; t < now + 0.15; t += beat) {
        if (t <= this.pumpNext + 1e-6) continue;
        this.pump.gain.setValueAtTime(1 - 0.85 * this.amount.pump, t);
        this.pump.gain.setTargetAtTime(1, t + 0.01, beat * 0.25);
        this.pumpNext = t;
      }
    }
  }

  setEq(i: number, db: number): void {
    this.set(this.eq[i].gain, Math.max(-12, Math.min(12, db)));
  }

  eqGains(): number[] {
    return this.eq.map(e => Math.round(e.gain.value * 2) / 2);
  }

  resetEq(): void {
    this.eq.forEach(e => this.set(e.gain, 0));
  }

  async measureBands(ms = 1500): Promise<number[]> {
    const analyser = this.analyser;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    const bands = [0, 0, 0, 0];
    const counts = [0, 0, 0, 0];
    const start = this.ctx.currentTime;
    const end = start + ms / 1000;
    const sampleRate = this.ctx.sampleRate;
    const nyquist = sampleRate / 2;
    const binSize = nyquist / bufferLength;

    while (this.ctx.currentTime < end) {
      analyser.getFloatFrequencyData(dataArray);
      for (let i = 0; i < bufferLength; i++) {
        const freq = i * binSize;
        let band = 0;
        if (freq >= 40 && freq < 200) band = 0;
        else if (freq >= 200 && freq < 800) band = 1;
        else if (freq >= 1500 && freq < 5000) band = 2;
        else if (freq >= 6000 && freq < 16000) band = 3;
        else continue;
        bands[band] += dataArray[i];
        counts[band]++;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return bands.map((sum, i) => counts[i] > 0 ? sum / counts[i] : -Infinity);
  }
}
