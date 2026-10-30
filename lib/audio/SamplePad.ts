import { SampledKit } from "./sampledKit";
import { DRUM_KITS, type DrumPart } from "@/lib/drumKits";
import { nextGridTime } from "./rhythmMath";
import { gridSlices, hitSlices, type PadSlice } from "./padSlices";
export const PAD_SLICES = 16;
export const ECHO_DIVS: number[] = [0.25, 0.5, 1, 2];

// slice length of one key, in beats (1 beat = a quarter note)
export const SLICE_DIVS: { label: string; beats: number }[] = [
  { label: "1/32", beats: 0.125 },
  { label: "1/16T", beats: 1 / 6 },
  { label: "1/16", beats: 0.25 },
  { label: "1/8T", beats: 1 / 3 },
  { label: "1/8", beats: 0.5 },
  { label: "1/4", beats: 1 },
  { label: "1/2", beats: 2 },
  { label: "1M", beats: 4 },
  { label: "2M", beats: 8 },
  { label: "4M", beats: 16 },
];
export const DEFAULT_SLICE_DIV = 2; // 1/16
export const DRUM_NAMES: string[] = ["Kick", "Kick 2", "Snare", "Clap", "Hat fermé", "Hat ouvert", "Rim", "Tom bas", "Tom haut", "Crash", "Montée", "Descente", "Sub", "Stab", "Sirène", "Zap"];

export type PadBank = "slices" | "drums";

// where the slices come from: the whole song or one of its stems
export const PAD_SOURCES: { id: string; label: string }[] = [{ id: "mix", label: "Mix" }, { id: "drums", label: "Batterie" }, { id: "bass", label: "Basse" }, { id: "other", label: "Autre" }, { id: "vocals", label: "Voix" }, { id: "phrases", label: "Phrases" }];

export interface PadSource {
  buffer: AudioBuffer | null;
  bpm: number;
  beatOffset: number;
  position: number;
  stem?: (name: string) => AudioBuffer | null; // a stem's audio, when the deck plays its stems
  events?: (name: string) => number[]; // the song's real hits (song seconds, sorted): "drums", "bass", "other", "vocals", "phrases" or "mix"
  rate?: number; // the deck's playback rate (AU TEMPS waits in audio seconds)
}

export interface PadSettings {
  pitch: number;
  reverse: boolean;
  hold: boolean;
  filter: number;
  echo: number;
  echoDiv: number;
  sliceDiv: number;
  gate: boolean;
  volume: number;
  reverb: number;
  source: number; // index in PAD_SOURCES (0 = the whole mix)
  quant: boolean; // AU TEMPS: a key waits for the next grid line
  kit: number; // BATTERIE sounds: 0 synthetic, i = DRUM_KITS[i - 1]
  onHits: boolean; // SUR LES COUPS: each key starts on one of the next real hits instead of the grid
}

export const DEFAULT_PAD_SETTINGS: PadSettings = {
  pitch: 0,
  reverse: false,
  hold: false,
  filter: 1,
  echo: 0,
  echoDiv: 1,
  sliceDiv: DEFAULT_SLICE_DIV,
  gate: false,
  volume: 0.8,
  reverb: 0.35,
  source: 0,
  onHits: false,
  quant: false,
  kit: 0,
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
  private delay: DelayNode;
  private readonly feedback: GainNode;
  private readonly echoOut: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly reverbOut: GainNode;
  private readonly noiseBuffer: AudioBuffer;
  private lastPlayedSlice: number | null = null;

  private bank: PadBank = "slices";
  private drumBuffers: AudioBuffer[] | null = null;
  private readonly outGain: GainNode;
  private readonly oneShots = new Set<AudioScheduledSourceNode>();

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
    this.feedback.gain.value = 0.5; // loop gain below 1: the echo tail decays instead of ringing forever
    this.echoOut = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverbOut = ctx.createGain();

    this.filter.connect(this.dryOut);
    this.filter.connect(this.echoSend);
    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.settings.volume;
    this.outGain.connect(dest);
    this.dryOut.connect(this.outGain);
    this.echoSend.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.echoOut);
    this.echoOut.connect(this.outGain);

    this.reverb.buffer = this.createReverbImpulse();
    this.reverb.connect(this.reverbOut);
    this.reverbOut.gain.value = this.settings.reverb;
    this.reverbOut.connect(this.outGain);

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

  // BATTERIE on a real kit: the drum keys take Beat Lab's kits (machines or acoustic), the effect keys stay synthetic
  private kit: SampledKit | null = null;
  private static readonly DRUM_KEY_PARTS: (DrumPart | null)[] = ["kick", "kick", "snare", "clap", "hat", "open", "rim", "tom", "tom", "cymbal", null, null, null, null, null, null];

  kitStatus(): string | null {
    if (this.settings.kit === 0) return null;
    const kitLabel = DRUM_KITS[this.settings.kit - 1].label;
    if (this.kit?.ready()) return `${kitLabel} prête`;
    if (this.kit?.failed) return `${kitLabel} indisponible (réseau ?) : sons synthétiques`;
    return `${kitLabel} : chargement`;
  }

  private loadKit(): void {
    if (this.settings.kit === 0) return;
    const def = DRUM_KITS[this.settings.kit - 1];
    if (!def) return;
    this.kit ??= new SampledKit(this.ctx);
    void this.kit.load(def.id).then(() => this.onKitChange?.());
  }

  private onKitChange: (() => void) | null = null; // the panel re-renders when a kit has loaded
  setKitListener(fn: (() => void) | null): void { this.onKitChange = fn; }

  // the buffer and level of drum key `index`: the kit's sound when it has this part, else null (the synthetic one plays)
  private kitSample(index: number): { buffer: AudioBuffer; gain: number } | null {
    if (this.settings.kit === 0 || !this.kit?.ready()) return null;
    const part = SamplePad.DRUM_KEY_PARTS[index];
    return part ? this.kit.sample(part, 0.85) : null;
  }

  triggerDrum(index: number): void {
    if (index < 0 || index >= 16) return;

    if (!this.drumBuffers) {
      this.drumBuffers = this.generateDrumBuffers();
    }

    const ks = this.kitSample(index);
    const buffer = ks?.buffer ?? this.drumBuffers[index];
    if (!buffer) return;

    if (this.voices.has(index)) {
      this.stopVoice(index);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** (this.settings.pitch / 12);

    const gain = this.ctx.createGain();
    const at = this.ctx.currentTime + this.quantDelay();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(ks?.gain ?? 1, at + 0.004);

    source.connect(gain);
    gain.connect(this.filter);

    source.start(at, 0);
    source.stop(at + buffer.duration);

    const voice: Voice = {
      source,
      gain,
      gateInterval: null,
      startTime: at,
    };

    this.voices.set(index, voice);

    source.onended = () => {
      if (this.voices.get(index) === voice) {
        this.voices.delete(index);
      }
    };
  }


  // the audio and the span of key `slice` right now: from the chosen stem (the mix when stems do not play), on the grid or on the real hits
  private sliceAt(slice: number): { buffer: AudioBuffer; start: number; len: number } | null {
    const src = this.source(); if (!src.buffer || src.bpm <= 0) return null;
    const name = PAD_SOURCES[this.settings.source]?.id ?? "mix";
    const stemName = name === "phrases" ? "vocals" : name;
    const buffer = name === "mix" ? src.buffer : src.stem?.(stemName) ?? src.buffer;
    const spb = 60 / src.bpm;
    const barStart = src.beatOffset + Math.floor((src.position - src.beatOffset) / (4 * spb)) * 4 * spb;
    const sec = this.sliceSec(spb);
    // a sung phrase always starts on its first note and lasts until the next phrase, at most 4 bars
    const useHits = this.settings.onHits || name === "phrases";
    const hits = useHits ? src.events?.(name) ?? [] : [];
    const maxLen = name === "phrases" ? 16 * spb : Math.max(sec, spb); // a hit lasts until the next one, at most a beat (or TRANCHE when longer)
    const list: PadSlice[] = hits.length
      ? hitSlices(hits, barStart, PAD_SLICES, maxLen, buffer.duration)
      : gridSlices(barStart, sec, PAD_SLICES, buffer.duration); // the grid, also while the hits are not analysed yet
    const s = list[slice]; return s && s.len > 0.01 ? { buffer, start: s.start, len: s.len } : null;
  }

  // AU TEMPS: how long to wait for the next grid line (a beat for a phrase, else a sixteenth), in audio seconds; 0 when off
  private quantDelay(): number {
    if (!this.settings.quant) return 0;
    const src = this.source(); if (src.bpm <= 0) return 0;
    const spb = 60 / src.bpm, step = PAD_SOURCES[this.settings.source]?.id === "phrases" ? spb : spb / 4;
    const next = nextGridTime(src.position + 0.005, src.beatOffset, step);
    return Math.max(0, (next - src.position) / Math.max(0.25, src.rate ?? 1));
  }


  private startVoice(slice: number): void {
    const sl = this.sliceAt(slice); if (!sl) return;
    const sr = sl.buffer.sampleRate;
    const sliceBuffer = this.copySlice(sl.buffer, Math.floor(sl.start * sr), Math.floor(sl.len * sr), this.settings.reverse);

    const source = this.ctx.createBufferSource();
    source.buffer = sliceBuffer;
    source.playbackRate.value = 2 ** (this.settings.pitch / 12);

    const at = this.ctx.currentTime + this.quantDelay();
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + 0.004);

    source.connect(gain);
    gain.connect(this.filter);

    source.loop = this.settings.hold;
    const startTime = at;
    source.start(at, 0);

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
      }, sl.len * 1000);

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

  // the level of this module for the next `sec` seconds (a rhythm link plays it softer or louder)
  levelFor(mult: number, sec: number): void {
    const g = this.outGain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(this.settings.volume * mult, t);
    g.setValueAtTime(this.settings.volume, t + sec);
  }

  trigger(slice: number): void {
    if (slice < 0 || slice >= PAD_SLICES) return;

    if (this.bank === "drums") {
      this.triggerDrum(slice);
      return;
    }

    if (!this.sliceAt(slice)) return;

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

  // length of one key's slice in seconds, for the current tempo and division
  private sliceSec(spb: number): number {
    return SLICE_DIVS[this.settings.sliceDiv].beats * spb;
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
      if (!this.settings.hold) this.stopAll();
    } else if (key === "filter") {
      this.settings.filter = typeof value === "number" ? Math.max(0, Math.min(1, value)) : 1;
      const freq = 120 * (20000 / 120) ** this.settings.filter;
      this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
    } else if (key === "echo") {
      this.settings.echo = typeof value === "number" ? Math.max(0, Math.min(1, value)) : 0;
      this.echoSend.gain.value = this.settings.echo;
    } else if (key === "source") {
      this.settings.source = typeof value === "number" ? Math.max(0, Math.min(PAD_SOURCES.length - 1, Math.round(value))) : 0;
    } else if (key === "kit") {
      this.settings.kit = typeof value === "number" ? Math.max(0, Math.min(DRUM_KITS.length, Math.round(value))) : 0;
      this.loadKit();
    } else if (key === "quant") {
      this.settings.quant = typeof value === "boolean" ? value : false;
    } else if (key === "onHits") {
      this.settings.onHits = typeof value === "boolean" ? value : false;
    } else if (key === "sliceDiv") {
      this.settings.sliceDiv = typeof value === "number" ? Math.max(0, Math.min(SLICE_DIVS.length - 1, Math.round(value))) : DEFAULT_SLICE_DIV;
    } else if (key === "echoDiv") {
      this.settings.echoDiv = typeof value === "number" ? Math.max(0, Math.min(ECHO_DIVS.length - 1, Math.floor(value))) : 1;
      const src = this.source();
      const delayTime = ECHO_DIVS[this.settings.echoDiv] * (src.bpm > 0 ? 60 / src.bpm : 0.5);
      this.delay.delayTime.setTargetAtTime(delayTime, this.ctx.currentTime, 0.02);
    } else if (key === "volume") {
      this.settings.volume = typeof value === "number" ? Math.max(0, Math.min(1.5, value)) : 0.8;
      this.outGain.gain.setTargetAtTime(this.settings.volume, this.ctx.currentTime, 0.02);
    } else if (key === "reverb") {
      this.settings.reverb = typeof value === "number" ? Math.max(0, Math.min(1, value)) : 0.35;
      this.reverbOut.gain.setTargetAtTime(this.settings.reverb, this.ctx.currentTime, 0.02);
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

    const source = this.track(this.ctx.createBufferSource());
    const sr = src.buffer.sampleRate;
    const sliceBuffer = this.copySlice(src.buffer, Math.floor(src.position * sr), Math.floor(duration * sr), true);

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

  impact(when?: number): void {
    this.impactAt(Math.max(this.ctx.currentTime, when ?? 0));
  }

  private impactAt(when: number): void {
    // Bass tone
    const bass = this.track(this.ctx.createOscillator());
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
    const noise = this.track(this.ctx.createBufferSource());
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

  // drops the echo memory: a new delay line replaces the old one, so a stopped tail cannot come back
  private flushEcho(): void {
    const old = this.delay;
    const time = old.delayTime.value;
    this.echoSend.disconnect(old);
    this.feedback.disconnect(old);
    old.disconnect();

    this.delay = this.ctx.createDelay(2);
    this.delay.delayTime.value = time;
    this.echoSend.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.echoOut);
  }

  // one-shot sources (drop, impact) are kept here so STOP can cut them too
  private track<T extends AudioScheduledSourceNode>(node: T): T {
    this.oneShots.add(node);
    node.onended = () => {
      this.oneShots.delete(node);
    };
    return node;
  }

  stopAll(): void {
    const now = this.ctx.currentTime;
    const slices = Array.from(this.voices.keys());

    slices.forEach(slice => {
      this.stopVoice(slice);
    });

    this.voices.clear();

    this.oneShots.forEach(node => {
      try {
        node.stop(now);
      } catch {
        // already stopped
      }
    });
    this.oneShots.clear();
    this.flushEcho();
  }

  // copy [start, start + len) of a buffer, reversed if asked: only the played slice is
  // ever copied or reversed, never the whole track
  private copySlice(buf: AudioBuffer, start: number, len: number, reverse: boolean): AudioBuffer {
    const out = this.ctx.createBuffer(buf.numberOfChannels, Math.max(1, len), buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const dst = out.getChannelData(ch);
      dst.set(buf.getChannelData(ch).subarray(Math.max(0, start), Math.max(0, start) + len));
      if (reverse) dst.reverse();
    }
    return out;
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
