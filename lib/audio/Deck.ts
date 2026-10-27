import type { StemMap } from "@/lib/stemAnalysis";
import { getMemLevel } from "@/lib/memoryGovernor";
import { detectBPM, buildWaveformPeaks } from "./bpm";
import { detectKey, transposeKey, KeyResult } from "./key";
import { FXRack, FX_LIST, FxName, DECK_FX, STEM_FX } from "./FXRack";
import { Retouch } from "./Retouch";
import { Rack, RackPreset } from "./Rack";
import { sha1Hex16 } from "./stemHash";
import { PitchShifter } from "./PitchShifter";
import type { ClockInfo } from "./stepClock";
import { guess as guessBeat } from "web-audio-beat-detector";

// synthesized white-noise impulse response for the shared per-stem reverb
// send bus — same technique as the Rack's own "reverb" module.
export function makeReverbImpulse(ctx: BaseAudioContext, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * decay));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  }
  return buf;
}

// WaveShaper curve for the per-stem Drive knob: tanh soft-clip, normalized so
// the loudest sample stays at unity gain even as drive increases. amt<=0 is
// exactly transparent (identity curve) so a stem at 0% drive is untouched.
export function driveCurve(amt: number): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(n);
  const k = 1 + amt * 30;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = amt <= 0.001 ? x : Math.tanh(k * x) / norm;
  }
  return curve;
}

// bipolar stem filter: -1..0 lowpass, 0 neutral, 0..1 highpass
export function applyStemFilter(filt: BiquadFilterNode, x: number): void {
  if (Math.abs(x) < 0.02) {
    filt.type = "allpass";
    filt.frequency.value = 20000;
    return;
  }
  if (x < 0) {
    filt.type = "lowpass";
    filt.frequency.value = 20000 * Math.pow(40 / 20000, -x);
  } else {
    filt.type = "highpass";
    filt.frequency.value = 20 * Math.pow(12000 / 20, x);
  }
  filt.Q.value = 1 + Math.abs(x) * 6;
}

export interface DeckState {
  loaded: boolean;
  playing: boolean;
  name: string;
  duration: number;
  bpm: number;
}

// full snapshot of a deck's mixer/FX controls — saved per track in the library
export interface DeckSettings {
  trim: number;
  volume: number;
  low: number;
  mid: number;
  high: number;
  filter: number; // bipolar -1..1
  pitch: number; // percent
  fx: Partial<Record<FxName, number>>;
  fxp?: Partial<Record<FxName, { beat: number; p1: number; p2: number }>>; // DJ FX beat division + params; old saves lack it
  retouch?: Record<string, number>; // sound retouch settings; old saves lack it
  hot?: (number | null)[]; // hot cue positions in seconds (4 slots); old saves lack it
  rack?: RackPreset; // serial DSP rack state (optional: old saves won't have it)
}

// One DJ deck: load -> trim -> 3-band EQ -> filter -> (dry + delay FX) -> volume -> output.
export class Deck {
  readonly ctx: AudioContext;
  readonly output: GainNode; // connect this to the mixer channel

  private buffer: AudioBuffer | null = null;
  private rawBlob: Blob | null = null; // the source file, kept as a Blob so Chromium can page it to disk instead of RAM
  private activeSources: AudioBufferSourceNode[] = []; // 1 in normal mode, N in stem mode

  // bumped on every load()/_streamSetup()/unload() — every async stem call
  // (probeStems/prefetchStems/ensureStems) captures it before its first await
  // and checks it again at each resolution point, so a slow response for a
  // track the user has since swapped out on this deck can't write stale
  // names/buffers/hash over whatever's actually loaded now.
  private loadGen = 0;

  // ---------- streaming fast-path (phase 1 of two-phase loading) ----------
  // While a long file is being decoded in the background, a MediaElementSource
  // lets the browser stream/play it immediately through the same effects chain.
  // Once decodeAudioData + peak/BPM analysis finishes the source hot-swaps to
  // the full AudioBuffer so scratch/loop/every feature works normally (phase 2).
  private mediaEl: HTMLAudioElement | null = null;
  private mediaElSrc: MediaElementAudioSourceNode | null = null;
  static maxDecodeSec = 20 * 60; // above this, play straight from the streaming <audio> element: no full decode (a 3 h set would need >4 GB of RAM)
  // true while we're in phase 1 (streaming preview, full decode still in flight)
  private _bufferLoading = false;
  private _streamOnly = false;
  get bufferLoading(): boolean { return this._bufferLoading; }
  get streamOnly(): boolean { return this._streamOnly; }
  // decoded stem i of the loaded track (null when not separated), for the sampler
  getStemBuffer(i: number): AudioBuffer | null { return this.stemBuffers[i] ?? null; }

  private cleanupMediaEl() {
    if (this.mediaElSrc) { try { this.mediaElSrc.disconnect(); } catch {} this.mediaElSrc = null; }
    if (this.mediaEl) {
      this.mediaEl.pause();
      if (this.mediaEl.src.startsWith("blob:")) URL.revokeObjectURL(this.mediaEl.src);
      this.mediaEl.src = "";
      this.mediaEl = null;
    }
    this._bufferLoading = false;
  }
  // -------------------------------------------------------------------------

  // stem separation (Demucs). The model decides the channel count:
  //   htdemucs / htdemucs_ft -> 4 (drums/bass/other/vocals)
  //   htdemucs_6s            -> 6 (+ guitar/piano)
  static readonly STEM_MAX = 6;
  // false while a deck plays: separation would make the audio stutter, so it waits for pause
  private playbackGate: () => boolean = () => true;
  setPlaybackGate(fn: () => boolean): void {
    this.playbackGate = fn;
  }
  private stemBuffers: (AudioBuffer | null)[] = []; // length === stemNames.length when loaded
  private stemGains: GainNode[] = []; // STEM_MAX gains, all summed into stemBus
  private stemSynthIn: GainNode[] = []; // per-stem input for the DJ synth, feeds the stem's filter
  private synthRoute: { src: AudioNode; dst: AudioNode } | null = null; // synth output and its master bus
  private synthStem: number | null = null; // stem currently replaced by the synth
  private static synthHolder: Deck | null = null; // only one deck can hold the synth at a time
  private synthStemVol = 1; // volume the replaced stem had before the synth took its place
  private synthKeep = false; // DOUBLER: the stem keeps playing under the synth
  private stemAnalysers: AnalyserNode[] = []; // per-stem level taps for the LED meters
  private stemMeterBuf = new Float32Array(256); // reusable scratch for RMS reads
  private stemEnv: number[] = []; // smoothed per-stem meter level (VU-style ballistics)
  private stemBus!: GainNode; // sum of the stem gains, carries the makeup gain
  private fxInGate!: GainNode; // what enters the FX unit; muted for an echo-out drop
  private pumpLast = -1; // ctx time of the last beat already pumped
  private pumpTimer: ReturnType<typeof setInterval> | null = null;
  stemMakeup = true; // auto-compensate level when stem faders are pulled down
  stemNames: string[] = []; // active stem labels (drives the fader count)
  stemModel: "htdemucs" | "htdemucs_ft" | "htdemucs_6s" = "htdemucs";
  stemUltra = false; // extra-precision Demucs pass (shifts≥2, overlap 0.25) — several× slower
  stemLossless = false; // cache/serve stems as WAV instead of MP3
  stemDenoiseVocals = false; // ffmpeg noise-reduction pass on the vocals stem
  // Stems prepared in advance (Préparation) sit in the server cache under THEIR variant (e.g. htdemucs_ultra_wav).
  // adoptPreparedStems() points the deck at that variant for the loaded track; the user's own settings are kept
  // aside and come back as soon as another track is loaded or the user changes a setting by hand.
  private preparedHash = "";
  private stemOptsSaved: { model: Deck["stemModel"]; ultra: boolean; lossless: boolean; denoise: boolean } | null = null;
  stemsActive = false; // play the stems (with per-stem gain) instead of the full mix
  // sticks across track loads (unlike stemsActive, which clearStems() resets) so
  // that once a DJ turns stems on for a deck, every track queued into it next —
  // e.g. the "cued" side during an A→B→A relay — gets separated ahead of time
  // instead of waiting for a STEMS click after it's already live
  stemsWanted = false;
  stemVol: number[] = []; // one entry per active stem
  stemStatus: "none" | "prefetching" | "working" | "ready" | "error" | "blocked" = "none";
  // 0..100 while a separation is actively running/queued server-side for the
  // currently-loading track (working or prefetching); null the rest of the
  // time — see pollStemProgress()/stopStemProgressPoll() below.
  stemProgress: number | null = null;
  private stemProgressTimer: ReturnType<typeof setInterval> | null = null;
  stemCached = false; // server already has the stems on disk -> loading is instant
  stemMap: StemMap | null = null; // peaks, slow parts and blanks of the song (made when its stems were prepared)
  stemHash = ""; // server content hash of the loaded track (for the library badge)
  // when non-empty, the Rack DSP pedalboard is unhooked from the whole-mix
  // chain and spliced onto ONLY these stems instead — every other stem stays
  // dry and fully audible, un-plugged from the effects entirely. Empty set =
  // normal (Rack processes the whole deck, as usual).
  stemFxTargets: Set<number> = new Set();
  private stemFxAnyActive = false; // tracks whether the whole-mix bypass wiring is engaged

  // shared per-stem effect SENDS (Reverb / Delay) — independent of the Rack
  // DSP splice above: every stem gets its own send amount into one shared
  // reverb bus and one shared delay bus, like sends on a real mixer, so e.g.
  // vocals can sit wetter than drums while everything keeps playing together
  // (a send blends a stem WITH an effect; the Rack splice routes a stem
  // THROUGH one instead).
  stemReverbSend: number[] = []; // 0..1 per stem, public read for the UI
  stemDelaySend: number[] = [];
  stemFxVol: number[] = []; // 0..1 per stem: level of this stem's reverb and delay returns (starts at 40%)
  private stemReverbSendGain: GainNode[] = [];
  private stemDelaySendGain: GainNode[] = [];
  private stemReverbConv!: ConvolverNode;
  private stemReverbReturn!: GainNode;
  private stemDelayNode!: DelayNode;
  private stemDelayFb!: GainNode;
  private stemDelayReturn!: GainNode;

  // dedicated per-stem FX — unlike the shared Rack splice above (one pedalboard,
  // spliced onto whichever stems are "targeted"), these live directly in each
  // stem's own signal path: turning the knob IS the effect, no separate
  // targeting step, and each stem can run a totally different setting at once.
  stemFilterX: number[] = []; // -1..1 bipolar: <0 lowpass sweep, 0 bypass, >0 highpass sweep
  stemDriveAmt: number[] = []; // 0..1 soft-clip saturation amount
  private stemFilter: BiquadFilterNode[] = [];
  private stemDrive: WaveShaperNode[] = [];
  // per-stem output point (after the optional per-stem DJ FX rack); this is what gets routed to stemBus or the shared Rack
  private stemOut: GainNode[] = [];
  // per-stem DJ FX pedalboard, created on first use (see stemFxRack)
  private stemDjFx: (FXRack | null)[] = [];

  private trim: GainNode;
  private low: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private high: BiquadFilterNode;
  private filter: BiquadFilterNode;
  private fx: FXRack;
  private retouch: Retouch;
  readonly rack: Rack; // serial studio DSP rack (compressor, drive, delay, …)
  private volume: GainNode;
  private analyser: AnalyserNode;

  // crowd / ambience reducer (mid-side). Diffuse crowd noise, applause and room
  // tone are decorrelated between L/R (they live in the "side" signal); the lead
  // vocal, kick and bass sit centre ("mid"). Attenuating the side strips crowd
  // from a live single while keeping the performance. 0 = stereo untouched,
  // 1 = full mono (sides removed).
  crowd = 0;
  private crowdIn!: GainNode;
  private crowdOut!: GainNode;
  private crowdStraight: GainNode[] = []; // L->L, R->R  (gain a = 1 - k/2)
  private crowdCross: GainNode[] = []; // R->L, L->R    (gain b = k/2)

  // Auto-Tune (pitch correction). A monophonic AudioWorklet snaps the lead pitch
  // to the chosen scale; best on a solo vocal. Loaded lazily on first enable so
  // it costs nothing when off. Bypassed by crossfading bypass/wet gains.
  autotuneOn = false;
  autotuneAmount = 1; // 0 = none, 1 = full snap
  autotuneRetune = 0.2; // 0 = instant/robotic, 1 = smooth glide
  autotuneKey = 0; // 0..11 (C..B)
  autotuneScale: "chromatic" | "major" | "minor" = "chromatic";
  private autotuneNode: AudioWorkletNode | null = null;
  private autotuneIn!: GainNode;
  private autotuneOut!: GainNode;
  private autotuneBypass!: GainNode;
  private autotuneWet!: GainNode;
  private autotuneLoading = false;
  private static moduleAdded = new WeakMap<BaseAudioContext, Promise<void>>();

  // playback bookkeeping
  private startCtxTime = 0;
  private startOffset = 0;
  private pausedAt = 0;
  private rate = 1;
  private scratchMult = 1; // momentary scratch/pitch-bend, springs back to 1
  private _playing = false;

  // Master Tempo (Key Lock) & Quantize (Beatgrid)
  keyLock = false; // preserves track pitch when pitch fader / tempo changes
  keyShift = 0; // semitones added on top of the key-lock compensation, -6..+6
  readonly sliceGate: GainNode; // normal deck sound level, ducked by the slicer
  private keyShifter: PitchShifter | null = null;
  private keyShifterIn!: GainNode;
  private keyShifterOut!: GainNode;
  private keyShifterBypass!: GainNode;
  private keyShifterWet!: GainNode;

  quantize = true; // snaps play, cue and loop points to the nearest beat boundary
  beatGridOffset = 0; // phase offset in seconds to first beat

  // metadata
  name = "";
  duration = 0;
  bpm = 0;
  key: KeyResult | null = null; // musical key + Camelot notation, for harmonic mixing
  peaks: Float32Array = new Float32Array(0);
  cuePoint = 0;
  hotCues: (number | null)[] = [null, null, null, null]; // four performance cue points, seconds
  // original YouTube link of the loaded track (empty for uploads / Audius) —
  // lets the deck hand the track off to the MP3 converter.
  sourceLink = "";
  // cover art (data/URL) of the loaded single, shown on the deck while it plays.
  coverArt = "";
  // identity of the library track this audio came from (set by the library after
  // load) so the deck can offer "save to a playlist" for whatever is loaded.
  // null when the audio was loaded directly via the deck's own file picker.
  origin: {
    id: string;
    source: "local" | "youtube" | "audius" | "soundcloud" | "deezer";
    url?: string;
    art?: string;
  } | null = null;
  // loading lifecycle: true while a track is being fetched/decoded for this deck
  // (between the click and "ready to play"). The panel shows a progress bar.
  loading = false;
  loadStartedAt = 0;

  // loop
  private loopActive = false;
  private loopStart = 0;
  private loopEnd = 0;
  // per-stem beat loop — independent of the whole-deck loop above. Each stem
  // plays on its own AudioBufferSourceNode (see activeSources), so its loop
  // points can be set live without touching the other stems at all.
  // public: the panel derives its "is this stem looping" display straight from
  // this array (+ stemLoopBeatsVal below) instead of a separate mirrored
  // useState, so the UI can never show a loop as engaged when the deck-side
  // call actually no-op'd.
  stemLoopActive: boolean[] = [];
  private stemLoopStart: number[] = [];
  private stemLoopEnd: number[] = [];
  private stemLoopWrapTimer: (ReturnType<typeof setTimeout> | null)[] = [];
  private stemLoopWrapCount: number[] = []; // wraps seen since engagement — drives Roll mode
  // public so the UI can read/adjust these live, per stem
  stemLoopSmoothMs: number[] = []; // 0..80ms fade applied right at each loop seam ("smooth" boundary)
  stemLoopRollAt: (number | null)[] = []; // auto-release after N wraps; null = stays locked until cleared
  // nominal loop length in beats (the exact value the UI asked for — e.g. 1/4,
  // 2, 8) — kept alongside the derived stemLoopStart/End times so the panel can
  // show which preset is engaged without recomputing it from times/bpm, which
  // would drift out of sync with the ½/×2 preset ladder after float rounding.
  stemLoopBeatsVal: (number | null)[] = [];
  // whole-track repeat: restart the song automatically when it reaches the end
  repeat = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const C = () => ctx.createGain();

    this.trim = C();
    this.volume = C();
    this.output = C();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.78;

    this.low = ctx.createBiquadFilter();
    this.low.type = "lowshelf";
    this.low.frequency.value = 200;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = "peaking";
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.8;
    this.high = ctx.createBiquadFilter();
    this.high.type = "highshelf";
    this.high.frequency.value = 4000;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "allpass"; // bypass at center
    this.filter.frequency.value = 20000;

    this.fx = new FXRack(ctx, DECK_FX);
    this.retouch = new Retouch(ctx);
    this.fx.setClock(() => this.fxClock());
    this.rack = new Rack(ctx);

    // per-stem gains (up to STEM_MAX) sum into a shared stem bus, which feeds
    // trim. The bus carries an automatic makeup gain: as you pull stem faders
    // down, it boosts to keep the overall level roughly constant (a muted stem
    // shouldn't make the whole deck quieter). The rest of the chain — EQ, filter,
    // FX, volume — is identical whether we play the full mix or N stems.
    this.stemBus = C();
    this.stemBus.connect(this.trim);

    // shared reverb/delay send buses — built once per deck, always present;
    // each stem's SEND gain (below) starts at 0 so this is silent until raised.
    this.stemReverbConv = ctx.createConvolver();
    this.stemReverbConv.buffer = makeReverbImpulse(ctx, 2.4);
    this.stemReverbReturn = C();
    this.stemReverbReturn.gain.value = 1.3;
    this.stemReverbConv.connect(this.stemReverbReturn);
    this.stemReverbReturn.connect(this.stemBus);

    this.stemDelayNode = ctx.createDelay(1.5);
    this.stemDelayNode.delayTime.value = 0.375;
    this.stemDelayFb = C();
    this.stemDelayFb.gain.value = 0.35;
    this.stemDelayNode.connect(this.stemDelayFb);
    this.stemDelayFb.connect(this.stemDelayNode);
    this.stemDelayReturn = C();
    this.stemDelayReturn.gain.value = 1;
    this.stemDelayNode.connect(this.stemDelayReturn);
    this.stemDelayReturn.connect(this.stemBus);

    for (let i = 0; i < Deck.STEM_MAX; i++) {
      const g = C();
      this.stemGains.push(g);

      // dedicated per-stem FX, always live: g -> filter -> drive -> stemBus
      // (or -> rack.input, if this stem is later targeted for the shared
      // pedalboard — see toggleStemFxTarget, which re-splices AFTER this pair).
      const filt = ctx.createBiquadFilter();
      filt.type = "allpass";
      filt.frequency.value = 20000;
      const drive = ctx.createWaveShaper();
      drive.curve = driveCurve(0);
      drive.oversample = "2x";
      g.connect(filt);
      filt.connect(drive);
      const out = C();
      drive.connect(out);
      out.connect(this.stemBus);
      this.stemOut.push(out);
      this.stemDjFx.push(null);
      const synthIn = C();
      synthIn.connect(filt);
      this.stemSynthIn.push(synthIn);
      this.stemFilter.push(filt);
      this.stemFilterX.push(0);
      this.stemDrive.push(drive);
      this.stemDriveAmt.push(0);

      // post-fader (post-FX) tap for the per-stem LED meter
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.6;
      drive.connect(an);
      this.stemAnalysers.push(an);
      this.stemEnv.push(0);

      const rSend = C();
      rSend.gain.value = 0;
      drive.connect(rSend);
      rSend.connect(this.stemReverbConv);
      this.stemReverbSendGain.push(rSend);
      this.stemReverbSend.push(0);

      const dSend = C();
      dSend.gain.value = 0;
      drive.connect(dSend);
      dSend.connect(this.stemDelayNode);
      this.stemDelaySendGain.push(dSend);
      this.stemDelaySend.push(0);
      this.stemFxVol.push(0.4);

      this.stemLoopWrapTimer.push(null);
      this.stemLoopWrapCount.push(0);
      this.stemLoopSmoothMs.push(10); // a light 10ms fade by default — on, but subtle
      this.stemLoopRollAt.push(null); // Lock by default (no auto-release)
      this.stemLoopBeatsVal.push(null);
    }

    // crowd / ambience reducer: a per-channel mix matrix that scales the side
    // signal. outL = a·L + b·R, outR = a·R + b·L, with a = 1-k/2, b = k/2.
    // Force the input to stereo so mono tracks up-mix cleanly (speakers, not
    // discrete) before the split — otherwise the right channel would go silent.
    this.crowdIn = C();
    this.crowdIn.channelCount = 2;
    this.crowdIn.channelCountMode = "explicit";
    this.crowdIn.channelInterpretation = "speakers";
    this.crowdOut = C();
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    const ll = C(), rr = C(), rl = C(), lr = C();
    ll.gain.value = 1; rr.gain.value = 1; // a = 1 at k=0
    rl.gain.value = 0; lr.gain.value = 0; // b = 0 at k=0
    this.crowdStraight = [ll, rr];
    this.crowdCross = [rl, lr];
    this.crowdIn.connect(split);
    split.connect(ll, 0); ll.connect(merge, 0, 0); // L -> outL
    split.connect(rl, 1); rl.connect(merge, 0, 0); // R -> outL
    split.connect(rr, 1); rr.connect(merge, 0, 1); // R -> outR
    split.connect(lr, 0); lr.connect(merge, 0, 1); // L -> outR
    merge.connect(this.crowdOut);

    // Auto-Tune insert sits right after trim, before the EQ, so it corrects a
    // clean signal. Until the worklet loads (or when off) audio passes through
    // the bypass gain; the wet path is wired in once the node exists.
    this.autotuneIn = C();
    this.autotuneOut = C();
    this.autotuneBypass = C();
    this.autotuneWet = C();
    this.autotuneBypass.gain.value = 1;
    this.autotuneWet.gain.value = 0;
    this.autotuneIn.connect(this.autotuneBypass);
    this.autotuneBypass.connect(this.autotuneOut);

    // Key Lock (Master Tempo) insert — compensates pitch shift when rate changes
    this.keyShifterIn = C();
    this.keyShifterOut = C();
    this.keyShifterBypass = C();
    this.keyShifterWet = C();
    this.keyShifterBypass.gain.value = 1;
    this.keyShifterWet.gain.value = 0;
    this.keyShifterIn.connect(this.keyShifterBypass);
    this.keyShifterBypass.connect(this.keyShifterOut);

    // signal chain: trim -> autotune -> keyLock -> EQ -> filter -> FX -> volume -> crowd -> analyser -> out
    this.sliceGate = C();
    this.trim.connect(this.sliceGate);
    this.sliceGate.connect(this.autotuneIn);
    this.autotuneOut.connect(this.keyShifterIn);
    this.keyShifterOut.connect(this.low);
    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.filter);
    this.filter.connect(this.retouch.input);
    this.fxInGate = C();
    this.retouch.output.connect(this.fxInGate);
    this.fxInGate.connect(this.fx.input);
    this.fx.output.connect(this.rack.input);
    this.rack.output.connect(this.volume);
    this.volume.connect(this.crowdIn);
    this.crowdOut.connect(this.analyser);
    this.analyser.connect(this.output);
  }

  // 0 = off (stereo untouched), 1 = max crowd/ambience removal (full mono).
  setCrowd(k: number) {
    this.crowd = Math.min(1, Math.max(0, k));
    const a = 1 - this.crowd / 2;
    const b = this.crowd / 2;
    for (const g of this.crowdStraight) g.gain.value = a;
    for (const g of this.crowdCross) g.gain.value = b;
  }

  // ---- Auto-Tune ----
  // the absolute pitch classes the corrector is allowed to snap to
  private static SCALE_DEGREES: Record<Deck["autotuneScale"], number[]> = {
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
  };

  // build + wire the worklet node the first time Auto-Tune is switched on
  private async ensureAutotuneNode(): Promise<void> {
    if (this.autotuneNode || this.autotuneLoading) return;
    if (!this.ctx.audioWorklet) return; // unsupported browser
    this.autotuneLoading = true;
    try {
      let p = Deck.moduleAdded.get(this.ctx);
      if (!p) {
        p = this.ctx.audioWorklet.addModule("/autotune-worklet.js");
        Deck.moduleAdded.set(this.ctx, p);
      }
      await p;
      if (this.autotuneNode) return;
      const node = new AudioWorkletNode(this.ctx, "autotune", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 2,
        channelCountMode: "explicit",
        channelInterpretation: "speakers",
        outputChannelCount: [2],
      });
      this.autotuneNode = node;
      this.autotuneIn.connect(node);
      node.connect(this.autotuneWet);
      this.autotuneWet.connect(this.autotuneOut);
      this.pushAutotuneParams();
    } catch (e) {
      console.error("[autotune]", e);
    } finally {
      this.autotuneLoading = false;
      this.applyAutotuneMix();
    }
  }

  private pushAutotuneParams() {
    const node = this.autotuneNode;
    if (!node) return;
    const amp = node.parameters.get("amount");
    const ret = node.parameters.get("retune");
    if (amp) amp.value = this.autotuneAmount;
    if (ret) ret.value = this.autotuneRetune;
    const key = ((this.autotuneKey % 12) + 12) % 12;
    const classes = Deck.SCALE_DEGREES[this.autotuneScale].map((d) => (d + key) % 12);
    node.port.postMessage({ type: "scale", classes });
  }

  // crossfade dry/wet based on the on flag + whether the node has loaded
  private applyAutotuneMix() {
    if (!this.autotuneBypass) return;
    const wet = this.autotuneOn && this.autotuneNode ? 1 : 0;
    const t = this.ctx.currentTime;
    this.autotuneWet.gain.setTargetAtTime(wet, t, 0.01);
    this.autotuneBypass.gain.setTargetAtTime(1 - wet, t, 0.01);
  }

  setAutotune(on: boolean) {
    this.autotuneOn = on;
    if (on) void this.ensureAutotuneNode();
    this.applyAutotuneMix();
  }

  setAutotuneAmount(v: number) {
    this.autotuneAmount = Math.min(1, Math.max(0, v));
    const amp = this.autotuneNode?.parameters.get("amount");
    if (amp) amp.value = this.autotuneAmount;
  }

  setAutotuneRetune(v: number) {
    this.autotuneRetune = Math.min(1, Math.max(0, v));
    const ret = this.autotuneNode?.parameters.get("retune");
    if (ret) ret.value = this.autotuneRetune;
  }

  setAutotuneScale(key: number, scale: Deck["autotuneScale"]) {
    this.autotuneKey = ((Math.round(key) % 12) + 12) % 12;
    this.autotuneScale = scale;
    this.pushAutotuneParams();
  }

  // Smoothed 0..1 output level of stem i, for the per-stem LED meter. Reads the
  // post-fader tap so a pulled-down stem reads 0. Fast attack, slow release.
  stemLevel(i: number): number {
    const an = this.stemAnalysers[i];
    if (!an || !this.stemsActive || !this._playing || i >= this.stemNames.length) {
      this.stemEnv[i] = (this.stemEnv[i] || 0) * 0.8;
      return this.stemEnv[i];
    }
    an.getFloatTimeDomainData(this.stemMeterBuf);
    let sum = 0;
    for (let k = 0; k < this.stemMeterBuf.length; k++) sum += this.stemMeterBuf[k] * this.stemMeterBuf[k];
    const rms = Math.sqrt(sum / this.stemMeterBuf.length);
    const level = Math.min(1, rms * 3.2); // map typical RMS into a usable 0..1
    const prev = this.stemEnv[i] || 0;
    this.stemEnv[i] = level > prev ? level : prev * 0.82 + level * 0.18;
    return this.stemEnv[i];
  }

  get playing() {
    return this._playing;
  }

  // Key detection is the heaviest sync analysis (~0.3-0.6 s): run it after the first paint.
  // The load generation guards against writing the key of a track that was replaced meanwhile.
  private deferKey(buf: AudioBuffer): void {
    this.key = null;
    const gen = this.loadGen;
    setTimeout(() => {
      if (this.loadGen === gen) this.key = detectKey(buf);
    }, 0);
  }

  async load(file: File | ArrayBuffer, name: string) {
    const data = file instanceof File ? await file.arrayBuffer() : file;
    this.rawBlob = file instanceof File ? file : new Blob([data]); // keep a pristine copy for stem separation
    const buf = await this.ctx.decodeAudioData(data);
    this._streamOnly = false;
    this.cleanupMediaEl(); // cancel any in-progress streaming phase
    this.stopSources(); // kill any lingering playback (incl. orphaned stems) first
    this._playing = false;
    this.buffer = buf;
    this.clearStems();
    this.loadGen++;
    this.name = name;
    this.duration = buf.duration;
    this.peaks = buildWaveformPeaks(buf);
    this.bpm = detectBPM(buf);
    this.deferKey(buf);
    this.pausedAt = 0;
    this.keyShift = 0;
    this.updateKeyLockShifter();
    this.cuePoint = 0;
    this.hotCues = [null, null, null, null];
    this.loopActive = false;
    this._playing = false;
    this.sourceLink = ""; // default: no external source; caller may set it after
    this.coverArt = ""; // default: no art; caller (library) may set it after
    this.origin = null; // default: unknown origin; library sets it after load
    if (this.stemsWanted) void this.prefetchStems(); // prep in the background — this deck was using stems
  }

  // Two-phase loading: start audio immediately through a MediaElementSource while
  // decodeAudioData + waveform/BPM analysis run in the background (phase 1), then
  // hot-swap to the full AudioBuffer once it's ready (phase 2). All effects work
  // in both phases since both paths connect to this.trim and the rest of the chain.
  //
  // loadStreaming()    — for blobs already in memory (local files from IndexedDB)
  // loadStreamingUrl() — for online streams (streams from /api/<src>/stream)
  private _streamSetup(el: HTMLAudioElement, name: string, onEnded: () => void) {
    this.cleanupMediaEl();
    this.stopSources();
    this._playing = false;
    this.buffer = null;
    this.name = name;
    this.peaks = new Float32Array(0);
    this.bpm = 0;
    this.key = null;
    this.duration = 0;
    this.pausedAt = 0;
    this.cuePoint = 0;
    this._streamOnly = false;
    this.clearStems();
    this.loadGen++;

    el.preload = "auto";
    el.addEventListener("loadedmetadata", () => { this.duration = el.duration; }, { once: true });
    el.addEventListener("ended", onEnded, { once: true });

    const elSrc = this.ctx.createMediaElementSource(el);
    elSrc.connect(this.trim);
    this.mediaEl = el;
    this.mediaElSrc = elSrc;
    this._bufferLoading = true;
  }

  private _streamSwap(buf: AudioBuffer, pos: number, wasPlaying: boolean) {
    this.cleanupMediaEl();
    this.buffer = buf;
    this.duration = buf.duration;
    this.peaks = buildWaveformPeaks(buf);
    this.bpm = detectBPM(buf);
    this.deferKey(buf);
    this.pausedAt = Math.min(Math.max(0, pos), buf.duration - 0.05);
    this._playing = false;

    // Asynchronous fine-tuned beat detection (BPM + phase offset beatgrid)
    const currentGen = this.loadGen;
    guessBeat(buf)
      .then((res) => {
        if (this.loadGen !== currentGen) return;
        if (res && res.bpm > 0) {
          this.bpm = Math.round(res.bpm * 10) / 10;
          this.beatGridOffset = Math.max(0, res.offset || 0);
        }
      })
      .catch(() => {
        /* fallback to detectBPM already set */
      });

    if (wasPlaying) this.play();
  }

  private waitDuration(el: HTMLAudioElement, ms: number): Promise<number> {
    return new Promise((resolve) => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        resolve(el.duration);
        return;
      }

      let timer: number | null = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        el.removeEventListener('loadedmetadata', onLoaded);
      };

      const onLoaded = () => {
        cleanup();
        resolve(Number.isFinite(el.duration) ? el.duration : NaN);
      };

      timer = window.setTimeout(() => {
        cleanup();
        resolve(NaN);
      }, ms);

      el.addEventListener('loadedmetadata', onLoaded, { once: true });
    });
  }

  async loadStreaming(blob: Blob, name: string): Promise<boolean> {
    const el = new Audio();
    el.src = URL.createObjectURL(blob);
    const onEnded = () => {
      if (this.mediaEl === el) {
        this._playing = false;
        this.pausedAt = 0;
        if (this.repeat && this.buffer) this.play();
        if (this.repeat && this._streamOnly) {
          el.currentTime = 0;
          el.play().catch(() => {});
          this._playing = true;
        }
      }
    };
    this._streamSetup(el, name, onEnded);

    const capturedEl = el;
    const dur = await this.waitDuration(el, 5000);
    if (capturedEl !== this.mediaEl) return false;
    if (dur > Deck.maxDecodeSec) {
      this.rawBlob = blob;
      this._streamOnly = true;
      this._bufferLoading = false;
      this.loading = false;
      this.duration = dur;
      return true;
    }

    try {
      const raw = await blob.arrayBuffer();
      if (capturedEl !== this.mediaEl) return false;
      this.rawBlob = blob;
      if (this.stemsWanted) void this.prefetchStems();
      const buf = await this.ctx.decodeAudioData(raw);
      if (!buf || capturedEl !== this.mediaEl) return false;
      const pos = this.mediaEl?.currentTime ?? 0;
      const wasPlaying = this._playing;
      this._streamSwap(buf, pos, wasPlaying);
      this._bufferLoading = false;
      this.loading = false;
      return true;
    } catch (e) {
      console.error("[deck] background decode failed", (e as Error).message);
      if (capturedEl === this.mediaEl) {
        this._bufferLoading = false;
        this.loading = false;
      }
      return false;
    }
  }

  async loadStreamingUrl(url: string, name: string, knownDurationSec = 0): Promise<boolean> {
    this.cleanupMediaEl();
    this.stopSources();
    this._playing = false;
    this.buffer = null;
    this.name = name;
    this.peaks = new Float32Array(0);
    this.bpm = 0;
    this.key = null;
    this.duration = 0;
    this.pausedAt = 0;
    this.cuePoint = 0;
    this._streamOnly = false;
    this.clearStems();
    this.loadGen++;
    this._bufferLoading = true;
    this.loading = false;

    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.src = url;
    const onEnded = () => {
      if (this.mediaEl === el) {
        this._playing = false;
        this.pausedAt = 0;
        if (this.repeat && this.buffer) this.play();
        if (this.repeat && this._streamOnly) {
          el.currentTime = 0;
          el.play().catch(() => {});
          this._playing = true;
        }
      }
    };
    this._streamSetup(el, name, onEnded);

    const currentGen = this.loadGen;
    const capturedEl = el;
    const dur = knownDurationSec > 0 ? knownDurationSec : await this.waitDuration(el, 8000);
    if (currentGen !== this.loadGen || capturedEl !== this.mediaEl) return false;
    if (dur > Deck.maxDecodeSec) {
      this._streamOnly = true;
      this._bufferLoading = false;
      this.loading = false;
      this.duration = dur;
      return true;
    }

    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      if (currentGen !== this.loadGen || capturedEl !== this.mediaEl) return false;
      this.rawBlob = blob;
      if (this.stemsWanted) void this.prefetchStems();
      const buf = await this.ctx.decodeAudioData(await blob.arrayBuffer());
      if (!buf || currentGen !== this.loadGen || capturedEl !== this.mediaEl) return false;
      const pos = this.mediaEl?.currentTime ?? 0;
      const wasPlaying = this._playing;
      this._streamSwap(buf, pos, wasPlaying);
      this._bufferLoading = false;
      return true;
    } catch (e) {
      console.error("[deck] background stream decode notice:", (e as Error).message);
      return true;
    }
  }

  // pristine bytes of the loaded track (for re-storing the audio when saving a
  // directly-loaded file into the library). Null once unloaded.
  getRawBlob(): Blob | null {
    return this.rawBlob;
  }

  // build one source feeding `dest`. The `primary` source carries the onended
  // handler that drives end-of-track / repeat (only one is needed). `stemIdx`
  // (stem mode only) lets this source use ITS OWN loop points instead of the
  // whole-deck loop, so one stem can loop while the others play straight through.
  private buildSource(buf: AudioBuffer, dest: AudioNode, primary: boolean, stemIdx?: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = this.effRate;
    if (stemIdx != null && this.stemLoopActive[stemIdx]) {
      src.loop = true;
      src.loopStart = this.stemLoopStart[stemIdx];
      src.loopEnd = this.stemLoopEnd[stemIdx];
    } else if (this.loopActive) {
      src.loop = true;
      src.loopStart = this.loopStart;
      src.loopEnd = this.loopEnd;
    }
    src.connect(dest);
    if (primary) {
      src.onended = () => {
        if (this.activeSources.includes(src) && !this.loopActive) {
          // stop every sibling stem too — in stem mode the 4 sources end at
          // slightly different instants, so the others would keep playing
          // (untracked, hence un-stoppable) once the primary set _playing=false
          this.stopSources();
          this._playing = false;
          this.pausedAt = 0;
          // whole-track repeat: relaunch from the top automatically
          if (this.repeat && this.buffer) this.play();
        }
      };
    }
    return src;
  }

  // one source in normal mode, N (per stem) when stems are active
  private makeSources(): AudioBufferSourceNode[] {
    if (this.stemsActive && this.stemReady) {
      return this.stemBuffers.map((b, i) => this.buildSource(b!, this.stemGains[i], i === 0, i));
    }
    if (!this.buffer) return [];
    return [this.buildSource(this.buffer, this.trim, true)];
  }

  // Quantize helper: snaps timestamp `t` to the closest beatgrid boundary
  snapToBeat(t: number): number {
    if (!this.quantize || !this.bpm) return t;
    const secPerBeat = 60 / this.bpm;
    const offset = this.beatGridOffset % secPerBeat;
    const beatIndex = Math.round((t - offset) / secPerBeat);
    const snapped = Math.max(0, beatIndex * secPerBeat + offset);
    return Math.min(snapped, this.duration);
  }

  toggleQuantize(): boolean {
    this.quantize = !this.quantize;
    return this.quantize;
  }

  play() {
    // phase 1: streaming via MediaElement (buffer not yet decoded)
    if ((this._bufferLoading || this._streamOnly) && this.mediaEl) {
      if (this._playing) return;
      this.mediaEl.play().catch(() => {});
      this._playing = true;
      return;
    }
    if (!this.buffer || this._playing) return;
    this.stopSources(); // clear any orphans left by a previous natural end
    const srcs = this.makeSources();
    if (!srcs.length) return;

    // When quantize is active and deck was paused, snap launch point to nearest beat
    const rawOffset = Math.min(this.pausedAt, this.duration - 0.01);
    const offset = this.quantize ? this.snapToBeat(rawOffset) : rawOffset;

    const when = this.ctx.currentTime; // start every stem at the exact same instant
    for (const s of srcs) s.start(when, offset);
    this.activeSources = srcs;
    this.startCtxTime = when;
    this.startOffset = offset;
    this._playing = true;
    // re-arm any stem loops still active — their wrap-timing depends on
    // startCtxTime/startOffset, which just changed
    for (let i = 0; i < this.stemLoopActive.length; i++) {
      if (this.stemLoopActive[i]) this.scheduleStemLoopWrap(i);
    }
  }

  pause() {
    if (!this._playing) return;
    // phase 1: pause the MediaElement
    if ((this._bufferLoading || this._streamOnly) && this.mediaEl) {
      this.pausedAt = this.mediaEl.currentTime;
      this.mediaEl.pause();
      this._playing = false;
      return;
    }
    for (let i = 0; i < this.stemLoopWrapTimer.length; i++) this.clearStemLoopTimer(i);
    this.pausedAt = this.position();
    this.stopSources();
    this._playing = false;
  }

  toggle() {
    if (this._playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  private stopSources() {
    for (const s of this.activeSources) {
      try {
        s.onended = null;
        s.stop();
      } catch {}
      s.disconnect();
    }
    this.activeSources = [];
    // streaming mode: just pause the element (don't clean it up — seeked replay
    // needs it alive; cleanupMediaEl() is called explicitly by load/unload/swap)
    if (this.mediaEl) this.mediaEl.pause();
  }

  position(): number {
    // phase 1: read position from the MediaElement
    if ((this._bufferLoading || this._streamOnly) && this.mediaEl) return this.mediaEl.currentTime;
    if (!this.buffer) return 0;
    if (!this._playing) return this.pausedAt;
    let pos = this.startOffset + (this.ctx.currentTime - this.startCtxTime) * this.effRate;
    if (this.loopActive && pos >= this.loopEnd) {
      const len = this.loopEnd - this.loopStart;
      pos = this.loopStart + ((pos - this.loopStart) % len);
    }
    return Math.min(pos, this.duration);
  }

  seek(t: number) {
    const target = Math.max(0, Math.min(t, this.duration));
    // phase 1: seek the MediaElement directly
    if ((this._bufferLoading || this._streamOnly) && this.mediaEl) {
      this.mediaEl.currentTime = target;
      this.pausedAt = target;
      return;
    }
    if (this._playing) {
      this.stopSources();
      this.pausedAt = target;
      this._playing = false;
      this.play();
    } else {
      this.pausedAt = target;
    }
  }

  // hot cues: a tap sets the slot to the current (quantized) position, then jumps there
  setHotCue(i: number): void {
    if (i < 0 || i >= this.hotCues.length || !this.buffer) return;
    const pos = this.position();
    const t = this.quantize ? this.snapToBeat(pos) : pos;
    this.hotCues[i] = Math.max(0, Math.min(this.duration, t));
  }

  gotoHotCue(i: number): void {
    const t = this.hotCues[i];
    if (t === null || t === undefined) return;
    this.seek(t);
  }

  clearHotCue(i: number): void {
    if (i >= 0 && i < this.hotCues.length) this.hotCues[i] = null;
  }

  setCue() {
    const pos = this.position();
    this.cuePoint = this.quantize ? this.snapToBeat(pos) : pos;
  }

  gotoCue() {
    this.seek(this.cuePoint);
    if (this._playing) this.pause();
  }

  // --- controls ---
  get trimValue(): number { return this.trim.gain.value; }
  setTrim(v: number) {
    this.trim.gain.value = v;
  }
  setVolume(v: number) {
    this.volume.gain.value = v;
  }

  get volumeValue(): number {
    return this.volume.gain.value;
  }
  setEQ(band: "low" | "mid" | "high", db: number) {
    this[band].gain.value = db;
  }

  // last bipolar filter position (the biquad itself doesn't store x)
  private filterX = 0;

  // bipolar filter: -1..0 = lowpass sweep, 0 = bypass, 0..1 = highpass sweep
  setFilter(x: number) {
    this.filter.frequency.cancelScheduledValues(0);
    this.filter.Q.cancelScheduledValues(0);
    this.filterX = x;
    if (Math.abs(x) < 0.02) {
      this.filter.type = "allpass";
      this.filter.frequency.value = 20000;
      return;
    }
    if (x < 0) {
      this.filter.type = "lowpass";
      const f = 20000 * Math.pow(40 / 20000, -x); // 20k -> 40 Hz
      this.filter.frequency.value = f;
    } else {
      this.filter.type = "highpass";
      const f = 20 * Math.pow(12000 / 20, x); // 20 -> 12k Hz
      this.filter.frequency.value = f;
    }
    this.filter.Q.value = 1 + Math.abs(x) * 6;
  }

  // live filter position, following a rampFilter sweep (for the FILTER knob)
  get filterLive(): number {
    const f = this.filter.frequency.value;
    if (this.filter.type === "highpass") return Math.min(1, Math.max(0, Math.log(f / 20) / Math.log(600)));
    if (this.filter.type === "lowpass") return -Math.min(1, Math.max(0, Math.log(20000 / f) / Math.log(500)));
    return 0;
  }

  // Momentary mutes for MONTÉE & DROP right before a drop: "out" silences the whole deck
  // (pre-drop gap), "fxin" silences what enters the FX unit so only its echoes ring out.
  setHold(which: "out" | "fxin", on: boolean) {
    const g = (which === "out" ? this.output : this.fxInGate).gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? 0 : 1, now + (on ? 0.006 : 0.003));
  }

  get filterPos(): number {
    return this.filterX;
  }

  // Sweep the high-pass from its current position up to x over dur seconds on the audio
  // clock (smooth, no zipper noise) for build-ups; setFilter() cancels it.
  rampFilter(x: number, dur: number) {
    const now = this.ctx.currentTime;
    const from = Math.max(0, this.filterX);
    const hz = (v: number) => 20 * Math.pow(12000 / 20, v);
    const fq = this.filter.frequency;
    const q = this.filter.Q;
    fq.cancelScheduledValues(now);
    q.cancelScheduledValues(now);
    this.filter.type = "highpass";
    fq.setValueAtTime(hz(from), now);
    q.setValueAtTime(1 + from * 6, now);
    fq.exponentialRampToValueAtTime(hz(x), now + Math.max(0.05, dur));
    q.linearRampToValueAtTime(1 + x * 6, now + Math.max(0.05, dur));
    this.filterX = x;
  }

  // effective playback rate = tempo (pitch) × momentary scratch bend
  private get effRate() {
    return this.rate * this.scratchMult;
  }

  // pitch / tempo as playback rate. ratePct in -8..+8 (%)
  setPitch(pct: number) {
    const newRate = 1 + pct / 100;
    if (this._playing && this.activeSources.length) {
      // rebase position so the change is seamless
      const pos = this.position();
      this.startOffset = pos;
      this.startCtxTime = this.ctx.currentTime;
      this.rate = newRate;
      for (const s of this.activeSources) s.playbackRate.value = this.effRate;
    } else {
      this.rate = newRate;
    }
    this.updateKeyLockShifter();
  }

  toggleKeyLock(): boolean {
    this.keyLock = !this.keyLock;
    this.updateKeyLockShifter();
    return this.keyLock;
  }

  setKeyShift(semis: number) {
    this.keyShift = Math.max(-6, Math.min(6, Math.round(semis)));
    this.updateKeyLockShifter();
  }

  get effectiveKey(): KeyResult | null {
    if (!this.key) return null;
    const total = this.keyShift + (this.keyLock ? 0 : Math.round(12 * Math.log2(this.rate)));
    return transposeKey(this.key, total);
  }

  get sliceInput(): AudioNode { return this.autotuneIn; }
  get audioBuffer(): AudioBuffer | null { return this.buffer; }
  get playbackRate(): number { return this.effRate; }

  private updateKeyLockShifter() {
    const comp = this.keyLock && Math.abs(this.rate - 1) >= 0.0005 ? -12 * (Math.log(this.rate) / Math.LN2) : 0;
    const total = comp + this.keyShift;

    if (Math.abs(total) < 0.005) {
      this.keyShifterBypass.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
      this.keyShifterWet.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      return;
    }

    if (!this.keyShifter) {
      this.keyShifter = new PitchShifter(this.ctx);
      this.keyShifter.start(this.ctx.currentTime + 0.01);
      this.keyShifterIn.connect(this.keyShifter.input);
      this.keyShifter.output.connect(this.keyShifterWet);
      this.keyShifterWet.connect(this.keyShifterOut);
    }

    this.keyShifter.setSemitones(total);
    this.keyShifterBypass.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    this.keyShifterWet.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
  }

  // momentary scratch / pitch-bend. amount in -1..+1, 0 = neutral.
  // Right speeds the platter up, left brakes it down; release back to 0 to
  // resume normal speed. Implemented as a temporary playback-rate multiplier.
  scratch(amount: number) {
    const a = Math.max(-1, Math.min(1, amount));
    const mult = Math.pow(2, a * 1.5); // 0→1, +1→~2.83×, −1→~0.35×
    if (this._playing && this.activeSources.length) {
      const pos = this.position(); // capture under the old rate first
      this.startOffset = pos;
      this.startCtxTime = this.ctx.currentTime;
      this.scratchMult = mult;
      for (const s of this.activeSources) s.playbackRate.value = this.effRate;
    } else {
      this.scratchMult = mult;
    }
  }

  // ---- stems (Demucs) ----
  // ready once every active stem has a decoded buffer (count depends on model)
  get stemReady(): boolean {
    return this.stemNames.length > 0 && this.stemBuffers.length === this.stemNames.length &&
      this.stemBuffers.every((b) => b !== null);
  }

  // wipe any loaded stems (called when a new track is loaded / deck is cleared /
  // the model changes). Does NOT reset stemModel (user's chosen quality sticks).
  clearStems() {
    this.restoreStemOpts();
    this.preparedHash = "";
    this.releaseStemSynth(); // a new track: give the synth back to the master before the stem indices go stale
    this.clearAllStemFxTargets(); // un-splice before the stem indices go stale
    this.stopStemProgressPoll();
    this.stemsActive = false;
    this.stemBuffers = [];
    this.stemNames = [];
    this.stemRamps.forEach((id) => window.clearInterval(id));
    this.stemRamps.clear();
    this.stemVol = [];
    this.stemMap = null;
    for (let i = 0; i < this.stemLoopWrapTimer.length; i++) this.clearStemLoopTimer(i);
    this.stemLoopWrapCount = this.stemLoopWrapCount.map(() => 0);
    this.stemLoopActive = [];
    this.stemLoopStart = [];
    this.stemLoopEnd = [];
    this.stemLoopBeatsVal = this.stemLoopBeatsVal.map(() => null);
    this.stemStatus = "none";
    this.stemCached = false;
    this.stemHash = "";
    for (const g of this.stemGains) g.gain.value = 1;
    if (this.stemBus) this.stemBus.gain.value = 1;
    for (let i = 0; i < this.stemReverbSendGain.length; i++) {
      this.stemReverbSend[i] = 0;
      this.stemReverbSendGain[i].gain.value = 0;
      this.stemDelaySend[i] = 0;
      this.stemDelaySendGain[i].gain.value = 0;
    }
    for (let i = 0; i < this.stemFilter.length; i++) this.setStemFilter(i, 0);
    for (let i = 0; i < this.stemDrive.length; i++) this.setStemDrive(i, 0);
    for (const r of this.stemDjFx) r?.resetAll();
  }

  // switch analysis model (standard / fine-tuned / 6-stem). Drops any loaded
  // stems so the next STEMS click re-separates with the new model.
  setStemModel(model: Deck["stemModel"]) {
    if (model === this.stemModel) return;
    this.stemModel = model;
    this.stemOptsSaved = null; // an explicit choice replaces whatever a prepared track had set
    this.clearStems();
    this.loadGen++; // invalidate any in-flight probe/prefetch/separate for the old model
    void this.probeStems();
  }

  // quality knobs, orthogonal to the model — each drops any loaded stems so
  // the next STEMS click re-separates (or re-probes an already-cached variant)
  setStemUltra(on: boolean) {
    if (on === this.stemUltra) return;
    this.stemUltra = on;
    this.stemOptsSaved = null; // an explicit choice replaces whatever a prepared track had set
    this.clearStems();
    this.loadGen++;
    void this.probeStems();
  }
  setStemLossless(on: boolean) {
    if (on === this.stemLossless) return;
    this.stemLossless = on;
    this.stemOptsSaved = null; // an explicit choice replaces whatever a prepared track had set
    this.clearStems();
    this.loadGen++;
    void this.probeStems();
  }
  setStemDenoiseVocals(on: boolean) {
    if (on === this.stemDenoiseVocals) return;
    this.stemDenoiseVocals = on;
    this.stemOptsSaved = null; // an explicit choice replaces whatever a prepared track had set
    this.clearStems();
    this.loadGen++;
    void this.probeStems();
  }

  private restoreStemOpts() {
    const saved = this.stemOptsSaved;
    if (!saved) return;
    this.stemOptsSaved = null;
    this.stemModel = saved.model;
    this.stemUltra = saved.ultra;
    this.stemLossless = saved.lossless;
    this.stemDenoiseVocals = saved.denoise;
  }

  // The loaded track has stems prepared in advance: use exactly that variant (model + ULTRA + WAV) and hash, so
  // the STEMS button loads them from the server cache instead of separating the track again. Checks the cache
  // first: false (and nothing changed) when the files are gone or another track got loaded meanwhile.
  async adoptPreparedStems(p: { hash: string; model: Deck["stemModel"]; ultra: boolean; lossless: boolean }): Promise<boolean> {
    if (this._streamOnly || this.stemReady) return false;
    const gen = this.loadGen;
    try {
      const qs = `&model=${p.model}${p.ultra ? "&ultra=1" : ""}${p.lossless ? "&wav=1" : ""}`;
      const res = await fetch(`/api/stems/status?hash=${p.hash}${qs}`);
      if (!res.ok) return false;
      const { cached } = (await res.json()) as { cached: boolean };
      if (!cached || this.loadGen !== gen || this.stemReady) return false;
    } catch {
      return false;
    }
    if (!this.stemOptsSaved) {
      this.stemOptsSaved = { model: this.stemModel, ultra: this.stemUltra, lossless: this.stemLossless, denoise: this.stemDenoiseVocals };
    }
    this.stemModel = p.model;
    this.stemUltra = p.ultra;
    this.stemLossless = p.lossless;
    this.stemDenoiseVocals = false;
    this.stemHash = p.hash;
    this.preparedHash = p.hash;
    this.stemCached = true;
    return true;
  }

  // load the prepared stems straight from the cache: no audio is sent back, nothing is separated, and the
  // files are fetched and decoded in parallel. false = they are gone: the shortcut is dropped and the normal path runs.
  private async loadPreparedStems(): Promise<boolean> {
    const hash = this.preparedHash;
    const model = this.stemModel;
    const gen = this.loadGen;
    const qs = this.stemOptsQS();
    this.stemStatus = "working";
    try {
      const st = await fetch(`/api/stems/status?hash=${hash}&model=${model}${qs}`).then((r) => r.json() as Promise<{ cached: boolean; stems?: string[] }>);
      const names = st.stems ?? [];
      if (!st.cached || names.length === 0) throw new Error("stems absents du cache");
      const bufs = await Promise.all(
        names.map(async (n) => {
          const r = await fetch(`/api/stems/${hash}/${n}?model=${model}${qs}`);
          if (!r.ok) throw new Error(`stem ${n}: ${r.status}`);
          return this.ctx.decodeAudioData(await r.arrayBuffer());
        })
      );
      if (this.loadGen !== gen || this.stemModel !== model) return true; // another track / setting meanwhile: nothing to install
      this.installStems(names, bufs, hash);
      return true;
    } catch (e) {
      console.warn("[stems] stems préparés introuvables, séparation normale :", (e as Error).message);
      if (this.loadGen === gen) {
        this.preparedHash = "";
        this.stemHash = "";
        this.stemCached = false;
        this.stemStatus = "none";
        this.restoreStemOpts(); // the normal path must not start a slow ULTRA run the user never asked for
      }
      return false;
    }
  }

  private installStems(names: string[], bufs: AudioBuffer[], hash: string) {
    this.stemNames = names;
    this.stemVol = names.map(() => 1);
    this.stemBuffers = bufs;
    void this.loadStemMap(hash);
    this.stemHash = hash;
    this.stemCached = true;
    for (let i = 0; i < names.length; i++) this.stemGains[i].gain.value = this.stemVol[i];
    this.recomputeStemMakeup();
    this.stemStatus = "ready";
  }

  // the map of the song (sections), read from the server: nothing is computed here
  private async loadStemMap(hash: string) {
    const gen = this.loadGen;
    this.stemMap = null;
    try {
      const r = await fetch(`/api/stems/map?hash=${hash}&model=${this.stemModel}${this.stemOptsQS()}`);
      const j = (await r.json()) as { map: StemMap | null };
      if (gen !== this.loadGen) return;
      this.stemMap = j.map;
      // the sung notes of the voice (made at preparation): read only, nothing is computed while loading
      const p = (await (await fetch(`/api/stems/pitch?read=1&hash=${hash}&model=${this.stemModel}${this.stemOptsQS()}`)).json()) as { pitch: { contour: number[]; hop: number } | null };
      if (gen === this.loadGen && this.stemMap && p.pitch) this.stemMap = { ...this.stemMap, voice: p.pitch.contour, voiceStep: p.pitch.hop * 4 };
    } catch {
      // no map: the DJ simply works without it
    }
  }

  // query-string suffix carrying the current quality opts, shared by every
  // /api/stems/* call so cache hits/misses stay consistent across them
  private stemOptsQS(): string {
    return `${this.stemUltra ? "&ultra=1" : ""}${this.stemLossless ? "&wav=1" : ""}${this.stemDenoiseVocals ? "&denoise=1" : ""}`;
  }

  // polls /api/stems/progress every ~1.2s while a separation is running for
  // `hash`, updating stemProgress live. `gen` pins this poll to the load that
  // started it — if the track changes mid-separation, polling for the old
  // job stops touching this deck's fields (same generation-guard pattern as
  // probeStems/prefetchStems/ensureStems).
  private pollStemProgress(hash: string, model: Deck["stemModel"], gen: number) {
    this.stopStemProgressPoll();
    const qs = this.stemOptsQS();
    this.stemProgressTimer = setInterval(async () => {
      if (this.loadGen !== gen || (this.stemStatus !== "prefetching" && this.stemStatus !== "working")) {
        this.stopStemProgressPoll();
        return;
      }
      try {
        const r = await fetch(`/api/stems/progress?hash=${hash}&model=${model}${qs}`);
        if (!r.ok || this.loadGen !== gen) return;
        const { progress } = (await r.json()) as { progress: number | null };
        if (this.loadGen === gen) this.stemProgress = progress;
      } catch {
        /* offline / route missing — leave the last known value showing */
      }
    }, 1200);
  }
  private stopStemProgressPoll() {
    if (this.stemProgressTimer) {
      clearInterval(this.stemProgressTimer);
      this.stemProgressTimer = null;
    }
    this.stemProgress = null;
  }

  // cheap check: does the server already have separated stems for this track +
  // model? (no separation is launched). Lets the UI show "instant" before a click.
  // Returns the probe result (or null if it no-op'd / a different track or setting
  // is now loaded on this deck by the time it resolves) — callers that persist
  // the result elsewhere (e.g. the library's "stems available" badge) MUST use
  // this return value rather than re-reading deck.stemHash after the await, since
  // that field may have moved on to a newer track by then.
  async probeStems(): Promise<{ hash: string; cached: boolean } | null> {
    if (this._streamOnly) return null;
    if (this.preparedHash) return { hash: this.preparedHash, cached: true }; // prepared stems: already known to be there
    const gen = this.loadGen;
    this.stemCached = false;
    if (!this.rawBlob || this.stemReady) return null;
    try {
      const res = await fetch(`/api/stems/separate?probe=1&model=${this.stemModel}${this.stemOptsQS()}`, {
        method: "POST",
        body: this.rawBlob,
      });
      if (!res.ok) return null;
      const { cached, hash } = (await res.json()) as { cached: boolean; hash: string };
      if (this.loadGen !== gen) return null; // a different track/setting loaded meanwhile — discard
      if (this.preparedHash) return { hash: this.preparedHash, cached: true }; // adopted while this probe was in flight
      this.stemCached = !!cached;
      if (hash) this.stemHash = hash;
      // a background prefetch just finished — drop the "préparation…" badge
      if (cached && this.stemStatus === "prefetching") this.stemStatus = "none";
      return { hash, cached };
    } catch {
      /* offline / route missing — leave as-is */
      return null;
    }
  }

  // Ask the server to separate this track in the background (low priority, niced)
  // so the stems are ready on disk before the user ever presses STEMS. Returns
  // immediately; the actual Demucs run happens server-side while the deck idles.
  // Caller should poll probeStems() to flip the "cached" badge once it lands.
  async prefetchStems(): Promise<void> {
    if (this._streamOnly) return;
    if (!this.rawBlob || this.stemReady || this.stemCached) return;
    if (!this.playbackGate()) return;
    if (getMemLevel() === "critical") return; // four decoded stems cost ~350 MB: not now
    // don't stomp on a live, foreground separation
    if (this.stemStatus === "working") return;
    const model = this.stemModel;
    const gen = this.loadGen;
    this.stemStatus = "prefetching";
    try {
      const res = await fetch(`/api/stems/separate?prefetch=1&model=${model}${this.stemOptsQS()}`, {
        method: "POST",
        body: this.rawBlob,
      });
      if (!res.ok) {
        if (this.loadGen === gen && this.stemStatus === "prefetching") this.stemStatus = "none";
        return;
      }
      const { hash, cached } = (await res.json()) as { hash: string; cached: boolean };
      if (this.loadGen !== gen || this.stemModel !== model) return; // track/settings swapped meanwhile
      if (hash) this.stemHash = hash;
      if (cached) {
        this.stemCached = true;
        if (this.stemStatus === "prefetching") this.stemStatus = "none";
      } else {
        this.pollStemProgress(hash, model, gen); // else: leave status "prefetching"; the poller will clear it when ready
      }
    } catch {
      if (this.loadGen === gen && this.stemStatus === "prefetching") this.stemStatus = "none";
    }
  }

  setSynthRoute(src: AudioNode, dst: AudioNode) {
    this.synthRoute = { src, dst };
  }

  get stemSynthIndex(): number | null {
    return this.synthStem;
  }

  get stemSynthKeep(): boolean {
    return this.synthKeep;
  }

  // The DJ synth goes through stem i's chain (filter, drive, FX, then the deck fader and crossfader):
  // keep=false mutes the stem (REMPLACER), keep=true keeps it under the synth (DOUBLER);
  // null gives the synth back to the master. One deck at a time.
  setStemSynth(i: number | null, keep = false) {
    const route = this.synthRoute;
    if (!route) return;
    if (Deck.synthHolder && Deck.synthHolder !== this) Deck.synthHolder.releaseStemSynth();
    this.releaseStemSynth();
    if (i === null || i < 0 || i >= this.stemSynthIn.length) return;
    route.src.disconnect(route.dst);
    route.src.connect(this.stemSynthIn[i]);
    this.synthStem = i;
    this.synthStemVol = this.stemVol[i] ?? 1;
    this.synthKeep = keep;
    if (!keep) this.setStemVol(i, 0);
    Deck.synthHolder = this;
  }

  releaseStemSynth() {
    const route = this.synthRoute;
    if (!route || this.synthStem === null) return;
    route.src.disconnect(this.stemSynthIn[this.synthStem]);
    route.src.connect(route.dst);
    if (!this.synthKeep) this.setStemVol(this.synthStem, this.synthStemVol);
    this.synthStem = null;
    this.synthKeep = false;
    if (Deck.synthHolder === this) Deck.synthHolder = null;
  }

  // per-stem volume (0..1+); index follows stemNames order
  setStemVol(i: number, v: number) {
    if (i < 0 || i >= this.stemVol.length) return;
    this.stopStemRamp(i);
    this.applyStemVol(i, v, 0.012);
  }

  // a stem goes to its new level over `sec` seconds (smooth curve), never with a step: what the intelligent DJ uses
  // to take stems down and bring them back. Any other change of that stem cancels the ramp.
  rampStemVol(i: number, to: number, sec: number) {
    if (i < 0 || i >= this.stemVol.length) return;
    this.stopStemRamp(i);
    const from = this.stemVol[i];
    if (sec <= 0.06 || Math.abs(to - from) < 0.005) {
      this.applyStemVol(i, to, 0.012);
      return;
    }
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
      const e = 0.5 - 0.5 * Math.cos(Math.PI * k); // slow start, slow end
      this.applyStemVol(i, from + (to - from) * e, 0.04);
      if (k >= 1) this.stopStemRamp(i);
    }, 40);
    this.stemRamps.set(i, id);
  }

  private stemRamps = new Map<number, number>();
  private stopStemRamp(i: number) {
    const id = this.stemRamps.get(i);
    if (id !== undefined) window.clearInterval(id);
    this.stemRamps.delete(i);
  }

  private applyStemVol(i: number, v: number, tc: number) {
    this.stemVol[i] = v;
    const g = this.stemGains[i]?.gain;
    if (g) g.setTargetAtTime(v, this.ctx.currentTime, tc);
    this.recomputeStemMakeup();
  }

  // Route the Rack DSP pedalboard onto one or more stems, instead of the
  // whole deck — every non-targeted stem stays dry, unplugged from the rack
  // entirely, and fully audible. Call again on the same stem to un-target it;
  // once no stems are targeted, routing reverts to normal whole-mix. Rack
  // modules default their own intensity to 0% ("start silent"), so engaging
  // this doesn't change anything audible until an FX is raised.
  toggleStemFxTarget(i: number) {
    if (i < 0 || i >= this.stemGains.length) return;
    const disconnect = (from: AudioNode, to: AudioNode) => {
      try {
        from.disconnect(to);
      } catch {
        /* wasn't connected — fine */
      }
    };
    // splice AFTER this stem's own dedicated filter/drive, not the raw gain —
    // those always apply regardless of whether the stem is also routed through
    // the shared Rack pedalboard
    const node = this.stemOut[i];
    if (this.stemFxTargets.has(i)) {
      disconnect(node, this.rack.input);
      node.connect(this.stemBus);
      this.stemFxTargets.delete(i);
    } else {
      disconnect(node, this.stemBus);
      node.connect(this.rack.input);
      this.stemFxTargets.add(i);
    }
    // the whole-mix bypass wiring only needs to change when we cross the
    // "any stem targeted at all" boundary — not on every individual toggle,
    // which would otherwise double-connect the same edge.
    const any = this.stemFxTargets.size > 0;
    if (any !== this.stemFxAnyActive) {
      this.stemFxAnyActive = any;
      if (any) {
        disconnect(this.fx.output, this.rack.input);
        disconnect(this.rack.output, this.volume);
        this.fx.output.connect(this.volume);
        this.rack.output.connect(this.stemBus);
      } else {
        disconnect(this.fx.output, this.volume);
        disconnect(this.rack.output, this.stemBus);
        this.fx.output.connect(this.rack.input);
        this.rack.output.connect(this.volume);
      }
    }
  }

  // Per-stem DJ FX pedalboard. Created on first use and spliced between the stem's
  // drive and its output point, so stems that never use it cost nothing.
  stemFxRack(i: number): FXRack | null {
    if (i < 0 || i >= this.stemOut.length) return null;
    let r = this.stemDjFx[i];
    if (!r) {
      r = new FXRack(this.ctx, STEM_FX);
      r.setClock(() => this.fxClock());
      const drive = this.stemDrive[i];
      drive.disconnect(this.stemOut[i]);
      drive.connect(r.input);
      r.output.connect(this.stemOut[i]);
      this.stemDjFx[i] = r;
    }
    return r;
  }

  // true when at least one DJ effect is engaged on stem i
  hasStemDjFx(i: number): boolean {
    const r = this.stemDjFx[i];
    return !!r && FX_LIST.some((fx) => r.getWet(fx.id) > 0);
  }

  private clearAllStemFxTargets() {
    for (const i of Array.from(this.stemFxTargets)) this.toggleStemFxTarget(i);
  }

  // every stem back to a dry sound: filter, drive, reverb/delay sends, DJ FX, Rack routing
  resetStemFx() {
    for (let i = 0; i < this.stemFilter.length; i++) {
      this.setStemFilter(i, 0);
      this.setStemDrive(i, 0);
      this.setStemReverbSend(i, 0);
      this.setStemDelaySend(i, 0);
      this.stemDjFx[i]?.resetAll();
    }
    this.clearAllStemFxTargets();
  }

  // whether any stem effect is on (drives the FX OFF button)
  get hasStemFx(): boolean {
    return (
      this.stemFilterX.some((x) => Math.abs(x) > 0.01) ||
      this.stemDriveAmt.some((v) => v > 0.01) ||
      this.stemReverbSend.some((v) => v > 0.01) ||
      this.stemDelaySend.some((v) => v > 0.01) ||
      this.stemFxTargets.size > 0 ||
      this.stemDjFx.some((_, i) => this.hasStemDjFx(i))
    );
  }

  // ---- shared per-stem Reverb/Delay sends (see field comments above) ----
  setStemReverbSend(i: number, v: number) {
    if (i < 0 || i >= this.stemReverbSendGain.length) return;
    this.stemReverbSend[i] = Math.min(1, Math.max(0, v));
    this.stemReverbSendGain[i].gain.value = this.stemReverbSend[i] * 0.9 * (this.stemFxVol[i] ?? 0.4); // headroom
  }
  setStemDelaySend(i: number, v: number) {
    if (i < 0 || i >= this.stemDelaySendGain.length) return;
    this.stemDelaySend[i] = Math.min(1, Math.max(0, v));
    this.stemDelaySendGain[i].gain.value = this.stemDelaySend[i] * 0.8 * (this.stemFxVol[i] ?? 0.4);
  }
  // level of one stem's reverb and delay returns, 0..1
  setStemFxVol(i: number, v: number) {
    if (i < 0 || i >= this.stemFxVol.length) return;
    this.stemFxVol[i] = Math.min(1, Math.max(0, v));
    this.setStemReverbSend(i, this.stemReverbSend[i] ?? 0);
    this.setStemDelaySend(i, this.stemDelaySend[i] ?? 0);
  }

  setStemReverbDecay(sec: number) {
    this.stemReverbConv.buffer = makeReverbImpulse(this.ctx, Math.min(6, Math.max(0.3, sec)));
  }
  setStemDelayTime(sec: number) {
    this.stemDelayNode.delayTime.value = Math.min(1.5, Math.max(0.02, sec));
  }
  setStemDelayFeedback(v: number) {
    this.stemDelayFb.gain.value = Math.min(0.9, Math.max(0, v));
  }

  // ---- dedicated per-stem FX (see field comments above) — always live,
  // no targeting step: turning the knob IS the effect ----
  // bipolar filter: -1..0 = lowpass sweep, 0 = bypass, 0..1 = highpass sweep
  // (same curve as the whole-deck setFilter, just one instance per stem)
  setStemFilter(i: number, x: number) {
    if (i < 0 || i >= this.stemFilter.length) return;
    this.stemFilterX[i] = x;
    applyStemFilter(this.stemFilter[i], x);
  }
  setStemDrive(i: number, amt: number) {
    if (i < 0 || i >= this.stemDrive.length) return;
    const v = Math.min(1, Math.max(0, amt));
    this.stemDriveAmt[i] = v;
    this.stemDrive[i].curve = driveCurve(v);
  }

  // Automatic makeup gain on the stem bus. Treating stems as roughly
  // uncorrelated, total power ≈ Σ v_i². With every fader at 1 that's N (the full
  // mix); as faders drop we scale the bus by √(N / Σv_i²) so the perceived level
  // stays stable. Boost-only and capped at +12 dB so near-silence can't blow up.
  private recomputeStemMakeup() {
    if (!this.stemBus) return;
    const n = this.stemVol.length;
    if (!this.stemMakeup || n === 0) {
      this.stemBus.gain.setTargetAtTime(1, this.ctx.currentTime, 0.03);
      return;
    }
    let power = 0;
    for (const v of this.stemVol) power += v * v;
    const makeup = power > 1e-4 ? Math.sqrt(n / power) : 1;
    this.stemBus.gain.setTargetAtTime(Math.min(4, Math.max(1, makeup)), this.ctx.currentTime, 0.03); // ≤ +12 dB, never cut
  }

  // toggle the auto makeup gain (and reapply / reset the bus immediately)
  setStemMakeup(on: boolean) {
    this.stemMakeup = on;
    this.recomputeStemMakeup();
  }

  // toggle stem playback on/off, seamlessly if currently playing
  setStemsActive(on: boolean) {
    this.stemsWanted = on; // remembers intent across the next track loaded here
    if (on && !this.stemReady) return;
    if (on === this.stemsActive) return;
    const resume = this._playing;
    if (resume) this.pause(); // captures position into pausedAt
    this.stemsActive = on;
    if (resume) this.play();
  }

  // separate the loaded track into stems (count per the chosen model) via the
  // server, fetch + decode them. Idempotent; updates stemStatus throughout.
  async ensureStems(): Promise<void> {
    if (this.stemReady) {
      this.stemStatus = "ready";
      return;
    }
    // prepared in advance: straight from the cache (allowed while playing, nothing is computed)
    if (this.preparedHash && this.stemCached && (await this.loadPreparedStems())) return;
    if (!this.stemCached && !this.playbackGate()) {
      this.stemStatus = "blocked";
      return;
    }
    if (!this.rawBlob) {
      this.stemStatus = "error";
      return;
    }
    if (this._streamOnly) {
      this.stemStatus = "error"; // a long track is never decoded, so its stems can't be either
      return;
    }
    this.stemStatus = "working";
    const model = this.stemModel;
    const gen = this.loadGen;
    try {
      const stemOpts = this.stemOptsQS();
      // the /separate POST below blocks server-side until the whole Demucs run
      // finishes, so progress has to come from a side-channel poll — compute
      // the content hash ourselves (matches the server's hashBytes()) so we
      // can start polling immediately, without waiting on that response.
      const hash = await sha1Hex16(await this.rawBlob.arrayBuffer());
      if (this.loadGen === gen) this.pollStemProgress(hash, model, gen);
      const res = await fetch(`/api/stems/separate?model=${model}${stemOpts}`, {
        method: "POST",
        body: this.rawBlob,
      });
      if (!res.ok) throw new Error(await res.text());
      const { stems } = (await res.json()) as { hash: string; stems: string[] };
      // user may have swapped tracks or the model/quality while we were separating — bail if so
      if (this.loadGen !== gen || this.stemModel !== model) return;
      const bufs = await Promise.all(
        stems.map(async (n) => {
          const r = await fetch(`/api/stems/${hash}/${n}?model=${model}${stemOpts}`);
          if (!r.ok) throw new Error(`stem ${n}: ${r.status}`);
          return this.ctx.decodeAudioData(await r.arrayBuffer());
        })
      );
      if (this.loadGen !== gen || this.stemModel !== model) return;
      this.installStems(stems, bufs, hash);
    } catch (e) {
      if (this.loadGen === gen) this.stemStatus = "error"; // a newer track's own status shouldn't be clobbered
      console.error("[stems]", e);
    } finally {
      if (this.loadGen === gen) this.stopStemProgressPoll();
    }
  }

  get effectiveBPM() {
    return this.bpm ? Math.round(this.bpm * this.rate * 10) / 10 : 0;
  }

  // current pitch as a percentage (-x..+x), inverse of setPitch
  get pitchPct() {
    return (this.rate - 1) * 100;
  }

  get fxRack(): FXRack { return this.fx; }
  // current playback rate (tempo × scratch), for tools that follow the deck
  get playRate(): number { return this.effRate; }
  // active deck loop as [start, end] in track seconds, or null
  get loopRange(): [number, number] | null { return this.loopActive ? [this.loopStart, this.loopEnd] : null; }
  // post-fader output of stem i, to listen to it (e.g. the drums for a sidechain)
  stemTap(i: number): AudioNode | null { return this.stemOut[i] ?? null; }
  get retouchFx(): Retouch { return this.retouch; }

  public fxClock(): ClockInfo | null {
    if (!this.bpm || !this.rate) return null;
    const spb = 60 / this.bpm;
    const rel = (((this.position() - this.beatGridOffset) % spb) + spb) % spb;
    return {
      bpm: this.bpm * this.rate,
      toNextBeat: this._playing ? (spb - rel) / this.rate : 0,
      nextBeat: Math.floor((this.position() - this.beatGridOffset) / spb) + 1,
      playing: this._playing
    };
  }

  // Pump the stems on the beat (sidechain feel): every stem but the drums dips to
  // (1 - depth) on each beat and comes back over releaseBeats, so the kick stays punchy.
  // Scheduled on the audio clock, looking ahead a quarter second.
  setStemPump(on: boolean, depth = 0.8, releaseBeats = 0.5): void {
    if (this.pumpTimer) {
      clearInterval(this.pumpTimer);
      this.pumpTimer = null;
    }
    const now = this.ctx.currentTime;
    for (const o of this.stemOut) {
      o.gain.cancelScheduledValues(now);
      o.gain.setValueAtTime(1, now);
    }
    this.pumpLast = -1;
    if (!on) return;
    this.pumpTimer = setInterval(() => {
      const c = this.fxClock();
      if (!c || !c.playing) return;
      const spb = 60 / c.bpm;
      const t0 = this.ctx.currentTime;
      const horizon = t0 + 0.25;
      let t = t0 + c.toNextBeat;
      while (t < horizon) {
        if (t > this.pumpLast + spb * 0.5) {
          this.stemNames.forEach((name, i) => {
            if (name === "drums" || !this.stemOut[i]) return;
            const g = this.stemOut[i].gain;
            g.setValueAtTime(1 - depth, t);
            g.linearRampToValueAtTime(1, t + releaseBeats * spb);
          });
          this.pumpLast = t;
        }
        t += spb;
      }
    }, 50);
  }

  // FX rack — each effect has an independent wet level (0..1)
  setFxWet(name: FxName, v: number) {
    this.fx.setWet(name, v);
  }
  // p1 / p2 of an effect (e.g. sweep position), exposed for the dance tools
  setFxParam(name: FxName, key: "p1" | "p2", v: number) {
    this.fx.setParam(name, key, v);
  }
  // beat division of a tempo-synced effect (index in BEAT_DIVS)
  setFxBeat(name: FxName, idx: number) {
    this.fx.setBeat(name, idx);
  }
  getFxWet(name: FxName): number {
    return this.fx.getWet(name);
  }

  // beat loop of n beats from current position
  setBeatLoop(beats: number) {
    if (!this.buffer || !this.bpm) return;
    const secPerBeat = 60 / this.bpm;
    const rawStart = this.position();
    const start = this.quantize ? this.snapToBeat(rawStart) : rawStart;
    this.loopStart = start;
    this.loopEnd = Math.min(start + secPerBeat * beats, this.duration);
    this.loopActive = true;
    if (this._playing) {
      this.stopSources();
      this.pausedAt = start;
      this._playing = false;
      this.play();
    }
  }

  // loop over an explicit passage [from, to] in seconds (e.g. the waveform selection)
  setLoopRange(from: number, to: number) {
    if (!this.buffer) return;
    const start = Math.max(0, Math.min(from, to));
    const end = Math.min(this.duration, Math.max(from, to));
    if (!(end - start > 0.01)) return;
    this.loopStart = start;
    this.loopEnd = end;
    this.loopActive = true;
    if (this._playing) {
      this.stopSources();
      this.pausedAt = start;
      this._playing = false;
      this.play();
    } else {
      this.pausedAt = start;
    }
  }

  clearLoop() {
    if (!this.loopActive) return;
    const pos = this.position();
    this.loopActive = false;
    if (this._playing) {
      this.stopSources();
      this.pausedAt = pos;
      this._playing = false;
      this.play();
    }
  }

  // beat loop of n beats on ONE stem, from its current position — the other
  // stems keep playing untouched. Mutates the live AudioBufferSourceNode
  // directly (Web Audio allows changing loop/loopStart/loopEnd mid-playback),
  // so there's no stop/restart click and no risk of desyncing the other stems.
  // opts.quantize (default true) snaps the loop-in point to the nearest beat
  // instead of the exact click position, for a cleaner capture.
  // Returns whether the loop actually engaged — false on every silent-no-op
  // guard below (stems off, not ready, BPM unknown, bad index). The panel uses
  // this to decide whether to show the loop as active, instead of assuming a
  // click always "took" (see stemLoopBeatsVal comment above).
  setStemBeatLoop(i: number, beats: number, opts?: { quantize?: boolean; start?: number }): boolean {
    if (!this.stemsActive || !this.stemReady || !this.bpm) return false;
    if (i < 0 || i >= this.stemGains.length) return false;
    const secPerBeat = 60 / this.bpm;
    const rawStart = this.position();
    let start = opts?.start !== undefined
      ? Math.max(0, opts.start)
      : (opts?.quantize ?? true)
        ? Math.max(0, Math.round((rawStart - this.beatGridOffset) / secPerBeat) * secPerBeat + this.beatGridOffset)
        : rawStart;
    // at the very end of the track there is no room left for the loop: take the last bars instead
    start = Math.max(0, Math.min(start, this.duration - secPerBeat * beats));
    const end = Math.min(start + secPerBeat * beats, this.duration);
    this.stemLoopActive[i] = true;
    this.stemLoopStart[i] = start;
    this.stemLoopEnd[i] = end;
    this.stemLoopBeatsVal[i] = beats;
    this.stemLoopWrapCount[i] = 0;
    const src = this.activeSources[i];
    if (src) {
      src.loopStart = start;
      src.loopEnd = end;
      src.loop = true;
    }
    this.scheduleStemLoopWrap(i);
    return true;
  }

  clearStemLoop(i: number) {
    if (i < 0 || i >= this.stemGains.length) return;
    this.stemLoopBeatsVal[i] = null;
    if (!this.stemLoopActive[i]) return;
    this.stemLoopActive[i] = false;
    this.clearStemLoopTimer(i);
    const src = this.activeSources[i];
    if (src) src.loop = false;
    // restore full volume in case the loop was cleared mid-fade
    const g = this.stemGains[i];
    if (g) {
      g.gain.cancelScheduledValues(this.ctx.currentTime);
      g.gain.value = this.stemVol[i] ?? 1;
    }
    this.resyncStem(i);
  }

  // every stem loop off, each stem back in place
  clearAllStemLoops() {
    for (let i = 0; i < this.stemLoopActive.length; i++) this.clearStemLoop(i);
  }

  // Slip: once a stem loop is released, restart that stem at the deck's timeline position
  // so it plays in time with the other stems again (a 10 ms dip hides the jump).
  private resyncStem(i: number) {
    const old = this.activeSources[i];
    const buf = this.stemBuffers[i];
    if (!this._playing || !this.stemsActive || !old || !buf) return;
    const DIP = 0.01;
    const now = this.ctx.currentTime;
    const when = now + DIP;
    let pos = this.startOffset + (when - this.startCtxTime) * this.effRate;
    if (this.loopActive && pos >= this.loopEnd) {
      const len = this.loopEnd - this.loopStart;
      pos = this.loopStart + ((pos - this.loopStart) % len);
    }
    if (pos >= this.duration - 0.02) return;
    const src = this.buildSource(buf, this.stemGains[i], i === 0, i);
    src.start(when, pos);
    old.onended = () => old.disconnect();
    try {
      old.stop(when);
    } catch {
      /* already stopped */
    }
    this.activeSources[i] = src;
    const g = this.stemGains[i].gain;
    const base = this.stemVol[i] ?? 1;
    g.cancelScheduledValues(now);
    g.setValueAtTime(base, now);
    g.linearRampToValueAtTime(0, when);
    g.linearRampToValueAtTime(base, when + DIP);
  }

  // halve/double the CURRENT loop length live, keeping the same start point —
  // the classic loop-resize gesture (½ / ×2) on real DJ hardware. Returns
  // whether it actually resized (false if no loop is active on this stem).
  resizeStemLoop(i: number, factor: 0.5 | 2): boolean {
    if (i < 0 || i >= this.stemGains.length || !this.stemLoopActive[i]) return false;
    const start = this.stemLoopStart[i];
    const newLen = Math.max(0.01, (this.stemLoopEnd[i] - start) * factor);
    const end = Math.min(start + newLen, this.duration);
    this.stemLoopEnd[i] = end;
    if (this.stemLoopBeatsVal[i] != null) this.stemLoopBeatsVal[i] = this.stemLoopBeatsVal[i]! * factor;
    this.stemLoopWrapCount[i] = 0;
    const src = this.activeSources[i];
    if (src) src.loopEnd = end;
    this.scheduleStemLoopWrap(i);
    return true;
  }

  // Returns current loop position (0-1) and wrap count
  stemLoopStatus(i: number): { phase: number; wraps: number; start: number; end: number } | null {
    if (i < 0 || i >= Deck.STEM_MAX) return null;
    if (!this.stemLoopActive[i]) return null;
    const start = this.stemLoopStart[i];
    const len = this.stemLoopEnd[i] - start;
    if (!(len > 0)) return null;
    const phase = ((((this.position() - start) % len) + len) % len) / len;
    return { phase, wraps: this.stemLoopWrapCount[i] ?? 0, start, end: this.stemLoopEnd[i] };
  }

  // Shifts loop window by given beats while keeping length
  shiftStemLoop(i: number, beats: number): boolean {
    if (i < 0 || i >= this.stemGains.length) return false;
    if (!this.stemLoopActive[i] || !this.bpm) return false;
    const len = this.stemLoopEnd[i] - this.stemLoopStart[i];
    const delta = beats * (60 / this.bpm);
    const start = Math.max(0, Math.min(this.stemLoopStart[i] + delta, this.duration - len));
    const end = start + len;
    const forward = start > this.stemLoopStart[i];
    this.stemLoopStart[i] = start;
    this.stemLoopEnd[i] = end;
    this.stemLoopWrapCount[i] = 0;
    const src = this.activeSources[i];
    if (src) {
      if (forward) {
        src.loopEnd = end;
        src.loopStart = start;
      } else {
        src.loopStart = start;
        src.loopEnd = end;
      }
    }
    this.scheduleStemLoopWrap(i);
    return true;
  }

  // "smooth" loop boundary: a short fade-to-silence-and-back centred on every
  // loop seam so successive repeats don't click/thump. 0 = off (hard cut).
  setStemLoopSmooth(i: number, ms: number) {
    if (i < 0 || i >= Deck.STEM_MAX) return;
    this.stemLoopSmoothMs[i] = Math.max(0, Math.min(80, ms));
    if (this.stemLoopActive[i]) this.scheduleStemLoopWrap(i);
  }

  // "Roll" mode: after `repeats` wraps the loop releases itself and the stem
  // continues on naturally from wherever the track would be — as opposed to
  // "Lock" (repeats = null), which stays looped until manually cleared.
  setStemLoopRoll(i: number, repeats: number | null) {
    if (i < 0 || i >= Deck.STEM_MAX) return;
    this.stemLoopRollAt[i] = repeats;
  }

  // Snapshot the current loop configuration of stem `i` so it can be saved in presets/library
  // per-stem waveform peaks, cached per decoded buffer (freed together with it)
  private stemPeakCache = new WeakMap<AudioBuffer, Float32Array>();
  getStemPeaks(i: number): Float32Array | null {
    const buf = this.stemBuffers[i];
    if (!buf) return null;
    let peaks = this.stemPeakCache.get(buf);
    if (!peaks) {
      peaks = buildWaveformPeaks(buf, 1200);
      this.stemPeakCache.set(buf, peaks);
    }
    return peaks;
  }

  getStemLoopState(i: number): { active: boolean; beats: number | null; start: number; end: number; smoothMs: number; rollAt: number | null } | null {
    if (i < 0 || i >= Deck.STEM_MAX) return null;
    return {
      active: !!this.stemLoopActive[i],
      beats: this.stemLoopBeatsVal[i] ?? null,
      start: this.stemLoopStart[i] ?? 0,
      end: this.stemLoopEnd[i] ?? 0,
      smoothMs: this.stemLoopSmoothMs[i] ?? 10,
      rollAt: this.stemLoopRollAt[i] ?? null,
    };
  }

  // Recall and engage a saved loop for stem `i`
  recallStemLoop(i: number, saved: { beats?: number | null; start?: number; end?: number; smoothMs?: number; rollAt?: number | null }): boolean {
    if (!this.stemsActive || !this.stemReady || i < 0 || i >= this.stemGains.length) return false;
    if (saved.smoothMs !== undefined) this.stemLoopSmoothMs[i] = saved.smoothMs;
    if (saved.rollAt !== undefined) this.stemLoopRollAt[i] = saved.rollAt;

    if (saved.beats != null && this.bpm) {
      return this.setStemBeatLoop(i, saved.beats);
    } else if (saved.start !== undefined && saved.end !== undefined && saved.end > saved.start) {
      this.stemLoopActive[i] = true;
      this.stemLoopStart[i] = saved.start;
      this.stemLoopEnd[i] = saved.end;
      this.stemLoopBeatsVal[i] = saved.beats ?? null;
      this.stemLoopWrapCount[i] = 0;
      const src = this.activeSources[i];
      if (src) {
        src.loopStart = saved.start;
        src.loopEnd = saved.end;
        src.loop = true;
      }
      this.scheduleStemLoopWrap(i);
      return true;
    }
    return false;
  }

  private clearStemLoopTimer(i: number) {
    const t = this.stemLoopWrapTimer[i];
    if (t) {
      clearTimeout(t);
      this.stemLoopWrapTimer[i] = null;
    }
  }

  // precisely schedules the NEXT loop-wrap instant for stem `i` (via a
  // recursively-recomputed setTimeout, so no drift accumulates), and at that
  // instant applies the smoothing duck and/or counts toward Roll release.
  // Schedules the next loop seam for stem `i`. The smoothing duck is scheduled on the
  // AUDIO clock at the exact seam instant; the setTimeout only wakes up early to queue
  // it, so timer jitter (busy CPU, separation running) cannot move the dip off the loop
  // point. Seam bookkeeping (count, Roll release) runs once the seam has passed.
  private scheduleStemLoopWrap(i: number) {
    this.clearStemLoopTimer(i);
    if (!this.stemLoopActive[i] || !this._playing) return;
    const start = this.stemLoopStart[i];
    const len = (this.stemLoopEnd[i] - start) / Math.max(0.01, this.effRate);
    if (!(len > 0) || !isFinite(len)) return;
    const posNow = this.startOffset + (this.ctx.currentTime - this.startCtxTime) * this.effRate;
    const sinceStart = Math.max(0, posNow - start);
    const untilWrapSec = len - (sinceStart % len);
    const seamAt = this.ctx.currentTime + untilWrapSec; // audio-clock instant of the seam
    const smoothMs = this.stemLoopSmoothMs[i] ?? 0;
    const fadeSec = Math.min(untilWrapSec * 0.9, smoothMs / 1000);
    const WAKE_AHEAD = 0.15; // seconds before the seam at which the timer queues the duck
    const wakeInMs = Math.max(0, (untilWrapSec - WAKE_AHEAD) * 1000);
    this.stemLoopWrapTimer[i] = setTimeout(() => {
      if (!this.stemLoopActive[i]) return;
      if (fadeSec > 0.0005) {
        const g = this.stemGains[i];
        const base = this.stemVol[i] ?? 1;
        const now = this.ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.setValueAtTime(base, Math.max(now, seamAt - fadeSec / 2));
        g.gain.linearRampToValueAtTime(0, seamAt);
        g.gain.linearRampToValueAtTime(base, seamAt + fadeSec / 2);
      }
      const afterMs = Math.max(0, (seamAt - this.ctx.currentTime) * 1000 + 5);
      this.stemLoopWrapTimer[i] = setTimeout(() => {
        if (!this.stemLoopActive[i]) return;
        this.stemLoopWrapCount[i]++;
        const rollAt = this.stemLoopRollAt[i];
        if (rollAt != null && this.stemLoopWrapCount[i] >= rollAt) {
          this.clearStemLoop(i); // Roll: release — the stem continues naturally
          return;
        }
        this.scheduleStemLoopWrap(i);
      }, afterMs);
    }, wakeInMs);
  }

  get hasLoop() {
    return this.loopActive;
  }

  // whole-track repeat toggle (the song restarts automatically at the end)
  toggleRepeat(): boolean {
    this.repeat = !this.repeat;
    return this.repeat;
  }

  // copy a slice of ONE isolated stem from the current position (or active loop)
  // into an AudioBuffer — lets the sampler or exporter grab isolated stems
  captureStemSlice(stemIdx: number, beats = 4): AudioBuffer | null {
    if (!this.stemReady || stemIdx < 0 || stemIdx >= this.stemBuffers.length) return null;
    const stemBuf = this.stemBuffers[stemIdx];
    if (!stemBuf) return null;

    const secPerBeat = this.bpm ? 60 / this.bpm : 0.5;
    let startSec = this.position();
    let durSec = secPerBeat * beats;

    // If this stem is actively looping, grab the exact active loop window
    if (this.stemLoopActive[stemIdx]) {
      startSec = this.stemLoopStart[stemIdx];
      durSec = Math.max(0.05, this.stemLoopEnd[stemIdx] - startSec);
    }

    const sr = stemBuf.sampleRate;
    const startSample = Math.max(0, Math.floor(startSec * sr));
    const len = Math.min(Math.floor(durSec * sr), stemBuf.length - startSample);
    if (len <= 0) return null;

    const ch = stemBuf.numberOfChannels;
    const out = this.ctx.createBuffer(ch, len, sr);
    for (let c = 0; c < ch; c++) {
      const src = stemBuf.getChannelData(c);
      const dst = out.getChannelData(c);
      for (let i = 0; i < len; i++) dst[i] = src[startSample + i] || 0;
    }
    return out;
  }

  // copy a slice of the loaded track from the current position into a new
  // buffer — used by the sampler to "grab" a chunk of the playing song.
  captureSlice(beats = 4): AudioBuffer | null {
    if (!this.buffer) return null;
    const secPerBeat = this.bpm ? 60 / this.bpm : 0.5;
    const dur = Math.min(secPerBeat * beats, 4);
    const sr = this.buffer.sampleRate;
    const startSample = Math.floor(this.position() * sr);
    const len = Math.min(Math.floor(dur * sr), this.buffer.length - startSample);
    if (len <= 0) return null;
    const ch = this.buffer.numberOfChannels;
    const out = this.ctx.createBuffer(ch, len, sr);
    for (let c = 0; c < ch; c++) {
      const src = this.buffer.getChannelData(c);
      const dst = out.getChannelData(c);
      for (let i = 0; i < len; i++) dst[i] = src[startSample + i] || 0;
    }
    return out;
  }

  // hard clear: stop playback, drop the loaded track entirely (so the deck is
  // "— vide —" again) and return every control to neutral. Per-deck PANIC.
  // stop every timer and source of this deck so a replaced engine can be garbage-collected
  dispose() {
    this.setStemPump(false);
    this.stopStemProgressPoll();
    for (let i = 0; i < this.stemLoopWrapTimer.length; i++) this.clearStemLoopTimer(i);
    this.stopSources();
    this.cleanupMediaEl();
    this.fx.dispose();
    for (const r of this.stemDjFx) r?.dispose();
  }

  unload() {
    this.hotCues = [null, null, null, null];
    this.cleanupMediaEl();
    this.stopSources();
    this._playing = false;
    this.buffer = null;
    this.name = "";
    this.duration = 0;
    this.bpm = 0;
    this.key = null;
    this.peaks = new Float32Array(0);
    this.cuePoint = 0;
    this.pausedAt = 0;
    this.startOffset = 0;
    this.loopActive = false;
    this.sourceLink = "";
    this.coverArt = "";
    this._streamOnly = false;
    this.rawBlob = null;
    this.origin = null;
    this.clearStems();
    this.loadGen++;
    this.reset();
  }

  // reset every control to neutral but keep the loaded buffer and playback going
  reset() {
    this.setTrim(1);
    this.setVolume(1);
    this.setEQ("low", 0);
    this.setEQ("mid", 0);
    this.setEQ("high", 0);
    this.keyShift = 0;
    this.setFilter(0);
    this.setPitch(0);
    this.scratch(0);
    this.clearLoop();
    this.repeat = false;
    this.fx.resetAll();
    this.retouch.reset();
  }

  eqDb(band: "low" | "mid" | "high"): number {
    return this[band].gain.value;
  }

  // capture the current mixer/FX state so it can be stored with a track
  getSettings(): DeckSettings {
    const fx: Partial<Record<FxName, number>> = {};
    const fxp: Partial<Record<FxName, { beat: number; p1: number; p2: number }>> = {};
    for (const m of FX_LIST) {
      fx[m.id] = this.fx.getWet(m.id);
      fxp[m.id] = { beat: this.fx.getBeat(m.id), p1: this.fx.getParam(m.id, "p1"), p2: this.fx.getParam(m.id, "p2") };
    }
    return {
      trim: this.trim.gain.value,
      volume: this.volume.gain.value,
      low: this.low.gain.value,
      mid: this.mid.gain.value,
      high: this.high.gain.value,
      filter: this.filterX,
      pitch: this.pitchPct,
      fx,
      fxp,
      rack: this.rack.export(),
      retouch: this.retouch.export(),
      hot: [...this.hotCues],
    };
  }

  // restore a previously captured state
  applySettings(s: DeckSettings) {
    this.setTrim(s.trim);
    this.setVolume(s.volume);
    this.setEQ("low", s.low);
    this.setEQ("mid", s.mid);
    this.setEQ("high", s.high);
    this.setFilter(s.filter);
    this.setPitch(s.pitch);
    for (const m of FX_LIST) {
      const p = s.fxp?.[m.id];
      if (p) {
        this.fx.setBeat(m.id, p.beat);
        this.fx.setParam(m.id, "p1", p.p1);
        this.fx.setParam(m.id, "p2", p.p2);
      }
      if (typeof s.fx[m.id] === "number") this.setFxWet(m.id, s.fx[m.id] as number);
    }
    if (s.rack) this.rack.import(s.rack);
    if (s.retouch) this.retouch.import(s.retouch);
    if (Array.isArray(s.hot)) this.hotCues = [0, 1, 2, 3].map((k) => (typeof s.hot?.[k] === "number" ? (s.hot[k] as number) : null));
  }

  getLevel(): number {
    const arr = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(arr);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    return sum / (arr.length * 255);
  }

  // live spectrum for the spectral view
  get fftBins(): number {
    return this.analyser.frequencyBinCount;
  }
  getSpectrum(arr: Uint8Array<ArrayBuffer>) {
    this.analyser.getByteFrequencyData(arr);
  }

  // time-domain samples for the oscilloscope view
  get fftSize(): number {
    return this.analyser.fftSize;
  }
  getWaveform(arr: Uint8Array<ArrayBuffer>) {
    this.analyser.getByteTimeDomainData(arr);
  }
}
