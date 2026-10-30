// The song chord on every beat, from the bass and harmony stems together, smoothed (MaRuche/Falken)
type Note = [number, number, number, number];

export function chordTrack(other: Note[], bass: Note[], pcs: number[], beatLen: number, offset: number, duration: number, penalty = 0.4): number[] {
    const nb = Math.max(0, Math.ceil((duration - offset) / beatLen));
    if (nb === 0 || beatLen <= 0) return [];

    // Compute weights per beat
    const wo = new Float32Array(nb * 12).fill(0);
    const wb = new Float32Array(nb * 12).fill(0);
    const computeWeights = (notes: Note[], weights: Float32Array) => {
        for (const [start, end, midi] of notes) {
            const pc = ((midi % 12) + 12) % 12;
            for (let b = Math.max(0, Math.floor((start - offset) / beatLen)); b < nb && offset + b * beatLen < end; b++) {
                const beatStart = offset + b * beatLen;
                const beatEnd = offset + (b + 1) * beatLen;
                const overlap = Math.min(end, beatEnd) - Math.max(start, beatStart);
                weights[b * 12 + pc] += overlap;
            }
        }
    };
    computeWeights(other, wo);
    computeWeights(bass, wb);

    // Compute scores per beat and degree
    const scores = new Float32Array(nb * 7);
    for (let b = 0; b < nb; b++) {
        const beatWo = wo.subarray(b * 12, (b + 1) * 12);
        const beatWb = wb.subarray(b * 12, (b + 1) * 12);
        const beatWoSum = beatWo.reduce((sum, val) => sum + val, 0);
        const beatWbSum = beatWb.reduce((sum, val) => sum + val, 0);
        const norm = Math.max(beatWoSum + beatWbSum, beatLen); // a beat with less than one beat of notes is not fully trusted (a stray note does not decide)
        if (norm === 0) continue;

        for (let d = 0; d < 7; d++) {
            const r = pcs[d], t = pcs[(d + 2) % 7], f = pcs[(d + 4) % 7];
            const raw = 2 * beatWo[r] + beatWo[t] + beatWo[f] + 3 * beatWb[r] + beatWb[t] + beatWb[f];
            scores[b * 7 + d] = raw / norm;
        }
    }

    // Viterbi smoothing
    const dp = new Float32Array(nb * 7).fill(-Infinity);
    const prev = new Int32Array(nb * 7).fill(-1);
    for (let d = 0; d < 7; d++) dp[d] = scores[d];

    for (let b = 1; b < nb; b++) {
        for (let d = 0; d < 7; d++) {
            let maxScore = -Infinity, bestPrev = -1;
            for (let pd = 0; pd < 7; pd++) {
                const changeCost = penalty * (b % 4 === 0 ? 0.4 : b % 2 === 0 ? 1 : 2) * (d !== pd ? 1 : 0);
                const score = dp[(b - 1) * 7 + pd] + scores[b * 7 + d] - changeCost;
                if (score > maxScore || (score === maxScore && pd < bestPrev)) {
                    maxScore = score;
                    bestPrev = pd;
                }
            }
            dp[b * 7 + d] = maxScore;
            prev[b * 7 + d] = bestPrev;
        }
    }

    // Backtrack best path
    const path = new Int32Array(nb);
    let maxScore = -Infinity, bestD = -1;
    for (let d = 0; d < 7; d++) {
        if (dp[(nb - 1) * 7 + d] > maxScore || (dp[(nb - 1) * 7 + d] === maxScore && d < bestD)) {
            maxScore = dp[(nb - 1) * 7 + d];
            bestD = d;
        }
    }
    for (let b = nb - 1; b >= 0; b--) {
        path[b] = bestD;
        bestD = prev[b * 7 + bestD];
    }

    return Array.from(path);
}

export function selfTest(): void {
    const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
    const pcs = [0, 2, 4, 5, 7, 9, 11];
    const beatLen = 0.5;

    // Test 1: C to F
    const other1: Note[] = [
        [0, 2, 60, 1], [0, 2, 64, 1], [0, 2, 67, 1],
        [2, 4, 65, 1], [2, 4, 69, 1], [2, 4, 72, 1]
    ];
    const bass1: Note[] = [[0, 2, 48, 1], [2, 4, 41, 1]];
    assert(JSON.stringify(chordTrack(other1, bass1, pcs, beatLen, 0, 4)) === JSON.stringify([0, 0, 0, 0, 3, 3, 3, 3]), "C to F");

    // Test 2: Stray beat
    const other2: Note[] = [
        [0, 4, 60, 1], [0, 4, 64, 1], [0, 4, 67, 1],
        [1.5, 2, 62, 1], [1.5, 2, 65, 1], [1.5, 2, 69, 1]
    ];
    const bass2: Note[] = [[0, 4, 48, 1]];
    assert(JSON.stringify(chordTrack(other2, bass2, pcs, beatLen, 0, 4)) === JSON.stringify([0, 0, 0, 0, 0, 0, 0, 0]), "Stray beat");

    // Test 3: Bass decides between Am and C
    const other3: Note[] = [[0, 2, 60, 1], [0, 2, 64, 1]];
    const bass3: Note[] = [[0, 2, 45, 1]];
    assert(JSON.stringify(chordTrack(other3, bass3, pcs, beatLen, 0, 2)) === JSON.stringify([5, 5, 5, 5]), "Bass decides");

    // Test 4: No notes
    assert(JSON.stringify(chordTrack([], [], pcs, beatLen, 0, 2)) === JSON.stringify([0, 0, 0, 0]), "No notes");
    assert(JSON.stringify(chordTrack([], [], pcs, 0, 0, 2)) === JSON.stringify([]), "Zero beatLen");
}
