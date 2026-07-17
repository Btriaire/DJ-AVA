import { detectBPM, buildWaveformPeaks } from "./bpm";
import { detectKey, KeyResult } from "./key";
import { FXRack, FxName } from "./FXRack";
import { Rack, RackPreset } from "./Rack";

// synthesized white-noise impulse response for the shared per-stem reverb
// send bus — same technique as the Rack's own "reverb" module.
function makeReverbImpulse(ctx: AudioContext, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * decay));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  }
  return buf;
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
  rack?: RackPreset; // serial DSP rack state (optional: old saves won't have it)
}

// One DJ deck: load -> trim -> 3-band EQ -> filter -> (dry + delay FX) -> volume -> output.
export class Deck {
  readonly ctx: AudioContext;
  readonly output: GainNode; // connect this to the mixer channel

  private buffer: AudioBuffer | null = null;
  private rawData: ArrayBuffer | null = null; // kept so we can ship the track to the stem separator
  private activeSources: AudioBufferSourceNode[] = []; // 1 in normal mode, N in stem mode

  // ---------- streaming fast-path (phase 1 of two-phase loading) ----------
  // While a long file is being decoded in the background, a MediaElementSource
  // lets the browser stream/play it immediately through the same effects chain.
  // Once decodeAudioData + peak/BPM analysis finishes the source hot-swaps to
  // the full AudioBuffer so scratch/loop/every feature works normally (phase 2).
  private mediaEl: HTMLAudioElement | null = null;
  private mediaElSrc: MediaElementAudioSourceNode | null = null;
  // true while we're in phase 1 (streaming preview, full decode still in flight)
  private _bufferLoading = false;
  get bufferLoading(): boolean { return this._bufferLoading; }

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
  private stemBuffers: (AudioBuffer | null)[] = []; // length === stemNames.length when loaded
  private stemGains: GainNode[] = []; // STEM_MAX gains, all summed into stemBus
  private stemAnalysers: AnalyserNode[] = []; // per-stem level taps for the LED meters
  private stemMeterBuf = new Float32Array(256); // reusable scratch for RMS reads
  private stemEnv: number[] = []; // smoothed per-stem meter level (VU-style ballistics)
  private stemBus!: GainNode; // sum of the stem gains, carries the makeup gain
  stemMakeup = true; // auto-compensate level when stem faders are pulled down
  stemNames: string[] = []; // active stem labels (drives the fader count)
  stemModel: "htdemucs" | "htdemucs_ft" | "htdemucs_6s" = "htdemucs";
  stemUltra = false; // extra-precision Demucs pass (shifts≥2, overlap 0.25) — several× slower
  stemLossless = false; // cache/serve stems as WAV instead of MP3
  stemDenoiseVocals = false; // ffmpeg noise-reduction pass on the vocals stem
  stemsActive = false; // play the stems (with per-stem gain) instead of the full mix
  // sticks across track loads (unlike stemsActive, which clearStems() resets) so
  // that once a DJ turns stems on for a deck, every track queued into it next —
  // e.g. the "cued" side during an A→B→A relay — gets separated ahead of time
  // instead of waiting for a STEMS click after it's already live
  stemsWanted = false;
  stemVol: number[] = []; // one entry per active stem
  stemStatus: "none" | "prefetching" | "working" | "ready" | "error" = "none";
  stemCached = false; // server already has the stems on disk -> loading is instant
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
  private stemReverbSendGain: GainNode[] = [];
  private stemDelaySendGain: GainNode[] = [];
  private stemReverbConv!: ConvolverNode;
  private stemReverbReturn!: GainNode;
  private stemDelayNode!: DelayNode;
  private stemDelayFb!: GainNode;
  private stemDelayReturn!: GainNode;

  private trim: GainNode;
  private low: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private high: BiquadFilterNode;
  private filter: BiquadFilterNode;
  private fx: FXRack;
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

  // metadata
  name = "";
  duration = 0;
  bpm = 0;
  key: KeyResult | null = null; // musical key + Camelot notation, for harmonic mixing
  peaks: Float32Array = new Float32Array(0);
  cuePoint = 0;
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
  private stemLoopActive: boolean[] = [];
  private stemLoopStart: number[] = [];
  private stemLoopEnd: number[] = [];
  private stemLoopWrapTimer: (ReturnType<typeof setTimeout> | null)[] = [];
  private stemLoopWrapCount: number[] = []; // wraps seen since engagement — drives Roll mode
  // public so the UI can read/adjust these live, per stem
  stemLoopSmoothMs: number[] = []; // 0..80ms fade applied right at each loop seam ("smooth" boundary)
  stemLoopRollAt: (number | null)[] = []; // auto-release after N wraps; null = stays locked until cleared
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

    this.fx = new FXRack(ctx);
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
      g.connect(this.stemBus);
      // post-fader tap for the per-stem LED meter (analyser doesn't forward audio)
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.6;
      g.connect(an);
      this.stemGains.push(g);
      this.stemAnalysers.push(an);
      this.stemEnv.push(0);

      const rSend = C();
      rSend.gain.value = 0;
      g.connect(rSend);
      rSend.connect(this.stemReverbConv);
      this.stemReverbSendGain.push(rSend);
      this.stemReverbSend.push(0);

      const dSend = C();
      dSend.gain.value = 0;
      g.connect(dSend);
      dSend.connect(this.stemDelayNode);
      this.stemDelaySendGain.push(dSend);
      this.stemDelaySend.push(0);

      this.stemLoopWrapTimer.push(null);
      this.stemLoopWrapCount.push(0);
      this.stemLoopSmoothMs.push(10); // a light 10ms fade by default — on, but subtle
      this.stemLoopRollAt.push(null); // Lock by default (no auto-release)
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

    // signal chain: trim -> autotune -> EQ -> filter -> FX -> volume -> crowd -> analyser -> out
    this.trim.connect(this.autotuneIn);
    this.autotuneOut.connect(this.low);
    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.filter);
    this.filter.connect(this.fx.input);
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

  async load(file: File | ArrayBuffer, name: string) {
    const data = file instanceof File ? await file.arrayBuffer() : file;
    this.rawData = data.slice(0); // keep a pristine copy for stem separation
    const buf = await this.ctx.decodeAudioData(data.slice(0));
    this.cleanupMediaEl(); // cancel any in-progress streaming phase
    this.stopSources(); // kill any lingering playback (incl. orphaned stems) first
    this._playing = false;
    this.buffer = buf;
    this.clearStems();
    this.name = name;
    this.duration = buf.duration;
    this.peaks = buildWaveformPeaks(buf);
    this.bpm = detectBPM(buf);
    this.key = detectKey(buf);
    this.pausedAt = 0;
    this.cuePoint = 0;
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
    this.clearStems();

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
    this.key = detectKey(buf);
    this.pausedAt = Math.min(Math.max(0, pos), buf.duration - 0.05);
    this._playing = false;
    if (wasPlaying) this.play();
  }

  loadStreaming(blob: Blob, name: string) {
    const el = new Audio();
    el.src = URL.createObjectURL(blob);
    const onEnded = () => {
      if (this.mediaEl === el) {
        this._playing = false;
        this.pausedAt = 0;
        if (this.repeat && this.buffer) this.play();
      }
    };
    this._streamSetup(el, name, onEnded);

    // Phase 2 in background: decode + analysis → hot-swap.
    // We need rawData (for stems) AND an ArrayBuffer for decodeAudioData.
    // decodeAudioData *transfers* (detaches) the buffer it receives, so we keep
    // a slice for rawData and give a second slice to the decoder — but for very
    // large files two full copies fit easily since the blob was already in RAM.
    // The capture guard (el === this.mediaEl) drops the result if a new track was
    // loaded before decoding finished, preventing a stale swap.
    const capturedEl = el;
    blob.arrayBuffer().then((raw) => {
      if (capturedEl !== this.mediaEl) return null; // superseded load, drop it
      this.rawData = raw.slice(0); // keep a copy; decodeAudioData detaches its arg
      if (this.stemsWanted) void this.prefetchStems(); // prep in the background — this deck was using stems
      return this.ctx.decodeAudioData(raw);
    }).then((buf) => {
      if (!buf || capturedEl !== this.mediaEl) return; // superseded
      const pos = this.mediaEl?.currentTime ?? 0;
      const wasPlaying = this._playing;
      this._streamSwap(buf, pos, wasPlaying);
    }).catch((e) => {
      console.error("[deck] background decode failed", (e as Error).message);
      if (capturedEl === this.mediaEl) this._bufferLoading = false;
    });
  }

  loadStreamingUrl(url: string, name: string) {
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.src = url;
    const onEnded = () => {
      if (this.mediaEl === el) {
        this._playing = false;
        this.pausedAt = 0;
        if (this.repeat && this.buffer) this.play();
      }
    };
    this._streamSetup(el, name, onEnded);

    // Phase 2: fetch the same URL again for decode (browser may cache it)
    const capturedEl = el;
    fetch(url).then((r) => r.arrayBuffer()).then((raw) => {
      if (capturedEl !== this.mediaEl) return null;
      this.rawData = raw.slice(0);
      if (this.stemsWanted) void this.prefetchStems(); // prep in the background — this deck was using stems
      return this.ctx.decodeAudioData(raw);
    }).then((buf) => {
      if (!buf || capturedEl !== this.mediaEl) return;
      const pos = this.mediaEl?.currentTime ?? 0;
      const wasPlaying = this._playing;
      this._streamSwap(buf, pos, wasPlaying);
    }).catch((e) => {
      console.error("[deck] background decode failed", (e as Error).message);
      if (capturedEl === this.mediaEl) this._bufferLoading = false;
    });
  }

  // pristine bytes of the loaded track (for re-storing the audio when saving a
  // directly-loaded file into the library). Null once unloaded.
  getRawData(): ArrayBuffer | null {
    return this.rawData;
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

  play() {
    // phase 1: streaming via MediaElement (buffer not yet decoded)
    if (this._bufferLoading && this.mediaEl) {
      if (this._playing) return;
      this.mediaEl.play().catch(() => {});
      this._playing = true;
      return;
    }
    if (!this.buffer || this._playing) return;
    this.stopSources(); // clear any orphans left by a previous natural end
    const srcs = this.makeSources();
    if (!srcs.length) return;
    const offset = Math.min(this.pausedAt, this.duration - 0.01);
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
    if (this._bufferLoading && this.mediaEl) {
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
    this._playing ? this.pause() : this.play();
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
    if (this._bufferLoading && this.mediaEl) return this.mediaEl.currentTime;
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
    if (this._bufferLoading && this.mediaEl) {
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

  setCue() {
    this.cuePoint = this.position();
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
  setEQ(band: "low" | "mid" | "high", db: number) {
    this[band].gain.value = db;
  }

  // last bipolar filter position (the biquad itself doesn't store x)
  private filterX = 0;

  // bipolar filter: -1..0 = lowpass sweep, 0 = bypass, 0..1 = highpass sweep
  setFilter(x: number) {
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
    this.clearAllStemFxTargets(); // un-splice before the stem indices go stale
    this.stemsActive = false;
    this.stemBuffers = [];
    this.stemNames = [];
    this.stemVol = [];
    for (let i = 0; i < this.stemLoopWrapTimer.length; i++) this.clearStemLoopTimer(i);
    this.stemLoopWrapCount = this.stemLoopWrapCount.map(() => 0);
    this.stemLoopActive = [];
    this.stemLoopStart = [];
    this.stemLoopEnd = [];
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
  }

  // switch analysis model (standard / fine-tuned / 6-stem). Drops any loaded
  // stems so the next STEMS click re-separates with the new model.
  setStemModel(model: Deck["stemModel"]) {
    if (model === this.stemModel) return;
    this.stemModel = model;
    this.clearStems();
    void this.probeStems();
  }

  // quality knobs, orthogonal to the model — each drops any loaded stems so
  // the next STEMS click re-separates (or re-probes an already-cached variant)
  setStemUltra(on: boolean) {
    if (on === this.stemUltra) return;
    this.stemUltra = on;
    this.clearStems();
    void this.probeStems();
  }
  setStemLossless(on: boolean) {
    if (on === this.stemLossless) return;
    this.stemLossless = on;
    this.clearStems();
    void this.probeStems();
  }
  setStemDenoiseVocals(on: boolean) {
    if (on === this.stemDenoiseVocals) return;
    this.stemDenoiseVocals = on;
    this.clearStems();
    void this.probeStems();
  }

  // query-string suffix carrying the current quality opts, shared by every
  // /api/stems/* call so cache hits/misses stay consistent across them
  private stemOptsQS(): string {
    return `${this.stemUltra ? "&ultra=1" : ""}${this.stemLossless ? "&wav=1" : ""}${this.stemDenoiseVocals ? "&denoise=1" : ""}`;
  }

  // cheap check: does the server already have separated stems for this track +
  // model? (no separation is launched). Lets the UI show "instant" before a click.
  async probeStems(): Promise<void> {
    this.stemCached = false;
    if (!this.rawData || this.stemReady) return;
    try {
      const res = await fetch(`/api/stems/separate?probe=1&model=${this.stemModel}${this.stemOptsQS()}`, {
        method: "POST",
        body: this.rawData.slice(0),
      });
      if (!res.ok) return;
      const { cached, hash } = (await res.json()) as { cached: boolean; hash: string };
      this.stemCached = !!cached;
      if (hash) this.stemHash = hash;
      // a background prefetch just finished — drop the "préparation…" badge
      if (cached && this.stemStatus === "prefetching") this.stemStatus = "none";
    } catch {
      /* offline / route missing — leave as-is */
    }
  }

  // Ask the server to separate this track in the background (low priority, niced)
  // so the stems are ready on disk before the user ever presses STEMS. Returns
  // immediately; the actual Demucs run happens server-side while the deck idles.
  // Caller should poll probeStems() to flip the "cached" badge once it lands.
  async prefetchStems(): Promise<void> {
    if (!this.rawData || this.stemReady || this.stemCached) return;
    // don't stomp on a live, foreground separation
    if (this.stemStatus === "working") return;
    const model = this.stemModel;
    this.stemStatus = "prefetching";
    try {
      const res = await fetch(`/api/stems/separate?prefetch=1&model=${model}${this.stemOptsQS()}`, {
        method: "POST",
        body: this.rawData.slice(0),
      });
      if (!res.ok) {
        if (this.stemStatus === "prefetching") this.stemStatus = "none";
        return;
      }
      const { hash, cached } = (await res.json()) as { hash: string; cached: boolean };
      if (this.stemModel !== model) return; // model swapped meanwhile
      if (hash) this.stemHash = hash;
      if (cached) {
        this.stemCached = true;
        if (this.stemStatus === "prefetching") this.stemStatus = "none";
      }
      // else: leave status "prefetching"; the poller will clear it when ready
    } catch {
      if (this.stemStatus === "prefetching") this.stemStatus = "none";
    }
  }

  // per-stem volume (0..1+); index follows stemNames order
  setStemVol(i: number, v: number) {
    if (i < 0 || i >= this.stemVol.length) return;
    this.stemVol[i] = v;
    if (this.stemGains[i]) this.stemGains[i].gain.value = v;
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
    if (this.stemFxTargets.has(i)) {
      disconnect(this.stemGains[i], this.rack.input);
      this.stemGains[i].connect(this.stemBus);
      this.stemFxTargets.delete(i);
    } else {
      disconnect(this.stemGains[i], this.stemBus);
      this.stemGains[i].connect(this.rack.input);
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

  private clearAllStemFxTargets() {
    for (const i of Array.from(this.stemFxTargets)) this.toggleStemFxTarget(i);
  }

  // ---- shared per-stem Reverb/Delay sends (see field comments above) ----
  setStemReverbSend(i: number, v: number) {
    if (i < 0 || i >= this.stemReverbSendGain.length) return;
    this.stemReverbSend[i] = Math.min(1, Math.max(0, v));
    this.stemReverbSendGain[i].gain.value = this.stemReverbSend[i] * 0.9; // headroom
  }
  setStemDelaySend(i: number, v: number) {
    if (i < 0 || i >= this.stemDelaySendGain.length) return;
    this.stemDelaySend[i] = Math.min(1, Math.max(0, v));
    this.stemDelaySendGain[i].gain.value = this.stemDelaySend[i] * 0.8;
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

  // Automatic makeup gain on the stem bus. Treating stems as roughly
  // uncorrelated, total power ≈ Σ v_i². With every fader at 1 that's N (the full
  // mix); as faders drop we scale the bus by √(N / Σv_i²) so the perceived level
  // stays stable. Boost-only and capped at +12 dB so near-silence can't blow up.
  private recomputeStemMakeup() {
    if (!this.stemBus) return;
    const n = this.stemVol.length;
    if (!this.stemMakeup || n === 0) {
      this.stemBus.gain.value = 1;
      return;
    }
    let power = 0;
    for (const v of this.stemVol) power += v * v;
    const makeup = power > 1e-4 ? Math.sqrt(n / power) : 1;
    this.stemBus.gain.value = Math.min(4, Math.max(1, makeup)); // ≤ +12 dB, never cut
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
    if (!this.rawData) {
      this.stemStatus = "error";
      return;
    }
    this.stemStatus = "working";
    const model = this.stemModel;
    try {
      const stemOpts = this.stemOptsQS();
      const res = await fetch(`/api/stems/separate?model=${model}${stemOpts}`, {
        method: "POST",
        body: this.rawData.slice(0),
      });
      if (!res.ok) throw new Error(await res.text());
      const { hash, stems } = (await res.json()) as { hash: string; stems: string[] };
      // user may have swapped the model while we were separating — bail if so
      if (this.stemModel !== model) return;
      const bufs: AudioBuffer[] = [];
      for (const n of stems) {
        const r = await fetch(`/api/stems/${hash}/${n}?model=${model}${stemOpts}`);
        if (!r.ok) throw new Error(`stem ${n}: ${r.status}`);
        bufs.push(await this.ctx.decodeAudioData(await r.arrayBuffer()));
      }
      if (this.stemModel !== model) return;
      this.stemNames = stems;
      this.stemVol = stems.map(() => 1);
      this.stemBuffers = bufs;
      this.stemHash = hash;
      this.stemCached = true;
      for (let i = 0; i < stems.length; i++) this.stemGains[i].gain.value = this.stemVol[i];
      this.recomputeStemMakeup();
      this.stemStatus = "ready";
    } catch (e) {
      this.stemStatus = "error";
      console.error("[stems]", e);
    }
  }

  get effectiveBPM() {
    return this.bpm ? Math.round(this.bpm * this.rate * 10) / 10 : 0;
  }

  // current pitch as a percentage (-x..+x), inverse of setPitch
  get pitchPct() {
    return (this.rate - 1) * 100;
  }

  // FX rack — each effect has an independent wet level (0..1)
  setFxWet(name: FxName, v: number) {
    this.fx.setWet(name, v);
  }
  getFxWet(name: FxName): number {
    return this.fx.getWet(name);
  }

  // beat loop of n beats from current position
  setBeatLoop(beats: number) {
    if (!this.buffer || !this.bpm) return;
    const secPerBeat = 60 / this.bpm;
    const start = this.position();
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
  setStemBeatLoop(i: number, beats: number, opts?: { quantize?: boolean }) {
    if (!this.stemsActive || !this.stemReady || !this.bpm) return;
    if (i < 0 || i >= this.stemGains.length) return;
    const secPerBeat = 60 / this.bpm;
    const rawStart = this.position();
    const start = (opts?.quantize ?? true) ? Math.round(rawStart / secPerBeat) * secPerBeat : rawStart;
    const end = Math.min(start + secPerBeat * beats, this.duration);
    this.stemLoopActive[i] = true;
    this.stemLoopStart[i] = start;
    this.stemLoopEnd[i] = end;
    this.stemLoopWrapCount[i] = 0;
    const src = this.activeSources[i];
    if (src) {
      src.loopStart = start;
      src.loopEnd = end;
      src.loop = true;
    }
    this.scheduleStemLoopWrap(i);
  }

  clearStemLoop(i: number) {
    if (i < 0 || i >= this.stemGains.length) return;
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
  }

  // halve/double the CURRENT loop length live, keeping the same start point —
  // the classic loop-resize gesture (½ / ×2) on real DJ hardware.
  resizeStemLoop(i: number, factor: 0.5 | 2) {
    if (i < 0 || i >= this.stemGains.length || !this.stemLoopActive[i]) return;
    const start = this.stemLoopStart[i];
    const newLen = Math.max(0.01, (this.stemLoopEnd[i] - start) * factor);
    const end = Math.min(start + newLen, this.duration);
    this.stemLoopEnd[i] = end;
    this.stemLoopWrapCount[i] = 0;
    const src = this.activeSources[i];
    if (src) src.loopEnd = end;
    this.scheduleStemLoopWrap(i);
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
  private scheduleStemLoopWrap(i: number) {
    this.clearStemLoopTimer(i);
    if (!this.stemLoopActive[i] || !this._playing) return;
    const start = this.stemLoopStart[i];
    const len = (this.stemLoopEnd[i] - start) / Math.max(0.01, this.effRate);
    if (!(len > 0) || !isFinite(len)) return;
    const posNow = this.startOffset + (this.ctx.currentTime - this.startCtxTime) * this.effRate;
    const sinceStart = Math.max(0, posNow - start);
    const untilWrapSec = len - (sinceStart % len);
    const smoothMs = this.stemLoopSmoothMs[i] ?? 0;
    const fadeSec = Math.min(untilWrapSec * 0.9, smoothMs / 1000);
    const fireInMs = Math.max(0, (untilWrapSec - fadeSec / 2) * 1000);
    this.stemLoopWrapTimer[i] = setTimeout(() => {
      if (!this.stemLoopActive[i]) return;
      if (fadeSec > 0.0005) {
        const g = this.stemGains[i];
        const now = this.ctx.currentTime;
        const base = this.stemVol[i] ?? 1;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + fadeSec / 2);
        g.gain.linearRampToValueAtTime(base, now + fadeSec);
      }
      this.stemLoopWrapCount[i]++;
      const rollAt = this.stemLoopRollAt[i];
      if (rollAt != null && this.stemLoopWrapCount[i] >= rollAt) {
        this.clearStemLoop(i); // Roll: release — the stem continues naturally
        return;
      }
      this.scheduleStemLoopWrap(i);
    }, fireInMs);
  }

  get hasLoop() {
    return this.loopActive;
  }

  // whole-track repeat toggle (the song restarts automatically at the end)
  toggleRepeat(): boolean {
    this.repeat = !this.repeat;
    return this.repeat;
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
  unload() {
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
    this.rawData = null;
    this.origin = null;
    this.clearStems();
    this.reset();
  }

  // reset every control to neutral but keep the loaded buffer and playback going
  reset() {
    this.setTrim(1);
    this.setVolume(1);
    this.setEQ("low", 0);
    this.setEQ("mid", 0);
    this.setEQ("high", 0);
    this.setFilter(0);
    this.setPitch(0);
    this.scratch(0);
    this.clearLoop();
    this.repeat = false;
    for (const fx of ["echo", "reverb", "flanger", "phaser", "gate", "crush"] as const) {
      this.setFxWet(fx, 0);
    }
  }

  // capture the current mixer/FX state so it can be stored with a track
  getSettings(): DeckSettings {
    const fx: Partial<Record<FxName, number>> = {};
    for (const name of ["echo", "reverb", "flanger", "phaser", "gate", "crush"] as const) {
      fx[name] = this.fx.getWet(name);
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
      rack: this.rack.export(),
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
    for (const name of ["echo", "reverb", "flanger", "phaser", "gate", "crush"] as const) {
      if (typeof s.fx[name] === "number") this.setFxWet(name, s.fx[name] as number);
    }
    if (s.rack) this.rack.import(s.rack);
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
