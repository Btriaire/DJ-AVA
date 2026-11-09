function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export type AmbienceSampleName = 'rain' | 'wind' | 'bowlStrike' | 'bowlSing';

export interface AmbienceSample {
  buffer: AudioBuffer;
  gain: number;
  pitchHz: number | null;
}

export const SAMPLE_FILES: Record<AmbienceSampleName, string> = {
  rain: "/ambience/rain.ogg",
  wind: "/ambience/wind.ogg",
  bowlStrike: "/ambience/bowl-strike.ogg",
  bowlSing: "/ambience/bowl-sing.ogg"
};

const sampleCache = new WeakMap<BaseAudioContext, Map<AmbienceSampleName, Promise<AmbienceSample | null>>>();

export function rmsOf(data: Float32Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}

export function peakOf(data: Float32Array): number {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]);
    if (abs > max) max = abs;
  }
  return max;
}

export function pitchRatioFor(nativeHz: number, targetHz: number): number {
  let ratio = targetHz / nativeHz;
  while (ratio > 2 ** (6 / 12)) ratio /= 2;
  while (ratio < 2 ** (-6 / 12)) ratio *= 2;
  return ratio;
}

export function estimateFundamental(data: Float32Array, sampleRate: number, loHz = 80, hiHz = 700): number | null {
  if (data.length < 2048) return null;

  const windowSize = Math.min(16384, data.length);
  const windowedData = new Float32Array(windowSize);
  for (let i = 0; i < windowSize; i++) {
    windowedData[i] = data[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (windowSize - 1)));
  }

  const freqs: number[] = [];
  const powers: number[] = [];
  const step = 1.003;
  let freq = loHz;
  let maxPower = 0;
  let maxIndex = 0;

  while (freq <= hiHz) {
    const omega = 2 * Math.PI * freq / sampleRate;
    let sinSum = 0;
    let cosSum = 0;

    for (let i = 0; i < windowSize; i++) {
      sinSum += windowedData[i] * Math.sin(omega * i);
      cosSum += windowedData[i] * Math.cos(omega * i);
    }

    const power = sinSum * sinSum + cosSum * cosSum;
    freqs.push(freq);
    powers.push(power);

    if (power > maxPower) {
      maxPower = power;
      maxIndex = freqs.length - 1;
    }

    freq *= step;
  }

  if (maxPower < 1e-9 * windowedData.reduce((sum, val) => sum + val * val, 0)) return null;

  if (maxIndex === 0 || maxIndex === freqs.length - 1) return freqs[maxIndex];

  const p0 = powers[maxIndex - 1];
  const p1 = powers[maxIndex];
  const p2 = powers[maxIndex + 1];
  const denom = p0 - 2 * p1 + p2;
  const delta = denom === 0 ? 0 : 0.5 * (p0 - p2) / denom;

  return freqs[maxIndex] * step ** delta;
}

export async function loadAmbienceSample(ctx: BaseAudioContext, name: AmbienceSampleName): Promise<AmbienceSample | null> {
  let ctxCache = sampleCache.get(ctx);
  if (!ctxCache) {
    ctxCache = new Map();
    sampleCache.set(ctx, ctxCache);
  }

  let promise = ctxCache.get(name);
  if (!promise) {
    promise = (async () => {
      try {
        const response = await fetch(SAMPLE_FILES[name]);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuffer);

        const channels: Float32Array[] = [];
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          channels.push(buffer.getChannelData(c));
        }

        const mono = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
          let sum = 0;
          for (let j = 0; j < channels.length; j++) {
            sum += channels[j][i];
          }
          mono[i] = sum / channels.length;
        }

        const rms = rmsOf(mono);
        const peak = peakOf(mono);
        const gain = name === 'bowlStrike' ? clamp(0.4 / peak, 0.05, 20) : clamp(0.05 / rms, 0.05, 20);

        let pitchHz: number | null = null;
        if (name === 'bowlStrike' || name === 'bowlSing') {
          const windowSize = Math.min(buffer.sampleRate, mono.length);
          let start = 0;
          if (name === 'bowlStrike') {
            let maxFramePower = 0;
            let maxFrameStart = 0;
            const frameSize = Math.floor(0.05 * buffer.sampleRate);
            for (let i = 0; i + frameSize <= mono.length; i += frameSize) {
              let framePower = 0;
              for (let j = 0; j < frameSize; j++) {
                framePower += mono[i + j] * mono[i + j];
              }
              if (framePower > maxFramePower) {
                maxFramePower = framePower;
                maxFrameStart = i;
              }
            }
            start = Math.max(0, Math.min(maxFrameStart + Math.floor(0.1 * buffer.sampleRate), mono.length - windowSize));
          } else {
            start = Math.floor((mono.length - windowSize) / 2);
          }

          const windowedData = mono.subarray(start, start + windowSize);
          pitchHz = estimateFundamental(windowedData, buffer.sampleRate, 80, 700);
        }

        return { buffer, gain, pitchHz };
      } catch (e) {
        console.error(`Error loading ambience sample ${name}:`, e);
        return null;
      }
    })();
    ctxCache.set(name, promise);
  }

  return promise;
}

export function sampleSelfCheck(): string[] {
  const errors: string[] = [];

  const sampleRate = 48000;
  const duration = 16384 / sampleRate;
  const t = new Float32Array(16384);
  for (let i = 0; i < 16384; i++) {
    t[i] = 0.5 * Math.sin(2 * Math.PI * 220 * i / sampleRate);
  }
  const pitch220 = estimateFundamental(t, sampleRate, 80, 700);
  if (pitch220 === null || Math.abs(pitch220 - 220) > 2.2) {
    errors.push('(a) estimateFundamental(220 Hz) failed');
  }

  for (let i = 0; i < 16384; i++) {
    t[i] = 0.5 * Math.sin(2 * Math.PI * 330 * i / sampleRate);
  }
  const pitch330 = estimateFundamental(t, sampleRate, 80, 700);
  if (pitch330 === null || Math.abs(pitch330 - 330) > 3.3) {
    errors.push('(b) estimateFundamental(330 Hz) failed');
  }

  for (let i = 0; i < 16384; i++) {
    t[i] = 0.5 * Math.sin(2 * Math.PI * 220 * i / sampleRate);
  }
  const rms220 = rmsOf(t);
  if (Math.abs(rms220 - 0.5 / Math.SQRT2) > 0.005) {
    errors.push('(c) rmsOf(0.5) failed');
  }

  const peakTest = peakOf(Float32Array.of(0.2, -0.7, 0.4));
  if (Math.abs(peakTest - 0.7) > 1e-6) {
    errors.push('(d) peakOf([0.2, -0.7, 0.4]) failed');
  }

  const ratio200to400 = pitchRatioFor(200, 400);
  if (ratio200to400 < 0.99 || ratio200to400 > 1.01) {
    errors.push('(e) pitchRatioFor(200, 400) failed');
  }

  const ratio200to300 = pitchRatioFor(200, 300);
  if (Math.abs(ratio200to300 - 0.75) > 0.01) {
    errors.push('(f) pitchRatioFor(200, 300) failed');
  }

  const ratio300to200 = pitchRatioFor(300, 200);
  if (Math.abs(ratio300to200 - 4 / 3) > 0.01) {
    errors.push('(g) pitchRatioFor(300, 200) failed');
  }

  return errors;
}
