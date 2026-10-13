export const PAD_SLICES = 16;
export const ECHO_DIVS: number[] = [0.25, 0.5, 1, 2];

export interface PadSource {
  buffer: AudioBuffer | null;
  bpm: number;
  beatOffset: number;
  position: number;
}

export interface PadSettings {
  pitch: number;
  reverse: boolean;
  hold: boolean;
  filter: number;
  echo: number;
  echoDiv: number;
  gate: boolean;
}

export const DEFAULT_PAD_SETTINGS: PadSettings = {
  pitch: 0,
  reverse: false,
  hold: false,
  filter: 1,
  echo: 0,
  echoDiv: 1,
  gate: false,
};

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  gateInterval: number | null;
  startTime: number;
}

export class SamplePad {
  readonly settings: PadSettings;
  private readonly ctx: AudioContext;
  private readonly dest: AudioNode;
  private readonly source: () => PadSource;
  private readonly voices: Map<number, Voice>;
  private readonly filter: BiquadFilterNode;
  private readonly dryOut: GainNode;
  private readonly echoSend: GainNode;
  private readonly delay: DelayNode;
  private readonly feedback: GainNode;
  private readonly echoOut: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly reverbOut: GainNode;
  private readonly noiseBuffer: AudioBuffer;
  private lastPlayedSlice: number | null = null;
  private sourceBuffer: AudioBuffer | null = null;
  private reversedBuffer: AudioBuffer | null = null;

  constructor(ctx: AudioContext, dest: AudioNode, source: () => PadSource) {
    this.ctx = ctx;
    this.dest = dest;
    this.source = source;
    this.settings = { ...DEFAULT_PAD_SETTINGS };
    this.voices = new Map();

    // Common audio chain
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 0.7;
    this.filter.frequency.setTargetAtTime(20000, ctx.currentTime, 0.02);

    this.dryOut = ctx.createGain();
    this.echoSend = ctx.createGain();
    this.delay = ctx.createDelay(2);
    this.feedback = ctx.createGain();
    this.echoOut = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverbOut = ctx.createGain();

    this.filter.connect(this.dryOut);
    this.filter.connect(this.echoSend);
    this.dryOut.connect(dest);
    this.echoSend.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.echoOut);
    this.echoOut.connect(dest);

    this.reverb.buffer = this.createReverbImpulse();
    this.reverb.connect(this.reverbOut);
    this.reverbOut.gain.value = 0.35;
    this.reverbOut.connect(dest);

    this.noiseBuffer = this.createNoiseBuffer();
  }

  private startVoice(slice: number): void {
    const src = this.source();
    if (!src.buffer || src.bpm <= 0) return;

    const spb = 60 / src.bpm;
    const barStart = src.beatOffset + Math.floor((src.position - src.beatOffset) / (4 * spb)) * 4 * spb;
    const sliceStart = barStart + slice * spb / 4;
    if (sliceStart >= src.buffer.duration) return;

    const source = this.ctx.createBufferSource();
    const buffer = this.settings.reverse ? this.getReversedBuffer(src.buffer) : src.buffer;
    const sliceLength = Math.floor(Math.min(spb / 4, src.buffer.duration - sliceStart) * buffer.sampleRate);
    const sliceBuffer = this.ctx.createBuffer(
      buffer.numberOfChannels,
      sliceLength,
      buffer.sampleRate
    );

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const srcData = buffer.getChannelData(ch);
      const dstData = sliceBuffer.getChannelData(ch);
      const readTime = Math.max(0, this.settings.reverse ? src.buffer.duration - (sliceStart + spb / 4) : sliceStart);
      const startSample = Math.floor(readTime * buffer.sampleRate);
      const endSample = Math.min(startSample + sliceLength, buffer.length);

      for (let i = startSample; i < endSample; i++) {
        dstData[i - startSample] = srcData[i];
      }
    }

    source.buffer = sliceBuffer;
    source.playbackRate.value = 2 ** (this.settings.pitch / 12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.004);

    source.connect(gain);
    gain.connect(this.filter);

    source.loop = this.settings.hold;
    const startTime = this.ctx.currentTime;
    source.start(0, 0);

    const voice: Voice = {
      source,
      gain,
      gateInterval: null,
      startTime,
    };

    this.voices.set(slice, voice);
    this.lastPlayedSlice = slice;

    if (this.settings.gate) {
      const interval = setInterval(() => {
        if (this.voices.get(slice) !== voice) return;
        this.stopVoice(slice);
        this.startVoice(slice);
      }, spb / 4 * 1000);

      voice.gateInterval = interval as unknown as number;
    }

    source.onended = () => {
      if (this.voices.get(slice) === voice) {
        this.voices.delete(slice);
      }
      if (voice.gateInterval) clearInterval(voice.gateInterval);
    };
  }

  private stopVoice(slice: number): void {
    const voice = this.voices.get(slice);
    if (!voice) return;

    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.012);

    voice.source.stop(now + 0.012);
    if (voice.gateInterval) clearInterval(voice.gateInterval);
    this.voices.delete(slice);
  }

  trigger(slice: number): void {
    if (slice < 0 || slice >= PAD_SLICES) return;

    const src = this.source();
    if (!src.buffer || src.bpm <= 0) return;

    const spb = 60 / src.bpm;
    const barStart = src.beatOffset + Math.floor((src.position - src.beatOffset) / (4 * spb)) * 4 * spb;
    const sliceStart = barStart + slice * spb / 4;
    if (sliceStart >= src.buffer.duration) return;

    if (this.voices.has(slice)) {
      if (this.settings.hold) {
        this.stopVoice(slice);
        return;
      }
      this.stopVoice(slice);
    }

    this.startVoice(slice);
  }

  release(slice: number): void {
    if (this.settings.hold) return;
    this.stopVoice(slice);
  }

  isActive(slice: number): boolean {
    return this.voices.has(slice);
  }

  set(key: keyof PadSettings, value: number | boolean): void {
    if (key === "pitch") {
      this.settings.pitch = typeof value === "number" ? value : 0;
      const rate = 2 ** (this.settings.pitch / 12);
      this.voices.forEach(voice => {
        voice.source.playbackRate.value = rate;
      });
    } else if (key === "reverse") {
      this.settings.reverse = typeof value === "boolean" ? value : false;
    } else if (key === "hold") {
      this.settings.hold = typeof value === "boolean" ? value : false;
    } else if (key === "filter") {
      this.settings.filter = typeof value === "number" ? Math.max(0, Math.min(1, value)) : 1;
      const freq = 120 * (20000 / 120) ** this.settings.filter;
      this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
    } else if (key === "echo") {
      this.settings.echo = typeof value === "number" ? Math.max(0, Math.min(1, value)) : 0;
      this.echoSend.gain.value = this.settings.echo;
    } else if (key === "echoDiv") {
      this.settings.echoDiv = typeof value === "number" ? Math.max(0, Math.min(ECHO_DIVS.length - 1, Math.floor(value))) : 1;
      const src = this.source();
      const delayTime = ECHO_DIVS[this.settings.echoDiv] * (src.bpm > 0 ? 60 / src.bpm : 0.5);
      this.delay.delayTime.setTargetAtTime(delayTime, this.ctx.currentTime, 0.02);
    } else if (key === "gate") {
      this.settings.gate = typeof value === "boolean" ? value : false;
    }
  }

  dropHQ(): void {
    const src = this.source();
    if (!src.buffer || src.bpm <= 0) return;

    const spb = 60 / src.bpm;
    const barStart = src.beatOffset + Math.floor((src.position - src.beatOffset) / (4 * spb)) * 4 * spb;
    const dropPoint = barStart + 4 * spb;
    const duration = dropPoint - src.position;

    if (duration <= 0) return;

    const reversed = this.getReversedBuffer(src.buffer);
    const source = this.ctx.createBufferSource();
    const sliceLength = Math.floor(duration * reversed.sampleRate);
    const sliceBuffer = this.ctx.createBuffer(
      reversed.numberOfChannels,
      sliceLength,
      reversed.sampleRate
    );

    const readStart = Math.max(0, reversed.duration - dropPoint);
    const readEnd = Math.min(readStart + duration, reversed.duration);

    for (let ch = 0; ch < reversed.numberOfChannels; ch++) {
      const srcData = reversed.getChannelData(ch);
      const dstData = sliceBuffer.getChannelData(ch);
      const startSample = Math.floor(readStart * reversed.sampleRate);
      const endSample = Math.floor(readEnd * reversed.sampleRate);

      for (let i = startSample; i < endSample; i++) {
        dstData[i - startSample] = srcData[i];
      }
    }

    source.buffer = sliceBuffer;
    source.playbackRate.value = 2 ** (this.settings.pitch / 12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.004);

    source.connect(gain);
    gain.connect(this.filter);

    source.start(0, 0);
    source.stop(this.ctx.currentTime + duration);

    this.impactAt(this.ctx.currentTime + (dropPoint - src.position));
  }

  impact(): void {
    this.impactAt(this.ctx.currentTime);
  }

  private impactAt(when: number): void {
    // Bass tone
    const bass = this.ctx.createOscillator();
    bass.type = "sine";
    bass.frequency.setValueAtTime(110, when);
    bass.frequency.exponentialRampToValueAtTime(38, when + 0.8);

    const bassGain = this.ctx.createGain();
    bassGain.gain.setValueAtTime(0, when);
    bassGain.gain.linearRampToValueAtTime(0.5, when + 0.05);
    bassGain.gain.linearRampToValueAtTime(0, when + 0.8);

    bass.connect(bassGain);
    bassGain.connect(this.dryOut);

    // Noise burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.Q.value = 1;
    noiseFilter.frequency.setValueAtTime(6000, when);
    noiseFilter.frequency.exponentialRampToValueAtTime(300, when + 0.5);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0, when);
    noiseGain.gain.linearRampToValueAtTime(0.3, when + 0.05);
    noiseGain.gain.linearRampToValueAtTime(0, when + 0.5);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.dryOut);

    // Reverb sends
    const bassReverb = this.ctx.createGain();
    bassReverb.gain.value = 0.2;
    bassGain.connect(bassReverb);
    bassReverb.connect(this.reverb);

    const noiseReverb = this.ctx.createGain();
    noiseReverb.gain.value = 0.15;
    noiseGain.connect(noiseReverb);
    noiseReverb.connect(this.reverb);

    bass.start(when);
    bass.stop(when + 0.8);
    noise.start(when);
    noise.stop(when + 0.5);
  }

  brake(beats: number): void {
    const src = this.source();
    const spb = src.bpm > 0 ? 60 / src.bpm : 0.5;
    const now = this.ctx.currentTime;

    this.voices.forEach(voice => {
      voice.source.playbackRate.cancelScheduledValues(now);
      voice.source.playbackRate.setValueAtTime(voice.source.playbackRate.value, now);
      voice.source.playbackRate.exponentialRampToValueAtTime(0.01, now + beats * spb);
      voice.source.stop(now + beats * spb);
    });
  }

  scratch(): void {
    if (this.lastPlayedSlice === null) return;

    const voice = this.voices.get(this.lastPlayedSlice);
    if (!voice) return;

    const now = this.ctx.currentTime;
    const rates = [1, 0.2, 1.4, 0.5, 1];

    voice.source.playbackRate.cancelScheduledValues(now);
    voice.source.playbackRate.setValueAtTime(voice.source.playbackRate.value, now);

    rates.forEach((rate, i) => {
      voice.source.playbackRate.setValueAtTime(rate, now + i * 0.05);
    });
  }

  stopAll(): void {
    const now = this.ctx.currentTime;
    const slices = Array.from(this.voices.keys());

    slices.forEach(slice => {
      this.stopVoice(slice);
    });

    this.voices.clear();
  }

  private getReversedBuffer(buffer: AudioBuffer): AudioBuffer {
    if (this.sourceBuffer === buffer && this.reversedBuffer) {
      return this.reversedBuffer;
    }

    const reversed = this.ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const srcData = buffer.getChannelData(ch);
      const dstData = reversed.getChannelData(ch);

      for (let i = 0; i < buffer.length; i++) {
        dstData[i] = srcData[buffer.length - 1 - i];
      }
    }

    this.sourceBuffer = buffer;
    this.reversedBuffer = reversed;
    return reversed;
  }

  private createReverbImpulse(): AudioBuffer {
    const length = 2.5 * this.ctx.sampleRate;
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.1));
      }
    }

    return impulse;
  }

  private createNoiseBuffer(): AudioBuffer {
    const length = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }
}
