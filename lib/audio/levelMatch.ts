import { measureLoudness } from "./loudness";

// Volume matching between two songs: the loudness (LUFS) of each song is measured once, from its decoded audio,
// and the incoming song is trimmed so that it arrives at the level of the one leaving.
const cache = new Map<string, number>();

// the measure if it was already taken (never computes: safe at the moment of a transition)
export const cachedLoudness = (id: string): number | null => cache.get(id) ?? null;

export function loudnessFor(id: string, buffer: AudioBuffer | null): number | null {
  const known = cache.get(id);
  if (known !== undefined) return known;
  if (!buffer) return null;
  const { lufs } = measureLoudness(buffer);
  if (!Number.isFinite(lufs)) return null;
  cache.set(id, lufs);
  return lufs;
}

// dB to add to the incoming song's trim: cut up to 6 dB, boost up to 3 dB (a boost can clip, a cut cannot)
export function matchTrimDb(outLufs: number, outTrimDb: number, inLufs: number): number {
  return Math.max(-6, Math.min(3, outLufs + outTrimDb - inLufs));
}
