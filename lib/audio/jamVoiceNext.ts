// When the next sung phrase starts, from the voice contour (MaRuche/Codestral)
export function nextSungAt(contour: number[], step: number, pos: number, minGap = 0.6): number | null {
    if (step <= 0 || contour.length === 0) return null;
    const startIdx = Math.max(0, Math.floor(pos / step));
    let silentCount = 0;
    for (let i = startIdx; i < contour.length; i++) {
        if (contour[i] >= 0) {
            const time = i * step;
            if (i === 0 || silentCount * step >= minGap) return time;
            if (pos >= time && pos < time + step) return pos;
        } else {
            silentCount++;
        }
    }
    return null;
}

export function selfTest(): void {
    const c = [-1, -1, 60, 60, -1, -1, -1, 62];
    assert(nextSungAt(c, 0.5, 0) === 1, "Test 1 failed");
    assert(nextSungAt(c, 0.5, 1.2) === 1.2, "Test 2 failed");
    assert(nextSungAt(c, 0.5, 2.1) === 3.5, "Test 3 failed");
    assert(nextSungAt(c, 0.5, 4) === null, "Test 4 failed");
    assert(nextSungAt([], 0.5, 0) === null, "Test 5 failed");
    assert(nextSungAt(c, 0, 0) === null, "Test 6 failed");
}

function assert(cond: boolean, msg: string): void {
    if (!cond) throw new Error(msg);
}
