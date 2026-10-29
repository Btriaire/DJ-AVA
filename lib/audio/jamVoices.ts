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

export class PolySynth {
  readonly out: GainNode;
  private _tone = 0.55;
  private sounding: [number, number][] = [];

  constructor(ctx: BaseAudioContext) {
    this.out = new GainNode(ctx, { gain: 0.5 });
  }

  get tone() { return this._tone; }
  setTone(v: number) { this._tone = Math.min(1, Math.max(0, v)); }

  note(midi: number, when: number, dur: number, vel: number, kind: "pluck" | "stab" | "pad") {
    const ctx = this.out.context;
    when = clampWhen(ctx, when);
    const now = ctx.currentTime;

    this.sounding = this.sounding.filter((v) => v[1] > now);
    if (this.sounding.length >= 8) return;

    const voiceGain = new GainNode(ctx, { gain: 0 });
    const cutoff = 300 + this._tone ** 2 * 7000;
    const filter = new BiquadFilterNode(ctx, { type: "lowpass", Q: 4, frequency: cutoff });

    const osc1 = new OscillatorNode(ctx, { type: "sawtooth", frequency: mtof(midi), detune: 7 });
    const osc2 = new OscillatorNode(ctx, { type: "sawtooth", frequency: mtof(midi), detune: -7 });
    const osc3 = new OscillatorNode(ctx, { type: "square", frequency: mtof(midi - 12) });
    const oscGain = new GainNode(ctx, { gain: 0.25 });

    osc3.connect(oscGain).connect(filter);
    [osc1, osc2].forEach(osc => osc.connect(filter));

    if (kind === "pluck") {
      filter.frequency.setValueAtTime(cutoff * 3, when);
      filter.frequency.exponentialRampToValueAtTime(cutoff, when + 0.12);
      voiceGain.gain.setValueAtTime(0, when);
      voiceGain.gain.linearRampToValueAtTime(0.22 * vel, when + 0.003);
      voiceGain.gain.exponentialRampToValueAtTime(0.2 * 0.22 * vel, when + 0.25);
      const end = Math.max(when + dur, when + 0.3);
      voiceGain.gain.linearRampToValueAtTime(0.001, end - 0.08);
    } else if (kind === "stab") {
      filter.frequency.setValueAtTime(cutoff * 4, when);
      filter.frequency.exponentialRampToValueAtTime(cutoff, when + 0.06);
      voiceGain.gain.setValueAtTime(0, when);
      voiceGain.gain.linearRampToValueAtTime(0.22 * vel, when + 0.002);
      voiceGain.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
    } else {
      filter.frequency.linearRampToValueAtTime(cutoff * 1.6, when + dur);
      voiceGain.gain.setValueAtTime(0, when);
      voiceGain.gain.linearRampToValueAtTime(0.22 * vel, when + 0.35);
      voiceGain.gain.linearRampToValueAtTime(0.6 * 0.22 * vel, when + dur);
      voiceGain.gain.linearRampToValueAtTime(0.001, when + dur + 0.6);
    }

    [osc1, osc2, osc3].forEach(osc => {
      osc.start(when);
      osc.stop(when + dur + (kind === "pad" ? 0.6 : 0.2));
    });

    filter.connect(voiceGain).connect(this.out);
    const endTime = when + dur + (kind === "pad" ? 0.6 : 0.2) + 0.02;
    this.sounding.push([when, endTime]);
  }

  chord(midis: number[], when: number, dur: number, vel: number, kind: "pluck" | "stab" | "pad") {
    midis.forEach(m => this.note(m, when, dur, vel, kind));
  }
}


export class DrumKit {
  readonly out: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.out = new GainNode(ctx, { gain: 0.8 });
  }

  kick(when: number, vel: number): void {
    when = clampWhen(this.out.context, when);
    const ctx = this.out.context;
    const osc = new OscillatorNode(ctx, { type: 'sine', frequency: 150 });
    const env = new GainNode(ctx);
    osc.connect(env).connect(this.out);

    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    env.gain.setValueAtTime(vel, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.35);

    const click = new GainNode(ctx);
    const noise = getNoiseBuffer(ctx);
    const src = new AudioBufferSourceNode(ctx, { buffer: noise });
    const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 3000 });
    src.connect(hp).connect(click).connect(this.out);
    click.gain.setValueAtTime(vel * 0.3, when);
    click.gain.linearRampToValueAtTime(0, when + 0.004);

    osc.start(when);
    src.start(when, Math.random() * 0.5);
    osc.stop(when + 0.35);
    src.stop(when + 0.004);
  }

  clap(when: number, vel: number): void {
    when = clampWhen(this.out.context, when);
    const ctx = this.out.context;
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1200, Q: 1.2 });
    const env = new GainNode(ctx);
    env.gain.setValueAtTime(vel * 0.7, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.21);
    const noise = getNoiseBuffer(ctx);

    bp.connect(env).connect(this.out);
    for (let i = 0; i < 3; i++) {
      const src = new AudioBufferSourceNode(ctx, { buffer: noise });
      const burstEnv = new GainNode(ctx);
      src.connect(burstEnv).connect(bp);
      burstEnv.gain.setValueAtTime(1, when + i * 0.01);
      burstEnv.gain.linearRampToValueAtTime(0.2, when + i * 0.01 + 0.008);
      src.start(when + i * 0.01);
      src.stop(when + i * 0.01 + 0.005);
    }

    const tail = new AudioBufferSourceNode(ctx, { buffer: noise });
    tail.connect(bp);
    tail.start(when + 0.03);
    tail.stop(when + 0.21);
  }

  hat(when: number, vel: number, open = false): void {
    when = clampWhen(this.out.context, when);
    const ctx = this.out.context;
    const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 7500 });
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 10000, Q: 0.8 });
    const env = new GainNode(ctx);
    env.gain.setValueAtTime(vel * 0.45, when);
    env.gain.exponentialRampToValueAtTime(0.001, when + (open ? 0.32 : 0.045));
    const noise = getNoiseBuffer(ctx);
    const src = new AudioBufferSourceNode(ctx, { buffer: noise });

    src.connect(hp).connect(bp).connect(env).connect(this.out);
    src.start(when);
    src.stop(when + (open ? 0.32 : 0.045) + 0.01);
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

