// The notes the vocal harmony sings over a sung note (MaRuche/Codestral)
export type HarmonyMode = "third" | "fifth" | "chord" | "low";

export function harmonyNotes(sung: number, pcs: number[], mode: HarmonyMode): number[] {
  const up = (n: number): number => {
    let steps = 0;
    let current = sung;
    while (steps < n) {
      current++;
      if (pcs.includes(((current % 12) + 12) % 12)) steps++;
    }
    return current;
  };

  switch (mode) {
    case "third": return [up(2)];
    case "fifth": return [up(4)];
    case "chord": return [up(2), up(4)];
    case "low": return [up(2) - 12, sung - 12];
  }
}

export function selfTest(): void {
  const pcsC = [0, 2, 4, 5, 7, 9, 11];
  const pcsA = [9, 11, 0, 2, 4, 5, 7];

  const assert = (cond: boolean, msg: string): void => {
    if (!cond) throw new Error(msg);
  };

  assert(harmonyNotes(60, pcsC, "third")[0] === 64, "C major third from 60 should be 64");
  assert(harmonyNotes(60, pcsC, "fifth")[0] === 67, "C major fifth from 60 should be 67");
  assert(harmonyNotes(62, pcsC, "chord")[0] === 65 && harmonyNotes(62, pcsC, "chord")[1] === 69, "C major chord from 62 should be [65, 69]");
  assert(harmonyNotes(64, pcsC, "low")[0] === 55 && harmonyNotes(64, pcsC, "low")[1] === 52, "C major low from 64 should be [55, 52]");
  assert(harmonyNotes(69, pcsA, "third")[0] === 72, "A minor third from 69 should be 72");
}
