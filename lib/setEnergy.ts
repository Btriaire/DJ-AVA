// The energy of each song of a set (tempo first, then real loudness when prepared, a minor key a little darker),
// compared with the arc the DJ wants, and the transitions where the energy jumps too hard.
import { arcTarget, type SetArc } from "./setBuilder";
import { tempoGap } from "./mixPlan";

export interface EnergyTrack { bpm?: number; camelot?: string; lufs?: number }

export function trackEnergy(t: EnergyTrack): number | null {
  if (!(t.bpm && t.bpm > 0)) return null;
  const bpm = t.bpm < 85 ? t.bpm * 2 : t.bpm; // a half-time song moves at its double tempo
  let e = Math.min(1, Math.max(0, (bpm - 90) / 60)) * 0.7;
  e += typeof t.lufs === "number" ? Math.min(1, Math.max(0, (t.lufs + 20) / 12)) * 0.3 : 0.15;
  if (t.camelot?.endsWith("A")) e -= 0.05;
  return Math.min(1, Math.max(0, e));
}

// the target of the arc rescaled onto the set's own energy range
export function arcLine(arc: SetArc, n: number, lo: number, hi: number): number[] {
  return Array.from({ length: n }, (_, i) => lo + arcTarget(arc, n > 1 ? i / (n - 1) : 0) * (hi - lo));
}

// 0..100: how close the set follows the arc (100 = exactly)
export function arcFit(energy: (number | null)[], arc: SetArc): number {
  const e = energy.filter((x): x is number => x !== null);
  if (e.length < 2) return 100;
  const lo = Math.min(...e), hi = Math.max(...e);
  const line = arcLine(arc, e.length, lo, hi);
  const err = e.reduce((s, v, i) => s + Math.abs(v - line[i]), 0) / e.length / Math.max(0.15, hi - lo);
  return Math.round(100 * Math.max(0, 1 - err));
}

// transitions i-1 -> i that jump too hard: tempo over 8 % (double/half counted as the same beat) or energy over 0.3
export function energyJumps(tracks: EnergyTrack[]): { i: number; why: string }[] {
  const out: { i: number; why: string }[] = [];
  for (let i = 1; i < tracks.length; i++) {
    const a = tracks[i - 1], b = tracks[i];
    if (a.bpm && b.bpm) {
      const g = tempoGap(a.bpm, b.bpm);
      if (Math.abs(g.pct) > 8) { out.push({ i, why: `tempo ${g.pct > 0 ? "+" : ""}${Math.round(g.pct)} %` }); continue; }
    }
    const ea = trackEnergy(a), eb = trackEnergy(b);
    if (ea !== null && eb !== null && Math.abs(eb - ea) > 0.3) out.push({ i, why: eb > ea ? "énergie qui bondit" : "énergie qui chute" });
  }
  return out;
}

export function setEnergyTest(): void {
  if (trackEnergy({}) !== null) throw new Error("energy unknown");
  if (!(trackEnergy({ bpm: 128, lufs: -8 })! > trackEnergy({ bpm: 100, lufs: -16 })!)) throw new Error("energy order");
  if (trackEnergy({ bpm: 64 }) !== trackEnergy({ bpm: 128 })) throw new Error("energy half time");
  if (arcFit([0.1, 0.4, 0.7, 1], "rise") < 95 || arcFit([1, 0.7, 0.4, 0.1], "rise") > 40) throw new Error("energy fit");
  const j = energyJumps([{ bpm: 120 }, { bpm: 122 }, { bpm: 140 }]);
  if (j.length !== 1 || j[0].i !== 2) throw new Error("energy jumps");
}
