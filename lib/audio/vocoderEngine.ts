// Classic analog-style vocoder + vocal processing rack, built entirely from
// native Web Audio nodes (no AudioWorklet needed) — the modulator (isolated
// vocal) is split into N log-spaced bands; each band's amplitude envelope
// (rectify + lowpass) drives the gain of the matching band of the carrier via
// GainNode.gain, which accepts an audio-rate control signal from any node.
// Runs identically against a live AudioContext or an OfflineAudioContext
// (both are BaseAudioContext) so the exact same chain can be bounced to a WAV
// for export.
import { FXRack } from "./FXRack";
import { PitchShifter } from "./PitchShifter";

export type CarrierType = "synth" | "noise" | "instrumental";
export type HarmonizeMode = "off" | "third" | "fifth" | "octave" | "choir";

// which extra pitched copies get mixed in under the main vocal for each
// harmonize mode — "choir" stacks several at once (with slight per-voice
// detune/pan humanize applied in buildHarmonyVoices) for a group/ensemble
// sound rather than a single clean doubled interval.
export const HARMONIZE_INTERVALS: Record<HarmonizeMode, number[]> = {
  off: [],
  third: [4],
  fifth: [7],
  octave: [12],
  choir: [0, 4, 7, 12],
};

export interface VocalParams {
  vocoderOn: boolean;
  vocoderMix: number; // 0..1, dry vocal vs vocoder output
  carrier: CarrierType;
  carrierNote: number; // MIDI note for the synth carrier's root
  pitchSemis: number; // -12..12, tempo-preserving pitch shift
  robotOn: boolean; // quantizes pitchSemis to the nearest semitone step
  // formant-lock (approximate): vocodes a pitch-shifted carrier through the
  // ORIGINAL (unshifted) vocal's amplitude envelope via a dedicated internal
  // Vocoder, so the pitch moves while the vowel/formant character stays
  // closer to the natural voice. This is a real, known technique but with
  // only 16 bands it isn't a transparent studio-grade formant correction —
  // it imparts some of the vocoder's own character. Off = plain pitch shift
  // (pitch and formants move together, the classic chipmunk/demon sound).
  formantLock: boolean;
  // independent formant shift, in "semitone-equivalent" units (-12..12) —
  // separate from pitchSemis so timbre and pitch can move independently,
  // the way real voice-conversion tools split them. Implemented by giving
  // the internal formant-shift Vocoder's modulator bands a different center
  // frequency than its carrier bands (see Vocoder's modFreqScale param):
  // reading the SAME unshifted vocal's envelope from a scaled frequency
  // warps the reconstructed spectral envelope without touching pitch.
  formantShift: number;
  harmonize: HarmonizeMode;
  eqLow: number; // dB, -12..12
  eqMid: number;
  eqHigh: number;
  deess: number; // dB cut, 0..18 (applied as negative gain at ~6.5kHz)
  reverbWet: number; // 0..1 (fed into FXRack "reverb")
  delayWet: number; // 0..1 (fed into FXRack "echo")
  chorusWet: number; // 0..1, virtual chorus (subtle multi-voice detune/delay)
}

export const defaultVocalParams: VocalParams = {
  vocoderOn: false,
  vocoderMix: 1,
  carrier: "synth",
  carrierNote: 45, // A2-ish drone root
  pitchSemis: 0,
  robotOn: false,
  formantLock: false,
  formantShift: 0,
  harmonize: "off",
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  deess: 0,
  reverbWet: 0,
  delayWet: 0,
  chorusWet: 0,
};

// One-click "Female Voice" conversion: a moderate pitch-up plus an
// independent formant-up shift (shorter effective vocal tract), without
// touching harmonize/vocoder/space so it composes with whatever else is
// dialed in. Kept as a named preset since "pitch +4, formant +3" isn't a
// combination someone would otherwise land on by trial and error.
export const FEMALE_VOICE_PRESET: Partial<VocalParams> = {
  pitchSemis: 4,
  robotOn: false,
  formantLock: false,
  formantShift: 3,
};

// One-click "Celestial Choir": stacks the choir harmony under a low synth
// drone (soft pad texture, not a robotic vocode — vocoderMix stays partial
// so the dry voice leads) and opens up reverb/delay/chorus for an airy,
// ensemble-cathedral space. Pitch/formant are left untouched (0, robot and
// formant-lock off) so the lead voice stays perfectly in tune — only the
// harmony stack and the space around it are "celestial", not the voice itself.
export const CELESTIAL_CHOIR_PRESET: Partial<VocalParams> = {
  harmonize: "choir",
  vocoderOn: true,
  vocoderMix: 0.35,
  carrier: "synth",
  carrierNote: 52, // E3 drone — open, airy root under the choir stack
  pitchSemis: 0,
  robotOn: false,
  formantLock: false,
  formantShift: 0,
  eqLow: -3,
  eqMid: 0,
  eqHigh: 4,
  deess: 5,
  reverbWet: 0.55,
  delayWet: 0.2,
  chorusWet: 0.45,
};

const NUM_BANDS = 16;
const MIN_FREQ = 110;
const MAX_FREQ = 7000;
const BAND_Q = 4.5;

function rectifyCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.abs(x);
  }
  return curve;
}
const RECTIFY_CURVE = rectifyCurve();

interface Band {
  modBP: BiquadFilterNode;
  rectify: WaveShaperNode;
  env: BiquadFilterNode;
  envMakeup: GainNode;
  carrierBP: BiquadFilterNode;
  bandGain: GainNode;
}

// Envelope-follower vocoder: `input` is the modulator (vocal), `carrierInput`
// is where the excitation signal (synth/noise/instrumental) connects, `output`
// carries the vocoded result.
export class Vocoder {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly carrierInput: GainNode;
  private bands: Band[] = [];
  private bandFreqs: number[] = [];

  // modFreqScale > 1 shifts the RECONSTRUCTED formant envelope up by that
  // ratio (reads each band's envelope from a proportionally lower frequency
  // in the modulator, so the carrier's own — unshifted — pitch/frequency
  // content at each band gets shaped by an envelope sampled from lower down,
  // stretching the overall spectral envelope upward). 1 = normal vocoder
  // (mod and carrier bands aligned, used everywhere except the dedicated
  // formant-shift stage).
  constructor(ctx: BaseAudioContext, modFreqScale = 1) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.output.gain.value = 1 / Math.sqrt(NUM_BANDS / 4); // tame the N-band sum
    this.carrierInput = ctx.createGain();

    for (let i = 0; i < NUM_BANDS; i++) {
      const t = i / (NUM_BANDS - 1);
      const freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, t);
      this.bandFreqs.push(freq);

      const modBP = ctx.createBiquadFilter();
      modBP.type = "bandpass";
      modBP.frequency.value = freq / modFreqScale;
      modBP.Q.value = BAND_Q;

      const rectify = ctx.createWaveShaper();
      rectify.curve = RECTIFY_CURVE;

      const env = ctx.createBiquadFilter();
      env.type = "lowpass";
      env.frequency.value = 22;
      env.Q.value = 0.7;

      const envMakeup = ctx.createGain();
      envMakeup.gain.value = 7;

      const carrierBP = ctx.createBiquadFilter();
      carrierBP.type = "bandpass";
      carrierBP.frequency.value = freq;
      carrierBP.Q.value = BAND_Q;

      const bandGain = ctx.createGain();
      bandGain.gain.value = 0; // base level; envelope adds on top via connect()

      this.input.connect(modBP);
      modBP.connect(rectify);
      rectify.connect(env);
      env.connect(envMakeup);
      envMakeup.connect(bandGain.gain);

      this.carrierInput.connect(carrierBP);
      carrierBP.connect(bandGain);
      bandGain.connect(this.output);

      this.bands.push({ modBP, rectify, env, envMakeup, carrierBP, bandGain });
    }
  }

  // live-update the formant-shift ratio without rebuilding the graph
  setModFreqScale(scale: number) {
    for (let i = 0; i < this.bands.length; i++) {
      this.bands[i].modBP.frequency.value = this.bandFreqs[i] / scale;
    }
  }

  disconnect() {
    this.input.disconnect();
    this.output.disconnect();
    this.carrierInput.disconnect();
    for (const b of this.bands) {
      b.modBP.disconnect();
      b.rectify.disconnect();
      b.env.disconnect();
      b.envMakeup.disconnect();
      b.carrierBP.disconnect();
      b.bandGain.disconnect();
    }
  }
}

const noteToFreq = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

// A small buzzy chord (root/fifth/octave sawtooths) — the classic robotic
// vocoder excitation source.
export function makeSynthCarrier(ctx: BaseAudioContext, note: number) {
  const out = ctx.createGain();
  out.gain.value = 0.5;
  const freq = noteToFreq(note);
  const oscs = [1, 1.5, 2].map((mult) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq * mult;
    o.connect(out);
    return o;
  });
  return {
    output: out as AudioNode,
    start: (when: number) => oscs.forEach((o) => o.start(when)),
    stop: (when: number) => oscs.forEach((o) => { try { o.stop(when); } catch { /* already stopped */ } }),
  };
}

// White-noise excitation — a breathier, whispered vocoder texture.
export function makeNoiseCarrier(ctx: BaseAudioContext) {
  const dur = 2;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const out = ctx.createGain();
  out.gain.value = 0.5;
  src.connect(out);
  return {
    output: out as AudioNode,
    start: (when: number) => src.start(when),
    stop: (when: number) => { try { src.stop(when); } catch { /* already stopped */ } },
  };
}

// Simple 3-band shelving/peaking EQ.
export class Eq3 {
  readonly input: BiquadFilterNode;
  readonly output: BiquadFilterNode;
  private low: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private high: BiquadFilterNode;

  constructor(ctx: BaseAudioContext) {
    this.low = ctx.createBiquadFilter();
    this.low.type = "lowshelf";
    this.low.frequency.value = 250;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = "peaking";
    this.mid.frequency.value = 1500;
    this.mid.Q.value = 0.8;
    this.high = ctx.createBiquadFilter();
    this.high.type = "highshelf";
    this.high.frequency.value = 6000;
    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.input = this.low;
    this.output = this.high;
  }

  setGains(lowDb: number, midDb: number, highDb: number) {
    this.low.gain.value = lowDb;
    this.mid.gain.value = midDb;
    this.high.gain.value = highDb;
  }

  disconnect() {
    this.low.disconnect();
    this.mid.disconnect();
    this.high.disconnect();
  }
}

// Static de-esser approximation: a peaking cut around sibilance frequencies.
export class Deess {
  readonly node: BiquadFilterNode;
  constructor(ctx: BaseAudioContext) {
    this.node = ctx.createBiquadFilter();
    this.node.type = "peaking";
    this.node.frequency.value = 6500;
    this.node.Q.value = 2.2;
    this.node.gain.value = 0;
  }
  setCutDb(db: number) {
    this.node.gain.value = -Math.abs(db);
  }
  disconnect() {
    this.node.disconnect();
  }
}

// Virtual chorus: several short modulated delay lines (no feedback, unlike
// the flanger) spread across the stereo field, each drifting at a slightly
// different slow LFO rate — the classic "multiple voices singing together
// just slightly out of sync" thickening effect. Depth is kept small (a few
// milliseconds / cents-scale) on purpose: enough to sound like doubled
// voices, not enough to sound out of tune.
export class Chorus {
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private lfos: OscillatorNode[] = [];

  constructor(ctx: BaseAudioContext, voices = 3) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;

    this.input.connect(this.dry);
    this.dry.connect(this.output);

    for (let i = 0; i < voices; i++) {
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = 0.016 + i * 0.007;

      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.5 + i * 0.17; // detuned rates so voices drift independently
      const depth = ctx.createGain();
      depth.gain.value = 0.0025;
      lfo.connect(depth);
      depth.connect(delay.delayTime);
      lfo.start();
      this.lfos.push(lfo);

      this.input.connect(delay);
      if (typeof ctx.createStereoPanner === "function") {
        const pan = ctx.createStereoPanner();
        pan.pan.value = ((i - (voices - 1) / 2) / voices) * 1.4;
        delay.connect(pan);
        pan.connect(this.wet);
      } else {
        delay.connect(this.wet);
      }
    }
    this.wet.connect(this.output);
  }

  setWet(v: number) {
    this.wet.gain.value = Math.max(0, Math.min(1, v));
  }

  disconnect() {
    this.input.disconnect();
    this.output.disconnect();
    this.dry.disconnect();
    this.wet.disconnect();
    this.lfos.forEach((l) => { try { l.stop(); } catch { /* already stopped */ } });
  }
}

export const formantRatio = (semis: number) => Math.pow(2, semis / 12);

// Builds one or more extra pitched copies of `vocals` (per HARMONIZE_INTERVALS)
// and mixes them into `dest`. "choir" humanizes each voice slightly (a few
// cents of detune, a touch of stereo spread) so the stack reads as a group
// rather than a single clean doubled interval; single-interval modes (third/
// fifth/octave) stay clean. `startFn` lets callers control the start time
// (0 for offline render, `when`/`offset` for live playback).
export interface HarmonyVoices {
  sources: AudioScheduledSourceNode[];
  // each shifter paired with the interval+detune offset (in semitones) it was
  // built with, so a live pitchSemis change can recompute `newBase + offset`
  // per voice without losing choir mode's per-voice humanize detune.
  shifters: { shifter: PitchShifter; offset: number }[];
}

export function buildHarmonyVoices(
  ctx: BaseAudioContext,
  vocals: AudioBuffer,
  baseSemis: number,
  mode: HarmonizeMode,
  dest: AudioNode,
  startWhen: number,
  startOffset = 0
): HarmonyVoices {
  const intervals = HARMONIZE_INTERVALS[mode];
  const isChoir = mode === "choir";
  const sources: AudioScheduledSourceNode[] = [];
  const shifters: { shifter: PitchShifter; offset: number }[] = [];
  intervals.forEach((interval, i) => {
    const src = ctx.createBufferSource();
    src.buffer = vocals;
    const detuneCents = isChoir ? (i % 2 === 0 ? 6 : -6) + (Math.random() * 4 - 2) : 0;
    const offset = interval + detuneCents / 100;
    const pitch = new PitchShifter(ctx);
    pitch.start(startWhen);
    pitch.setSemitones(baseSemis + offset);
    src.connect(pitch.input);
    const gain = ctx.createGain();
    gain.gain.value = isChoir ? 0.32 : 0.55;
    if (typeof ctx.createStereoPanner === "function" && isChoir) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = ((i - (intervals.length - 1) / 2) / intervals.length) * 0.7;
      pitch.output.connect(pan);
      pan.connect(gain);
    } else {
      pitch.output.connect(gain);
    }
    gain.connect(dest);
    src.start(startWhen, startOffset);
    sources.push(src);
    shifters.push({ shifter: pitch, offset });
  });
  return { sources, shifters };
}

// Bounces an AudioBuffer through the full vocal processing chain (pitch shift
// → vocoder → harmonizer → EQ → de-ess → reverb/delay) and returns the result
// as a 16-bit PCM WAV Blob, ready to download. Runs on an OfflineAudioContext
// so it renders as fast as the machine allows, not in real time.
export async function renderVocalToWav(
  vocals: AudioBuffer,
  params: VocalParams
): Promise<Blob> {
  const ctx = new OfflineAudioContext(2, vocals.length, vocals.sampleRate);
  const semisEffective = params.robotOn ? Math.round(params.pitchSemis) : params.pitchSemis;

  let pitchedOutput: AudioNode;
  if (params.formantLock && semisEffective !== 0) {
    const unshiftedSrc = ctx.createBufferSource();
    unshiftedSrc.buffer = vocals;
    const pitchedSrc = ctx.createBufferSource();
    pitchedSrc.buffer = vocals;

    const pitch = new PitchShifter(ctx);
    pitch.start(0);
    pitch.setSemitones(semisEffective);
    pitchedSrc.connect(pitch.input);

    const formantVocoder = new Vocoder(ctx);
    unshiftedSrc.connect(formantVocoder.input);
    pitch.output.connect(formantVocoder.carrierInput);

    unshiftedSrc.start(0);
    pitchedSrc.start(0);
    pitchedOutput = formantVocoder.output;
  } else {
    const src = ctx.createBufferSource();
    src.buffer = vocals;
    const pitch = new PitchShifter(ctx);
    pitch.start(0);
    pitch.setSemitones(semisEffective);
    src.connect(pitch.input);
    src.start(0);
    pitchedOutput = pitch.output;
  }

  // independent formant shift (voice-conversion stage) — separate from the
  // pitch/formant-lock stage above, so timbre and pitch can move on their own
  if (params.formantShift !== 0) {
    const formantSrc = ctx.createBufferSource();
    formantSrc.buffer = vocals;
    const formantVocoder = new Vocoder(ctx, formantRatio(params.formantShift));
    formantSrc.connect(formantVocoder.input);
    pitchedOutput.connect(formantVocoder.carrierInput);
    formantSrc.start(0);
    pitchedOutput = formantVocoder.output;
  }

  const dry = ctx.createGain();
  dry.gain.value = params.vocoderOn ? 1 - params.vocoderMix : 1;
  pitchedOutput.connect(dry);

  let carrierStop: ((when: number) => void) | null = null;
  if (params.vocoderOn) {
    const vocoder = new Vocoder(ctx);
    pitchedOutput.connect(vocoder.input);
    const carrier =
      params.carrier === "noise" ? makeNoiseCarrier(ctx) : makeSynthCarrier(ctx, params.carrierNote);
    carrier.output.connect(vocoder.carrierInput);
    carrier.start(0);
    carrierStop = carrier.stop;
    const wet = ctx.createGain();
    wet.gain.value = params.vocoderMix;
    vocoder.output.connect(wet);
    wet.connect(dry); // reuse `dry` node as the summing bus from here down
  }

  // harmonizer / virtual choir: extra pitched copies mixed in underneath
  buildHarmonyVoices(ctx, vocals, params.pitchSemis, params.harmonize, dry, 0);

  const eq = new Eq3(ctx);
  eq.setGains(params.eqLow, params.eqMid, params.eqHigh);
  dry.connect(eq.input);

  const deess = new Deess(ctx);
  deess.setCutDb(params.deess);
  eq.output.connect(deess.node);

  const chorus = new Chorus(ctx);
  chorus.setWet(params.chorusWet);
  deess.node.connect(chorus.input);

  const fx = new FXRack(ctx);
  fx.setWet("reverb", params.reverbWet);
  fx.setWet("echo", params.delayWet);
  chorus.output.connect(fx.input);
  fx.output.connect(ctx.destination);

  if (carrierStop) carrierStop(vocals.duration + 0.1);

  const rendered = await ctx.startRendering();
  return audioBufferToWav(rendered);
}

// Minimal 16-bit PCM WAV encoder — the browser has no native AudioBuffer→WAV
// export, and pulling in a dependency for ~40 lines of header math isn't worth it.
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const bufferSize = 44 + dataSize;
  const out = new ArrayBuffer(bufferSize);
  const view = new DataView(out);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([out], { type: "audio/wav" });
}
