export interface Cue { id: string; bpm: number; camelot: string }

export function harmonicScore(a: string, b: string): number {
    if (!a || !b) return 1;
    if (a === b) return 3;

    const parse = (s: string) => {
        const num = parseInt(s.slice(0, -1), 10);
        const letter = s.slice(-1);
        return { num, letter };
    };

    const { num: numA, letter: letterA } = parse(a);
    const { num: numB, letter: letterB } = parse(b);

    if (numA === numB) return 2;
    if (Math.abs(numA - numB) % 12 === 1 && letterA === letterB) return 2;

    return 0;
}

export function tempoScore(a: number, b: number): number {
    if (a === 0 || b === 0) return 1;

    const ratio = b / a;
    if (Math.abs(ratio - 1) <= 0.06) return 2;
    // half or double time: the ratio sits within 3 % of 0.5 or 2
    if (Math.abs(ratio - 0.5) <= 0.015 || Math.abs(ratio - 2) <= 0.06) return 1;

    return 0;
}

export function pickNext(cur: Cue, candidates: Cue[], played: ReadonlySet<string>): Cue | null {
    let bestScore = -1;
    let bestCue: Cue | null = null;

    for (const candidate of candidates) {
        if (candidate.id === cur.id || played.has(candidate.id)) continue;

        const score = 2 * tempoScore(cur.bpm, candidate.bpm) + harmonicScore(cur.camelot, candidate.camelot);
        if (score > bestScore) {
            bestScore = score;
            bestCue = candidate;
        }
    }

    return bestCue;
}
