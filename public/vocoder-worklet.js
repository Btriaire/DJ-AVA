function bpCoefs(f, q, sr, c, co) {
  const w0 = 2 * Math.PI * f / sr, alpha = Math.sin(w0) / (2 * q), a0 = 1 + alpha;
  c[co] = alpha / a0; c[co + 1] = 0; c[co + 2] = -alpha / a0; c[co + 3] = -2 * Math.cos(w0) / a0; c[co + 4] = (1 - alpha) / a0;
}

function bp4(x, c, co, z, zo) {
  const b0 = c[co], b1 = c[co + 1], b2 = c[co + 2], a1 = c[co + 3], a2 = c[co + 4];
  const y1 = b0 * x + z[zo];      z[zo] = b1 * x - a1 * y1 + z[zo + 1];      z[zo + 1] = b2 * x - a2 * y1;
  const y2 = b0 * y1 + z[zo + 2]; z[zo + 2] = b1 * y1 - a1 * y2 + z[zo + 3]; z[zo + 3] = b2 * y1 - a2 * y2;
  return y2;
}

function polyBlep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  } else if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

class VocoderCore {
  constructor(sr, bands) {
    this.sr = sr;
    this.n = bands;
    this.on = false;
    this.formantApplied = NaN;
    this.xPrev = 0;
    this.gateGain = 0;
    this.uMix = 0;
    this.seed = 22222;
    this.zeroBuffer = new Float32Array(128);

    const lo = 80, hi = Math.min(11000, 0.45 * sr);
    const w = Math.log2(hi / lo) / bands;
    const q = Math.sqrt(2 ** w) / (2 ** w - 1);

    this.modCoefs = new Float64Array(bands * 5);
    this.carCoefs = new Float64Array(bands * 5);
    this.ms = new Float64Array(bands * 4);
    this.cs = new Float64Array(bands * 4);
    this.env = new Float64Array(bands);
    this.makeup = new Float64Array(bands);
    this.gl = new Float64Array(bands);
    this.gr = new Float64Array(bands);
    this.isHigh = new Uint8Array(bands);

    for (let k = 0; k < bands; k++) {
      const f = lo * (hi / lo) ** ((k + 0.5) / bands);
      bpCoefs(f, q, sr, this.modCoefs, k * 5);
      this.makeup[k] = 7.5 * Math.sqrt(f / 500) * Math.sqrt(bands / 24);
      this.isHigh[k] = f > 4000 ? 1 : 0;
    }

    this.target = new Float64Array(4);
    this.active = new Float64Array(4);
    this.freq = new Float64Array(4);
    this.gain = new Float64Array(4);
    this.phase = new Float64Array(12);
    this.detune = [2 ** (-7 / 1200), 1, 2 ** (7 / 1200)];
    this.wave = "saw";
    this.octave = 1;
    this.mono = false;
    this.trim = 1;
    this.midis = [];

    const w0 = 2 * Math.PI * 5000 / sr, alpha = Math.sin(w0) / (2 * 0.707), a0 = 1 + alpha;
    this.hpCoefs = [(1 + Math.cos(w0)) / 2 / a0, -(1 + Math.cos(w0)) / a0, (1 + Math.cos(w0)) / 2 / a0, -2 * Math.cos(w0) / a0, (1 - alpha) / a0];
    this.hp = new Float64Array(2);
  }

  setRun(on) {
    this.on = on;
    if (!on) {
      for (let v = 0; v < 4; v++) {
        this.gain[v] = 0;
        this.active[v] = 0;
      }
      this.gateGain = 0;
      this.env.fill(0);
    }
  }

  setVariant(v) {
    this.wave = v.wave;
    this.octave = 2 ** v.octave;
    this.mono = v.mono;
    this.detune = [2 ** (-v.detune / 1200), 1, 2 ** (v.detune / 1200)];
    this.trim = v.trim;
    this.setChord(this.midis);
  }

  setChord(midis) {
    this.midis = midis;
    const list = this.mono && midis.length ? [Math.min(...midis)] : midis;
    for (let v = 0; v < 4; v++) {
      if (v < list.length) {
        this.target[v] = 440 * 2 ** ((list[v] - 69) / 12) * this.octave;
        this.active[v] = 1;
        if (this.gain[v] < 1e-5) this.freq[v] = this.target[v];
      } else {
        this.active[v] = 0;
      }
    }
  }

  carrierCoefs() {
    const hi = Math.min(11000, 0.45 * this.sr);
    const w = Math.log2(hi / 80) / this.n;
    const q = Math.sqrt(2 ** w) / (2 ** w - 1);
    for (let k = 0; k < this.n; k++) {
      const f = 80 * (hi / 80) ** ((k + 0.5) / this.n) * 2 ** (this.formantApplied / 12);
      bpCoefs(Math.min(Math.max(f, 40), hi), q, this.sr, this.carCoefs, k * 5);
    }
  }

  process(input, outL, outR, p) {
    if (!this.on) { outL.fill(0); outR.fill(0); return; }
    if (p.formant !== this.formantApplied) { this.formantApplied = p.formant; this.carrierCoefs(); }
    const n = outL.length;
    let gateTarget = 0;
    if (input) {
      let sum = 0, sum2 = 0;
      for (let i = 0; i < n; i++) {
        const x = input[i];
        sum += x;
        sum2 += x * x;
      }
      const rms = Math.sqrt(sum2 / n - (sum / n) ** 2);
      gateTarget = 20 * Math.log10(rms + 1e-12) > p.gate ? 1 : 0;
    }
    const a = Math.exp(-1 / (0.002 * this.sr));
    const b = Math.exp(-1 / (p.release * this.sr));
    const gc = Math.exp(-1 / (0.01 * this.sr));
    const nc = Math.exp(-1 / (0.015 * this.sr));
    let seed = this.seed;
    let sumEnv = 0, sumHighEnv = 0;
    for (let k = 0; k < this.n; k++) {
      this.gl[k] = k % 2 === 0 ? 1 : 1 - p.spread;
      this.gr[k] = k % 2 === 0 ? 1 - p.spread : 1;
    }
    for (let i = 0; i < n; i++) {
      const x = input ? input[i] : 0;
      const m = x - 0.7 * this.xPrev; this.xPrev = x;
      this.gateGain = gc * this.gateGain + (1 - gc) * gateTarget;
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
      const white = seed / 2147483648 - 1;
      let tone = 0;
      if (this.wave === "noise") {
        tone = white * 0.6;
      } else {
        for (let v = 0; v < 4; v++) {
          this.freq[v] = nc * this.freq[v] + (1 - nc) * this.target[v];
          this.gain[v] = nc * this.gain[v] + (1 - nc) * this.active[v];
          if (this.gain[v] < 1e-5) continue;
          for (let d = 0; d < 3; d++) {
            const dt = this.freq[v] * this.detune[d] / this.sr;
            let t = this.phase[v * 3 + d] + dt; if (t >= 1) t -= 1; this.phase[v * 3 + d] = t;
            let s;
            if (this.wave === "saw") {
              s = 2 * t - 1 - polyBlep(t, dt);
            } else if (this.wave === "square") {
              let t2 = t + 0.5; if (t2 >= 1) t2 -= 1;
              s = (t < 0.5 ? 1 : -1) + polyBlep(t, dt) - polyBlep(t2, dt);
            } else if (this.wave === "bell") {
              s = Math.sin(2 * Math.PI * t + 2.5 * Math.sin(6 * Math.PI * t));
            }
            tone += this.gain[v] * 0.25 * s;
          }
        }
      }
      const c = tone * (1 - 0.8 * this.uMix * p.noise) + white * (this.uMix * p.noise * 1.5 + 0.04 * p.noise);
      let L = 0, R = 0;
      for (let k = 0; k < this.n; k++) {
        const mb = bp4(m, this.modCoefs, k * 5, this.ms, k * 4);
        const r = Math.abs(mb);
        this.env[k] = r > this.env[k] ? a * this.env[k] + (1 - a) * r : b * this.env[k] + (1 - b) * r;
        const cb = bp4(c, this.carCoefs, k * 5, this.cs, k * 4);
        const y = cb * this.env[k] * this.gateGain * this.makeup[k] * this.trim;
        L += y * this.gl[k];
        R += y * this.gr[k];
        sumEnv += this.env[k];
        sumHighEnv += this.env[k] * this.isHigh[k];
      }
      const hp = this.hpCoefs[0] * x + this.hp[0];
      this.hp[0] = this.hpCoefs[1] * x - this.hpCoefs[3] * hp + this.hp[1];
      this.hp[1] = this.hpCoefs[2] * x - this.hpCoefs[4] * hp;
      L += hp * this.gateGain * 0.15 * p.noise;
      R += hp * this.gateGain * 0.15 * p.noise;
      outL[i] = Math.tanh(L);
      outR[i] = Math.tanh(R);
    }
    this.seed = seed;
    const u = sumHighEnv / (sumEnv + 1e-9);
    this.uMix = 0.7 * this.uMix + 0.3 * Math.min(1, Math.max(0, (u - 0.25) / 0.35));
  }
}

if (typeof exportsBox !== "undefined") {
  exportsBox.VocoderCore = VocoderCore;
  exportsBox.bp4 = bp4;
  exportsBox.bpCoefs = bpCoefs;
}

if (typeof registerProcessor === "function") {
  registerProcessor("vocoder", class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        { name: "formant", defaultValue: 0, minValue: -12, maxValue: 12, automationRate: "k-rate" },
        { name: "release", defaultValue: 0.06, minValue: 0.01, maxValue: 0.4, automationRate: "k-rate" },
        { name: "noise", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
        { name: "spread", defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: "k-rate" },
        { name: "gate", defaultValue: -55, minValue: -80, maxValue: -20, automationRate: "k-rate" }
      ];
    }

    constructor(options) {
      super();
      this.core = new VocoderCore(sampleRate, options?.processorOptions?.bands ?? 24);
      this.queue = [];
      this.mono = new Float32Array(128);
      this.running = false;
      this.lastMidis = [];
      this.bands = options?.processorOptions?.bands ?? 24;
      this.port.onmessage = (e) => {
        if (e.data.type === "chord") {
          this.queue.push({ type: "chord", midis: e.data.midis, when: e.data.when });
          this.queue.sort((a, b) => a.when - b.when);
        } else if (e.data.type === "run") {
          this.running = e.data.on;
          this.core.setRun(e.data.on);
        } else if (e.data.type === "variant") {
          const variant = e.data.variant;
          if (variant.bands !== this.bands) {
            this.core = new VocoderCore(sampleRate, variant.bands);
            this.bands = variant.bands;
            this.core.setRun(this.running);
          }
          this.core.setVariant(variant);
          this.core.setChord(this.lastMidis);
        }
      };
    }

    process(inputs, outputs, parameters) {
      let input = null;
      if (inputs[0] && inputs[0].length > 0) {
        const n = inputs[0][0].length;
        for (let i = 0; i < n; i++) {
          let sum = 0;
          for (let c = 0; c < inputs[0].length; c++) {
            sum += inputs[0][c][i];
          }
          this.mono[i] = sum / inputs[0].length;
        }
        input = this.mono;
      }
      const outL = outputs[0][0];
      const outR = outputs[0][1] || outputs[0][0];
      const p = {
        formant: parameters.formant[0],
        release: parameters.release[0],
        noise: parameters.noise[0],
        spread: parameters.spread[0],
        gate: parameters.gate[0]
      };
      while (this.queue.length > 0 && this.queue[0].when <= currentTime) {
        const msg = this.queue.shift();
        if (msg.type === "chord") {
          this.lastMidis = msg.midis;
          this.core.setChord(msg.midis);
        }
      }
      this.core.process(input, outL, outR, p);
      return true;
    }
  });
}
