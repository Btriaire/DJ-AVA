export interface Cue { id: string; bpm: number; camelot: string }

export function harmonicScore(a: string, b: string): number {
    const parse = (s: string) => {
        const match = s.match(/^(\d{1,2})([AB])$/i);
        if (!match) return null;
        const num = parseInt(match[1], 10);
        const letter = match[2].toUpperCase();
        return num >= 1 && num <= 12 ? { num, letter } : null;
    };
    const parsedA = parse(a);
    const parsedB = parse(b);
    if (!parsedA || !parsedB) return 1;
    if (parsedA.num === parsedB.num && parsedA.letter === parsedB.letter) return 3;
    if (parsedA.num === parsedB.num) return 2;
    const diff = Math.abs(parsedA.num - parsedB.num);
    if ((diff === 1 || diff === 11) && parsedA.letter === parsedB.letter) return 2;
    return 0;
}

export function tempoScore(a: number, b: number): number {
    if (a === 0 || b === 0) return 1;
    const ratio = b / a;
    if (Math.abs(ratio - 1) <= 0.06) return 2;
    if (Math.abs(ratio - 0.5) <= 0.015 || Math.abs(ratio - 2) <= 0.06) return 1;
    return 0;
}

export function pickNext(cur: Cue, candidates: Cue[], played: ReadonlySet<string>): Cue | null {
    let bestScore = -1;
    let bestCue: Cue | null = null;
    for (const candidate of candidates) {
        if (candidate.id === cur.id || played.has(candidate.id)) continue;
        const score = 2 * tempoScore(cur.bpm, candidate.bpm) + harmonicScore(cur.camelot, candidate.camelot);
        if (score > bestScore) { bestScore = score; bestCue = candidate; }
    }
    return bestCue;
}
