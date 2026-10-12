import { FXRack } from "./FXRack";
import { StepClock, type ClockFn } from "./stepClock";
import { BEAT_DIVS, makeRamp, setRampFreq, startAligned, type FxEnv } from "./fxTypes";
import { degreeToMidi, chordDegrees, arpSequence, midiFreq, type ScaleId, type ChordKind, type ArpPattern } from "./theory";

export type DjPresetId = "sub" | "reese" | "acid" | "wobble" | "stab" | "pluck" | "pad" | "lead";
export interface DjOsc { type: OscillatorType; detune: number; octave: number; gain: number; pan: number }
export interface DjPreset {
  id: DjPresetId; label: string; color: string; glyph: string; title: string; mono: boolean;
  oscs: DjOsc[]; sub: number;
  cutoff: number; reso: number; env: number; envDecay: number;
  a: number; d: number; s: number; r: number; glide: number; drive: number;
  wobble: number; wobbleDiv: number; octave: number; level: number;
}
export const DJ_PRESETS: DjPreset[] = [
  { id: "sub", label: "SUB", color: "#38bdf8", glyph: "●", title: "Basse sinus profonde pour les clubs", mono: true,
    oscs: [{ type: "sine", detune: 0, octave: 0, gain: 0.9, pan: 0 }, { type: "triangle", detune: 0, octave: 0, gain: 0.18, pan: 0 }],
    sub: 0, cutoff: 0.38, reso: 0.05, env: 0.12, envDecay: 0.15, a: 0.004, d: 0.25, s: 0.9, r: 0.12, glide: 0.04, drive: 0.25, wobble: 0, wobbleDiv: 3, octave: -2, level: 0.36 },
  { id: "reese", label: "REESE", color: "#a78bfa", glyph: "≋", title: "Basse saturée à trois dents de scie désaccordées", mono: true,
    oscs: [{ type: "sawtooth", detune: -18, octave: 0, gain: 0.4, pan: -0.5 }, { type: "sawtooth", detune: 0, octave: 0, gain: 0.4, pan: 0 }, { type: "sawtooth", detune: 18, octave: 0, gain: 0.4, pan: 0.5 }],
    sub: 0.5, cutoff: 0.42, reso: 0.2, env: 0.25, envDecay: 0.4, a: 0.01, d: 0.4, s: 0.8, r: 0.25, glide: 0.05, drive: 0.35, wobble: 0, wobbleDiv: 3, octave: -1, level: 0.4 },
  { id: "acid", label: "ACID", color: "#a3e635", glyph: "∿", title: "Basse acide résonante façon 303", mono: true,
    oscs: [{ type: "sawtooth", detune: 0, octave: 0, gain: 0.8, pan: 0 }],
    sub: 0, cutoff: 0.22, reso: 0.75, env: 0.7, envDecay: 0.18, a: 0.002, d: 0.22, s: 0.25, r: 0.08, glide: 0.07, drive: 0.4, wobble: 0, wobbleDiv: 3, octave: -1, level: 0.9 },
  { id: "wobble", label: "WOBBLE", color: "#fb923c", glyph: "≈", title: "Basse dubstep dont le filtre pulse au tempo", mono: true,
    oscs: [{ type: "sawtooth", detune: -10, octave: 0, gain: 0.4, pan: -0.3 }, { type: "sawtooth", detune: 10, octave: 0, gain: 0.4, pan: 0.3 }, { type: "square", detune: 0, octave: 0, gain: 0.25, pan: 0 }],
    sub: 0.5, cutoff: 0.3, reso: 0.45, env: 0.1, envDecay: 0.2, a: 0.005, d: 0.3, s: 0.9, r: 0.12, glide: 0.03, drive: 0.5, wobble: 0.75, wobbleDiv: 3, octave: -1, level: 0.32 },
  { id: "stab", label: "STAB", color: "#fbbf24", glyph: "◆", title: "Accord court de house / rave", mono: false,
    oscs: [{ type: "sawtooth", detune: -22, octave: 0, gain: 0.3, pan: -0.6 }, { type: "sawtooth", detune: -8, octave: 0, gain: 0.3, pan: -0.2 }, { type: "sawtooth", detune: 8, octave: 0, gain: 0.3, pan: 0.2 }, { type: "sawtooth", detune: 22, octave: 0, gain: 0.3, pan: 0.6 }, { type: "square", detune: 0, octave: 0, gain: 0.15, pan: 0 }],
    sub: 0, cutoff: 0.55, reso: 0.25, env: 0.5, envDecay: 0.22, a: 0.002, d: 0.26, s: 0, r: 0.14, glide: 0, drive: 0.3, wobble: 0, wobbleDiv: 3, octave: 0, level: 0.75 },
  { id: "pluck", label: "PLUCK", color: "#f472b6", glyph: "♪", title: "Note pincée courte et mélodique", mono: false,
    oscs: [{ type: "triangle", detune: 0, octave: 0, gain: 0.6, pan: 0 }, { type: "sawtooth", detune: 7, octave: 0, gain: 0.35, pan: 0 }],
    sub: 0, cutoff: 0.5, reso: 0.2, env: 0.6, envDecay: 0.16, a: 0.001, d: 0.35, s: 0, r: 0.2, glide: 0, drive: 0.1, wobble: 0, wobbleDiv: 3, octave: 0, level: 1.0 },
  { id: "pad", label: "PAD", color: "#60a5fa", glyph: "▬", title: "Nappe lente et large pour les ambiances", mono: false,
    oscs: [{ type: "sawtooth", detune: -12, octave: 0, gain: 0.28, pan: -0.7 }, { type: "sawtooth", detune: 0, octave: 0, gain: 0.28, pan: 0 }, { type: "sawtooth", detune: 12, octave: 0, gain: 0.28, pan: 0.7 }, { type: "triangle", detune: 0, octave: 0, gain: 0.25, pan: 0 }],
    sub: 0, cutoff: 0.45, reso: 0.12, env: 0.15, envDecay: 1, a: 0.55, d: 1, s: 0.8, r: 1.3, glide: 0, drive: 0.05, wobble: 0, wobbleDiv: 3, octave: 0, level: 1.1 },
  { id: "lead", label: "LEAD", color: "#ff6a3d", glyph: "▲", title: "Lead brillant pour les mélodies", mono: true,
    oscs: [{ type: "sawtooth", detune: -9, octave: 0, gain: 0.4, pan: -0.3 }, { type: "sawtooth", detune: 9, octave: 0, gain: 0.4, pan: 0.3 }, { type: "square", detune: 0, octave: 1, gain: 0.12, pan: 0 }],
    sub: 0, cutoff: 0.62, reso: 0.3, env: 0.35, envDecay: 0.3, a: 0.01, d: 0.22, s: 0.7, r: 0.3, glide: 0.05, drive: 0.25, wobble: 0, wobbleDiv: 3, octave: 1, level: 0.8 },
];
export interface ArpSettings { on: boolean; pattern: ArpPattern; div: number; gate: number; octaves: number }
export const ARP_DIVS = [
  { label: "1/4", perBeat: 1 }, { label: "1/8", perBeat: 2 }, { label: "1/8T", perBeat: 3 },
  { label: "1/16", perBeat: 4 }, { label: "1/16T", perBeat: 6 }, { label: "1/32", perBeat: 8 },
];
export interface DjKnobs { cutoff: number; reso: number; env: number; drive: number; glide: number; release: number; wobble: number; vol: number }
export interface DjSynthState { preset: DjPresetId; root: number; scale: ScaleId; octave: number; knobs: DjKnobs; wobbleDiv: number; chord: ChordKind; latch: boolean; quantize: boolean; arp: ArpSettings }

interface Voice {
  midi: number;
  oscs: OscillatorNode[];
  envGain: GainNode;
  relGain: GainNode;
  filter: BiquadFilterNode;
  released: boolean;
  t0: number;
  freq: number;
}

export class DjSynth {
  readonly out: GainNode;
  readonly fx: FXRack;
  readonly clock: StepClock;
  preset: DjPresetId = "sub";
  root: number = 0;
  scale: ScaleId = "minor";
  octave: number = -2;
  knobs: DjKnobs = { cutoff: 0.38, reso: 0.05, env: 0.12, drive: 0.25, glide: 0.1, release: 0.2, wobble: 0, vol: 0.8 };
  wobbleDiv: number = 3;
  chord: ChordKind = "off";
  latch: boolean = false;
  quantize: boolean = false;
  arp: ArpSettings = { on: false, pattern: "up", div: 3, gate: 0.6, octaves: 1 };

  private ctx: BaseAudioContext;
  private voices: Voice[] = [];
  private padNotes: Map<number, number[]> = new Map();
  private arpHeld: number[] = [];
  private arpIndex: number = 0;
  private glideFrom: number | null = null;
  private bus: GainNode;
  private driveShaper: WaveShaperNode;
  private clip: WaveShaperNode;
  private volGain: GainNode;
  private lfo: AudioBufferSourceNode;
  private lfoShape: WaveShaperNode;
  private lfoDepth: GainNode;
  private env: FxEnv;
  private retuneInterval: number | null = null;

  constructor(ctx: BaseAudioContext, getClock: ClockFn) {
    this.ctx = ctx;
    this.fx = new FXRack(ctx);
    this.clock = new StepClock(ctx, getClock, (n, t, d) => this.onArpStep(t, d));
    this.clock.stepsPerBeat = ARP_DIVS[this.arp.div].perBeat;

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;

    this.driveShaper = ctx.createWaveShaper();
    this.driveShaper.oversample = "2x";

    this.clip = ctx.createWaveShaper();
    const clipCurve = new Float32Array(513) as Float32Array<ArrayBuffer>;
    for (let i = 0; i < 513; i++) {
      const x = (i - 256) / 256;
      clipCurve[i] = Math.tanh(1.5 * x) / Math.tanh(1.5);
    }
    this.clip.curve = clipCurve;

    this.volGain = ctx.createGain();
    this.volGain.gain.value = this.knobs.vol;

    this.bus.connect(this.driveShaper);
    this.driveShaper.connect(this.fx.input);
    this.fx.output.connect(this.volGain);
    this.volGain.connect(this.clip);
    this.clip.connect(this.out = ctx.createGain());

    this.env = {
      ctx,
      beat: () => {
        const c = getClock?.();
        const bpm = c && c.bpm > 0 ? c.bpm : 120;
        return {
          period: 60 / bpm,
          toNext: c && c.playing !== false ? c.toNextBeat : 0
        };
      }
    };

    this.lfo = makeRamp(ctx, 2);
    this.lfoShape = ctx.createWaveShaper();
    const lfoCurve = new Float32Array(513) as Float32Array<ArrayBuffer>;
    for (let i = 0; i < 513; i++) {
      const x = (i - 256) / 256;
      lfoCurve[i] = 1 - 2 * Math.abs(x);
    }
    this.lfoShape.curve = lfoCurve;

    this.lfoDepth = ctx.createGain();
    this.lfoDepth.gain.value = 0;

    this.lfo.connect(this.lfoShape);
    this.lfoShape.connect(this.lfoDepth);

    startAligned(ctx, this.lfo, this.env);

    if (typeof window !== "undefined" && !(typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext)) {
      this.retuneInterval = window.setInterval(() => this.updateLfo(), 250);
    }

    this.setPreset("sub");
    this.applyDrive();
    this.updateLfo();
  }

  get presetDef(): DjPreset {
    return DJ_PRESETS.find(p => p.id === this.preset)!;
  }

  get bpm(): number {
    return this.clock.bpm;
  }

  get activeVoices(): number {
    return this.voices.filter(v => !v.released).length;
  }

  setPreset(id: DjPresetId): void {
    const p = DJ_PRESETS.find(p => p.id === id)!;
    this.preset = id;
    this.knobs.cutoff = p.cutoff;
    this.knobs.reso = p.reso;
    this.knobs.env = p.env;
    this.knobs.drive = p.drive;
    this.knobs.glide = Math.min(1, Math.max(0, p.glide / 0.4));
    this.knobs.release = Math.min(1, Math.max(0, Math.sqrt(Math.max(0, (p.r - 0.02) / 2.5))));
    this.knobs.wobble = p.wobble;
    this.octave = p.octave;
    this.wobbleDiv = p.wobbleDiv;

    this.releaseAll();
    this.applyDrive();
    this.updateLfo();
  }

  setKnob(k: keyof DjKnobs, v: number): void {
    this.knobs[k] = Math.min(k === "vol" ? 1.5 : 1, Math.max(0, v));

    if (k === "drive") {
      this.applyDrive();
    } else if (k === "wobble") {
      this.updateLfo();
    } else if (k === "vol") {
      this.volGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
    }
  }

  setKey(root: number, scale: ScaleId): void {
    this.root = (root + 12) % 12;
    this.scale = scale;
  }

  setOctave(o: number): void {
    this.octave = Math.min(2, Math.max(-3, o));
  }

  setWobbleDiv(i: number): void {
    this.wobbleDiv = Math.min(BEAT_DIVS.length - 1, Math.max(0, i));
    this.updateLfo();
  }

  setChord(c: ChordKind): void {
    this.chord = c;
  }

  setLatch(on: boolean): void {
    if (!on && this.latch) {
      this.releaseAll();
    }
    this.latch = on;
  }

  setArp(patch: Partial<ArpSettings>): void {
    if (patch.gate !== undefined) {
      this.arp.gate = Math.min(1, Math.max(0.1, patch.gate));
    }
    if (patch.octaves !== undefined) {
      this.arp.octaves = Math.min(3, Math.max(1, patch.octaves));
    }
    if (patch.div !== undefined) {
      this.arp.div = Math.min(ARP_DIVS.length - 1, Math.max(0, patch.div));
      this.clock.stepsPerBeat = ARP_DIVS[this.arp.div].perBeat;
    }
    if (patch.pattern !== undefined) {
      this.arp.pattern = patch.pattern;
    }
    if (patch.on !== undefined) {
      this.arp.on = patch.on;
      if (this.arp.on && !this.clock.running) {
        this.clock.start("grid");
      } else if (!this.arp.on) {
        this.clock.stop();
        this.arpHeld = [];
      }
    }
  }

  baseMidi(): number {
    return 48 + 12 * this.octave + this.root;
  }

  padMidi(degree: number): number {
    return degreeToMidi(this.baseMidi(), this.scale, degree);
  }

  padDown(degree: number, vel: number = 1): void {
    if (this.latch) {
      this.releaseAll();
    }

    const notes = chordDegrees(this.chord, degree, this.scale).map(d => this.padMidi(d));
    this.padNotes.set(degree, notes);

    if (this.arp.on) {
      notes.forEach(n => {
        if (!this.arpHeld.includes(n)) {
          this.arpHeld.push(n);
        }
      });
      if (this.arpHeld.length > 0 && this.arpIndex === 0) {
        this.arpIndex = 0;
      }
      if (!this.clock.running) {
        this.clock.start("grid");
      }
      return;
    }

    const when = this.quantize ? this.clock.nextGrid(4) : undefined;
    notes.forEach(n => this.noteOn(n, vel, when));
  }

  padUp(degree: number): void {
    const notes = this.padNotes.get(degree);
    if (!notes) return;

    if (this.latch) return;

    this.padNotes.delete(degree);

    if (this.arp.on) {
      this.arpHeld = this.arpHeld.filter(n => !notes.includes(n));
      return;
    }

    notes.forEach(n => this.noteOff(n));
  }

  noteOn(midi: number, vel: number = 1, when?: number, dur?: number): void {
    const t = Math.max(when ?? this.ctx.currentTime, this.ctx.currentTime);
    const p = this.presetDef;
    vel = Math.min(1, Math.max(0.05, vel));

    if (p.mono) {
      this.voices.filter(v => !v.released).forEach(v => this.releaseVoice(v, t, 0.012));
      this.glideFrom = this.voices.length > 0 ? this.voices[this.voices.length - 1].freq : null;
    } else if (this.voices.filter(v => !v.released).length >= 8) {
      const oldest = this.voices.reduce((a, b) => a.t0 < b.t0 ? a : b);
      this.releaseVoice(oldest, t, 0.02);
    }

    const f = midiFreq(midi);
    const mix = this.ctx.createGain();
    mix.gain.value = 1;

    const oscs: OscillatorNode[] = [];
    const glideSec = this.knobs.glide * 0.4;

    p.oscs.forEach((osc: DjOsc) => {
      const o = this.ctx.createOscillator();
      o.type = osc.type;
      o.detune.value = osc.detune;
      o.frequency.value = f * 2 ** osc.octave;

      if (this.glideFrom && glideSec > 0) {
        o.frequency.setValueAtTime(this.glideFrom * 2 ** osc.octave, t);
        o.frequency.exponentialRampToValueAtTime(f * 2 ** osc.octave, t + glideSec);
      }

      const gain = this.ctx.createGain();
      gain.gain.value = osc.gain;

      const pan = this.ctx.createStereoPanner();
      pan.pan.value = osc.pan;

      o.connect(gain);
      gain.connect(pan);
      pan.connect(mix);
      oscs.push(o);
    });

    if (p.sub > 0) {
      const sub = this.ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = f / 2;

      const subGain = this.ctx.createGain();
      subGain.gain.value = p.sub;

      sub.connect(subGain);
      subGain.connect(mix);
      oscs.push(sub);
    }

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    const fc = 80 * 200 ** this.knobs.cutoff;
    filter.frequency.value = fc;
    filter.Q.value = 0.5 + this.knobs.reso * 15.5;

    const peakFc = Math.min(fc * 2 ** (this.knobs.env * 5 * (0.5 + 0.5 * vel)), 18000);
    filter.frequency.setValueAtTime(peakFc, t);
    filter.frequency.exponentialRampToValueAtTime(fc, t + p.envDecay);

    this.lfoDepth.connect(filter.detune);

    const envGain = this.ctx.createGain();
    const relGain = this.ctx.createGain();
    relGain.gain.value = 1;

    const peak = 0.5 * p.level * vel;
    envGain.gain.setValueAtTime(0, t);
    envGain.gain.linearRampToValueAtTime(peak, t + p.a);

    if (p.s < 1) {
      envGain.gain.exponentialRampToValueAtTime(Math.max(peak * p.s, 0.0001), t + p.a + p.d);
    }

    mix.connect(filter);
    filter.connect(envGain);
    envGain.connect(relGain);
    relGain.connect(this.bus);

    const voice: Voice = {
      midi,
      oscs,
      envGain,
      relGain,
      filter,
      released: false,
      t0: t,
      freq: f
    };

    this.voices.push(voice);

    oscs[0].onended = () => {
      try {
        this.lfoDepth.disconnect(filter.detune);
      } catch {}
      oscs.forEach(o => o.disconnect());
      mix.disconnect();
      filter.disconnect();
      envGain.disconnect();
      relGain.disconnect();
      this.voices = this.voices.filter(v => v !== voice);
    };

    oscs.forEach(o => o.start(t));

    if (dur !== undefined) {
      this.releaseVoice(voice, t + dur);
    }
  }

  noteOff(midi: number, when?: number): void {
    const t = Math.max(when ?? this.ctx.currentTime, this.ctx.currentTime);
    this.voices.filter(v => v.midi === midi && !v.released).forEach(v => this.releaseVoice(v, t));
  }

  releaseAll(): void {
    const t = this.ctx.currentTime;
    this.voices.filter(v => !v.released).forEach(v => this.releaseVoice(v, t));
    this.padNotes.clear();
    this.arpHeld = [];
  }

  private releaseVoice(v: Voice, tr: number, fast?: number): void {
    if (v.released) return;
    v.released = true;

    const relSec = fast ?? (0.02 + this.knobs.release ** 2 * 2.5);
    v.relGain.gain.setTargetAtTime(0, tr, relSec / 5);

    const stopTime = tr + relSec * 1.6 + 0.05;
    v.oscs.forEach(o => o.stop(stopTime));
  }

  private onArpStep(time: number, stepDur: number): void {
    if (!this.arp.on || this.arpHeld.length === 0) return;

    const seq = arpSequence(this.arpHeld, this.arp.pattern, this.arp.octaves);
    const note = seq[this.arpIndex % seq.length];
    this.arpIndex++;
    this.noteOn(note, 0.9, time, stepDur * this.arp.gate);
  }

  private applyDrive(): void {
    const k = 1 + this.knobs.drive * 9;
    const curve = new Float32Array(513) as Float32Array<ArrayBuffer>;
    for (let i = 0; i < 513; i++) {
      const x = (i - 256) / 256;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    this.driveShaper.curve = curve;
  }

  private updateLfo(): void {
    const period = 60 / this.bpm;
    const freq = 1 / (period * BEAT_DIVS[this.wobbleDiv]);
    setRampFreq(this.ctx, this.lfo, freq);
    this.lfoDepth.gain.setTargetAtTime(this.knobs.wobble * 2400, this.ctx.currentTime, 0.02);
  }

  exportState(): DjSynthState {
    return {
      preset: this.preset,
      root: this.root,
      scale: this.scale,
      octave: this.octave,
      knobs: { ...this.knobs },
      wobbleDiv: this.wobbleDiv,
      chord: this.chord,
      latch: this.latch,
      quantize: this.quantize,
      arp: { ...this.arp }
    };
  }

  importState(s: Partial<DjSynthState>): void {
    if (s.preset !== undefined && s.preset !== this.preset) {
      this.setPreset(s.preset);
    }

    if (s.root !== undefined) this.root = (s.root + 12) % 12;
    if (s.scale !== undefined) this.scale = s.scale;
    if (s.octave !== undefined) this.setOctave(s.octave);
    if (s.wobbleDiv !== undefined) this.setWobbleDiv(s.wobbleDiv);
    if (s.chord !== undefined) this.setChord(s.chord);
    if (s.latch !== undefined) this.setLatch(s.latch);
    if (s.quantize !== undefined) this.quantize = s.quantize;

    if (s.knobs) {
      if (s.knobs.cutoff !== undefined) this.knobs.cutoff = Math.min(1, Math.max(0, s.knobs.cutoff));
      if (s.knobs.reso !== undefined) this.knobs.reso = Math.min(1, Math.max(0, s.knobs.reso));
      if (s.knobs.env !== undefined) this.knobs.env = Math.min(1, Math.max(0, s.knobs.env));
      if (s.knobs.drive !== undefined) this.knobs.drive = Math.min(1, Math.max(0, s.knobs.drive));
      if (s.knobs.glide !== undefined) this.knobs.glide = Math.min(1, Math.max(0, s.knobs.glide));
      if (s.knobs.release !== undefined) this.knobs.release = Math.min(1, Math.max(0, s.knobs.release));
      if (s.knobs.wobble !== undefined) this.knobs.wobble = Math.min(1, Math.max(0, s.knobs.wobble));
      if (s.knobs.vol !== undefined) this.knobs.vol = Math.min(1.5, Math.max(0, s.knobs.vol));
      this.applyDrive();
      this.updateLfo();
      this.volGain.gain.setTargetAtTime(this.knobs.vol, this.ctx.currentTime, 0.01);
    }

    if (s.arp) {
      this.setArp({
        on: s.arp.on,
        pattern: s.arp.pattern,
        div: s.arp.div,
        gate: s.arp.gate,
        octaves: s.arp.octaves
      });
    }
  }

  panic(): void {
    this.clock.stop();
    this.arp.on = false;
    this.releaseAll();
    this.voices.filter(v => !v.released).forEach(v => this.releaseVoice(v, this.ctx.currentTime, 0.015));
  }

  dispose(): void {
    this.panic();
    if (this.retuneInterval !== null) {
      clearInterval(this.retuneInterval);
      this.retuneInterval = null;
    }
    this.fx.dispose();
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoShape.disconnect();
    this.lfoDepth.disconnect();
    this.bus.disconnect();
    this.driveShaper.disconnect();
    this.clip.disconnect();
    this.volGain.disconnect();
    this.out.disconnect();
  }
}
