import { buildBeatGrid, buildColoredPeaks, detectBPM, type ColoredPeaks } from "./bpm";

export type Voicing = "poly" | "mono"; // poly = overlap; mono = retrigger cuts last
export type PadMode = "oneshot" | "hold" | "trigger" | "key"; // playback behaviour

export interface Pad {
  name: string;
  buffer: AudioBuffer | null;
  color: string;
  // --- performance effects (SPD-SX style) ---
  pitch: number; // semitones, -12..+12
  filter: number; // 0 = open, 1 = fully closed lowpass
  gain: number; // per-pad volume, 0..2
  reverb: number; // 0..1 reverb send
  reverse: boolean;
  loop: boolean;
  // --- sound design / "sculpt" ---
  tune: number; // fine pitch, cents -100..+100
  attack: number; // amp envelope, seconds
  decay: number; // seconds
  sustain: number; // 0..1 sustain level
  release: number; // seconds
  reso: number; // 0..1 -> filter resonance (Q)
  drive: number; // 0..1 saturation
  pan: number; // -1 (L) .. +1 (R) stereo placement
  start: number; // sample trim start, fraction 0..1
  end: number; // sample trim end, fraction 0..1
  // --- Serato-style sampler ---
  cues: number[]; // cue points as fractions 0..1 (DJ cue points / hot cues)
  slices: number; // slicer divisions (0 = off) — equal slices across the sample
  voicing: Voicing; // mono / poly
  mode: PadMode; // oneshot / hold / trigger / key-shift
  velo: boolean; // velocity mode — hit strength drives level
  quantize: boolean; // snap triggers to the sequencer grid
  sync: boolean; // beat-sync playback rate to the sequencer BPM
  keyShift: number; // semitone offset (key-shift pad layout / transpose)
  random: boolean; // each trigger fires a random slice / cue
  // --- analysis (recomputed on load, NOT persisted) ---
  bpm: number;
  beats: number[]; // beat-grid times (seconds)
  peaks: ColoredPeaks | null; // colored waveform peaks
}

// keys writable through setParam (scalar performance + sculpt params)
export type PadParam =
  | "pitch" | "filter" | "gain" | "reverb" | "reverse" | "loop"
  | "tune" | "attack" | "decay" | "sustain" | "release" | "reso" | "drive" | "pan"
  | "start" | "end" | "slices" | "voicing" | "mode" | "velo" | "quantize" | "sync" | "keyShift" | "random";

// the subset of pad config we persist (everything except buffer + analysis)
type PadFx = Omit<Pad, "name" | "buffer" | "color" | "bpm" | "beats" | "peaks">;

// A saved pad sequence: the step patterns plus the per-pad FX + transport. The
// audio samples themselves are NOT stored — a recalled pattern plays through
// whatever sounds are currently loaded on the pads (like a groovebox kit/pattern
// split), so presets stay tiny and survive across sessions in localStorage.
export interface PadSeqPreset {
  steps: number;
  bpm: number;
  patterns: boolean[][];
  padFx: Partial<PadFx>[];
}

const PAD_SEQ_KEY = "djsynth.padseq.v1";
export function loadPadPresets(): Record<string, PadSeqPreset> {
  try {
    return JSON.parse(localStorage.getItem(PAD_SEQ_KEY) || "{}");
  } catch {
    return {};
  }
}
export function savePadPresets(all: Record<string, PadSeqPreset>): void {
  try {
    localStorage.setItem(PAD_SEQ_KEY, JSON.stringify(all));
  } catch {
    /* quota / unavailable */
  }
}

// 9-pad sampler (Roland SPD-SX style). Pads 0-3 ship with synthesized drums;
// the rest hold grabbed song slices or uploaded files. Each pad has its own
// performance FX: pitch, lowpass filter, gain, reverb send, reverse and loop.
export class Sampler {
  readonly ctx: AudioContext;
  readonly out: GainNode; // master pad volume (setVolume controls this)
  readonly output: AudioNode; // final node to wire into the mixer (post-limiter)
  pads: Pad[];

  private limiter: DynamicsCompressorNode; // tames peaks so we can push volume hot
  private reverb: ConvolverNode;
  private active: ({ src: AudioBufferSourceNode; gain: GainNode } | null)[];
  private reversedCache = new Map<AudioBuffer, AudioBuffer>();

  // --- per-pad step sequencer (16th notes) ---
  // patterns are always stored at MAX length; seqSteps is the active loop length
  // (selectable 4 / 8 / 12 / 16 / 24) and applies to every pad identically.
  static readonly seqLengths = [4, 8, 12, 16, 24] as const;
  static readonly seqMax = 24;
  seqSteps = 24;
  seqBpm = 120;
  seqPlaying = false;
  seqRecording = false; // live overdub: pad hits are written into the pattern
  seqPatterns: boolean[][] = []; // [padIndex][stepIndex] = on/off
  private seqTimer: number | null = null;
  private nextStepTime = 0;
  private nextStepIndex = 0;
  private scheduled: { step: number; time: number }[] = [];

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1.3; // louder by default than the old 0.9

    // brick-wall-ish limiter after the volume stage: lets you crank the master
    // pad volume and individual pad gains without harsh clipping at the mixer.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;
    this.out.connect(this.limiter);
    this.output = this.limiter;

    // shared plate-style reverb fed by each pad's send
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 1.1;
    this.reverb.connect(wet);
    wet.connect(this.out);

    const colors = [
      "#f87171",
      "#fb923c",
      "#fbbf24",
      "#a3e635",
      "#34d399",
      "#ff8a1e",
      "#4dff84",
      "#facc15",
      "#22c55e",
    ];
    this.pads = colors.map((c, i) => ({
      name: `Pad ${i + 1}`,
      buffer: null,
      color: c,
      pitch: 0,
      filter: 0,
      gain: 1,
      reverb: 0,
      reverse: false,
      loop: false,
      // sculpt defaults (neutral)
      tune: 0,
      attack: 0.002,
      decay: 0,
      sustain: 1,
      release: 0.04,
      reso: 0,
      drive: 0,
      pan: 0,
      start: 0,
      end: 1,
      // serato sampler defaults
      cues: [],
      slices: 0,
      voicing: "poly" as Voicing,
      mode: "oneshot" as PadMode,
      velo: false,
      quantize: false,
      sync: false,
      keyShift: 0,
      random: false,
      // analysis
      bpm: 0,
      beats: [],
      peaks: null,
    }));
    this.active = this.pads.map(() => null);
    this.seqPatterns = this.pads.map(() => new Array(Sampler.seqMax).fill(false));

    this.setBuffer(0, this.kick(), "Kick");
    this.setBuffer(1, this.snare(), "Snare");
    this.setBuffer(2, this.hat(), "HiHat");
    this.setBuffer(3, this.clap(), "Clap");
  }

  setVolume(v: number) {
    this.out.gain.value = Math.max(0, Math.min(2, v));
  }
  getVolume() {
    return this.out.gain.value;
  }

  setBuffer(i: number, buf: AudioBuffer, name: string) {
    if (i < 0 || i >= this.pads.length) return;
    const pad = this.pads[i];
    pad.buffer = buf;
    pad.name = name;
    pad.start = 0;
    pad.end = 1;
    pad.cues = [];
    pad.slices = 0;
    this.reversedCache.delete(buf);
    this.analyze(i);
  }

  // Sample analysis (Serato-style): colored waveform peaks always; BPM + beat
  // grid only for clips long enough to carry a tempo (skips drum one-shots).
  analyze(i: number) {
    const pad = this.pads[i];
    if (!pad?.buffer) return;
    const buf = pad.buffer;
    pad.peaks = buildColoredPeaks(buf, 1600);
    if (buf.duration >= 1.5) {
      pad.bpm = detectBPM(buf);
      pad.beats = buildBeatGrid(buf.duration, pad.bpm, 0);
    } else {
      pad.bpm = 0;
      pad.beats = [];
    }
  }

  setParam(i: number, key: PadParam, value: number | boolean | string) {
    const pad = this.pads[i];
    if (!pad) return;
    // @ts-expect-error indexed write across mixed scalar/string types
    pad[key] = value;
  }

  // reset every pad's FX to neutral but keep the loaded buffers
  resetFx() {
    for (const pad of this.pads) {
      pad.pitch = 0;
      pad.filter = 0;
      pad.gain = 1;
      pad.reverb = 0;
      pad.reverse = false;
      pad.loop = false;
      pad.tune = 0;
      pad.attack = 0.002;
      pad.decay = 0;
      pad.sustain = 1;
      pad.release = 0.04;
      pad.reso = 0;
      pad.drive = 0;
      pad.pan = 0;
    }
    this.active.forEach((s, i) => {
      if (s) {
        try {
          s.src.stop();
        } catch {}
        this.active[i] = null;
      }
    });
  }

  async loadFile(i: number, file: File) {
    const buf = await this.ctx.decodeAudioData(await file.arrayBuffer());
    this.setBuffer(i, buf, file.name.replace(/\.[^.]+$/, ""));
  }

  // The single voice builder behind every trigger (live + sequenced + cue +
  // slice). Honours trim (start/end), reverse, pitch + fine tune + key-shift +
  // optional beat-sync rate, drive (saturation), lowpass + resonance, an amp
  // ADSR, pan and the reverb send. Returns the source + amp gain so callers can
  // hold (loop / mono / hold mode) and release it cleanly.
  private buildVoice(
    i: number,
    when: number,
    velocity: number,
    startFrac: number,
    endFrac: number,
    loop: boolean,
    extraSemis = 0
  ): { src: AudioBufferSourceNode; gain: GainNode } | null {
    const pad = this.pads[i];
    if (!pad?.buffer) return null;
    const buf = pad.reverse ? this.reversed(pad.buffer) : pad.buffer;
    const dur = buf.duration;

    let s = Math.max(0, Math.min(1, startFrac));
    let e = Math.max(0, Math.min(1, endFrac));
    if (e <= s) e = Math.min(1, s + 0.002);
    const windowSec = (e - s) * dur;
    // trim fractions refer to the displayed (forward) waveform; flip for reverse
    const offset = (pad.reverse ? 1 - e : s) * dur;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const semis = pad.pitch + pad.keyShift + extraSemis + pad.tune / 100;
    let rate = Math.pow(2, semis / 12);
    if (pad.sync && pad.bpm > 0) rate *= this.seqBpm / pad.bpm; // beat-sync
    src.playbackRate.value = rate;

    let head: AudioNode = src;
    // saturation / drive
    if (pad.drive > 0.001) {
      const ws = this.ctx.createWaveShaper();
      ws.curve = this.driveCurve(pad.drive) as Float32Array<ArrayBuffer>;
      ws.oversample = "2x";
      head.connect(ws);
      head = ws;
    }
    // lowpass + resonance
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value =
      pad.filter <= 0.001 ? 20000 : 20000 * Math.pow(120 / 20000, pad.filter);
    lp.Q.value = 1 + pad.filter * 4 + pad.reso * 18;
    head.connect(lp);
    head = lp;
    // amp ADSR
    const g = this.ctx.createGain();
    const peak = Math.max(0, pad.gain) * Math.max(0, velocity);
    const atk = Math.max(0.001, pad.attack);
    const dec = Math.max(0, pad.decay);
    const sus = Math.max(0, Math.min(1, pad.sustain));
    g.gain.cancelScheduledValues(when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + atk);
    if (dec > 0) g.gain.linearRampToValueAtTime(Math.max(0.0001, peak * sus), when + atk + dec);
    head.connect(g);
    // pan
    let tail: AudioNode = g;
    if (Math.abs(pad.pan) > 0.001) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pad.pan));
      g.connect(p);
      tail = p;
    }
    tail.connect(this.out);
    if (pad.reverb > 0.001) {
      const send = this.ctx.createGain();
      send.gain.value = pad.reverb;
      g.connect(send);
      send.connect(this.reverb);
    }

    if (loop) {
      src.loop = true;
      src.loopStart = offset;
      src.loopEnd = Math.min(dur, offset + windowSec);
      src.start(when, offset);
    } else {
      const playSec = windowSec / rate; // real-time length of the trimmed window
      const rel = Math.min(playSec * 0.5, Math.max(0.005, pad.release));
      g.gain.setTargetAtTime(0.0001, when + playSec - rel, Math.max(0.003, rel / 3));
      src.start(when, offset, windowSec);
    }
    return { src, gain: g };
  }

  // hard-knee soft saturation curve, cached per drive amount
  private driveCurves = new Map<number, Float32Array>();
  private driveCurve(amount: number): Float32Array {
    const key = Math.round(amount * 20) / 20;
    const hit = this.driveCurves.get(key);
    if (hit) return hit;
    const k = key * 100;
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    this.driveCurves.set(key, curve);
    return curve;
  }

  // next 16th-note grid time (for pad-quantized live triggers)
  private nextGridTime(): number {
    const now = this.ctx.currentTime;
    for (const s of this.scheduled) if (s.time > now + 0.001) return s.time;
    return Math.max(now, this.nextStepTime);
  }

  // fade out and stop a held voice (loop / mono / hold) with the pad's release
  private stopVoice(i: number, when = this.ctx.currentTime) {
    const v = this.active[i];
    if (!v) return;
    const rel = Math.max(0.01, this.pads[i]?.release ?? 0.04);
    try {
      v.gain.gain.cancelScheduledValues(when);
      v.gain.gain.setTargetAtTime(0.0001, when, rel / 3);
      v.src.stop(when + rel * 4);
    } catch {}
    this.active[i] = null;
  }

  // live trigger (pad press / keyboard). `velocity` 0..1 drives level in velo mode.
  play(i: number, velocity = 1) {
    const pad = this.pads[i];
    if (!pad?.buffer) return;
    const vel = pad.velo ? Math.max(0.05, Math.min(1, velocity)) : 1;

    // random mode: fire a random slice or cue instead of the head
    if (pad.random && (pad.slices > 0 || pad.cues.length)) {
      if (pad.slices > 0) this.playSlice(i, Math.floor(Math.random() * pad.slices), vel);
      else this.playCue(i, Math.floor(Math.random() * pad.cues.length), vel);
      return;
    }

    // a looping / held pad toggles off on the next hit
    if ((pad.loop || pad.mode === "hold") && this.active[i]) {
      this.stopVoice(i);
      if (pad.loop) return;
    }
    // mono voicing (and Trigger mode) cut the previous voice on this pad
    if ((pad.voicing === "mono" || pad.mode === "trigger") && this.active[i]) this.stopVoice(i);

    const when = pad.quantize && this.seqPlaying ? this.nextGridTime() : this.ctx.currentTime;
    const v = this.buildVoice(i, when, vel, pad.start, pad.end, pad.loop);
    if (!v) return;
    // hold the voice so we can stop it (loop toggle, mono retrigger, hold release)
    if (pad.loop || pad.mode === "hold" || pad.voicing === "mono") {
      this.active[i] = v;
      v.src.onended = () => {
        if (this.active[i] === v) this.active[i] = null;
      };
    }
  }

  // pad released (for Hold mode: stop while-held playback)
  release(i: number) {
    if (this.pads[i]?.mode === "hold") this.stopVoice(i);
  }

  isLooping(i: number): boolean {
    return !!this.active[i];
  }

  // --- cue points / slicer / key-shift ---
  addCue(i: number, frac: number) {
    const pad = this.pads[i];
    if (!pad) return;
    const f = Math.max(0, Math.min(1, frac));
    pad.cues = [...pad.cues, f].sort((a, b) => a - b).slice(0, 8);
  }
  clearCues(i: number) {
    if (this.pads[i]) this.pads[i].cues = [];
  }
  playCue(i: number, cueIdx: number, velocity = 1) {
    const pad = this.pads[i];
    const s = pad?.cues[cueIdx];
    if (s == null) return;
    this.buildVoice(i, this.ctx.currentTime, velocity, s, pad.end, false);
  }
  playSlice(i: number, k: number, velocity = 1) {
    const pad = this.pads[i];
    if (!pad?.buffer || pad.slices <= 0) return;
    const span = (pad.end - pad.start) / pad.slices;
    const s = pad.start + span * k;
    this.buildVoice(i, this.ctx.currentTime, velocity, s, s + span, false);
  }
  // play pad i transposed by `semitone` (key-shift pad layout / melodic play)
  playKey(i: number, semitone: number, velocity = 1) {
    const pad = this.pads[i];
    if (!pad?.buffer) return;
    this.buildVoice(i, this.ctx.currentTime, velocity, pad.start, pad.end, false, semitone);
  }

  // one-shot voice scheduled at an exact context time (used by the sequencer).
  // Full sculpt chain, never loops.
  playAt(i: number, when: number, velocity = 1) {
    const pad = this.pads[i];
    if (!pad?.buffer) return;
    this.buildVoice(i, when, velocity, pad.start, pad.end, false);
  }

  // ---- save / recall the programmed sequence ----
  exportPattern(): PadSeqPreset {
    return {
      steps: this.seqSteps,
      bpm: this.seqBpm,
      patterns: this.seqPatterns.map((r) => r.slice()),
      padFx: this.pads.map((p) => ({
        pitch: p.pitch,
        filter: p.filter,
        gain: p.gain,
        reverb: p.reverb,
        reverse: p.reverse,
        loop: p.loop,
        tune: p.tune,
        attack: p.attack,
        decay: p.decay,
        sustain: p.sustain,
        release: p.release,
        reso: p.reso,
        drive: p.drive,
        pan: p.pan,
        start: p.start,
        end: p.end,
        cues: p.cues.slice(),
        slices: p.slices,
        voicing: p.voicing,
        mode: p.mode,
        velo: p.velo,
        quantize: p.quantize,
        sync: p.sync,
        keyShift: p.keyShift,
        random: p.random,
      })),
    };
  }
  importPattern(preset: PadSeqPreset) {
    if (Array.isArray(preset.patterns)) {
      for (let i = 0; i < this.pads.length; i++) {
        const row = this.seqPatterns[i];
        const src = preset.patterns[i] || [];
        for (let s = 0; s < Sampler.seqMax; s++) row[s] = !!src[s];
      }
    }
    if (preset.bpm) this.setSeqBpm(preset.bpm);
    if (preset.steps) this.setSeqSteps(preset.steps);
    if (Array.isArray(preset.padFx)) {
      preset.padFx.forEach((fx, i) => {
        const pad = this.pads[i];
        if (!pad || !fx) return;
        // performance (back-compat with old presets via ?? defaults)
        pad.pitch = fx.pitch ?? 0;
        pad.filter = fx.filter ?? 0;
        pad.gain = fx.gain ?? 1;
        pad.reverb = fx.reverb ?? 0;
        pad.reverse = !!fx.reverse;
        pad.loop = !!fx.loop;
        // sculpt
        pad.tune = fx.tune ?? 0;
        pad.attack = fx.attack ?? 0.002;
        pad.decay = fx.decay ?? 0;
        pad.sustain = fx.sustain ?? 1;
        pad.release = fx.release ?? 0.04;
        pad.reso = fx.reso ?? 0;
        pad.drive = fx.drive ?? 0;
        pad.pan = fx.pan ?? 0;
        pad.start = fx.start ?? 0;
        pad.end = fx.end ?? 1;
        // serato sampler
        pad.cues = Array.isArray(fx.cues) ? fx.cues.slice() : [];
        pad.slices = fx.slices ?? 0;
        pad.voicing = fx.voicing === "mono" ? "mono" : "poly";
        pad.mode =
          fx.mode === "hold" || fx.mode === "trigger" || fx.mode === "key" ? fx.mode : "oneshot";
        pad.velo = !!fx.velo;
        pad.quantize = !!fx.quantize;
        pad.sync = !!fx.sync;
        pad.keyShift = fx.keyShift ?? 0;
        pad.random = !!fx.random;
      });
    }
  }

  // ---- step sequencer transport ----
  toggleStep(pad: number, step: number) {
    const row = this.seqPatterns[pad];
    if (row && step >= 0 && step < this.seqSteps) row[step] = !row[step];
  }
  isStep(pad: number, step: number): boolean {
    return !!this.seqPatterns[pad]?.[step];
  }
  clearPadSteps(pad: number) {
    if (this.seqPatterns[pad]) this.seqPatterns[pad].fill(false);
  }
  clearAllSteps() {
    this.seqPatterns.forEach((row) => row.fill(false));
  }
  setSeqBpm(b: number) {
    this.seqBpm = Math.max(40, Math.min(240, Math.round(b)));
  }
  // change the active loop length (4/8/12/16/24). Patterns keep their stored
  // steps so shrinking then growing again never loses programmed hits.
  setSeqSteps(n: number) {
    if (!(Sampler.seqLengths as readonly number[]).includes(n)) return;
    this.seqSteps = n;
    if (this.nextStepIndex >= n) this.nextStepIndex = 0;
  }

  startSeq() {
    if (this.seqPlaying) return;
    this.seqPlaying = true;
    this.nextStepIndex = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.scheduled = [];
    this.seqTimer = window.setInterval(() => this.scheduler(), 25);
  }
  stopSeq() {
    this.seqPlaying = false;
    if (this.seqTimer !== null) {
      clearInterval(this.seqTimer);
      this.seqTimer = null;
    }
    this.scheduled = [];
  }
  toggleSeq(): boolean {
    if (this.seqPlaying) this.stopSeq();
    else this.startSeq();
    return this.seqPlaying;
  }

  // step currently being heard (for the UI playhead), derived from audio time
  currentStep(): number {
    const now = this.ctx.currentTime;
    while (this.scheduled.length > 1 && this.scheduled[1].time <= now + 0.0001) {
      this.scheduled.shift();
    }
    return this.scheduled.length ? this.scheduled[0].step : 0;
  }

  // live record: write a pad hit into the step nearest the playhead, so you can
  // tap the pattern in while the sequencer loops (quantized to 16th notes).
  recordHit(pad: number) {
    if (!this.seqPlaying || !this.seqRecording) return;
    const stepDur = 60 / this.seqBpm / 4;
    const now = this.ctx.currentTime;
    while (this.scheduled.length > 1 && this.scheduled[1].time <= now + 0.0001) {
      this.scheduled.shift();
    }
    let step = this.scheduled.length ? this.scheduled[0].step : this.nextStepIndex;
    const base = this.scheduled.length ? this.scheduled[0].time : now;
    if ((now - base) / stepDur > 0.5) step = (step + 1) % this.seqSteps;
    if (this.seqPatterns[pad] && step >= 0 && step < this.seqSteps) {
      this.seqPatterns[pad][step] = true;
    }
  }

  // lookahead scheduler: queue every step that falls inside the next window
  private scheduler() {
    const stepDur = 60 / this.seqBpm / 4; // 16th notes
    const ahead = this.ctx.currentTime + 0.12;
    while (this.nextStepTime < ahead) {
      const step = this.nextStepIndex;
      for (let p = 0; p < this.pads.length; p++) {
        if (this.seqPatterns[p][step] && this.pads[p].buffer) {
          this.playAt(p, this.nextStepTime);
        }
      }
      this.scheduled.push({ step, time: this.nextStepTime });
      if (this.scheduled.length > 64) this.scheduled.shift();
      this.nextStepIndex = (step + 1) % this.seqSteps;
      this.nextStepTime += stepDur;
    }
  }

  private reversed(buf: AudioBuffer): AudioBuffer {
    const cached = this.reversedCache.get(buf);
    if (cached) return cached;
    const out = this.ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c);
      const dst = out.getChannelData(c);
      for (let i = 0, n = buf.length; i < n; i++) dst[i] = src[n - 1 - i];
    }
    this.reversedCache.set(buf, out);
    return out;
  }

  private impulse(duration: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  // first empty grabbable pad (skipping the 4 drum slots), else cycles
  private grabTarget = 4;
  nextGrabSlot(): number {
    for (let i = 4; i < this.pads.length; i++) {
      if (!this.pads[i].buffer) return i;
    }
    const span = this.pads.length - 4;
    const t = this.grabTarget;
    this.grabTarget = 4 + ((this.grabTarget - 4 + 1) % span);
    return t;
  }

  // --- synthesized drums ---
  private make(dur: number, fn: (t: number, i: number, n: number) => number) {
    const rate = this.ctx.sampleRate;
    const n = Math.floor(dur * rate);
    const buf = this.ctx.createBuffer(1, n, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = fn(i / rate, i, n);
    return buf;
  }

  private kick() {
    return this.make(0.5, (t) => {
      const f = 120 * Math.exp(-t * 18) + 40;
      const env = Math.exp(-t * 6);
      return Math.sin(2 * Math.PI * f * t) * env;
    });
  }

  private snare() {
    return this.make(0.3, (t) => {
      const tone = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 20);
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 18);
      return tone * 0.4 + noise * 0.7;
    });
  }

  private hat() {
    let last = 0;
    return this.make(0.08, (t) => {
      const noise = Math.random() * 2 - 1;
      const hp = noise - last; // crude high-pass
      last = noise;
      return hp * Math.exp(-t * 80) * 0.6;
    });
  }

  private clap() {
    return this.make(0.25, (t) => {
      const bursts = [0, 0.012, 0.024, 0.05];
      let v = 0;
      for (const b of bursts) {
        if (t >= b) v += (Math.random() * 2 - 1) * Math.exp(-(t - b) * 40);
      }
      return v * 0.5;
    });
  }
}
