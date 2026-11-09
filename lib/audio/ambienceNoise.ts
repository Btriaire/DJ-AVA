export function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function pinkNoiseData(n: number, random: () => number = Math.random): Float32Array<ArrayBuffer> {
  const data = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let maxAbs = 0;

  for (let i = 0; i < n; i++) {
    const white = random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    data[i] = pink;
    maxAbs = Math.max(maxAbs, Math.abs(pink));
  }

  for (let i = 0; i < n; i++) {
    data[i] *= 0.9 / maxAbs;
  }

  return data;
}

export function crossfadeLoop(data: Float32Array, n: number, F: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    if (i < F) {
      const t = i / F;
      out[i] = data[i] * Math.sin(t * Math.PI / 2) + data[n + i] * Math.cos(t * Math.PI / 2);
    } else {
      out[i] = data[i];
    }
  }

  return out;
}

export function loopedNoiseBuffer(ctx: BaseAudioContext, seconds: number, channels: number = 1): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const n = Math.round(seconds * sampleRate);
  const F = Math.round(sampleRate);
  const buffer = ctx.createBuffer(channels, n, sampleRate);

  for (let c = 0; c < channels; c++) {
    const data = pinkNoiseData(n + F);
    const out = crossfadeLoop(data, n, F);
    buffer.copyToChannel(out, c);
  }

  return buffer;
}

export function wander(param: AudioParam, ctx: BaseAudioContext, opts: { min: number; max: number; minSec: number; maxSec: number; tc?: number }): () => void {
  let timer: number | null = null;

  function step() {
    const v = rand(opts.min, opts.max);
    const delay = rand(opts.minSec, opts.maxSec);
    param.setTargetAtTime(v, ctx.currentTime, opts.tc ?? delay / 3);
    timer = window.setTimeout(step, delay * 1000);
  }

  step();

  return () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
}

export function noiseSelfCheck(): string[] {
  const errors: string[] = [];

  // Test 1: pinkNoiseData properties
  const data = pinkNoiseData(48000, lcg(1));
  let maxAbs = 0;
  let allFinite = true;

  for (let i = 0; i < data.length; i++) {
    maxAbs = Math.max(maxAbs, Math.abs(data[i]));
    if (!Number.isFinite(data[i])) {
      allFinite = false;
    }
  }

  if (!allFinite) {
    errors.push('Pink noise data contains non-finite values');
  }

  if (Math.abs(maxAbs - 0.9) > 1e-6) {
    errors.push(`Pink noise data max absolute value is ${maxAbs}, expected ~0.9`);
  }

  // Test 2: energy comparison
  const smoothed = new Float32Array(data.length);
  const residual = new Float32Array(data.length);
  let energySmoothed = 0;
  let energyResidual = 0;

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - 15);
    let sum = 0;
    for (let j = start; j <= i; j++) {
      sum += data[j];
    }
    smoothed[i] = sum / (i - start + 1);
    residual[i] = data[i] - smoothed[i];
    energySmoothed += smoothed[i] * smoothed[i];
    energyResidual += residual[i] * residual[i];
  }

  if (energySmoothed <= energyResidual) {
    errors.push(`Energy of smoothed signal (${energySmoothed}) is not greater than energy of residual (${energyResidual})`);
  }

  // Test 3: crossfadeLoop properties
  const n = 1000;
  const F = 200;
  const testData = new Float32Array(n + F);
  for (let i = 0; i < testData.length; i++) {
    testData[i] = i;
  }
  const testOut = crossfadeLoop(testData, n, F);

  if (testOut.length !== n) {
    errors.push(`Crossfade loop output length is ${testOut.length}, expected ${n}`);
  }

  if (testOut[F] !== F) {
    errors.push(`Crossfade loop output at index ${F} is ${testOut[F]}, expected ${F}`);
  }

  if (testOut[0] !== n) {
    errors.push(`Crossfade loop output at index 0 is ${testOut[0]}, expected ${n}`);
  }

  for (let i = 0; i < F; i++) {
    const minVal = Math.min(testData[i], testData[n + i]);
    const maxVal = Math.max(testData[i], testData[n + i]);
    if (testOut[i] < minVal || testOut[i] > maxVal) {
      errors.push(`Crossfade loop output at index ${i} is ${testOut[i]}, expected between ${minVal} and ${maxVal}`);
    }
  }

  return errors;
}
