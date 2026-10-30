// Soundfont samples brought to a common playing level (MaRuche/Codestral)
export function normGain(channels: Float32Array[], sampleRate: number, targetDb = -18, maxGainDb = 24): number {
    if (channels.length === 0) return 1;

    const start = Math.floor(0.05 * sampleRate);
    const end = Math.min(Math.floor(1.05 * sampleRate), channels[0].length);
    if (end - start < 64) return 1;

    let meanSquare = 0;
    for (let i = start; i < end; i++) {
        let sum = 0;
        for (const channel of channels) {
            sum += channel[i] ** 2;
        }
        meanSquare += sum / channels.length;
    }
    meanSquare /= end - start;
    if (meanSquare < 1e-12) return 1;

    const rmsDb = 10 * Math.log10(meanSquare);
    let gain = 10 ** ((targetDb - rmsDb) / 20);
    gain = Math.min(gain, 10 ** (maxGainDb / 20));

    let peak = 0;
    for (const channel of channels) {
        for (let i = 0; i < channel.length; i++) {
            peak = Math.max(peak, Math.abs(channel[i]));
        }
    }
    gain = Math.min(gain, 0.98 / peak);

    return gain;
}

export function selfTest(): void {
    const sampleRate = 1000;
    const sine = (amp: number, length: number): Float32Array => {
        const buffer = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            buffer[i] = amp * Math.sin(2 * Math.PI * 100 * i / sampleRate);
        }
        return buffer;
    };

    const test1 = sine(0.0355, 2000);
    const gain1 = normGain([test1], sampleRate);
    const rmsDb1 = 10 * Math.log10(0.0355 ** 2 / 2);
    const expected1 = 10 ** ((-18 - rmsDb1) / 20);
    assert(Math.abs(gain1 - expected1) < 0.01 * expected1, "Test 1 failed");

    const test2 = sine(0.9, 2000);
    const gain2 = normGain([test2], sampleRate);
    assert(gain2 <= 0.98 / 0.9 + 1e-9, "Test 2 failed");

    const test3 = sine(1e-4, 2000);
    const gain3 = normGain([test3], sampleRate);
    assert(Math.abs(gain3 - 10 ** (24 / 20)) < 1e-9, "Test 3 failed");
    assert(1e-4 * gain3 * 10 ** 1.2 * 0.98 <= 0.98, "Test 3 peak check failed");

    const test4 = new Float32Array(2000);
    const gain4 = normGain([test4], sampleRate);
    assert(gain4 === 1, "Test 4 failed");

    const gain5 = normGain([], sampleRate);
    assert(gain5 === 1, "Test 5 failed");
}

function assert(cond: boolean, msg: string): void {
    if (!cond) throw new Error(msg);
}
