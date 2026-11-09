import { balanceCurve, unmaskCurve } from "./eqLab";
import { EQ_FREQS } from "./Rack";

export const ADAPT_MIN = -12;
export const ADAPT_MAX = 9;

export function adaptiveTarget(mix: number[], vocals: number[] | null, others: number[] | null): number[] {
  const base = balanceCurve(mix);
  let mask = new Array(EQ_FREQS.length).fill(0);

  if (vocals && others) {
    mask = unmaskCurve(vocals, others);
  }

  return base.map((gain, i) => Math.max(ADAPT_MIN, Math.min(ADAPT_MAX, gain + mask[i])));
}

export function adaptiveStep(current: number[], target: number[], maxStep: number): number[] {
  if (maxStep <= 0) {
    return [...current];
  }

  return current.map((gain, i) => {
    const diff = target[i] - gain;
    const clampedDiff = Math.max(-maxStep, Math.min(maxStep, diff));
    const newGain = gain + clampedDiff;
    return Math.max(ADAPT_MIN, Math.min(ADAPT_MAX, newGain));
  });
}
