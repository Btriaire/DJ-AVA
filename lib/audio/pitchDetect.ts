// the note a sample sounds: YIN on its first second after the attack, the median of the confident frames
const median = (v: number[]) => { const s = [...v].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const log2 = Math.log2;

export function detectRoot(data: Float32Array, sampleRate: number): { midi: number; cents: number; confidence: number } | null {
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
        const absSample = Math.abs(data[i]);
        if (absSample > peak) peak = absSample;
    }

    let start = 0;
    const attackSamples = Math.floor(0.02 * peak * sampleRate);
    const attackMs = Math.floor(0.02 * sampleRate);
    for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > attackSamples) {
            start = Math.min(i + attackMs, data.length - 1);
            break;
        }
    }

    const frameSize = 2048;
    const hopSize = 512;
    const maxFrames = Math.min(Math.floor((data.length - start) / hopSize), Math.floor(sampleRate));
    const tauMin = Math.floor(sampleRate / 1500);
    const tauMax = Math.min(1024, Math.floor(sampleRate / 40));
    const voicedFrames: number[] = [];
    const confidences: number[] = [];

    for (let i = 0; i < maxFrames; i++) {
        const frameStart = start + i * hopSize;
        const frameEnd = frameStart + frameSize;
        if (frameEnd > data.length) break;

        const frame = data.subarray(frameStart, frameEnd);
        let rms = 0;
        for (let j = 0; j < frame.length; j++) {
            rms += frame[j] * frame[j];
        }
        rms = Math.sqrt(rms / frame.length);
        if (rms < 0.01) continue;

        const d = new Float32Array(tauMax + 1);
        for (let tau = 0; tau <= tauMax; tau++) {
            let sum = 0;
            for (let j = 0; j < frameSize - tauMax; j++) {
                const diff = frame[j] - frame[j + tau];
                sum += diff * diff;
            }
            d[tau] = sum;
        }

        const cmnd = new Float32Array(tauMax + 1);
        cmnd[0] = 1;
        let running = 0;
        for (let tau = 1; tau <= tauMax; tau++) {
            running += d[tau];
            cmnd[tau] = d[tau] * tau / (running || 1e-12);
        }

        let tau = tauMin;
        while (tau < tauMax && cmnd[tau] >= 0.15) tau++;
        if (tau >= tauMax) continue;

        while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
        const a = cmnd[tau - 1];
        const b = cmnd[tau];
        const c = cmnd[tau + 1];
        const den = a - 2 * b + c;
        const shift = den === 0 ? 0 : 0.5 * (a - c) / den;
        const tauI = tau + shift;
        const f0 = sampleRate / tauI;
        voicedFrames.push(f0);
        confidences.push(1 - cmnd[tau]);
    }

    if (voicedFrames.length < 3 || voicedFrames.length < 0.3 * maxFrames) return null;

    const medianF0 = median(voicedFrames);
    const midiFloat = 69 + 12 * log2(medianF0 / 440);
    const midi = Math.round(midiFloat);
    const cents = Math.round(100 * (midiFloat - midi));
    const confidence = Math.round(100 * confidences.reduce((a, b) => a + b, 0) / confidences.length) / 100;

    return { midi, cents, confidence };
}

export function selfTest(): void {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const tone = (f: number, sr = 44100) => {
    const x = new Float32Array(Math.round(1.1 * sr));
    for (let i = Math.round(0.1 * sr); i < x.length; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * f * i / sr);
    return x;
  };
  const lcg = (seed: number) => {
    const a = 1664525;
    const c = 1013904223;
    const m = 2 ** 32;
    let state = seed;
    return () => { state = (a * state + c) % m; return state / m; };
  };
  const noise = (sr = 44100) => {
    const x = new Float32Array(sr);
    const rng = lcg(42);
    for (let i = 0; i < x.length; i++) x[i] = 0.3 * (2 * rng() - 1);
    return x;
  };
  const silence = (sr = 44100) => new Float32Array(sr);
  const testCases = [
    { data: tone(220), expected: { midi: 57, cents: 0, confidence: 1 } },
    { data: tone(261.63), expected: { midi: 60, cents: 0, confidence: 1 } },
    { data: tone(233.08 * 2 ** (30 / 1200)), expected: { midi: 58, cents: 30, confidence: 1 } },
    { data: noise(), expected: null },
    { data: silence(), expected: null },
  ];
  for (const { data, expected } of testCases) {
    const result = detectRoot(data, 44100);
    if (expected === null) assert(result === null, "Expected null");
    else {
      assert(result !== null, "Expected non-null result");
      assert(result!.midi === expected.midi, `Expected midi ${expected.midi}, got ${result!.midi}`);
      assert(Math.abs(result!.cents - expected.cents) <= 4, `Expected cents ${expected.cents}, got ${result!.cents}`);
      assert(result!.confidence > 0.8, `a pure tone is a confident pitch, got ${result!.confidence}`);
    }
  }
}
