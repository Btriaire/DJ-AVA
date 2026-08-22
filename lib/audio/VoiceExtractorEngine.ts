// Stateful playback engine for the Voice Extractor tool: owns the AudioContext,
// holds the 4 separated stems + the original mix, and (re)builds the live
// processing graph (pitch → vocoder → harmonizer → EQ → de-ess → reverb/delay)
// each time playback starts, since most Web Audio source nodes are one-shot.
import {
  CarrierType,
  Chorus,
  Deess,
  Eq3,
  Saturate,
  VocalParams,
  Vocoder,
  buildHarmonyVoices,
  defaultVocalParams,
  formantRatio,
  makeNoiseCarrier,
  makeSynthCarrier,
} from "./vocoderEngine";
import { FXRack } from "./FXRack";
import { PitchShifter } from "./PitchShifter";

export type OutputMode = "vocals" | "instrumental" | "mix" | "original";

export interface StemBuffers {
  vocals: AudioBuffer;
  drums: AudioBuffer;
  bass: AudioBuffer;
  other: AudioBuffer;
  original: AudioBuffer;
}

interface Session {
  sources: AudioScheduledSourceNode[];
  stopFns: Array<(when: number) => void>;
  startedAtCtx: number;
  startedAtOffset: number;
}

export class VoiceExtractorEngine {
  readonly ctx: AudioContext;
  private masterGain: GainNode;
  private buffers: StemBuffers | null = null;
  private session: Session | null = null;
  private pausedAt = 0;

  params: VocalParams = { ...defaultVocalParams };
  outputMode: OutputMode = "mix";
  playing = false;
  onEnded?: () => void;
  onPositionTick?: (sec: number) => void;
  private tickHandle: number | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.9;
    this.masterGain.connect(this.ctx.destination);
  }

  setBuffers(b: StemBuffers) {
    this.stop();
    this.buffers = b;
    this.pausedAt = 0;
  }

  get duration(): number {
    return this.buffers?.vocals.duration ?? 0;
  }

  setMasterVolume(v: number) {
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  get vocalsBuffer(): AudioBuffer | null {
    return this.buffers?.vocals ?? null;
  }

  // bonus FXRack effects (flanger/phaser/gate/crush) beyond the dedicated
  // reverb/delay knobs — set-and-forget, no rebuild needed since FXRack
  // lazily (dis)connects each branch itself.
  setBonusFxWet(name: import("./FXRack").FxName, v: number) {
    this.liveNodes.fx?.setWet(name, v);
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setOutputMode(mode: OutputMode) {
    if (this.outputMode === mode) return;
    this.outputMode = mode;
    if (this.playing) this.play(this.getPosition());
  }

  // keys that change the graph topology (carrier node, vocoder in/out of the
  // signal path, number of harmony voices) and so need a full rebuild rather
  // than an AudioParam tweak
  private static readonly TOPOLOGY_KEYS = new Set<keyof VocalParams>(["vocoderOn", "carrier", "carrierNote", "formantLock", "harmonize"]);

  private applyLiveUpdate(key: keyof VocalParams) {
    const live = this.liveNodes;
    switch (key) {
      case "pitchSemis":
      case "robotOn": {
        if (!live.pitch) break;
        const semis = this.params.robotOn ? Math.round(this.params.pitchSemis) : this.params.pitchSemis;
        live.pitch.setSemitones(semis);
        live.harmonizerPitches?.forEach(({ shifter, offset }) => shifter.setSemitones(semis + offset));
        break;
      }
      case "formantShift":
        live.formantShiftVocoder?.setModFreqScale(formantRatio(this.params.formantShift));
        break;
      case "eqLow":
      case "eqMid":
      case "eqHigh":
        live.eq?.setGains(this.params.eqLow, this.params.eqMid, this.params.eqHigh);
        break;
      case "deess":
        live.deess?.setCutDb(this.params.deess);
        break;
      case "reverbWet":
        live.fx?.setWet("reverb", this.params.reverbWet);
        break;
      case "delayWet":
        live.fx?.setWet("echo", this.params.delayWet);
        break;
      case "chorusWet":
        live.chorus?.setWet(this.params.chorusWet);
        break;
      case "saturation":
        live.saturate?.setWet(this.params.saturation);
        break;
      case "vocoderMix":
        if (live.dryGain && live.vocoderWetGain) {
          live.dryGain.gain.value = this.params.vocoderOn ? 1 - this.params.vocoderMix : 1;
          live.vocoderWetGain.gain.value = this.params.vocoderOn ? this.params.vocoderMix : 0;
        }
        break;
    }
  }

  setParam<K extends keyof VocalParams>(key: K, value: VocalParams[K]) {
    this.params = { ...this.params, [key]: value };
    if (!this.session) return;
    if (VoiceExtractorEngine.TOPOLOGY_KEYS.has(key)) {
      if (this.playing) this.play(this.getPosition());
    } else {
      this.applyLiveUpdate(key);
    }
  }

  // batched version of setParam for applying a multi-key preset in one go —
  // merges every key into this.params first, then triggers at most ONE
  // rebuild (if any topology key is in the patch) instead of one rebuild per
  // topology key, which would otherwise glitch/retrigger playback repeatedly.
  setParams(patch: Partial<VocalParams>) {
    this.params = { ...this.params, ...patch };
    if (!this.session) return;
    const keys = Object.keys(patch) as (keyof VocalParams)[];
    const needsRebuild = keys.some((k) => VoiceExtractorEngine.TOPOLOGY_KEYS.has(k));
    if (needsRebuild) {
      if (this.playing) this.play(this.getPosition());
      return;
    }
    keys.forEach((k) => this.applyLiveUpdate(k));
  }

  getPosition(): number {
    if (this.playing && this.session) {
      return Math.min(this.duration, this.session.startedAtOffset + (this.ctx.currentTime - this.session.startedAtCtx));
    }
    return this.pausedAt;
  }

  private teardown() {
    if (this.tickHandle !== null) {
      cancelAnimationFrame(this.tickHandle);
      this.tickHandle = null;
    }
    if (!this.session) return;
    const now = this.ctx.currentTime;
    for (const stop of this.session.stopFns) {
      try {
        stop(now);
      } catch {
        /* already stopped */
      }
    }
    this.session = null;
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.getPosition();
    this.playing = false;
    this.teardown();
  }

  stop() {
    this.playing = false;
    this.pausedAt = 0;
    this.teardown();
  }

  seek(sec: number) {
    const clamped = Math.max(0, Math.min(this.duration, sec));
    if (this.playing) this.play(clamped);
    else this.pausedAt = clamped;
  }

  private handleEnded() {
    this.playing = false;
    this.pausedAt = 0;
    this.teardown();
    this.onEnded?.();
  }

  private tick = () => {
    if (!this.playing) return;
    this.onPositionTick?.(this.getPosition());
    if (this.getPosition() >= this.duration - 0.05) {
      this.handleEnded();
      return;
    }
    this.tickHandle = requestAnimationFrame(this.tick);
  };

  play(fromSec?: number) {
    if (!this.buffers) return;
    const offset = Math.max(0, Math.min(this.duration, fromSec ?? this.pausedAt));
    this.teardown();
    void this.resume();

    const ctx = this.ctx;
    const when = ctx.currentTime + 0.06;
    const b = this.buffers;
    const sources: AudioScheduledSourceNode[] = [];
    const stopFns: Array<(w: number) => void> = [];

    if (this.outputMode === "original") {
      const src = ctx.createBufferSource();
      src.buffer = b.original;
      src.connect(this.masterGain);
      src.onended = () => {
        if (this.playing) this.handleEnded();
      };
      src.start(when, offset);
      sources.push(src);
      stopFns.push((w) => src.stop(w));
    } else {
      // instrumental bus (drums + bass + other), always built so "mix" mode has it
      if (this.outputMode === "instrumental" || this.outputMode === "mix") {
        const instGain = ctx.createGain();
        instGain.gain.value = 1;
        instGain.connect(this.masterGain);
        for (const buf of [b.drums, b.bass, b.other]) {
          const s = ctx.createBufferSource();
          s.buffer = buf;
          s.connect(instGain);
          s.start(when, offset);
          sources.push(s);
          stopFns.push((w) => s.stop(w));
        }
      }

      if (this.outputMode === "vocals" || this.outputMode === "mix") {
        const live = this.buildVocalChain(ctx, when, offset);
        for (const s of live.sources) sources.push(s);
        for (const f of live.stopFns) stopFns.push(f);
        this.liveNodes = live.nodes;
      } else {
        this.liveNodes = {};
      }

      // main track's onended reference (vocals if present, else first instrumental source)
      const anchor = sources[sources.length - 1];
      if (anchor) {
        anchor.onended = () => {
          if (this.playing) this.handleEnded();
        };
      }
    }

    this.session = { sources, stopFns, startedAtCtx: when, startedAtOffset: offset };
    this.playing = true;
    this.tickHandle = requestAnimationFrame(this.tick);
  }

  private liveNodes: Partial<LiveNodes> = {};

  private buildVocalChain(ctx: AudioContext, when: number, offset: number) {
    const b = this.buffers!;
    const p = this.params;
    const sources: AudioScheduledSourceNode[] = [];
    const stopFns: Array<(w: number) => void> = [];
    const nodes: Partial<LiveNodes> = {};

    const semisEffective = p.robotOn ? Math.round(p.pitchSemis) : p.pitchSemis;
    let pitchedOutput: AudioNode;

    if (p.formantLock && semisEffective !== 0) {
      // formant-locked pitch: vocode a pitch-shifted carrier through the
      // ORIGINAL (unshifted) vocal's envelope, via a dedicated internal
      // Vocoder — see the comment on VocalParams.formantLock for caveats.
      const unshiftedSrc = ctx.createBufferSource();
      unshiftedSrc.buffer = b.vocals;
      sources.push(unshiftedSrc);
      stopFns.push((w) => unshiftedSrc.stop(w));

      const pitchedSrc = ctx.createBufferSource();
      pitchedSrc.buffer = b.vocals;
      sources.push(pitchedSrc);
      stopFns.push((w) => pitchedSrc.stop(w));

      const pitch = new PitchShifter(ctx);
      pitch.start(when);
      pitch.setSemitones(semisEffective);
      pitchedSrc.connect(pitch.input);
      nodes.pitch = pitch;

      const formantVocoder = new Vocoder(ctx);
      unshiftedSrc.connect(formantVocoder.input);
      pitch.output.connect(formantVocoder.carrierInput);
      nodes.formantVocoder = formantVocoder;

      unshiftedSrc.start(when, offset);
      pitchedSrc.start(when, offset);
      pitchedOutput = formantVocoder.output;
    } else {
      const src = ctx.createBufferSource();
      src.buffer = b.vocals;
      sources.push(src);
      stopFns.push((w) => src.stop(w));

      const pitch = new PitchShifter(ctx);
      pitch.start(when);
      pitch.setSemitones(semisEffective);
      src.connect(pitch.input);
      nodes.pitch = pitch;

      src.start(when, offset);
      pitchedOutput = pitch.output;
    }

    // independent formant shift (voice-conversion stage) — always built (like
    // EQ/de-ess/chorus below) so the knob stays live-adjustable without a
    // rebuild; scale=1 when formantShift is 0 is a transparent no-op.
    const formantSrc = ctx.createBufferSource();
    formantSrc.buffer = b.vocals;
    sources.push(formantSrc);
    stopFns.push((w) => formantSrc.stop(w));
    const formantShiftVocoder = new Vocoder(ctx, formantRatio(p.formantShift));
    formantSrc.connect(formantShiftVocoder.input);
    pitchedOutput.connect(formantShiftVocoder.carrierInput);
    formantSrc.start(when, offset);
    nodes.formantShiftVocoder = formantShiftVocoder;
    pitchedOutput = formantShiftVocoder.output;

    const dryGain = ctx.createGain();
    dryGain.gain.value = p.vocoderOn ? 1 - p.vocoderMix : 1;
    pitchedOutput.connect(dryGain);
    nodes.dryGain = dryGain;

    if (p.vocoderOn) {
      const vocoder = new Vocoder(ctx);
      pitchedOutput.connect(vocoder.input);
      const carrier = makeCarrier(ctx, p.carrier, p.carrierNote, () => this.instrumentalTap(ctx));
      carrier.output.connect(vocoder.carrierInput);
      carrier.start(when);
      stopFns.push(carrier.stop);
      const vocoderWetGain = ctx.createGain();
      vocoderWetGain.gain.value = p.vocoderMix;
      vocoder.output.connect(vocoderWetGain);
      vocoderWetGain.connect(dryGain);
      nodes.vocoderWetGain = vocoderWetGain;
    }

    // harmonizer / virtual choir: extra pitched copies mixed in underneath
    const harmony = buildHarmonyVoices(ctx, b.vocals, p.pitchSemis, p.harmonize, dryGain, when, offset);
    for (const s of harmony.sources) {
      sources.push(s);
      stopFns.push((w) => s.stop(w));
    }
    nodes.harmonizerPitches = harmony.shifters;

    const eq = new Eq3(ctx);
    eq.setGains(p.eqLow, p.eqMid, p.eqHigh);
    dryGain.connect(eq.input);
    nodes.eq = eq;

    const deess = new Deess(ctx);
    deess.setCutDb(p.deess);
    eq.output.connect(deess.node);
    nodes.deess = deess;

    const saturate = new Saturate(ctx);
    saturate.setWet(p.saturation);
    deess.node.connect(saturate.input);
    nodes.saturate = saturate;

    const chorus = new Chorus(ctx);
    chorus.setWet(p.chorusWet);
    saturate.output.connect(chorus.input);
    nodes.chorus = chorus;

    const fx = new FXRack(ctx);
    fx.setWet("reverb", p.reverbWet);
    fx.setWet("echo", p.delayWet);
    chorus.output.connect(fx.input);
    fx.output.connect(this.masterGain);
    nodes.fx = fx;

    return { sources, stopFns, nodes };
  }

  // lazily creates a silent tap of the instrumental bus for the "instrumental as
  // carrier" option — only relevant when output mode is "vocals" (mix mode
  // already has a live instrumental bus, but keeping this independent avoids
  // coupling the two chains together)
  private instrumentalTap(ctx: AudioContext): AudioNode {
    const b = this.buffers!;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    for (const buf of [b.drums, b.bass, b.other]) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(gain);
      s.start();
    }
    return gain;
  }

  dispose() {
    this.teardown();
    try {
      this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}

interface LiveNodes {
  pitch: PitchShifter;
  formantVocoder: Vocoder; // formant-LOCK stage (approx. formant preservation while pitch shifts)
  formantShiftVocoder: Vocoder; // independent formant-SHIFT stage (voice conversion, e.g. Female Voice preset)
  harmonizerPitches: { shifter: PitchShifter; offset: number }[];
  dryGain: GainNode;
  vocoderWetGain: GainNode;
  eq: Eq3;
  deess: Deess;
  saturate: Saturate;
  chorus: Chorus;
  fx: FXRack;
}

function makeCarrier(
  ctx: AudioContext,
  type: CarrierType,
  note: number,
  instrumentalTap: () => AudioNode
) {
  if (type === "noise") return makeNoiseCarrier(ctx);
  if (type === "instrumental") {
    const node = instrumentalTap();
    return { output: node, start: () => {}, stop: () => {} };
  }
  return makeSynthCarrier(ctx, note);
}
