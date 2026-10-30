// Instruments of the stem modules: sub bass, in-key synth, drum layers, sung harmony (MaRuche/Falken)
// Web Audio instruments for DJ app stem modules.
// No external dependencies, strict TypeScript, short comments.

type When = number; // AudioContext time supplied by caller

/** Convert MIDI note number to frequency (Hz). */
const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Cache a 1‑second white‑noise buffer per AudioContext. */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
    let buf = noiseCache.get(ctx);
    if (!buf) {
        const length = ctx.sampleRate;
        buf = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < length; ++i) data[i] = Math.random() * 2 - 1;
        noiseCache.set(ctx, buf);
    }
    return buf;
}

/** Clamp a scheduled time to the current context time. */
function clampWhen(ctx: BaseAudioContext, when: When): When {
    const now = ctx.currentTime;
    return when < now ? now : when;
}

/* -------------------------------------------------------------------------- */
/* 1. SubVoice – deep sub bass                                               */
/* -------------------------------------------------------------------------- */
export class SubVoice {
    readonly out: GainNode;
    private readonly ctx: BaseAudioContext;
    private lastFreq = 55; // Hz, default if no note yet

    constructor(ctx: BaseAudioContext) {
        this.ctx = ctx;
        this.out = ctx.createGain();
        this.out.gain.value = 0.9;
    }

    play(midi: number, when: When, dur: number, vel: number): void {
        const start = clampWhen(this.ctx, when);
        const minDur = Math.max(dur, 0.08);
        const end = start + minDur;
        const freq = mtof(midi);
        this.lastFreq = freq;

        // Sine base
        const oscSine = this.ctx.createOscillator();
        oscSine.type = "sine";
        oscSine.frequency.value = freq;

        // Triangle octave up
        const oscTri = this.ctx.createOscillator();
        oscTri.type = "triangle";
        oscTri.frequency.value = freq * 2;

        // Gain for triangle (0.18)
        const triGain = this.ctx.createGain();
        triGain.gain.value = 0.18;

        // Low‑pass filter 180 Hz, Q 0.7
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 180;
        lp.Q.value = 0.7;

        // Amplitude envelope
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, start);
        env.gain.linearRampToValueAtTime(vel * 0.8, start + 0.006); // attack 6 ms
        env.gain.setValueAtTime(vel * 0.8, end);
        env.gain.linearRampToValueAtTime(0, end + 0.06); // release 60 ms

        // Routing
        oscSine.connect(lp);
        oscTri.connect(triGain).connect(lp);
        lp.connect(env).connect(this.out);

        // Start/stop
        oscSine.start(start);
        oscTri.start(start);
        oscSine.stop(end + 0.06);
        oscTri.stop(end + 0.06);
    }

    dive(when: When, beats: number, spb: number): void {
        const start = clampWhen(this.ctx, when);
        const dur = beats * spb;
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = this.lastFreq;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.7;

        osc.frequency.setValueAtTime(this.lastFreq, start);
        osc.frequency.exponentialRampToValueAtTime(30, start + dur);
        gain.gain.setValueAtTime(0.7, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain).connect(this.out);
        osc.start(start);
        osc.stop(start + dur);
    }
}

/* -------------------------------------------------------------------------- */

export type SynthPatch = "pluck" | "supersaw" | "organ" | "keys" | "brass";
export const PATCH_INFO: Record<SynthPatch, { cutoffMul: number; q: number; attack: number }> = {
  pluck: { cutoffMul: 1, q: 4, attack: 0 },
  supersaw: { cutoffMul: 1.3, q: 1.5, attack: 0 },
  organ: { cutoffMul: 4, q: 0.7, attack: 0.008 },
  keys: { cutoffMul: 2.2, q: 0.9, attack: 0 },
  brass: { cutoffMul: 0.9, q: 2.5, attack: 0.03 }
};

export function patchOscillators(ctx: BaseAudioContext, patch: SynthPatch, freq: number, when: number, end: number, dest: AudioNode): void {
  const oscGain = (osc: OscillatorNode, gain: number) => {
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(dest);
    osc.start(when);
    osc.stop(end);
  };

  switch (patch) {
    case "pluck":
      oscGain(new OscillatorNode(ctx, { type: "sawtooth", frequency: freq, detune: 7 }), 0.5);
      oscGain(new OscillatorNode(ctx, { type: "sawtooth", frequency: freq, detune: -7 }), 0.5);
      oscGain(new OscillatorNode(ctx, { type: "square", frequency: freq / 2 }), 0.25);
      break;

    case "supersaw":
      [-18, -9, 0, 9, 18].forEach(detune =>
        oscGain(new OscillatorNode(ctx, { type: "sawtooth", frequency: freq, detune }), 0.2)
      );
      oscGain(new OscillatorNode(ctx, { type: "sine", frequency: freq / 2 }), 0.3);
      break;

    case "organ":
      [1, 2, 3, 4].forEach((mul, i) => {
        const osc = new OscillatorNode(ctx, { type: "sine", frequency: freq * mul });
        oscGain(osc, [0.55, 0.3, 0.2, 0.12][i]);
      });
      break;

    case "keys": {
      const carrier = new OscillatorNode(ctx, { type: "sine", frequency: freq });
      const modulator = new OscillatorNode(ctx, { type: "sine", frequency: freq });
      const index = ctx.createGain();
      index.gain.setValueAtTime(freq * 1.6, when);
      index.gain.exponentialRampToValueAtTime(freq * 0.08, when + 0.7);
      modulator.connect(index).connect(carrier.frequency);
      oscGain(carrier, 0.7);
      modulator.start(when);
      modulator.stop(end);

      const bell = new OscillatorNode(ctx, { type: "sine", frequency: freq * 4 });
      const bellGain = ctx.createGain();
      bellGain.gain.setValueAtTime(0.08, when);
      bellGain.gain.exponentialRampToValueAtTime(0.001, when + 0.25);
      bell.connect(bellGain).connect(dest);
      bell.start(when);
      bell.stop(end);
      break;
    }

    case "brass":
      oscGain(new OscillatorNode(ctx, { type: "sawtooth", frequency: freq, detune: 5 }), 0.45);
      oscGain(new OscillatorNode(ctx, { type: "sawtooth", frequency: freq, detune: -5 }), 0.45);
      oscGain(new OscillatorNode(ctx, { type: "sawtooth", frequency: freq * 2 }), 0.12);
      break;
  }
}

// a warm in-key synth: five sounds (patches), three envelopes (pluck, stab, pad), at most 8 notes at once
export class PolySynth {
  readonly out: GainNode;
  private _tone = 0.55;
  patch: SynthPatch = "pluck";
  private sounding: number[] = []; // end times of the notes still sounding

  constructor(ctx: BaseAudioContext) {
    this.out = new GainNode(ctx, { gain: 0.5 });
  }

  get tone() { return this._tone; }
  setTone(v: number) { this._tone = Math.min(1, Math.max(0, v)); }

  note(midi: number, when: number, dur: number, vel: number, kind: "pluck" | "stab" | "pad") {
    const ctx = this.out.context;
    when = clampWhen(ctx, when);
    this.sounding = this.sounding.filter((e) => e > ctx.currentTime);
    if (this.sounding.length >= 8) return;
    const info = PATCH_INFO[this.patch];
    const cutoff = Math.min(16000, (300 + this._tone ** 2 * 7000) * info.cutoffMul);
    const peak = 0.22 * vel;
    const filter = new BiquadFilterNode(ctx, { type: "lowpass", Q: info.q, frequency: cutoff });
    const amp = new GainNode(ctx, { gain: 0 });
    const f = filter.frequency, g = amp.gain;
    let end: number;
    if (kind === "stab") {
      f.setValueAtTime(cutoff * 4, when);
      f.exponentialRampToValueAtTime(cutoff, when + 0.06);
      g.setValueAtTime(0, when);
      g.linearRampToValueAtTime(peak, when + 0.002 + info.attack);
      g.exponentialRampToValueAtTime(0.001, when + 0.2 + info.attack);
      end = when + 0.22 + info.attack;
    } else if (kind === "pad") {
      f.setValueAtTime(cutoff, when);
      f.linearRampToValueAtTime(cutoff * 1.6, when + Math.max(0.4, dur));
      g.setValueAtTime(0, when);
      g.linearRampToValueAtTime(peak, when + 0.35);
      g.linearRampToValueAtTime(0.6 * peak, when + Math.max(0.4, dur));
      g.linearRampToValueAtTime(0, when + Math.max(0.4, dur) + 0.6);
      end = when + Math.max(0.4, dur) + 0.62;
    } else {
      const hold = Math.max(0.3, dur);
      f.setValueAtTime(cutoff * 3, when);
      f.exponentialRampToValueAtTime(cutoff, when + 0.12);
      g.setValueAtTime(0, when);
      g.linearRampToValueAtTime(peak, when + 0.003 + info.attack);
      g.exponentialRampToValueAtTime(0.2 * peak, when + 0.25);
      g.setValueAtTime(0.2 * peak, when + hold);
      g.linearRampToValueAtTime(0, when + hold + 0.08);
      end = when + hold + 0.1;
    }
    patchOscillators(ctx, this.patch, mtof(midi), when, end, filter);
    filter.connect(amp).connect(this.out);
    this.sounding.push(end);
  }

  // a chord, its notes spread by `strum` seconds from the lowest up, like a hand on a keyboard
  chord(midis: number[], when: number, dur: number, vel: number, kind: "pluck" | "stab" | "pad", strum = 0, dir: "down" | "up" = "down") {
    const order = [...midis].sort((a, b) => (dir === "down" ? a - b : b - a));
    order.forEach((m, i) => this.note(m, when + i * strum, dur, vel, kind));
  }
}

// the bass of the generated lines: five characters, monophonic, 303-style slides and accents (MaRuche/Falken)
export type BassCharacter = "acid" | "reese" | "808" | "funk" | "moog" | "fm" | "hoover" | "donk" | "berlin";

const wsCache = new WeakMap<BaseAudioContext, Float32Array>();

export class BassVoice {
  readonly out: GainNode;
  private ctx: BaseAudioContext;
  tone = 0.3;
  env = 0.5;
  character: BassCharacter = "acid";
  private prev: { amp: GainNode; oscs: OscillatorNode[]; filter?: BiquadFilterNode; end: number; freq: number } | null = null;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.out = new GainNode(ctx, { gain: 0.6 });
  }

  setTone(v: number) { this.tone = Math.max(0, Math.min(1, v)); }
  setEnv(v: number) { this.env = Math.max(0, Math.min(1, v)); }
  setCharacter(c: BassCharacter) { this.character = c; }

  note(midi: number, when: number, dur: number, vel: number, opts: { slide?: boolean; accent?: boolean } = {}) {
    const ctx = this.ctx;
    when = clampWhen(ctx, when);
    const freq = mtof(midi);
    const end = when + Math.max(dur, 0.06);
    const p = this.prev;

    if (opts.slide && p && when < p.end) {
      for (const o of p.oscs) {
        o.frequency.cancelScheduledValues(when);
        o.frequency.setValueAtTime(p.freq, when);
        o.frequency.exponentialRampToValueAtTime(freq, when + 0.06);
        o.stop(end + 0.02);
      }
      p.amp.gain.cancelScheduledValues(when);
      this.setupAmp(p.amp, when, end, vel, opts);
      p.end = end;
      p.freq = freq;
      return;
    }

    if (p && when < p.end) {
      p.amp.gain.cancelScheduledValues(when);
      p.amp.gain.setTargetAtTime(0, when, 0.008);
      p.oscs.forEach(o => o.stop(when + 0.03));
    }

    const nodes = this.buildNodes(ctx, freq, when, end, vel, opts, dur);
    this.prev = { amp: nodes.amp, oscs: nodes.oscs, filter: nodes.filter, end, freq };
  }

  private buildNodes(ctx: BaseAudioContext, freq: number, when: number, end: number, vel: number, opts: { accent?: boolean }, dur: number) {
    const c = this.character;
    const oscs: OscillatorNode[] = [];
    let filter: BiquadFilterNode | undefined;
    const amp = new GainNode(ctx, { gain: 0 });

    if (c === "acid") {
      const saw = new OscillatorNode(ctx, { type: "sawtooth", frequency: freq });
      const sine = new OscillatorNode(ctx, { type: "sine", frequency: freq });
      const sineGain = new GainNode(ctx, { gain: 0.6 });
      const low = 120 + this.tone * 900;
      const high = low + (300 + 2600 * this.env) * (opts.accent ? 1.6 : 1) * (0.5 + 0.5 * vel);
      filter = new BiquadFilterNode(ctx, { type: "lowpass", Q: opts.accent ? 10 : 7, frequency: high });
      filter.frequency.setValueAtTime(high, when);
      filter.frequency.exponentialRampToValueAtTime(low, when + (opts.accent ? 0.12 : 0.18));
      saw.connect(filter);
      sine.connect(sineGain).connect(filter);
      filter.connect(amp);
      oscs.push(saw, sine);
      this.setupAmp(amp, when, end, vel, opts);
    } else if (c === "reese") {
      const saw1 = new OscillatorNode(ctx, { type: "sawtooth", frequency: freq * Math.pow(2, 14/1200) });
      const saw2 = new OscillatorNode(ctx, { type: "sawtooth", frequency: freq * Math.pow(2, -14/1200) });
      const sine = new OscillatorNode(ctx, { type: "sine", frequency: freq * 0.5 });
      const low = 120 + this.tone * 900;
      const high = low + (300 + 2600 * this.env) * 0.5 * (0.5 + 0.5 * vel);
      filter = new BiquadFilterNode(ctx, { type: "lowpass", Q: 2, frequency: high });
      filter.frequency.setValueAtTime(high, when);
      filter.frequency.exponentialRampToValueAtTime(low, when + 0.18);
      const mix = new GainNode(ctx, { gain: 0.45 });
      saw1.connect(mix); saw2.connect(mix); mix.connect(filter);
      sine.connect(new GainNode(ctx, { gain: 0.4 })).connect(filter);
      filter.connect(amp);
      oscs.push(saw1, saw2, sine);
      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(vel * 0.7, when + 0.004);
      const holdAt = Math.max(when + 0.01, end - 0.05);
      if (end <= holdAt + 0.005) end = holdAt + 0.02;
      amp.gain.setValueAtTime(vel * 0.7, holdAt);
      amp.gain.linearRampToValueAtTime(0, end);
    } else if (c === "808") {
      const sine = new OscillatorNode(ctx, { type: "sine", frequency: freq * 1.5 });
      const shaper = this.getWaveShaper(ctx);
      sine.connect(shaper).connect(amp);
      oscs.push(sine);
      sine.frequency.setValueAtTime(freq * 1.5, when);
      sine.frequency.exponentialRampToValueAtTime(freq, when + 0.04);
      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(vel * 0.7, when + 0.004);
      const holdAt = Math.max(when + 0.01, end - 0.05);
      if (end <= holdAt + 0.005) end = holdAt + 0.02;
      amp.gain.setValueAtTime(vel * 0.7, holdAt);
      amp.gain.linearRampToValueAtTime(0, end);
    } else if (c === "funk") {
      const square = new OscillatorNode(ctx, { type: "square", frequency: freq });
      const saw = new OscillatorNode(ctx, { type: "sawtooth", frequency: freq });
      const low = 120 + this.tone * 900;
      const high = low + (300 + 2600 * this.env) * (0.5 + 0.5 * vel);
      filter = new BiquadFilterNode(ctx, { type: "lowpass", Q: 3, frequency: high });
      filter.frequency.setValueAtTime(high, when);
      filter.frequency.exponentialRampToValueAtTime(low, when + 0.06);
      square.connect(filter);
      saw.connect(new GainNode(ctx, { gain: 0.4 })).connect(filter);
      filter.connect(amp);
      oscs.push(square, saw);
      const actualEnd = when + Math.min(dur, 0.24);
      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(vel * 0.7, when + 0.004);
      amp.gain.exponentialRampToValueAtTime(0.001, actualEnd);
    } else if (c === "moog") {
      const saw = new OscillatorNode(ctx, { type: "sawtooth", frequency: freq });
      const square = new OscillatorNode(ctx, { type: "square", frequency: freq * 0.5 * Math.pow(2, -5/1200) });
      const low = 120 + this.tone * 900;
      const high = low + (300 + 2600 * this.env) * (0.5 + 0.5 * vel);
      filter = new BiquadFilterNode(ctx, { type: "lowpass", Q: 12, frequency: high });
      filter.frequency.setValueAtTime(high, when);
      filter.frequency.exponentialRampToValueAtTime(low, when + 0.25);
      saw.connect(filter);
      square.connect(new GainNode(ctx, { gain: 0.5 })).connect(filter);
      filter.connect(amp);
      oscs.push(saw, square);
      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(vel * 0.7, when + 0.004);
      const holdAt = Math.max(when + 0.01, end - 0.05);
      if (end <= holdAt + 0.005) end = holdAt + 0.02;
      amp.gain.setValueAtTime(vel * 0.7 * 0.8, holdAt);
      amp.gain.linearRampToValueAtTime(0, end);

    } else if (c === "fm") {
      const carrier = new OscillatorNode(ctx, { type: "sine", frequency: freq });
      const modulator = new OscillatorNode(ctx, { type: "sine", frequency: freq });
      const bark = new OscillatorNode(ctx, { type: "sine", frequency: freq * 2 });
      const modDepth = new GainNode(ctx, { gain: freq * (2 + 4 * this.env) });
      const barkDepth = new GainNode(ctx, { gain: freq * 0.5 });
      modulator.connect(modDepth).connect(carrier.frequency);
      bark.connect(barkDepth).connect(carrier.frequency);
      carrier.connect(amp);
      oscs.push(carrier, modulator, bark);

      modDepth.gain.setValueAtTime(freq * (2 + 4 * this.env), when);
      modDepth.gain.exponentialRampToValueAtTime(freq * (0.3 + this.tone), when + 0.25);

      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(vel * 0.7, when + 0.003);
      amp.gain.exponentialRampToValueAtTime(vel * 0.7 * 0.6, when + 0.3);
      const holdAt = Math.max(when + 0.01, end - 0.05);
      if (end <= holdAt + 0.005) end = holdAt + 0.02;
      amp.gain.setValueAtTime(vel * 0.7 * 0.6, holdAt);
      amp.gain.linearRampToValueAtTime(0, end);
    } else if (c === "hoover") {
      const saw1 = new OscillatorNode(ctx, { type: "sawtooth", frequency: freq * Math.pow(2, -25/1200) });
      const saw2 = new OscillatorNode(ctx, { type: "sawtooth", frequency: freq });
      const saw3 = new OscillatorNode(ctx, { type: "sawtooth", frequency: freq * Math.pow(2, 25/1200) });
      const mix = new GainNode(ctx, { gain: 0.4 });
      filter = new BiquadFilterNode(ctx, { type: "lowpass", Q: 1, frequency: 800 + 6000 * this.tone });

      saw1.connect(mix);
      saw2.connect(mix);
      saw3.connect(mix);
      mix.connect(filter).connect(amp);
      oscs.push(saw1, saw2, saw3);

      saw1.frequency.setValueAtTime(freq * Math.pow(2, -7/12), when);
      saw2.frequency.setValueAtTime(freq * Math.pow(2, -7/12), when);
      saw3.frequency.setValueAtTime(freq * Math.pow(2, -7/12), when);
      saw1.frequency.exponentialRampToValueAtTime(freq * Math.pow(2, -25/1200), when + 0.12);
      saw2.frequency.exponentialRampToValueAtTime(freq, when + 0.12);
      saw3.frequency.exponentialRampToValueAtTime(freq * Math.pow(2, 25/1200), when + 0.12);

      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(vel * 0.7, when + 0.02);
      const hoverHold = Math.max(when + 0.03, end - 0.08);
      if (end <= hoverHold + 0.005) end = hoverHold + 0.06;
      amp.gain.setValueAtTime(vel * 0.7, hoverHold);
      amp.gain.linearRampToValueAtTime(0, end);
    } else if (c === "donk") {
      const square = new OscillatorNode(ctx, { type: "square", frequency: freq * 1.5 });
      const sine = new OscillatorNode(ctx, { type: "sine", frequency: freq * 1.5 });
      filter = new BiquadFilterNode(ctx, { type: "bandpass", Q: 6, frequency: freq * 2.5 });

      square.connect(filter);
      sine.connect(new GainNode(ctx, { gain: 0.5 })).connect(filter);
      filter.connect(amp);
      oscs.push(square, sine);

      square.frequency.setValueAtTime(freq * 1.5, when);
      sine.frequency.setValueAtTime(freq * 1.5, when);
      square.frequency.exponentialRampToValueAtTime(freq, when + 0.03);
      sine.frequency.exponentialRampToValueAtTime(freq, when + 0.03);

      const actualEnd = when + Math.min(dur, 0.18);
      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(vel * 0.7, when + 0.002);
      amp.gain.exponentialRampToValueAtTime(0.001, actualEnd);
    } else if (c === "berlin") {
      const saw = new OscillatorNode(ctx, { type: "sawtooth", frequency: freq });
      const sine = new OscillatorNode(ctx, { type: "sine", frequency: freq });
      filter = new BiquadFilterNode(ctx, {
        type: "lowpass",
        Q: 4 + 6 * this.env,
        frequency: 200 + 2500 * this.tone + 2000 * this.env
      });

      saw.connect(filter);
      sine.connect(new GainNode(ctx, { gain: 0.5 })).connect(filter);
      filter.connect(amp);
      oscs.push(saw, sine);

      filter.frequency.setValueAtTime(200 + 2500 * this.tone + 2000 * this.env, when);
      filter.frequency.exponentialRampToValueAtTime(90 + 600 * this.tone, when + 0.09);

      const actualEnd = when + Math.min(dur, 0.22);
      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(vel * 0.7, when + 0.003);
      amp.gain.exponentialRampToValueAtTime(0.001, actualEnd);
    }

    oscs.forEach(o => { o.start(when); o.stop(end + 0.01); });
    return { oscs, filter, amp };
  }

  private setupAmp(amp: GainNode, when: number, end: number, vel: number, opts: { accent?: boolean }) {
    const top = vel * (opts.accent ? 0.85 : 0.7);
    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(top, when + 0.004);
    amp.gain.exponentialRampToValueAtTime(top * 0.65, when + 0.12);
    if (end - 0.05 > when + 0.12) amp.gain.setValueAtTime(top * 0.65, end - 0.05);
    amp.gain.linearRampToValueAtTime(0, end);
  }

  private getWaveShaper(ctx: BaseAudioContext) {
    let curve = wsCache.get(ctx);
    if (!curve) {
      curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 256) * 2 - 1;
        curve[i] = Math.tanh(x * 2);
      }
      wsCache.set(ctx, curve);
    }
    const shaper = new WaveShaperNode(ctx, { curve });
    return shaper;
  }
}

export class DrumKit {
  private ctx: BaseAudioContext;
  readonly out: GainNode;
  private static curveCache = new WeakMap<BaseAudioContext, Float32Array>();

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.out = new GainNode(this.ctx, { gain: 0.8 });
  }

  kick(when: number, vel: number, tuneHz = 50) {
    when = clampWhen(this.ctx, when);

    // Body
    const body = new OscillatorNode(this.ctx, { type: 'sine', frequency: tuneHz * 3.2 });
    body.frequency.setValueAtTime(tuneHz * 3.2, when);
    body.frequency.exponentialRampToValueAtTime(tuneHz, when + 0.09);
    const bodyGain = new GainNode(this.ctx);
    bodyGain.gain.setValueAtTime(0, when);
    bodyGain.gain.linearRampToValueAtTime(vel, when + 0.002);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, when + 0.45);

    // Clip
    let curve = DrumKit.curveCache.get(this.ctx);
    if (!curve) {
      curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i - 128) / 128;
        curve[i] = Math.tanh(x * 2.5);
      }
      DrumKit.curveCache.set(this.ctx, curve);
    }
    const clip = new WaveShaperNode(this.ctx, { curve });

    // Click
    const click = new AudioBufferSourceNode(this.ctx, { buffer: getNoiseBuffer(this.ctx) });
    const clickFilter = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: 4000, Q: 1 });
    const clickGain = new GainNode(this.ctx);
    clickGain.gain.setValueAtTime(vel * 0.35, when);
    clickGain.gain.linearRampToValueAtTime(0, when + 0.006);

    // Routing
    body.connect(bodyGain).connect(clip).connect(new GainNode(this.ctx, { gain: 0.8 })).connect(this.out);
    click.connect(clickFilter).connect(clickGain).connect(this.out);

    // Start/stop
    body.start(when);
    body.stop(when + 0.45);
    click.start(when);
    click.stop(when + 0.006);
  }

  clap(when: number, vel: number) {
    when = clampWhen(this.ctx, when);
    const filter = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: 1200, Q: 1.2 });
    const env = new GainNode(this.ctx);
    env.gain.setValueAtTime(vel * 0.7, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.22);

    // Three bursts
    for (let i = 0; i < 3; i++) {
      const burst = new AudioBufferSourceNode(this.ctx, { buffer: getNoiseBuffer(this.ctx) });
      const burstGain = new GainNode(this.ctx);
      burstGain.gain.setValueAtTime(1, when + i * 0.01);
      burstGain.gain.linearRampToValueAtTime(0.2, when + i * 0.01 + 0.008);
      burst.connect(burstGain).connect(filter).connect(env).connect(this.out);
      burst.start(when + i * 0.01);
      burst.stop(when + i * 0.01 + 0.008);
    }

    // Tail
    const tail = new AudioBufferSourceNode(this.ctx, { buffer: getNoiseBuffer(this.ctx) });
    tail.connect(filter).connect(env).connect(this.out);
    tail.start(when + 0.03);
    tail.stop(when + 0.22);
  }

  hat(when: number, vel: number, open = false) {
    when = clampWhen(this.ctx, when);
    const end = when + (open ? 0.35 : 0.05);
    const freqs = [80, 120, 167.2, 218.4, 271.2, 336.8];
    const oscGain = new GainNode(this.ctx, { gain: 1 / 6 });
    const filter = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: 10000, Q: 1 });
    const highpass = new BiquadFilterNode(this.ctx, { type: 'highpass', frequency: 7000 });
    const env = new GainNode(this.ctx);
    env.gain.setValueAtTime(vel * 0.5, when);
    env.gain.exponentialRampToValueAtTime(0.001, end);

    // Oscillators
    const oscs: OscillatorNode[] = [];
    for (const freq of freqs) {
      const osc = new OscillatorNode(this.ctx, { type: 'square', frequency: freq });
      oscs.push(osc);
    }
    oscs.forEach(osc => {
      osc.connect(oscGain).connect(filter).connect(highpass).connect(env).connect(this.out);
      osc.start(when);
      osc.stop(end + 0.01);
    });
  }
}

export class ChoirVoice {
  readonly out: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.out = new GainNode(ctx, { gain: 0.6 });
  }

  note(midi: number, when: number, dur: number, vel: number) {
    const ctx = this.out.context;
    const freq = mtof(midi);
    const gain = vel * 0.35;

    // Oscillators
    const osc1 = new OscillatorNode(ctx, { type: 'sawtooth', frequency: freq });
    const osc2 = new OscillatorNode(ctx, { type: 'sawtooth', frequency: freq });
    osc1.detune.value = 9;
    osc2.detune.value = -9;

    // Formant filters
    const formant1 = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 700, Q: 6 });
    const formant2 = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1150, Q: 7 });
    const lowpass = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3000 });

    // Envelope
    const env = new GainNode(ctx);
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.12);
    env.gain.setValueAtTime(gain, when + dur);
    env.gain.linearRampToValueAtTime(0, when + dur + 0.25);

    // Vibrato
    const vibrato = new OscillatorNode(ctx, { type: 'sine', frequency: 5.5 });
    vibrato.connect(new GainNode(ctx, { gain: 6 })).connect(osc1.detune);
    vibrato.connect(new GainNode(ctx, { gain: 6 })).connect(osc2.detune);

    // Routing
    osc1.connect(formant1).connect(lowpass).connect(env);
    osc2.connect(formant2).connect(lowpass).connect(env);
    env.connect(this.out);

    // Start/stop
    osc1.start(when);
    osc2.start(when);
    vibrato.start(when);
    osc1.stop(when + dur + 0.25);
    osc2.stop(when + dur + 0.25);
    vibrato.stop(when + dur + 0.25);
  }
}

// a build-up: rising noise and a climbing saw that land exactly on a bar (MaRuche/Falken)
export class Riser {
  readonly out: GainNode;
  private ctx: BaseAudioContext;
  private noiseGain: GainNode | null = null;
  private sawGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private sawSource: OscillatorNode | null = null;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.out = new GainNode(ctx);
    this.out.gain.value = 0.5;
  }

  play(when: number, seconds: number, rootMidi: number): void {
    if (this.noiseGain || this.sawGain) this.stop(when);

    const end = when + seconds;
    const fadeEnd = end + 0.02;
    const peak = 0.5;

    // Noise setup
    const noise = new AudioBufferSourceNode(this.ctx, { buffer: getNoiseBuffer(this.ctx), loop: true });
    const noiseFilter = new BiquadFilterNode(this.ctx, { type: 'bandpass' });
    this.noiseGain = new GainNode(this.ctx);
    noise.connect(noiseFilter).connect(this.noiseGain).connect(this.out);

    // Noise automation
    noise.start(when);
    noise.stop(fadeEnd);
    this.noiseGain.gain.setValueAtTime(0, when);
    this.noiseGain.gain.linearRampToValueAtTime(0.5, end);
    this.noiseGain.gain.setValueAtTime(peak, end);
    this.noiseGain.gain.linearRampToValueAtTime(0, fadeEnd);

    // Noise filter automation
    noiseFilter.frequency.setValueAtTime(400, when);
    noiseFilter.frequency.exponentialRampToValueAtTime(9000, end);
    noiseFilter.Q.setValueAtTime(2, when);
    noiseFilter.Q.linearRampToValueAtTime(8, end);

    // Sawtooth setup
    const saw = new OscillatorNode(this.ctx, { type: 'sawtooth' });
    const sawFilter = new BiquadFilterNode(this.ctx, { type: 'lowpass' });
    this.sawGain = new GainNode(this.ctx);
    saw.connect(sawFilter).connect(this.sawGain).connect(this.out);

    // Sawtooth automation
    saw.start(when);
    saw.stop(fadeEnd);
    this.sawGain.gain.setValueAtTime(0, when);
    this.sawGain.gain.linearRampToValueAtTime(0.18, end);
    this.sawGain.gain.setValueAtTime(0.18, end);
    this.sawGain.gain.linearRampToValueAtTime(0, fadeEnd);

    // Sawtooth pitch automation
    const startFreq = mtof(rootMidi);
    const endFreq = mtof(rootMidi + 24);
    saw.frequency.setValueAtTime(startFreq, when);
    saw.frequency.exponentialRampToValueAtTime(endFreq, end);

    // Sawtooth filter automation
    sawFilter.frequency.setValueAtTime(600, when);
    sawFilter.frequency.linearRampToValueAtTime(8000, end);

    // Store references
    this.noiseSource = noise;
    this.sawSource = saw;
  }

  stop(at: number): void {
    const fadeEnd = at + 0.03;
    const stopTime = at + 0.04;

    if (this.noiseGain) {
      this.noiseGain.gain.cancelScheduledValues(at);
      this.noiseGain.gain.setValueAtTime(this.noiseGain.gain.value, at);
      this.noiseGain.gain.linearRampToValueAtTime(0, fadeEnd);
    }

    if (this.sawGain) {
      this.sawGain.gain.cancelScheduledValues(at);
      this.sawGain.gain.setValueAtTime(this.sawGain.gain.value, at);
      this.sawGain.gain.linearRampToValueAtTime(0, fadeEnd);
    }

    if (this.noiseSource) this.noiseSource.stop(stopTime);
    if (this.sawSource) this.sawSource.stop(stopTime);

    this.noiseGain = this.sawGain = this.noiseSource = this.sawSource = null;
  }
}
