// Monophonic Auto-Tune AudioWorklet.
//
// Pipeline, per sample block:
//   1. feed a mono mix into a sliding window and, every ~23 ms, estimate the
//      fundamental frequency by normalized autocorrelation (vocal range 75 Hz–1 kHz);
//   2. snap that pitch to the nearest note of the chosen scale (target ratio);
//   3. pitch-shift the audio toward the target with a granular (delay-line)
//      shifter — two half-grain-offset taps, sine-windowed and crossfaded.
//
// `amount` blends between the original pitch (1) and the corrected pitch; low
// `retune` = instant/robotic ("hard tune"), high = a smooth glide. It's a
// monophonic effect, so it shines on a solo vocal — solo the VOIX stem.
class AutotuneProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "amount", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "retune", defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.sr = sampleRate;
    this.grainSize = Math.max(256, Math.floor(this.sr * 0.03)); // ~30 ms grains
    this.dlen = 8192; // delay line length (> grainSize)
    this.delayL = new Float32Array(this.dlen);
    this.delayR = new Float32Array(this.dlen);
    this.wpos = 0;
    this.phase = 0;

    // pitch-detection sliding window
    this.win = 2048;
    this.ring = new Float32Array(this.win);
    this.rpos = 0;
    this.lin = new Float32Array(this.win);
    this.detectEvery = 1024;
    this.sinceDetect = 0;

    this.detectedHz = 0;
    this.ratio = 1; // currently applied shift ratio
    this.targetRatio = 1; // ratio that snaps detected -> nearest scale note

    // absolute pitch classes (0..11) the pitch is allowed to land on
    this.classes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d && d.type === "scale" && Array.isArray(d.classes) && d.classes.length) {
        this.classes = d.classes.slice();
      }
    };
  }

  // estimate the fundamental of the current window by autocorrelation
  detect() {
    const n = this.win;
    const buf = this.lin;
    // copy the ring into time order (oldest -> newest)
    let idx = this.rpos;
    for (let i = 0; i < n; i++) {
      buf[i] = this.ring[idx];
      idx++;
      if (idx >= n) idx = 0;
    }
    let norm0 = 0;
    for (let i = 0; i < n; i++) norm0 += buf[i] * buf[i];
    const rms = Math.sqrt(norm0 / n);
    if (rms < 0.006) {
      this.detectedHz = 0;
      return;
    }
    const minHz = 75;
    const maxHz = 1000;
    const maxLag = Math.min(n - 1, Math.floor(this.sr / minHz));
    const minLag = Math.max(2, Math.floor(this.sr / maxHz));
    let best = 0;
    let bestLag = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      const lim = n - lag;
      for (let i = 0; i < lim; i++) sum += buf[i] * buf[i + lag];
      const nac = sum / (norm0 + 1e-9);
      if (nac > best) {
        best = nac;
        bestLag = lag;
      }
    }
    this.detectedHz = bestLag > 0 && best > 0.3 ? this.sr / bestLag : 0;
  }

  // pick the nearest allowed note and set targetRatio = noteHz / detectedHz
  snap() {
    const f = this.detectedHz;
    if (!f) {
      this.targetRatio = 1;
      return;
    }
    const midi = 69 + 12 * Math.log2(f / 440);
    const base = Math.round(midi);
    let bestM = base;
    let bestD = Infinity;
    for (let m = base - 2; m <= base + 2; m++) {
      const pc = ((m % 12) + 12) % 12;
      if (this.classes.indexOf(pc) === -1) continue;
      const d = Math.abs(m - midi);
      if (d < bestD) {
        bestD = d;
        bestM = m;
      }
    }
    if (bestD === Infinity) {
      this.targetRatio = 1;
      return;
    }
    const tHz = 440 * Math.pow(2, (bestM - 69) / 12);
    let r = tHz / f;
    if (r > 2) r = 2;
    if (r < 0.5) r = 0.5;
    this.targetRatio = r;
  }

  // fractional (linear-interpolated) read from a delay buffer; pos in [0, dlen)
  read(buf, pos) {
    let i = Math.floor(pos);
    const frac = pos - i;
    i %= this.dlen;
    if (i < 0) i += this.dlen;
    let j = i + 1;
    if (j >= this.dlen) j = 0;
    return buf[i] * (1 - frac) + buf[j] * frac;
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    const inL = input[0];
    const inR = input[1] || input[0];
    const outL = output[0];
    const outR = output[1] || output[0];
    const blockLen = inL.length;
    const amount = params.amount.length ? params.amount[0] : params.amount;
    const retune = params.retune.length ? params.retune[0] : params.retune;
    const tc = 0.002 + retune * 0.08; // glide time constant (s)
    const glide = Math.exp(-1 / (tc * this.sr));
    const gs = this.grainSize;

    for (let s = 0; s < blockLen; s++) {
      const l = inL[s];
      const r = inR[s];

      // feed pitch detection (mono mix)
      this.ring[this.rpos] = 0.5 * (l + r);
      this.rpos++;
      if (this.rpos >= this.win) this.rpos = 0;
      this.sinceDetect++;
      if (this.sinceDetect >= this.detectEvery) {
        this.sinceDetect = 0;
        this.detect();
        this.snap();
      }

      // blend toward the corrected ratio by `amount`, then glide smoothly
      const goal = 1 + (this.targetRatio - 1) * amount;
      this.ratio = this.ratio * glide + goal * (1 - glide);

      // write into the delay line
      this.delayL[this.wpos] = l;
      this.delayR[this.wpos] = r;

      // advance the grain phase; wrap within one grain
      this.phase += 1 - this.ratio;
      if (this.phase >= gs) this.phase -= gs;
      if (this.phase < 0) this.phase += gs;
      const p2 = (this.phase + gs * 0.5) % gs;
      const w1 = Math.sin((Math.PI * this.phase) / gs);
      const w2 = Math.sin((Math.PI * p2) / gs);

      let rp1 = this.wpos - this.phase;
      let rp2 = this.wpos - p2;
      if (rp1 < 0) rp1 += this.dlen;
      if (rp2 < 0) rp2 += this.dlen;

      outL[s] = w1 * this.read(this.delayL, rp1) + w2 * this.read(this.delayL, rp2);
      outR[s] = w1 * this.read(this.delayR, rp1) + w2 * this.read(this.delayR, rp2);

      this.wpos++;
      if (this.wpos >= this.dlen) this.wpos = 0;
    }
    return true;
  }
}

registerProcessor("autotune", AutotuneProcessor);
