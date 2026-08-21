// Stateful playback engine for the Voice Extractor tool: owns the AudioContext,
// holds the 4 separated stems + the original mix, and (re)builds the live
// processing graph (pitch → vocoder → harmonizer → EQ → de-ess → reverb/delay)
// each time playback starts, since most Web Audio source nodes are one-shot.
import {
  CarrierType,
  Deess,
  Eq3,
  HarmonizeMode,
  VocalParams,
  Vocoder,
  defaultVocalParams,
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

  setParam<K extends keyof VocalParams>(key: K, value: VocalParams[K]) {
    this.params = { ...this.params, [key]: value };
    if (!this.session) return;
    const live = this.liveNodes;
    switch (key) {
      case "pitchSemis":
      case "robotOn": {
        if (!live.pitch) break;
        const semis = this.params.robotOn ? Math.round(this.params.pitchSemis) : this.params.pitchSemis;
        live.pitch.setSemitones(semis);
        live.harmonizerPitch?.setSemitones(semis + (HARMONIZE_SEMIS[this.params.harmonize] ?? 0));
        break;
      }
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
      case "vocoderMix":
        if (live.dryGain && live.vocoderWetGain) {
          live.dryGain.gain.value = this.params.vocoderOn ? 1 - this.params.vocoderMix : 1;
          live.vocoderWetGain.gain.value = this.params.vocoderOn ? this.params.vocoderMix : 0;
        }
        break;
      default:
        // vocoderOn, carrier, carrierNote, harmonize: topology change, needs a rebuild
        if (this.playing) this.play(this.getPosition());
    }
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

    const semis = HARMONIZE_SEMIS[p.harmonize];
    if (semis !== undefined) {
      const hSrc = ctx.createBufferSource();
      hSrc.buffer = b.vocals;
      sources.push(hSrc);
      stopFns.push((w) => hSrc.stop(w));
      const hPitch = new PitchShifter(ctx);
      hPitch.start(when);
      hPitch.setSemitones((p.robotOn ? Math.round(p.pitchSemis) : p.pitchSemis) + semis);
      hSrc.connect(hPitch.input);
      const hGain = ctx.createGain();
      hGain.gain.value = 0.55;
      hPitch.output.connect(hGain);
      hGain.connect(dryGain);
      hSrc.start(when, offset);
      nodes.harmonizerPitch = hPitch;
    }

    const eq = new Eq3(ctx);
    eq.setGains(p.eqLow, p.eqMid, p.eqHigh);
    dryGain.connect(eq.input);
    nodes.eq = eq;

    const deess = new Deess(ctx);
    deess.setCutDb(p.deess);
    eq.output.connect(deess.node);
    nodes.deess = deess;

    const fx = new FXRack(ctx);
    fx.setWet("reverb", p.reverbWet);
    fx.setWet("echo", p.delayWet);
    deess.node.connect(fx.input);
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
  formantVocoder: Vocoder;
  harmonizerPitch: PitchShifter;
  dryGain: GainNode;
  vocoderWetGain: GainNode;
  eq: Eq3;
  deess: Deess;
  fx: FXRack;
}

const HARMONIZE_SEMIS: Record<HarmonizeMode, number | undefined> = {
  off: undefined,
  third: 4,
  fifth: 7,
  octave: 12,
};

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
