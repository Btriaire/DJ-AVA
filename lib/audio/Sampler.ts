export interface Pad {
  name: string;
  buffer: AudioBuffer | null;
  color: string;
  // per-pad performance effects (SPD-SX style)
  pitch: number; // semitones, -12..+12
  filter: number; // 0 = open, 1 = fully closed lowpass
  gain: number; // per-pad volume, 0..2
  reverb: number; // 0..1 reverb send
  reverse: boolean;
  loop: boolean;
}

export type PadParam = "pitch" | "filter" | "gain" | "reverb" | "reverse" | "loop";

// A saved pad sequence: the step patterns plus the per-pad FX + transport. The
// audio samples themselves are NOT stored — a recalled pattern plays through
// whatever sounds are currently loaded on the pads (like a groovebox kit/pattern
// split), so presets stay tiny and survive across sessions in localStorage.
export interface PadSeqPreset {
  steps: number;
  bpm: number;
  patterns: boolean[][];
  padFx: { pitch: number; filter: number; gain: number; reverb: number; reverse: boolean; loop: boolean }[];
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
  private active: (AudioBufferSourceNode | null)[];
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
    this.pads[i].buffer = buf;
    this.pads[i].name = name;
    this.reversedCache.delete(buf);
  }

  setParam(i: number, key: PadParam, value: number | boolean) {
    const pad = this.pads[i];
    if (!pad) return;
    // @ts-expect-error indexed write across mixed types
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
    }
    this.active.forEach((s, i) => {
      if (s) {
        try {
          s.stop();
        } catch {}
        this.active[i] = null;
      }
    });
  }

  async loadFile(i: number, file: File) {
    const buf = await this.ctx.decodeAudioData(await file.arrayBuffer());
    this.setBuffer(i, buf, file.name.replace(/\.[^.]+$/, ""));
  }

  play(i: number) {
    const pad = this.pads[i];
    if (!pad?.buffer) return;

    // a looping pad toggles off on the next hit
    if (pad.loop && this.active[i]) {
      try {
        this.active[i]!.stop();
      } catch {}
      this.active[i] = null;
      return;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = pad.reverse ? this.reversed(pad.buffer) : pad.buffer;
    src.playbackRate.value = Math.pow(2, pad.pitch / 12);
    src.loop = pad.loop;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value =
      pad.filter <= 0.001 ? 20000 : 20000 * Math.pow(120 / 20000, pad.filter);
    lp.Q.value = 1 + pad.filter * 4;

    const g = this.ctx.createGain();
    g.gain.value = pad.gain;

    src.connect(lp);
    lp.connect(g);
    g.connect(this.out);

    if (pad.reverb > 0.001) {
      const send = this.ctx.createGain();
      send.gain.value = pad.reverb;
      g.connect(send);
      send.connect(this.reverb);
    }

    src.start();
    if (pad.loop) {
      this.active[i] = src;
      src.onended = () => {
        if (this.active[i] === src) this.active[i] = null;
      };
    }
  }

  isLooping(i: number): boolean {
    return !!this.active[i];
  }

  // one-shot voice scheduled at an exact context time (used by the sequencer).
  // Honours the pad's pitch / filter / gain / reverb / reverse, but never loops.
  playAt(i: number, when: number) {
    const pad = this.pads[i];
    if (!pad?.buffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = pad.reverse ? this.reversed(pad.buffer) : pad.buffer;
    src.playbackRate.value = Math.pow(2, pad.pitch / 12);

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value =
      pad.filter <= 0.001 ? 20000 : 20000 * Math.pow(120 / 20000, pad.filter);
    lp.Q.value = 1 + pad.filter * 4;

    const g = this.ctx.createGain();
    g.gain.value = pad.gain;

    src.connect(lp);
    lp.connect(g);
    g.connect(this.out);

    if (pad.reverb > 0.001) {
      const send = this.ctx.createGain();
      send.gain.value = pad.reverb;
      g.connect(send);
      send.connect(this.reverb);
    }

    src.start(when);
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
        pad.pitch = fx.pitch ?? 0;
        pad.filter = fx.filter ?? 0;
        pad.gain = fx.gain ?? 1;
        pad.reverb = fx.reverb ?? 0;
        pad.reverse = !!fx.reverse;
        pad.loop = !!fx.loop;
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
