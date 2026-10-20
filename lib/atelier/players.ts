import { Region } from './types';

export class Previewer {
  private ctx: BaseAudioContext;
  private dest: AudioNode;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentRegion: Region | null = null;
  private _playing = false;
  private t0 = 0;
  private from = 0;
  private to = 0;
  private looping = false;

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.dest = dest;
  }

  play(buf: AudioBuffer, from = 0, to = buf.duration, loop = false): void {
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.dest);

    this.t0 = this.ctx.currentTime;
    this.from = from;
    this.to = to;
    this.looping = loop;

    if (loop) {
      src.loop = true;
      src.loopStart = from;
      src.loopEnd = to;
      src.start(this.t0, from);
    } else {
      src.start(this.t0, from, to - from);
    }

    this.currentSource = src;
    this.currentRegion = { a: from, b: to };
    this._playing = true;

    src.onended = () => {
      src.disconnect();
      if (this.currentSource === src) {
        this._playing = false;
        this.currentSource = null;
        this.currentRegion = null;
      }
    };
  }

  stop(): void {
    if (this.currentSource) {
      const src = this.currentSource;
      try {
        src.onended = null;
        src.stop();
      } catch {}
      src.disconnect();
      this.currentSource = null;
      this.currentRegion = null;
      this._playing = false;
    }
  }

  get playing(): boolean {
    return this._playing;
  }

  position(): number | null {
    if (!this.currentSource || !this.currentRegion) return null;
    const e = this.ctx.currentTime - this.t0;
    if (this.looping) {
      const loopDuration = this.to - this.from;
      return this.from + (e % loopDuration);
    } else {
      const pos = this.from + e;
      return pos <= this.to ? pos : null;
    }
  }
}

export type KeysParams = {
  root: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  loop: boolean;
  reverse: boolean;
  start: number;
  glide: number;
  mono: boolean;
  cutoff: number;
  reso: number;
};

export class SampleKeys {
  readonly out: GainNode;
  root = 60;
  attack = 0.005;
  decay = 0.3;
  sustain = 1;
  release = 0.25;
  loop = false;
  reverse = false;
  start = 0;
  glide = 0;
  mono = false;
  cutoff = 1;
  reso = 0;
  hold = false;
  name = '';
  private ctx: BaseAudioContext;
  private voices = new Map<number, { src: AudioBufferSourceNode; env: GainNode }>();
  private sustained = new Set<number>();
  private sampleBuffer: AudioBuffer | null = null;
  private reversedBuffer: AudioBuffer | null = null;
  private filter: BiquadFilterNode;
  private noteListeners = new Set<(ev: { midi: number; at: number; duration: number }) => void>();
  private loadListeners = new Set<(name: string) => void>();

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.7;
    this.filter.frequency.value = 80 * Math.pow(20000 / 80, this.cutoff);
    this.out.connect(dest);
    this.filter.connect(this.out);
  }

  onNote(cb: (ev: { midi: number; at: number; duration: number }) => void): () => void {
    this.noteListeners.add(cb);
    return () => this.noteListeners.delete(cb);
  }

  onLoad(cb: (name: string) => void): () => void {
    this.loadListeners.add(cb);
    return () => this.loadListeners.delete(cb);
  }

  private notifyNote(midi: number, at: number, duration: number): void {
    const ev = { midi, at, duration };
    this.noteListeners.forEach(cb => {
      try {
        cb(ev);
      } catch {}
    });
  }

  private notifyLoad(name: string): void {
    this.loadListeners.forEach(cb => {
      try {
        cb(name);
      } catch {}
    });
  }

  setSample(buf: AudioBuffer | null, name = ''): void {
    this.allOff();
    this.sampleBuffer = buf;
    this.reversedBuffer = null;
    this.name = name;
    this.notifyLoad(name);
  }

  get loaded(): boolean {
    return this.sampleBuffer !== null;
  }

  get duration(): number {
    return this.sampleBuffer?.duration || 0;
  }

  setVolume(v: number): void {
    const now = this.ctx.currentTime;
    const bounded = Math.max(0, Math.min(1.5, v));
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(bounded, now, 0.02);
  }

  configure(p: Partial<KeysParams>): void {
    if (p.root !== undefined) this.root = Math.max(24, Math.min(96, p.root));
    if (p.attack !== undefined) this.attack = Math.max(0, Math.min(2, p.attack));
    if (p.decay !== undefined) this.decay = Math.max(0.01, Math.min(3, p.decay));
    if (p.sustain !== undefined) this.sustain = Math.max(0, Math.min(1, p.sustain));
    if (p.release !== undefined) this.release = Math.max(0.005, Math.min(4, p.release));
    if (p.loop !== undefined) this.loop = p.loop;
    if (p.reverse !== undefined) this.reverse = p.reverse;
    if (p.start !== undefined) this.start = Math.max(0, Math.min(0.95, p.start));
    if (p.glide !== undefined) this.glide = Math.max(0, Math.min(1, p.glide));
    if (p.mono !== undefined) this.mono = p.mono;
    if (p.cutoff !== undefined || p.reso !== undefined) {
      this.cutoff = Math.max(0, Math.min(1, p.cutoff ?? this.cutoff));
      this.reso = Math.max(0, Math.min(1, p.reso ?? this.reso));
      this.filter.frequency.value = 80 * Math.pow(20000 / 80, this.cutoff);
      this.filter.Q.value = 0.7 + this.reso * 11;
    }
  }

  setHold(on: boolean): void {
    this.hold = on;
    if (!on) {
      this.sustained.forEach(midi => this.stopVoice(midi, this.release));
      this.sustained.clear();
    }
  }

  noteOn(midi: number, vel = 1): void {
    if (!this.sampleBuffer) return;

    const now = this.ctx.currentTime;
    const boundedVel = Math.max(0, Math.min(1, vel));
    const rate = 2 ** ((midi - this.root) / 12);
    const buf = this.reverse ? (this.reversedBuffer || this.reverseBuffer(this.sampleBuffer)) : this.sampleBuffer;
    const offset = Math.max(0, Math.min(buf.duration - 0.01, this.start * buf.duration));

    if (this.mono && this.voices.size > 0) {
      const oldMidi = this.voices.keys().next().value as number;
      if (this.glide > 0) {
        const oldVoice = this.voices.get(oldMidi);
        if (oldVoice) {
          oldVoice.src.playbackRate.cancelScheduledValues(now);
          oldVoice.src.playbackRate.setValueAtTime(oldVoice.src.playbackRate.value, now);
          oldVoice.src.playbackRate.linearRampToValueAtTime(rate, now + this.glide);
          this.voices.set(midi, oldVoice);
          this.voices.delete(oldMidi);
          if (this.sustained.has(oldMidi)) {
            this.sustained.delete(oldMidi);
            this.sustained.add(midi);
          }
        }
        return;
      } else {
        this.stopVoice(oldMidi, 0.01);
      }
    }

    if (this.voices.has(midi)) {
      this.stopVoice(midi, 0.01);
    }

    if (this.voices.size >= 16) {
      const oldestNote = this.voices.keys().next().value;
      if (oldestNote !== undefined) this.stopVoice(oldestNote, 0.01);
    }

    const src = this.ctx.createBufferSource();
    const env = this.ctx.createGain();
    env.gain.value = 0;

    src.buffer = buf;
    src.playbackRate.value = rate;
    src.loop = this.loop;
    if (this.loop) {
      src.loopStart = offset;
      src.loopEnd = buf.duration;
    }

    src.connect(env);
    env.connect(this.filter);
    src.start(now, offset);

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(boundedVel, now + Math.max(0.001, this.attack));
    env.gain.setTargetAtTime(boundedVel * this.sustain, now + Math.max(0.001, this.attack), this.decay / 3);

    this.voices.set(midi, { src, env });
    this.notifyNote(midi, now, buf.duration);

    src.onended = () => {
      src.disconnect();
      env.disconnect();
      if (this.voices.get(midi)?.src === src) this.voices.delete(midi);
    };
  }

  noteOff(midi: number): void {
    if (this.hold) {
      if (this.voices.has(midi)) {
        this.sustained.add(midi);
      }
      return;
    }
    this.stopVoice(midi, this.release);
  }

  allOff(): void {
    this.voices.forEach((_, midi) => this.stopVoice(midi, 0.01));
    this.voices.clear();
    this.sustained.clear();
  }

  private stopVoice(midi: number, rel: number): void {
    const voice = this.voices.get(midi);
    if (!voice) return;

    const now = this.ctx.currentTime;
    voice.env.gain.cancelScheduledValues(now);
    voice.env.gain.setValueAtTime(voice.env.gain.value, now);
    voice.env.gain.linearRampToValueAtTime(0, now + rel);
    voice.src.stop(now + rel + 0.02);
    this.voices.delete(midi);
    this.sustained.delete(midi);
  }

  private reverseBuffer(buf: AudioBuffer): AudioBuffer {
    const reversed = this.ctx.createBuffer(
      buf.numberOfChannels,
      buf.length,
      buf.sampleRate
    );

    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const channelData = buf.getChannelData(ch);
      const reversedData = reversed.getChannelData(ch);
      for (let i = 0; i < buf.length; i++) {
        reversedData[i] = channelData[buf.length - 1 - i];
      }
    }

    this.reversedBuffer = reversed;
    return reversed;
  }
}
