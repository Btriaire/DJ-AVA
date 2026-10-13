export const PAD_SLICES = 16;
export const ECHO_DIVS: number[] = [0.25, 0.5, 1, 2];
export const DRUM_NAMES: string[] = ["Kick", "Kick 2", "Snare", "Clap", "Hat fermé", "Hat ouvert", "Rim", "Tom bas", "Tom haut", "Crash", "Montée", "Descente", "Sub", "Stab", "Sirène", "Zap"];

export type PadBank = "slices" | "drums";

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
  private bank: PadBank = "slices";
  private drumBuffers: AudioBuffer[] | null = null;

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

  setBank(b: PadBank): void {
    this.stopAll();
    this.bank = b;
  }

  private generateDrumBuffers(): AudioBuffer[] {
    const buffers: AudioBuffer[] = [];
    const sampleRate = this.ctx.sampleRate;

    // Kick (0)
    const kickBuffer = this.ctx.createBuffer(2, sampleRate * 0.35, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = kickBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const freq = 150 * Math.exp(-t * 5);
        const env = Math.exp(-t * 2.85);
        const click = t < 0.003 ? (1 - t * 1000) : 0;
        data[i] = Math.sin(2 * Math.PI * freq * t) * env + click * 0.2;
      }
    }
    buffers.push(this.normalizeBuffer(kickBuffer, 0.9));

    // Kick 2 (1)
    const kick2Buffer = this.ctx.createBuffer(2, sampleRate * 0.6, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = kick2Buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const freq = 120 * Math.exp(-t * 3.3);
        const env = Math.exp(-t * 1.66);
        data[i] = Math.tanh(2 * Math.sin(2 * Math.PI * freq * t) * env);
      }
    }
    buffers.push(this.normalizeBuffer(kick2Buffer, 0.9));

    // Snare (2)
    const snareBuffer = this.ctx.createBuffer(2, sampleRate * 0.18, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = snareBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 3.8);
        const noise = (Math.random() * 2 - 1) * env;
        const tone = Math.sin(2 * Math.PI * 190 * t) * (t < 0.08 ? 1 : 0);
        data[i] = noise * 0.5 + tone * 0.3;
      }
    }
    buffers.push(this.normalizeBuffer(snareBuffer, 0.9));

    // Clap (3)
    const clapBuffer = this.ctx.createBuffer(2, sampleRate * 0.15, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = clapBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 4.6);
        const burst = (t < 0.01 || (t > 0.015 && t < 0.025) || (t > 0.035 && t < 0.045)) ? 1 : 0;
        data[i] = (Math.random() * 2 - 1) * burst * env;
      }
    }
    buffers.push(this.normalizeBuffer(clapBuffer, 0.9));

    // Hat fermé (4)
    const closedHatBuffer = this.ctx.createBuffer(2, sampleRate * 0.04, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = closedHatBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 17);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    buffers.push(this.normalizeBuffer(closedHatBuffer, 0.9));

    // Hat ouvert (5)
    const openHatBuffer = this.ctx.createBuffer(2, sampleRate * 0.35, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = openHatBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 2);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    buffers.push(this.normalizeBuffer(openHatBuffer, 0.9));

    // Rim (6)
    const rimBuffer = this.ctx.createBuffer(2, sampleRate * 0.03, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = rimBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 33);
        const click = t < 0.001 ? (1 - t * 1000) : 0;
        data[i] = Math.sin(2 * Math.PI * 900 * t) * env + click * 0.3;
      }
    }
    buffers.push(this.normalizeBuffer(rimBuffer, 0.9));

    // Tom bas (7)
    const lowTomBuffer = this.ctx.createBuffer(2, sampleRate * 0.5, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = lowTomBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const freq = 110 * Math.exp(-t * 3.5);
        const env = Math.exp(-t * 2);
        data[i] = Math.sin(2 * Math.PI * freq * t) * env;
      }
    }
    buffers.push(this.normalizeBuffer(lowTomBuffer, 0.9));

    // Tom haut (8)
    const highTomBuffer = this.ctx.createBuffer(2, sampleRate * 0.35, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = highTomBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const freq = 220 * Math.exp(-t * 5);
        const env = Math.exp(-t * 2.85);
        data[i] = Math.sin(2 * Math.PI * freq * t) * env;
      }
    }
    buffers.push(this.normalizeBuffer(highTomBuffer, 0.9));

    // Crash (9)
    const crashBuffer = this.ctx.createBuffer(2, sampleRate * 1.6, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = crashBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = t < 0.002 ? t * 500 : Math.exp(-t * 0.625);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    buffers.push(this.normalizeBuffer(crashBuffer, 0.9));

    // Montée (10)
    const riseBuffer = this.ctx.createBuffer(2, sampleRate * 2, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = riseBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = t / 2;
        const cutoff = 300 + (12000 - 300) * (t / 2);
        const noise = (Math.random() * 2 - 1) * env;
        data[i] = noise * (cutoff > 12000 ? 1 : Math.exp(-(12000 - cutoff) * 0.001));
      }
    }
    buffers.push(this.normalizeBuffer(riseBuffer, 0.9));

    // Descente (11)
    const fallBuffer = this.ctx.createBuffer(2, sampleRate * 1.5, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = fallBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = 1 - t / 1.5;
        const cutoff = 12000 - (12000 - 200) * (t / 1.5);
        const noise = (Math.random() * 2 - 1) * env;
        data[i] = noise * (cutoff < 200 ? 1 : Math.exp(-(cutoff - 200) * 0.001));
      }
    }
    buffers.push(this.normalizeBuffer(fallBuffer, 0.9));

    // Sub (12)
    const subBuffer = this.ctx.createBuffer(2, sampleRate * 1.2, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = subBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = t < 0.01 ? t * 100 : Math.exp(-(t - 0.01) * 1.66);
        data[i] = Math.sin(2 * Math.PI * 50 * t) * env;
      }
    }
    buffers.push(this.normalizeBuffer(subBuffer, 0.9));

    // Stab (13)
    const stabBuffer = this.ctx.createBuffer(2, sampleRate * 0.35, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = stabBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 2.85);
        const saw = (t * 1000) % 1;
        const chord = Math.sin(2 * Math.PI * 220 * t) * 0.6 +
                      Math.sin(2 * Math.PI * 277 * t) * 0.3 +
                      Math.sin(2 * Math.PI * 330 * t) * 0.1;
        data[i] = (chord * (1 - saw) + saw * chord * 0.5) * env;
      }
    }
    buffers.push(this.normalizeBuffer(stabBuffer, 0.9));

    // Sirène (14)
    const sirenBuffer = this.ctx.createBuffer(2, sampleRate * 1.2, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = sirenBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const freq = 500 + 700 * Math.sin(2 * Math.PI * t);
        const env = Math.exp(-t * 0.833);
        data[i] = Math.sin(2 * Math.PI * freq * t) * env;
      }
    }
    buffers.push(this.normalizeBuffer(sirenBuffer, 0.9));

    // Zap (15)
    const zapBuffer = this.ctx.createBuffer(2, sampleRate * 0.3, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = zapBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const freq = 2000 * Math.exp(-t * 3.3);
        const env = Math.exp(-t * 4);
        data[i] = Math.sin(2 * Math.PI * freq * t) * env;
      }
    }
    buffers.push(this.normalizeBuffer(zapBuffer, 0.9));

    return buffers;
  }

  private normalizeBuffer(buffer: AudioBuffer, targetPeak: number): AudioBuffer {
    let max = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        max = Math.max(max, Math.abs(data[i]));
      }
    }

    if (max > 0) {
      const scale = targetPeak / max;
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          data[i] *= scale;
        }
      }
    }

    return buffer;
  }

  triggerDrum(index: number): void {
    if (index < 0 || index >= 16) return;

    if (!this.drumBuffers) {
      this.drumBuffers = this.generateDrumBuffers();
    }

    const buffer = this.drumBuffers[index];
    if (!buffer) return;

    if (this.voices.has(index)) {
      this.stopVoice(index);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** (this.settings.pitch / 12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.004);

    source.connect(gain);
    gain.connect(this.filter);

    const startTime = this.ctx.currentTime;
    source.start(0, 0);
    source.stop(startTime + buffer.duration);

    const voice: Voice = {
      source,
      gain,
      gateInterval: null,
      startTime,
    };

    this.voices.set(index, voice);

    source.onended = () => {
      if (this.voices.get(index) === voice) {
        this.voices.delete(index);
      }
    };
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

    if (this.bank === "drums") {
      this.triggerDrum(slice);
      return;
    }

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
