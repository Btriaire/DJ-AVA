// Bass fills: a turnaround on the last beat of every 4th or 8th bar (MaRuche/Codestral)
export type FillEvery = 0 | 4 | 8;

export function isFillBar(bar: number, every: FillEvery): boolean {
  return every !== 0 && (bar + 1) % every === 0;
}

export function fillNote(chord: number[], step: number): { midi: number; accent: boolean } | null {
  if (step < 12 || step > 15) return null;
  const notes = [chord[0], chord[1], chord[2], chord[0] + 12];
  return { midi: notes[step - 12], accent: step === 12 };
}

export function selfTest(): void {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
  assert(isFillBar(3, 4), "isFillBar(3,4) should be true");
  assert(!isFillBar(4, 4), "isFillBar(4,4) should be false");
  assert(isFillBar(7, 8), "isFillBar(7,8) should be true");
  assert(!isFillBar(3, 8), "isFillBar(3,8) should be false");
  assert(isFillBar(-1, 4), "isFillBar(-1,4) should be true");
  assert(!isFillBar(5, 0), "isFillBar(5,0) should be false");
  const note = fillNote([40, 43, 47], 12);
  assert(note?.midi === 40 && note?.accent, "fillNote([40,43,47],12) should return {midi:40,accent:true}");
  assert(fillNote([40, 43, 47], 15)?.midi === 52, "fillNote([40,43,47],15) should return {midi:52}");
  assert(fillNote([40, 43, 47], 3) === null, "fillNote([40,43,47],3) should return null");
}
