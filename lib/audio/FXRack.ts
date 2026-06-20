export type FxName = "echo" | "reverb" | "flanger" | "phaser" | "gate" | "crush";

export const FX_LIST: { id: FxName; label: string; color: string }[] = [
  { id: "echo", label: "Echo", color: "#ff8a1e" },
  { id: "reverb", label: "Reverb", color: "#4dff84" },
  { id: "flanger", label: "Flanger", color: "#34d399" },
  { id: "phaser", label: "Phaser", color: "#fbbf24" },
  { id: "gate", label: "Gate", color: "#a3e635" },
  { id: "crush", label: "Crush", color: "#ff6a3d" },
];

// Parallel FX bus: the dry signal always passes through, and every effect runs
// on its own branch with an independent wet gain. Each effect has its own
// intensity slider, so several can be layered at once. Effects are voiced hard
// (high feedback / deep modulation / wet boost) so they hit strong.
export class FXRack {
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private ctx: AudioContext;
  private wets = new Map<FxName, GainNode>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.dry.gain.value = 1;

    this.input.connect(this.dry);
    this.dry.connect(this.output);

    for (const fx of FX_LIST) this.build(fx.id);
  }

  // wet level 0..1 for one effect; we let it push past unity so it bites
  setWet(name: FxName, v: number) {
    const wet = this.wets.get(name);
    if (wet) wet.gain.value = Math.max(0, Math.min(1, v)) * 1.6;
  }

  getWet(name: FxName): number {
    const wet = this.wets.get(name);
    return wet ? Math.min(1, wet.gain.value / 1.6) : 0;
  }

  private build(name: FxName) {
    const c = this.ctx;
    const wet = c.createGain();
    wet.gain.value = 0;

    let inNode: AudioNode;
    let outNode: AudioNode;

    if (name === "echo") {
      const delay = c.createDelay(2);
      delay.delayTime.value = 0.38;
      const fb = c.createGain();
      fb.gain.value = 0.62;
      delay.connect(fb);
      fb.connect(delay);
      inNode = outNode = delay;
    } else if (name === "reverb") {
      const conv = c.createConvolver();
      conv.buffer = this.impulse(3.2, 2.2);
      const boost = c.createGain();
      boost.gain.value = 1.5;
      conv.connect(boost);
      inNode = conv;
      outNode = boost;
    } else if (name === "flanger") {
      const delay = c.createDelay(0.05);
      delay.delayTime.value = 0.005;
      const fb = c.createGain();
      fb.gain.value = 0.85;
      const lfo = c.createOscillator();
      const depth = c.createGain();
      depth.gain.value = 0.004;
      lfo.frequency.value = 0.5;
      lfo.connect(depth);
      depth.connect(delay.delayTime);
      lfo.start();
      delay.connect(fb);
      fb.connect(delay);
      inNode = outNode = delay;
    } else if (name === "phaser") {
      const stages: BiquadFilterNode[] = [];
      for (let i = 0; i < 6; i++) {
        const ap = c.createBiquadFilter();
        ap.type = "allpass";
        ap.frequency.value = 400 + i * 350;
        ap.Q.value = 6;
        stages.push(ap);
      }
      for (let i = 0; i < stages.length - 1; i++) stages[i].connect(stages[i + 1]);
      const lfo = c.createOscillator();
      const depth = c.createGain();
      depth.gain.value = 1200;
      lfo.frequency.value = 0.6;
      lfo.connect(depth);
      stages.forEach((s) => depth.connect(s.frequency));
      lfo.start();
      inNode = stages[0];
      outNode = stages[stages.length - 1];
    } else if (name === "gate") {
      const g = c.createGain();
      g.gain.value = 1;
      const lfo = c.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = 8;
      const depth = c.createGain();
      depth.gain.value = 0.5;
      const offset = c.createConstantSource();
      offset.offset.value = 0.5;
      offset.start();
      lfo.connect(depth);
      depth.connect(g.gain);
      offset.connect(g.gain);
      lfo.start();
      inNode = outNode = g;
    } else {
      // crush
      const shaper = c.createWaveShaper();
      shaper.curve = this.crushCurve(4);
      shaper.oversample = "none";
      inNode = outNode = shaper;
    }

    this.input.connect(inNode);
    outNode.connect(wet);
    wet.connect(this.output);
    this.wets.set(name, wet);
  }

  private impulse(duration: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = rate * duration;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  private crushCurve(bits: number): Float32Array<ArrayBuffer> {
    const n = 1024;
    const curve = new Float32Array(n);
    const step = Math.pow(2, bits);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.round(x * step) / step;
    }
    return curve;
  }
}
