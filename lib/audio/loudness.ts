export interface LoudnessResult {
  lufs: number;
  truePeakDb: number;
}

interface KFilterState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface KFilterCoefficients {
  b0Stage1: number;
  b1Stage1: number;
  b2Stage1: number;
  a1Stage1: number;
  a2Stage1: number;
  b0Stage2: number;
  b1Stage2: number;
  b2Stage2: number;
  a1Stage2: number;
  a2Stage2: number;
}

interface KFilterConfig {
  coefficients: KFilterCoefficients;
  initialState: KFilterState;
}

function createKFilterCoefficients(fs: number): KFilterCoefficients {
  // Stage 1: High-shelf filter
  const f0Stage1 = 1681.974450955533;
  const G = 3.999843853973347;
  const QStage1 = 0.7071752369554196;
  const KStage1 = Math.tan(Math.PI * f0Stage1 / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0Stage1 = 1 + KStage1 / QStage1 + KStage1 * KStage1;
  const b0Stage1 = (Vh + Vb * KStage1 / QStage1 + KStage1 * KStage1) / a0Stage1;
  const b1Stage1 = 2 * (KStage1 * KStage1 - Vh) / a0Stage1;
  const b2Stage1 = (Vh - Vb * KStage1 / QStage1 + KStage1 * KStage1) / a0Stage1;
  const a1Stage1 = 2 * (KStage1 * KStage1 - 1) / a0Stage1;
  const a2Stage1 = (1 - KStage1 / QStage1 + KStage1 * KStage1) / a0Stage1;

  // Stage 2: High-pass filter
  const f0Stage2 = 38.13547087602444;
  const QStage2 = 0.5003270373238773;
  const KStage2 = Math.tan(Math.PI * f0Stage2 / fs);
  const a0Stage2 = 1 + KStage2 / QStage2 + KStage2 * KStage2;
  const b0Stage2 = 1 / a0Stage2;
  const b1Stage2 = -2 / a0Stage2;
  const b2Stage2 = 1 / a0Stage2;
  const a1Stage2 = 2 * (KStage2 * KStage2 - 1) / a0Stage2;
  const a2Stage2 = (1 - KStage2 / QStage2 + KStage2 * KStage2) / a0Stage2;

  return {
    b0Stage1,
    b1Stage1,
    b2Stage1,
    a1Stage1,
    a2Stage1,
    b0Stage2,
    b1Stage2,
    b2Stage2,
    a1Stage2,
    a2Stage2,
  };
}

function createKFilter(fs: number): KFilterConfig {
  const coefficients = createKFilterCoefficients(fs);
  const initialState: KFilterState = { x1: 0, x2: 0, y1: 0, y2: 0 };

  return {
    coefficients,
    initialState,
  };
}

function applyKFilter(
  input: Float32Array,
  output: Float32Array,
  config: KFilterConfig,
): void {
  const { coefficients } = config;
  const state1: KFilterState = { ...config.initialState };
  const state2: KFilterState = { ...config.initialState };

  for (let i = 0; i < input.length; i++) {
    const x = input[i];

    // Stage 1
    const yStage1 = coefficients.b0Stage1 * x + coefficients.b1Stage1 * state1.x1 + coefficients.b2Stage1 * state1.x2
      - coefficients.a1Stage1 * state1.y1 - coefficients.a2Stage1 * state1.y2;
    state1.x2 = state1.x1;
    state1.x1 = x;
    state1.y2 = state1.y1;
    state1.y1 = yStage1;

    // Stage 2
    const yStage2 = coefficients.b0Stage2 * yStage1 + coefficients.b1Stage2 * state2.x1 + coefficients.b2Stage2 * state2.x2
      - coefficients.a1Stage2 * state2.y1 - coefficients.a2Stage2 * state2.y2;
    state2.x2 = state2.x1;
    state2.x1 = yStage1;
    state2.y2 = state2.y1;
    state2.y1 = yStage2;

    output[i] = yStage2;
  }
}

function calculateLufs(buffer: AudioBuffer): number {
  const fs = buffer.sampleRate;
  const blockSize = Math.round(0.4 * fs);
  const stepSize = Math.round(0.1 * fs);
  const numChannels = buffer.numberOfChannels;
  const numSamples = buffer.length;
  const numBlocks = Math.max(1, Math.ceil((numSamples - blockSize) / stepSize) + 1);

  const filteredBuffer = new Float32Array(numSamples * numChannels);
  const channelBuffers: Float32Array[] = [];

  // Apply K-filter to each channel
  for (let c = 0; c < numChannels; c++) {
    const channelData = buffer.getChannelData(c);
    const start = c * numSamples;
    const config = createKFilter(fs);
    applyKFilter(channelData, filteredBuffer.subarray(start, start + numSamples), config);
    channelBuffers.push(filteredBuffer.subarray(start, start + numSamples));
  }

  // Process blocks
  const blockEnergies: number[] = [];
  for (let block = 0; block < numBlocks; block++) {
    const start = block * stepSize;
    const end = Math.min(start + blockSize, numSamples);
    let blockEnergy = 0;

    for (let c = 0; c < numChannels; c++) {
      const channelData = channelBuffers[c];
      let sumSquares = 0;
      for (let i = start; i < end; i++) {
        sumSquares += channelData[i] * channelData[i];
      }
      blockEnergy += sumSquares / (end - start);
    }

    if (blockEnergy > 0) {
      blockEnergies.push(blockEnergy);
    }
  }

  if (blockEnergies.length === 0) {
    return -Infinity;
  }

  // Absolute gating
  const absoluteThreshold = -70;
  const absoluteGated = blockEnergies.filter(e => -0.691 + 10 * Math.log10(e) > absoluteThreshold);

  if (absoluteGated.length === 0) {
    return -Infinity;
  }

  // Relative gating
  const meanEnergy = absoluteGated.reduce((sum, e) => sum + e, 0) / absoluteGated.length;
  const relativeThreshold = -0.691 + 10 * Math.log10(meanEnergy) - 10;
  const relativeGated = blockEnergies.filter(e => -0.691 + 10 * Math.log10(e) > relativeThreshold);

  if (relativeGated.length === 0) {
    return -Infinity;
  }

  const totalEnergy = relativeGated.reduce((sum, e) => sum + e, 0) / relativeGated.length;
  return -0.691 + 10 * Math.log10(totalEnergy);
}

function calculateTruePeak(buffer: AudioBuffer): number {
  const numChannels = buffer.numberOfChannels;
  const numSamples = buffer.length;
  const upsampleFactor = 4;
  const upsampledLength = numSamples * upsampleFactor;
  const sincTableSize = 24;
  const sincTable: Float32Array[] = [];

  // Precompute sinc table
  for (let p = 0; p < upsampleFactor; p++) {
    const phase = new Float32Array(sincTableSize);
    const d = p / upsampleFactor;
    for (let k = 0; k < sincTableSize; k++) {
      const m = k - Math.floor(sincTableSize / 2);
      const t = m - d;
      const sincValue = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const windowValue = 0.5 - 0.5 * Math.cos(2 * Math.PI * (k + 0.5) / sincTableSize);
      phase[k] = sincValue * windowValue;
    }
    sincTable.push(phase);
  }

  let maxAbs = 0;

  for (let c = 0; c < numChannels; c++) {
    const channelData = buffer.getChannelData(c);

    // Check original samples
    for (let i = 0; i < numSamples; i++) {
      const absValue = Math.abs(channelData[i]);
      if (absValue > maxAbs) {
        maxAbs = absValue;
      }
    }

    // Check upsampled samples
    const upsampled = new Float32Array(upsampledLength);
    for (let i = 0; i < numSamples; i++) {
      for (let p = 0; p < upsampleFactor; p++) {
        let sum = 0;
        for (let k = 0; k < sincTableSize; k++) {
          const index = i + k - Math.floor(sincTableSize / 2);
          if (index >= 0 && index < numSamples) {
            sum += channelData[index] * sincTable[p][k];
          }
        }
        upsampled[i * upsampleFactor + p] = sum;
      }
    }

    for (let i = 0; i < upsampledLength; i++) {
      const absValue = Math.abs(upsampled[i]);
      if (absValue > maxAbs) {
        maxAbs = absValue;
      }
    }
  }

  return maxAbs === 0 ? -Infinity : 20 * Math.log10(maxAbs);
}

export function measureLoudness(buffer: AudioBuffer): LoudnessResult {
  const lufs = calculateLufs(buffer);
  const truePeakDb = calculateTruePeak(buffer);
  return { lufs, truePeakDb };
}
