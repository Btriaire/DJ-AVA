// Melodic vocal chops: one slice on the degrees of the key (MaRuche/Codestral)
export function degreeShifts(pcs: number[], from: number, count = 8): number[] {
    const nearest = pcs.reduce((prev, curr) => {
        const d = ((curr - from) % 12 + 12) % 12;
        const prevD = ((prev - from) % 12 + 12) % 12;
        const a = Math.min(d, 12 - d), b = Math.min(prevD, 12 - prevD);
        return a < b || (a === b && d > 6) ? curr : prev;
    });
    const start = pcs.indexOf(nearest);
    const d0 = ((nearest - from) % 12 + 12) % 12;
    const shifts = [d0 >= 6 ? d0 - 12 : d0];
    for (let i = 1; i < count; i++) {
        const k = (start + i - 1) % 7;
        const nextK = (start + i) % 7;
        shifts.push(shifts[i - 1] + ((pcs[nextK] - pcs[k]) % 12 + 12) % 12);
    }
    return shifts;
}

export function selfTest(): void {
    const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
    const cMajor = [0, 2, 4, 5, 7, 9, 11];
    const aMinor = [9, 11, 0, 2, 4, 5, 7];
    assert(JSON.stringify(degreeShifts(cMajor, 0)) === JSON.stringify([0, 2, 4, 5, 7, 9, 11, 12]), "C major from 0");
    assert(JSON.stringify(degreeShifts(cMajor, 0, 3)) === JSON.stringify([0, 2, 4]), "C major count 3");
    assert(JSON.stringify(degreeShifts(aMinor, 9)) === JSON.stringify([0, 2, 3, 5, 7, 8, 10, 12]), "A minor from 9");
    assert(JSON.stringify(degreeShifts(aMinor, 10)) === JSON.stringify([-1, 1, 2, 4, 6, 7, 9, 11]), "A minor from 10");
}
