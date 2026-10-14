import { stretchBuffer } from "./stretch";
import { measureLoudness, type LoudnessResult } from "./loudness";

export const SS_VOICES = 16;
export const DELAY_DIVS: number[] = [0.25, 0.5, 0.75, 1, 1.5, 2];
export const DELAY_LABELS: string[] = ["1/4", "1/2", "3/4", "1", "1.5", "2"];
export const FILTER_NAMES: string[] = ["LP", "HP", "BP"];

export interface SSParams {
  start: number;
  end: number;
  loop: boolean;
  oneShot: boolean;
  rootNote: number;
  pitch: number;
  fine: number;
  reverse: boolean;
  attack: number;
  release: number;
  volume: number;
  pan: number;
  filterType: number;
  filterCut: number;
  filterRes: number;
  drive: number;
  crush: number;
  delayDiv: number;
  delaySend: number;
  delayFb: number;
  reverbSend: number;
  reverbDecay: number;
  stretch: number;
}

export const DEFAULT_SS_PARAMS: SSParams = {
  start: 0,
  end: 1,
  loop: false,
  oneShot: false,
  rootNote: 60,
  pitch: 0,
  fine: 0,
  reverse: false,
  attack: 4,
  release: 120,
  volume: 0.9,
  pan: 0,
  filterType: 0,
  filterCut: 1,
  filterRes: 0,
  drive: 0,
  crush: 0,
  delayDiv: 2,
  delaySend: 0,
  delayFb: 0.35,
  reverbSend: 0,
  reverbDecay: 0.4,
  stretch: 1,
};

type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  note: number;
  startTime: number;
};

export class SuperSampler {
  readonly out: GainNode;
  readonly analyser: AnalyserNode;
  private ctx: BaseAudioContext;
  private dest: AudioNode;
  private getBpm: () => number;
  private sourceBuffer: AudioBuffer | null = null;
  private reversedBuffer: AudioBuffer | null = null;
  private _name: string = "";
  private params: SSParams = { ...DEFAULT_SS_PARAMS };
  private voices: Voice[] = [];
  private voiceBus: GainNode;
  private filter: BiquadFilterNode;
  private drive: WaveShaperNode;
  private crush: WaveShaperNode;
  private pan: StereoPannerNode;
  private dry: GainNode;
  private limiter: DynamicsCompressorNode;
  private delay: DelayNode;
  private delayFb: GainNode;
  private delaySend: GainNode;
  private reverb: ConvolverNode;
  private reverbSend: GainNode;
  private lastDriveCurve: number | null = null;
  private lastReverbDecay: number | null = null;
  private baseVersion = 0;
  private bakedBuffer: AudioBuffer | null = null;
  private bakedKey = "";
  private bakeTimer: ReturnType<typeof setTimeout> | null = null;
  private bakeToken = 0;
  private bakingNow = false;
  private reversedCache = new WeakMap<AudioBuffer, AudioBuffer>();
  private lastLoudness: LoudnessResult | null = null;
  private bakeListener: (() => void) | null = null;

  constructor(ctx: BaseAudioContext, dest: AudioNode, getBpm: () => number) {
    this.ctx = ctx;
    this.dest = dest;
    this.getBpm = getBpm;

    this.voiceBus = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.drive = ctx.createWaveShaper();
    this.crush = ctx.createWaveShaper();
    this.pan = ctx.createStereoPanner();
    this.dry = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.delay = ctx.createDelay(2);
    this.delayFb = ctx.createGain();
    this.delaySend = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverbSend = ctx.createGain();
    this.out = ctx.createGain();
    this.analyser = ctx.createAnalyser();

    this.voiceBus.connect(this.filter);
    this.filter.connect(this.drive);
    this.drive.connect(this.crush);
    this.crush.connect(this.pan);
    this.pan.connect(this.dry);
    this.pan.connect(this.delaySend);
    this.delaySend.connect(this.delay);
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.limiter);
    this.pan.connect(this.reverbSend);
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.limiter);
    this.dry.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.out);
    this.out.connect(dest);

    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.08;

    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;

    this.updateFilter();
    this.updateDrive();
    this.updateCrush();
    this.updateDelay();
    this.updateReverb();
    this.updateVolume();
  }

  get buffer(): AudioBuffer | null {
    return this.sourceBuffer;
  }

  get name(): string {
    return this._name;
  }

  get baking(): boolean {
    return this.bakingNow;
  }

  get loudness(): LoudnessResult | null {
    return this.lastLoudness;
  }

  setBakeListener(listener: (() => void) | null): void {
    this.bakeListener = listener;
  }

  setSource(buffer: AudioBuffer, name: string): void {
    this.sourceBuffer = buffer;
    this.reversedBuffer = null;
    this._name = name;
    this.params.start = 0;
    this.params.end = 1;
    this.stopAll();
    this.baseVersion++;
    this.bakedBuffer = null;
    this.bakedKey = "";
    this.scheduleBake();
  }

  getParams(): SSParams {
    return { ...this.params };
  }

  setParam<K extends keyof SSParams>(key: K, value: SSParams[K]): void {
    if (!Number.isFinite(value)) return;

    let clampedValue: SSParams[K] = value;

    switch (key) {
      case "start":
      case "end":
      case "filterCut":
      case "filterRes":
      case "drive":
      case "crush":
      case "delaySend":
      case "reverbSend":
      case "volume":
        clampedValue = Math.max(0, Math.min(1, value as number)) as SSParams[K];
        break;
      case "pitch":
        clampedValue = Math.max(-24, Math.min(24, value as number)) as SSParams[K];
        break;
      case "fine":
        clampedValue = Math.max(-100, Math.min(100, value as number)) as SSParams[K];
        break;
      case "attack":
        clampedValue = Math.max(0, Math.min(500, value as number)) as SSParams[K];
        break;
      case "release":
        clampedValue = Math.max(2, Math.min(3000, value as number)) as SSParams[K];
        break;
      case "delayFb":
        clampedValue = Math.max(0, Math.min(0.85, value as number)) as SSParams[K];
        break;
      case "reverbDecay":
        clampedValue = Math.max(0, Math.min(1, value as number)) as SSParams[K];
        break;
      case "filterType":
        clampedValue = Math.round(Math.max(0, Math.min(2, value as number))) as SSParams[K];
        break;
      case "delayDiv":
        clampedValue = Math.round(Math.max(0, Math.min(DELAY_DIVS.length - 1, value as number))) as SSParams[K];
        break;
      default:
        break;
    }

    this.params[key] = clampedValue;

    switch (key) {
      case "filterType":
      case "filterCut":
      case "filterRes":
        this.updateFilter();
        break;
      case "drive":
        this.updateDrive();
        break;
      case "crush":
        this.updateCrush();
        break;
      case "pan":
        this.pan.pan.value = value as number;
        break;
      case "delayDiv":
      case "delaySend":
      case "delayFb":
        this.updateDelay();
        break;
      case "reverbSend":
      case "reverbDecay":
        this.updateReverb();
        break;
      case "volume":
        this.updateVolume();
        break;
      case "start":
      case "end":
      case "stretch":
        this.scheduleBake();
        break;
    }
  }

  noteOn(note: number, velocity: number = 1): void {
    const range = this.playRange();
    if (!range) return;

    const now = this.ctx.currentTime;
    const buffer = range.buffer;
    const regionStart = range.start * buffer.duration;
    const regionEnd = range.end * buffer.duration;
    const regionDuration = regionEnd - regionStart;

    const playbackRate = this.calculatePlaybackRate(note);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    if (this.params.loop) {
      source.loop = true;
      source.loopStart = regionStart;
      source.loopEnd = regionEnd;
    } else {
      source.loop = false;
    }

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.voiceBus);

    const attackTime = Math.max(0.001, this.params.attack / 1000);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(velocity, now + attackTime);

    const voice: Voice = {
      source,
      gain,
      note,
      startTime: now,
    };

    this.voices.push(voice);

    if (this.voices.length > SS_VOICES) {
      const oldestVoice = this.voices.shift();
      if (oldestVoice) {
        this.stopVoice(oldestVoice, 0.003);
      }
    }

    const existingVoiceIndex = this.voices.findIndex(v => v.note === note && v !== voice);
    if (existingVoiceIndex !== -1) {
      const existingVoice = this.voices[existingVoiceIndex];
      this.stopVoice(existingVoice, 0.003);
      this.voices.splice(existingVoiceIndex, 1);
    }

    source.start(now, regionStart);

    if (!this.params.loop && !this.params.oneShot) {
      const releaseTime = this.params.release / 1000;
      const endTime = now + regionDuration / playbackRate;
      gain.gain.setValueAtTime(velocity, endTime - releaseTime);
      gain.gain.linearRampToValueAtTime(0, endTime);
      source.stop(endTime);
      this.scheduleVoiceCleanup(voice, endTime);
    }
  }

  noteOff(note: number): void {
    if (this.params.oneShot) return;

    const now = this.ctx.currentTime;
    const voice = this.voices.find(v => v.note === note);
    if (!voice) return;

    const releaseTime = this.params.release / 1000;
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + releaseTime);
    voice.source.stop(now + releaseTime);
    this.scheduleVoiceCleanup(voice, now + releaseTime);
  }

  playSlice(index: number, count: number): void {
    if (!this.sourceBuffer || count <= 0 || index < 0 || index >= count) return;

    const range = this.playRange();
    if (!range) return;

    const buffer = range.buffer;
    const regionStart = range.start * buffer.duration;
    const regionEnd = range.end * buffer.duration;
    const sliceDuration = (regionEnd - regionStart) / count;
    const sliceStart = regionStart + index * sliceDuration;
    const sliceEnd = sliceStart + sliceDuration;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.calculatePlaybackRate(this.params.rootNote);

    const gain = this.ctx.createGain();
    gain.gain.value = this.params.volume;
    source.connect(gain);
    gain.connect(this.voiceBus);

    source.start(0, sliceStart);
    source.stop(sliceEnd);
  }

  playStep(note: number, lengthSec: number, when: number, velocity: number = 1): void {
    const range = this.playRange();
    if (!range) return;

    const buffer = range.buffer;
    const regionStart = range.start * buffer.duration;
    const regionEnd = range.end * buffer.duration;
    const playbackRate = this.calculatePlaybackRate(note);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.voiceBus);

    const attackTime = Math.max(0.001, this.params.attack / 1000);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(velocity, when + attackTime);

    const releaseTime = this.params.release / 1000;
    const endTime = when + lengthSec;
    gain.gain.setValueAtTime(velocity, endTime - releaseTime);
    gain.gain.linearRampToValueAtTime(0, endTime);

    source.start(when, regionStart);
    source.stop(endTime);
  }

  stopAll(): void {
    const now = this.ctx.currentTime;
    this.voices.forEach(voice => {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + 0.005);
      voice.source.stop(now + 0.005);
    });
    this.voices = [];
  }

  async exportWav(): Promise<Blob> {
    const range = this.playRange();
    if (!range) return new Blob();

    const offlineCtx = new OfflineAudioContext(
      range.buffer.numberOfChannels,
      Math.ceil(range.buffer.sampleRate * (range.end - range.start) * range.buffer.duration),
      range.buffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = range.buffer;
    source.playbackRate.value = this.calculatePlaybackRate(this.params.rootNote);

    const gain = offlineCtx.createGain();
    source.connect(gain);

    const fadeIn = 0.003;
    const fadeOut = 0.008;
    const regionDuration = (range.end - range.start) * range.buffer.duration;
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(1, fadeIn);
    gain.gain.setValueAtTime(1, regionDuration - fadeOut);
    gain.gain.linearRampToValueAtTime(0, regionDuration);

    source.start(0, range.start * range.buffer.duration);
    source.stop(regionDuration);

    const merger = offlineCtx.createChannelMerger(2);
    if (range.buffer.numberOfChannels === 1) {
      gain.connect(merger, 0, 0);
      gain.connect(merger, 0, 1);
    } else {
      gain.connect(merger, 0, 0);
      gain.connect(merger, 1, 1);
    }

    const analyser = offlineCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    merger.connect(analyser);

    const limiter = offlineCtx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;
    analyser.connect(limiter);

    const out = offlineCtx.createGain();
    limiter.connect(out);
    out.connect(offlineCtx.destination);

    const renderedBuffer = await offlineCtx.startRendering();

    // Normalize to -1 dBFS
    let maxSample = 0;
    for (let i = 0; i < renderedBuffer.length; i++) {
      for (let channel = 0; channel < renderedBuffer.numberOfChannels; channel++) {
        const sample = Math.abs(renderedBuffer.getChannelData(channel)[i]);
        if (sample > maxSample) maxSample = sample;
      }
    }
    const gainFactor = maxSample > 0 ? 0.89125 / maxSample : 1; // 0.89125 = 10^(-1/20)
    for (let channel = 0; channel < renderedBuffer.numberOfChannels; channel++) {
      const channelData = renderedBuffer.getChannelData(channel);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] *= gainFactor;
      }
    }

    this.lastLoudness = measureLoudness(renderedBuffer);

    // Encode to 24-bit WAV
    const sampleRate = renderedBuffer.sampleRate;
    const numChannels = renderedBuffer.numberOfChannels;
    const numSamples = renderedBuffer.length;
    const dataSize = numSamples * numChannels * 3;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    // fmt subchunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 3, true);
    view.setUint16(32, numChannels * 3, true);
    view.setUint16(34, 24, true);

    // data subchunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write samples
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = renderedBuffer.getChannelData(channel)[i];
        const clamped = Math.max(-1, Math.min(1, sample));
        const intValue = Math.round(clamped * 8388607);
        view.setUint8(offset, intValue & 0xFF);
        view.setUint8(offset + 1, (intValue >> 8) & 0xFF);
        view.setUint8(offset + 2, (intValue >> 16) & 0xFF);
        offset += 3;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  regionBuffer(): AudioBuffer | null {
    if (!this.sourceBuffer) return null;

    const sourceBuffer = this.params.reverse ? this.getReversedBuffer() : this.sourceBuffer;
    if (!sourceBuffer) return null;

    const regionStart = this.params.start * sourceBuffer.duration;
    const regionEnd = this.params.end * sourceBuffer.duration;
    const regionDuration = regionEnd - regionStart;
    const regionSamples = Math.floor(regionDuration * sourceBuffer.sampleRate);

    const newBuffer = this.ctx.createBuffer(
      sourceBuffer.numberOfChannels,
      regionSamples,
      sourceBuffer.sampleRate
    );

    for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel++) {
      const sourceData = sourceBuffer.getChannelData(channel);
      const destData = newBuffer.getChannelData(channel);
      const startSample = Math.floor(regionStart * sourceBuffer.sampleRate);
      for (let i = 0; i < regionSamples; i++) {
        destData[i] = sourceData[startSample + i];
      }
    }

    return newBuffer;
  }

  private getReversedBuffer(): AudioBuffer | null {
    if (!this.sourceBuffer) return null;

    if (this.reversedBuffer) return this.reversedBuffer;

    const buffer = this.sourceBuffer;
    const reversedBuffer = this.ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const sourceData = buffer.getChannelData(channel);
      const destData = reversedBuffer.getChannelData(channel);
      for (let i = 0; i < buffer.length; i++) {
        destData[i] = sourceData[buffer.length - 1 - i];
      }
    }

    this.reversedBuffer = reversedBuffer;
    return reversedBuffer;
  }

  private calculatePlaybackRate(note: number): number {
    const semitones = note - this.params.rootNote + this.params.pitch + this.params.fine / 100;
    return Math.pow(2, semitones / 12);
  }

  private updateFilter(): void {
    const types: BiquadFilterType[] = ["lowpass", "highpass", "bandpass"];
    this.filter.type = types[this.params.filterType];
    const freq = 30 * Math.pow(20000 / 30, this.params.filterCut);
    this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.01);
    const q = 0.4 + this.params.filterRes * 15.6;
    this.filter.Q.setTargetAtTime(q, this.ctx.currentTime, 0.01);
  }

  private updateDrive(): void {
    const roundedDrive = Math.round(this.params.drive * 100) / 100;
    if (roundedDrive === this.lastDriveCurve) return;

    this.lastDriveCurve = roundedDrive;

    if (roundedDrive === 0) {
      this.drive.curve = null;
      return;
    }

    const k = 1 + roundedDrive * 24;
    const curveLength = 4096;
    const curve = new Float32Array(curveLength);

    for (let i = 0; i < curveLength; i++) {
      const x = (i * 2 / curveLength) - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }

    this.drive.curve = curve;
    this.drive.oversample = "4x";
  }

  private updateCrush(): void {
    if (this.params.crush === 0) {
      this.crush.curve = null;
      return;
    }

    const bits = Math.round(16 - this.params.crush * 13);
    const levels = Math.pow(2, bits);
    const curveLength = 4096;
    const curve = new Float32Array(curveLength);

    for (let i = 0; i < curveLength; i++) {
      const x = (i * 2 / curveLength) - 1;
      const quantized = Math.round(x * (levels - 1)) / (levels - 1);
      curve[i] = quantized;
    }

    this.crush.curve = curve;
  }

  private updateDelay(): void {
    const bpm = this.getBpm();
    const delayTime = Math.min(2, DELAY_DIVS[this.params.delayDiv] * 60 / bpm);
    this.delay.delayTime.setTargetAtTime(delayTime, this.ctx.currentTime, 0.05);
    this.delaySend.gain.value = this.params.delaySend;
    this.delayFb.gain.value = this.params.delayFb;
  }

  private updateReverb(): void {
    const roundedDecay = Math.round(this.params.reverbDecay * 100) / 100;
    if (Math.abs(roundedDecay - (this.lastReverbDecay ?? -1)) < 0.05) return;

    this.lastReverbDecay = roundedDecay;

    if (roundedDecay === 0) {
      this.reverb.buffer = null;
      return;
    }

    const duration = 0.4 + roundedDecay * 3.6;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.ceil(duration * sampleRate);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const fadeIn = Math.min(1, t / 0.002);
        data[i] = (Math.random() * 2 - 1) * Math.exp(-6 * t / duration) * fadeIn;
      }
    }

    this.reverb.buffer = impulse;
    this.reverbSend.gain.value = this.params.reverbSend;
  }

  private updateVolume(): void {
    this.out.gain.setTargetAtTime(this.params.volume, this.ctx.currentTime, 0.01);
  }

  private stopVoice(voice: Voice, rampTime: number): void {
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + rampTime);
    voice.source.stop(now + rampTime);
    this.scheduleVoiceCleanup(voice, now + rampTime);
  }

  private scheduleVoiceCleanup(voice: Voice, time: number): void {
    setTimeout(() => {
      const index = this.voices.indexOf(voice);
      if (index !== -1) {
        this.voices.splice(index, 1);
      }
    }, (time - this.ctx.currentTime) * 1000);
  }

  private currentBakeKey(): string {
    return `${this.baseVersion}|${this.params.start}|${this.params.end}|${this.params.stretch}`;
  }

  private notifyBake(): void {
    this.bakeListener?.();
  }

  private scheduleBake(): void {
    if (this.bakeTimer) {
      clearTimeout(this.bakeTimer);
      this.bakeTimer = null;
    }
    this.bakeToken++;

    if (this.params.stretch === 1) {
      this.bakedBuffer = null;
      this.bakedKey = "";
      this.bakingNow = false;
      this.notifyBake();
      return;
    }

    this.bakeTimer = setTimeout(() => {
      this.bakeTimer = null;
      void this.bake();
    }, 200);
  }

  private async bake(): Promise<void> {
    if (!this.sourceBuffer) return;

    const key = this.currentBakeKey();
    if (this.bakedBuffer !== null && this.bakedKey === key) return;

    const { start, end, stretch } = this.params;
    const token = ++this.bakeToken;

    this.bakingNow = true;
    this.notifyBake();

    try {
      const regionStart = start * this.sourceBuffer.duration;
      const regionEnd = end * this.sourceBuffer.duration;
      const regionDuration = regionEnd - regionStart;
      const regionSamples = Math.floor(regionDuration * this.sourceBuffer.sampleRate);

      const region = this.ctx.createBuffer(
        this.sourceBuffer.numberOfChannels,
        regionSamples,
        this.sourceBuffer.sampleRate
      );

      for (let channel = 0; channel < this.sourceBuffer.numberOfChannels; channel++) {
        const sourceData = this.sourceBuffer.getChannelData(channel);
        const destData = region.getChannelData(channel);
        const startSample = Math.floor(regionStart * this.sourceBuffer.sampleRate);
        for (let i = 0; i < regionSamples; i++) {
          destData[i] = sourceData[startSample + i];
        }
      }

      const out = await stretchBuffer(this.ctx, region, stretch, () => token !== this.bakeToken);
      if (token !== this.bakeToken || out === null) return;

      this.bakedBuffer = out;
      this.bakedKey = key;
    } catch (error) {
      console.error(error);
    } finally {
      if (token === this.bakeToken) {
        this.bakingNow = false;
        this.notifyBake();
      }
    }
  }

  private reversedOf(buffer: AudioBuffer): AudioBuffer {
    const cached = this.reversedCache.get(buffer);
    if (cached) return cached;

    const reversed = this.ctx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const sourceData = buffer.getChannelData(channel);
      const destData = reversed.getChannelData(channel);
      for (let i = 0; i < buffer.length; i++) {
        destData[i] = sourceData[buffer.length - 1 - i];
      }
    }

    this.reversedCache.set(buffer, reversed);
    return reversed;
  }

  private playRange(): { buffer: AudioBuffer; start: number; end: number } | null {
    if (!this.sourceBuffer) return null;

    if (this.params.stretch !== 1 && this.bakedBuffer !== null && this.bakedKey === this.currentBakeKey()) {
      const b = this.bakedBuffer;
      return {
        buffer: this.params.reverse ? this.reversedOf(b) : b,
        start: 0,
        end: 1
      };
    }

    const b = this.params.reverse ? this.getReversedBuffer() : this.sourceBuffer;
    if (!b) return null;

    return {
      buffer: b,
      start: this.params.start,
      end: this.params.end
    };
  }
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
