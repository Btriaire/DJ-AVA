// Chord progressions loaded into the Synth chord loop (MaRuche/Codestral)
export type ProgressionName = "pop" | "dark" | "house" | "jazz" | "epic" | "dream";

export const PROGRESSIONS: Record<ProgressionName, { label: string; major: number[]; minor: number[] }> = {
  pop: { label: "Pop", major: [0,4,5,3], minor: [0,5,2,6] },
  dark: { label: "Sombre", major: [5,3,0,4], minor: [0,6,5,6] },
  house: { label: "House", major: [5,3,0,4], minor: [0,5,3,4] },
  jazz: { label: "Jazz", major: [1,4,0,5], minor: [3,6,2,5] },
  epic: { label: "Épique", major: [0,2,5,4], minor: [0,5,6,4] },
  dream: { label: "Rêve", major: [3,4,2,5], minor: [5,3,0,6] }
};

export function progression(name: ProgressionName, minor: boolean): number[] {
  const prog = PROGRESSIONS[name];
  const degrees = minor ? prog.minor : prog.major;
  return [...degrees];
}

export function selfTest(): void {
  for (const name of Object.keys(PROGRESSIONS) as ProgressionName[]) {
    const prog = PROGRESSIONS[name];
    assert(prog.major.length === 4, `${name} major has ${prog.major.length} entries`);
    assert(prog.minor.length === 4, `${name} minor has ${prog.minor.length} entries`);
    assert(prog.major.every(d => d >= 0 && d <= 6), `${name} major has invalid degrees`);
    assert(prog.minor.every(d => d >= 0 && d <= 6), `${name} minor has invalid degrees`);
  }
  assert(progression("pop", false).join() === "0,4,5,3", "pop major mismatch");
  assert(progression("pop", true).join() === "0,5,2,6", "pop minor mismatch");
  const copy = progression("pop", false);
  copy[0] = 99;
  assert(PROGRESSIONS.pop.major[0] === 0, "progression() did not return a copy");
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}
