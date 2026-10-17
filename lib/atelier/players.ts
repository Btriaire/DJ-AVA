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

export class SampleKeys {
  readonly out: GainNode;
  root = 60;
  attack = 0.005;
  release = 0.25;
  loop = false;
  reverse = false;
  name = '';
  private ctx: BaseAudioContext;
  private voices = new Map<number, { src: AudioBufferSourceNode; env: GainNode }>();
  private sampleBuffer: AudioBuffer | null = null;
  private reversedBuffer: AudioBuffer | null = null;

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(dest);
  }

  setSample(buf: AudioBuffer | null, name = ''): void {
    this.allOff();
    this.sampleBuffer = buf;
    this.reversedBuffer = null;
    this.name = name;
  }

  get loaded(): boolean {
    return this.sampleBuffer !== null;
  }

  setVolume(v: number): void {
    const now = this.ctx.currentTime;
    const bounded = Math.max(0, Math.min(1.5, v));
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(bounded, now, 0.02);
  }

  configure(p: Partial<{
    root: number;
    attack: number;
    release: number;
    loop: boolean;
    reverse: boolean;
  }>): void {
    if (p.root !== undefined) this.root = p.root;
    if (p.attack !== undefined) this.attack = Math.max(0, p.attack);
    if (p.release !== undefined) this.release = Math.max(0, p.release);
    if (p.loop !== undefined) this.loop = p.loop;
    if (p.reverse !== undefined) this.reverse = p.reverse;
  }

  noteOn(midi: number, vel = 1): void {
    if (!this.sampleBuffer) return;

    if (this.voices.has(midi)) {
      this.noteOff(midi);
    }

    if (this.voices.size >= 16) {
      const oldestNote = this.voices.keys().next().value;
      if (oldestNote !== undefined) this.noteOff(oldestNote);
    }

    const src = this.ctx.createBufferSource();
    const env = this.ctx.createGain();
    env.gain.value = 0;

    if (this.reverse) {
      if (!this.reversedBuffer) {
        this.reversedBuffer = this.reverseBuffer(this.sampleBuffer);
      }
      src.buffer = this.reversedBuffer;
    } else {
      src.buffer = this.sampleBuffer;
    }

    src.playbackRate.value = 2 ** ((midi - this.root) / 12);
    src.loop = this.loop;
    if (this.loop) {
      src.loopStart = 0;
      src.loopEnd = src.buffer.duration;
    }

    src.connect(env);
    env.connect(this.out);
    src.start();

    env.gain.setValueAtTime(0, this.ctx.currentTime);
    env.gain.linearRampToValueAtTime(vel, this.ctx.currentTime + this.attack);

    this.voices.set(midi, { src, env });

    src.onended = () => {
      env.disconnect();
      if (this.voices.get(midi)?.src === src) this.voices.delete(midi);
    };
  }

  noteOff(midi: number): void {
    const voice = this.voices.get(midi);
    if (!voice) return;

    const now = this.ctx.currentTime;
    voice.env.gain.cancelScheduledValues(now);
    voice.env.gain.setValueAtTime(voice.env.gain.value, now);
    voice.env.gain.linearRampToValueAtTime(0, now + this.release);
    voice.src.stop(now + this.release);
    this.voices.delete(midi);
  }

  allOff(): void {
    this.voices.forEach(({ src }) => src.stop());
    this.voices.clear();
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

    return reversed;
  }
}
