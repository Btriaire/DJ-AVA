// A replay that lands on the original stem: its real attacks and its real loudness (MaRuche/Codestral)
export function envelope(data: Float32Array, sampleRate: number, hop = 0.005): Float32Array {
    const frameSize = Math.round(hop * sampleRate);
    const env = new Float32Array(Math.ceil(data.length / frameSize));
    for (let i = 0; i < env.length; i++) {
        const start = i * frameSize;
        const end = Math.min(start + frameSize, data.length);
        let sum = 0;
        for (let j = start; j < end; j++) {
            sum += data[j] * data[j];
        }
        env[i] = Math.sqrt(sum / (end - start));
    }
    return env;
}

export function refineOnset(env: Float32Array, hop: number, t: number, radius = 0.03): number {
    const start = Math.max(1, Math.round((t - radius) / hop));
    const end = Math.min(env.length - 1, Math.round((t + radius) / hop));
    let bestK = start;
    let maxRise = 0;
    for (let k = start; k <= end; k++) {
        const rise = env[k] - env[k - 1];
        if (rise > maxRise) {
            maxRise = rise;
            bestK = k;
        }
    }
    const maxEnv = Math.max(env[bestK], 1e-6);
    return maxRise > 0.1 * maxEnv ? bestK * hop : t;
}

export function percentile(env: Float32Array, q: number): number {
    if (env.length === 0) return 0;
    const sorted = new Float32Array(env);
    sorted.sort((a, b) => a - b);
    const index = Math.floor(q * (sorted.length - 1));
    return sorted[index];
}

export function levelAt(env: Float32Array, hop: number, t: number, ref: number, win = 0.06): number {
    if (ref <= 0) return 0;
    const start = Math.floor(t / hop);
    const end = Math.min(env.length, Math.floor((t + win) / hop));
    let max = 0;
    for (let i = start; i < end; i++) {
        if (env[i] > max) max = env[i];
    }
    return Math.min(max / ref, 1);
}

export function leadingSilence(channels: Float32Array[], sampleRate: number, ratio = 0.02, keep = 0.002): number {
    if (channels.length === 0) return 0;
    let peak = 0;
    for (const channel of channels) {
        for (const x of channel) {
            const absX = Math.abs(x);
            if (absX > peak) peak = absX;
        }
    }
    if (peak === 0) return 0;
    const threshold = ratio * peak;
    const keepSamples = Math.round(keep * sampleRate);
    for (let i = 0; i < channels[0].length; i++) {
        for (const channel of channels) {
            if (Math.abs(channel[i]) >= threshold) {
                return Math.max(0, i - keepSamples);
            }
        }
    }
    return 0;
}

// notes analysed before revision 3 sit late against the real attacks (measured: drums ~30 ms, notes ~10 ms): corrected on read
export function alignLegacyNotes<T extends { rev?: number; other?: [number, number, number, number][]; bass?: [number, number, number, number][]; drums?: number[][] }>(n: T): T {
    if ((n.rev ?? 1) >= 3) {
        return n;
    }

    const newObj: T = { ...n };

    if (newObj.drums) {
        newObj.drums = newObj.drums.map(drum => [Math.max(0, drum[0] - 0.03), ...drum.slice(1)]);
    }

    if (newObj.bass) {
        newObj.bass = newObj.bass.map(([a, b, m, v]) => [Math.max(0, a - 0.01), Math.max(0, b - 0.01), m, v]);
    }

    if (newObj.other) {
        newObj.other = newObj.other.map(([a, b, m, v]) => [Math.max(0, a - 0.01), Math.max(0, b - 0.01), m, v]);
    }

    return newObj;
}

export function selfTest(): void {
    const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
    const sampleRate = 1000;

    // Test envelope
    const data = new Float32Array(1000).fill(0.5);
    const env = envelope(data, sampleRate, 0.01);
    assert(env.length === 100, "Envelope length should be 100");
    for (const val of env) {
        assert(Math.abs(val - 0.5) < 1e-6, "Envelope values should be 0.5");
    }

    // Test refineOnset
    const silent = new Float32Array(300).fill(0);
    const signal = new Float32Array(700).fill(0.8);
    const combined = new Float32Array([...silent, ...signal]);
    const env2 = envelope(combined, sampleRate, 0.005);
    const refined = refineOnset(env2, 0.005, 0.31);
    assert(Math.abs(refined - 0.3) < 1e-9, "Refined onset should be 0.3");
    const constantEnv = new Float32Array(100).fill(1);
    assert(refineOnset(constantEnv, 0.01, 0.5) === 0.5, "Constant envelope should return original time");

    // Test percentile
    const values = new Float32Array([1, 2, 3, 4, 5]);
    assert(percentile(values, 0.5) === 3, "Percentile should be 3");

    // Test levelAt
    const stepEnv = new Float32Array([0, 0, 0, 0.8, 0.8, 0.8]);
    assert(Math.abs(levelAt(stepEnv, 0.1, 0.35, 0.8) - 1) < 1e-6, "Level at t 0.35 should be 1");
    assert(levelAt(stepEnv, 0.1, 0.1, 0.8) === 0, "Level at t 0.1 should be 0");

    // Test leadingSilence
    const channel1 = new Float32Array(100).fill(0);
    const channel2 = Float32Array.from({ length: 100 }, (_, i) => (i < 50 ? 0 : 1));
    assert(leadingSilence([channel1, channel2], sampleRate, 0.02, 0.002) === 48, "Leading silence should be 48");
    assert(leadingSilence([new Float32Array(100).fill(0)], sampleRate) === 0, "All zeros should return 0");
    assert(leadingSilence([], sampleRate) === 0, "No channels should return 0");
  // alignLegacyNotes
  const input = { rev: 2, drums: [[1, 0.5, 0]], bass: [[2, 3, 40, 0.8]] as [number, number, number, number][], other: [[0.005, 1, 60, 0.6]] as [number, number, number, number][] };
  const output = alignLegacyNotes(input);
  assert(Math.abs((output.drums?.[0][0] ?? -1) - 0.97) < 1e-9, "drums[0][0] should be 0.97");
  assert(Math.abs((output.bass?.[0][0] ?? -1) - 1.99) < 1e-9, "bass[0][0] should be 1.99");
  assert(Math.abs((output.bass?.[0][1] ?? -1) - 2.99) < 1e-9, "bass[0][1] should be 2.99");
  assert(Math.abs((output.other?.[0][0] ?? -1) - 0) < 1e-9, "other[0][0] should be 0 (clamped)");
  assert(Math.abs((input.drums?.[0][0] ?? -1) - 1) < 1e-9, "input drums[0][0] should remain unchanged");
  
  const rev3Input = { rev: 3, drums: [[1, 0.5, 0]] };
  const rev3Output = alignLegacyNotes(rev3Input);
  assert(rev3Output === rev3Input, "rev 3 object should be returned as the same object");
}
