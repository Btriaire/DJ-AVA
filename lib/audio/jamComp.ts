// Accompaniment rhythms for real instruments (MaRuche/Codestral)
export type CompName = "charleston" | "bossa" | "skank" | "ballad" | "pulse" | "strum";
export interface CompHit { vel: number; len: number; dir: "down" | "up"; voicing: "full" | "top" | "bass" }
export const COMPS: Record<CompName, { label: string; hits: Record<number, CompHit> }> = {
  charleston: { label: "Charleston", hits: { 0: { vel: 0.95, len: 3, dir: "down", voicing: "full" }, 6: { vel: 0.8, len: 2, dir: "down", voicing: "full" } } },
  bossa: { label: "Bossa", hits: { 0: { vel: 0.85, len: 2, dir: "down", voicing: "bass" }, 3: { vel: 0.7, len: 2, dir: "down", voicing: "top" }, 6: { vel: 0.75, len: 2, dir: "down", voicing: "top" }, 8: { vel: 0.85, len: 2, dir: "down", voicing: "bass" }, 10: { vel: 0.7, len: 2, dir: "down", voicing: "top" }, 13: { vel: 0.75, len: 2, dir: "down", voicing: "top" } } },
  skank: { label: "Skank reggae", hits: { 4: { vel: 0.9, len: 1, dir: "up", voicing: "top" }, 12: { vel: 0.9, len: 1, dir: "up", voicing: "top" } } },
  ballad: { label: "Ballade", hits: { 0: { vel: 0.85, len: 8, dir: "down", voicing: "full" }, 8: { vel: 0.7, len: 8, dir: "down", voicing: "full" } } },
  pulse: { label: "Croches", hits: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i * 2, { vel: i % 4 === 0 ? 0.8 : 0.62, len: 1.5, dir: "down", voicing: "full" }])) },
  strum: { label: "Grattage", hits: { 0: { vel: 0.95, len: 2, dir: "down", voicing: "full" }, 3: { vel: 0.6, len: 1, dir: "up", voicing: "top" }, 6: { vel: 0.8, len: 2, dir: "down", voicing: "full" }, 8: { vel: 0.7, len: 1, dir: "up", voicing: "top" }, 10: { vel: 0.85, len: 2, dir: "down", voicing: "full" }, 11: { vel: 0.6, len: 1, dir: "up", voicing: "top" }, 14: { vel: 0.7, len: 2, dir: "up", voicing: "top" } } }
};

export function compHit(name: CompName, step: number): CompHit | null {
  const s = ((step % 16) + 16) % 16;
  return COMPS[name].hits[s] ?? null;
}

export function voiceFor(chord: number[], voicing: CompHit["voicing"]): number[] {
  if (voicing === "full") return chord;
  if (voicing === "top") return chord.length >= 3 ? chord.slice(1) : chord;
  return [Math.min(...chord) - 12];
}

export function selfTest(): void {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
  assert(compHit("skank", 4)?.dir === "up", "skank step 4 should be up");
  assert(compHit("skank", 5) === null, "skank step 5 should be null");
  assert(compHit("pulse", 18)?.vel === 0.62, "pulse step 18 should be vel 0.62");
  assert(compHit("charleston", -10)?.len === 2, "charleston step -10 should be len 2");
  assert(voiceFor([60, 64, 67], "top").join() === "64,67", "top voicing should remove lowest note");
  assert(voiceFor([60, 64, 67], "bass").join() === "48", "bass voicing should be root - 12");
  Object.values(COMPS).forEach(c => {
    assert(Object.keys(c.hits).length > 0, `${c.label} should have at least one hit`);
    Object.keys(c.hits).forEach(s => assert(Number(s) >= 0 && Number(s) <= 15, `${c.label} step ${s} out of range`));
  });
}
