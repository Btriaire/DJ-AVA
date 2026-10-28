/**
 * Quantizes time to the nearest grid line, applying swing to odd indices.
 * @param t Time in seconds
 * @param offset Grid start time
 * @param step Grid step size (seconds)
 * @param swing Swing factor (0..0.6) for odd indices
 * @returns Quantized time
 */
export function quantizeTime(t: number, offset: number, step: number, swing = 0): number {
    if (step <= 0) return t;
    swing = Math.max(0, Math.min(0.6, swing));
    const index = Math.round((t - offset) / step);
    const baseTime = offset + index * step;
    const isOdd = index % 2 !== 0;
    return isOdd ? baseTime + swing * step : baseTime;
}

/**
 * Finds the next grid time (including swing) >= t.
 * @param t Time in seconds
 * @param offset Grid start time
 * @param step Grid step size (seconds)
 * @param swing Swing factor (0..0.6) for odd indices
 * @returns Next grid time
 */
export function nextGridTime(t: number, offset: number, step: number, swing = 0): number {
    if (step <= 0) return t;
    swing = Math.max(0, Math.min(0.6, swing));
    const index = Math.ceil((t - offset) / step);
    const baseTime = offset + index * step;
    const isOdd = index % 2 !== 0;
    return isOdd ? baseTime + swing * step : baseTime;
}

/**
 * Checks if a pattern allows playback at time t.
 * @param pattern Pattern string (e.g., 'x-x-x-')
 * @param t Time in seconds
 * @param offset Grid start time
 * @param step Grid step size (seconds)
 * @returns True if pattern allows playback
 */
export function patternAllows(pattern: string | undefined, t: number, offset: number, step: number): boolean {
    if (!pattern || step <= 0) return true;
    const index = Math.round((t - offset) / step);
    const pos = ((index % pattern.length) + pattern.length) % pattern.length;
    return pattern[pos].toLowerCase() === 'x';
}

/**
 * Deterministic jitter based on time.
 * @param t Time in seconds
 * @param amountMs Max jitter in milliseconds (0..30)
 * @returns Jittered time in milliseconds
 */
export function jitterMs(t: number, amountMs: number): number {
    const a = Math.max(0, Math.min(30, amountMs));
    const x = Math.sin(t * 12.9898) * 43758.5453;
    return (x - Math.floor(x) - 0.5) * 2 * a; // [-a, +a), same t gives the same value
}

/**
 * Snaps MIDI note to the nearest scale degree.
 * @param midi MIDI note number
 * @param root Root note (MIDI)
 * @param steps Scale steps (semitones)
 * @returns Closest scale note (lowest in case of tie)
 */
export function snapToScale(midi: number, root: number, steps: readonly number[]): number {
    if (steps.length === 0) return midi;
    const base = Math.round(midi);
    for (let d = 0; d <= 6; d++) {
        for (const n of [base - d, base + d]) { // lower first, so a tie goes to the lower note
            const pc = (((n - root) % 12) + 12) % 12;
            if (steps.includes(pc)) return n;
        }
    }
    return base;
}

/** Self-test for all functions: throws on the first failing case. */
export function selfTest(): void {
    const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };
    ok(quantizeTime(1.2, 0, 1) === 1, "quantizeTime");
    ok(quantizeTime(1.2, 0, 1, 0.5) === 1.5, "quantizeTime swing");
    ok(quantizeTime(2.1, 0, 1, 0.5) === 2, "quantizeTime even line");
    ok(nextGridTime(1.2, 0, 1) === 2, "nextGridTime");
    ok(patternAllows(undefined, 3, 0, 1) && patternAllows("x.x.", 0.1, 0, 1), "patternAllows on");
    ok(!patternAllows("x.x.", 1.1, 0, 1) && patternAllows("x.x.", 4.1, 0, 1), "patternAllows off/wrap");
    ok(!patternAllows("x.x.", -0.9, 0, 1) === false || true, "negative index does not throw");
    for (let t = 0; t < 50; t += 0.37) ok(Math.abs(jitterMs(t, 10)) <= 10 && jitterMs(t, 10) === jitterMs(t, 10), "jitterMs range");
    ok(jitterMs(1, 0) === 0, "jitterMs zero");
    ok(snapToScale(61, 0, [0, 2, 4, 5, 7, 9, 11]) === 60, "snapToScale C major tie goes down");
    ok(snapToScale(66, 0, [0, 2, 4, 5, 7, 9, 11]) === 65, "snapToScale F");
    ok(snapToScale(70, 2, [0, 2, 3, 5, 7, 8, 10]) === 70, "snapToScale keeps in-scale notes");
}
