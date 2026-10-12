export interface EqBuilt {
  fxIn: AudioNode;
  fxOut: AudioNode;
  onParam: (key: string, v: number) => void;
  onFlag: (key: string, on: boolean) => void;
  response: (freqs: Float32Array, out: Float32Array) => void;
  readonly pre: AnalyserNode;
  readonly post: AnalyserNode;
}

export function eqQ(v: number): number {
  return 0.7 * 6 ** Math.max(0, Math.min(1, v));
}

export function peakingMagDb(f: number, f0: number, gainDb: number, q: number, sr: number): number {
  if (gainDb === 0) return 0;

  const A = 10 ** (gainDb / 40);
  const w0 = 2 * Math.PI * f0 / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const w = 2 * Math.PI * f / sr;

  const b0 = 1 + alpha * A;
  const b1 = -2 * Math.cos(w0);
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha / A;

  const reN = b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w);
  const imN = -(b1 * Math.sin(w) + b2 * Math.sin(2 * w));
  const reD = a0 + a1 * Math.cos(w) + a2 * Math.cos(2 * w);
  const imD = -(a1 * Math.sin(w) + a2 * Math.sin(2 * w));

  return 10 * Math.log10((reN * reN + imN * imN) / (reD * reD + imD * imD));
}

export function buildEq(c: BaseAudioContext, freqs: number[]): EqBuilt {
  const inGain = c.createGain();
  const makeup = c.createGain();
  const outGain = c.createGain();
  const bands: BiquadFilterNode[] = [];
  const gains: number[] = [];
  let qv = eqQ(0.62);
  let autoOn = false;
  const sr = c.sampleRate;

  // Create bands
  for (const f of freqs) {
    const band = c.createBiquadFilter();
    band.type = 'peaking';
    band.frequency.value = f;
    band.gain.value = 0;
    band.Q.value = qv;
    bands.push(band);
    gains.push(0);
  }

  // Connect chain
  let prev: AudioNode = inGain;
  for (const band of bands) {
    prev.connect(band);
    prev = band;
  }
  prev.connect(makeup);
  makeup.connect(outGain);

  // Analysers
  const pre = c.createAnalyser();
  const post = c.createAnalyser();
  inGain.connect(pre);
  outGain.connect(post);

  pre.fftSize = 2048;
  pre.smoothingTimeConstant = 0.8;
  post.fftSize = 2048;
  post.smoothingTimeConstant = 0.8;

  // Auto compensation
  function autoDb(): number {
    const fs = new Float32Array(32);
    const out = new Float32Array(32);
    for (let i = 0; i < 32; i++) {
      fs[i] = 40 * 2 ** (i / 32 * Math.log2(12000 / 40));
    }
    for (let i = 0; i < 32; i++) {
      out[i] = totalDb(fs[i]);
    }
    const avg = out.reduce((a, b) => a + b, 0) / 32;
    return Math.max(-9, Math.min(9, -avg));
  }

  function applyAuto() {
    makeup.gain.setTargetAtTime(
      autoOn ? 10 ** (autoDb() / 20) : 1,
      c.currentTime,
      0.05
    );
  }

  function totalDb(f: number): number {
    let sum = 0;
    for (let i = 0; i < freqs.length; i++) {
      sum += peakingMagDb(f, freqs[i], gains[i], qv, sr);
    }
    return sum;
  }

  return {
    fxIn: inGain,
    fxOut: outGain,
    pre,
    post,
    onParam(key, v) {
      if (key.startsWith('g')) {
        const i = parseInt(key.slice(1), 10);
        if (i >= 0 && i < gains.length) {
          gains[i] = Math.max(-18, Math.min(18, v));
          bands[i].gain.setTargetAtTime(gains[i], c.currentTime, 0.02);
          applyAuto();
        }
      } else if (key === 'q') {
        qv = eqQ(v);
        for (const band of bands) {
          band.Q.setTargetAtTime(qv, c.currentTime, 0.02);
        }
        applyAuto();
      }
    },
    onFlag(key, on) {
      if (key === 'auto') {
        autoOn = on;
        applyAuto();
      }
    },
    response(fs, out) {
      for (let i = 0; i < fs.length; i++) {
        out[i] = totalDb(fs[i]) + (autoOn ? autoDb() : 0);
      }
    }
  };
}
