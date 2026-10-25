import type { LibTrack, Playlist } from "@/lib/library";
import { buildSet, type SetArc } from "@/lib/setBuilder";

// Pure helpers of the set-creation assistant (shared by the Préparation and Playlist views).

export type WizardSource = "checked" | "list" | "all";

export const ARC_ORDER: SetArc[] = ["flow", "rise", "fall", "peak", "wave"];
export const ARC_LABEL: Record<SetArc, string> = { flow: "Fluide", rise: "Montée", fall: "Descente", peak: "Pic", wave: "Vague" };
export const ARC_HINT: Record<SetArc, string> = {
  flow: "Enchaîne au plus compatible, sans courbe imposée : idéal pour un set d'ambiance.",
  rise: "Le tempo monte du début à la fin : un échauffement qui prend de l'énergie.",
  fall: "Le tempo descend : pour finir en douceur ou clôturer la soirée.",
  peak: "Monte jusqu'à un pic aux deux tiers, puis redescend : un set complet.",
  wave: "Deux vagues : bas, haut, bas, haut, bas : de quoi faire respirer la piste.",
};

export const DURATIONS = [0, 30, 45, 60, 90, 120] as const;
export function durationLabel(min: number): string {
  return min === 0 ? "Tous les titres" : min < 60 ? `${min} min` : min % 60 === 0 ? `${min / 60} h` : `${Math.floor(min / 60)} h ${min % 60}`;
}

export function resolveSource(
  source: WizardSource,
  listId: string,
  bac: LibTrack[],
  allTracks: LibTrack[],
  checkedIds: ReadonlySet<string>,
  playlists: Playlist[]
): LibTrack[] {
  if (source === "checked") return bac.filter((t) => checkedIds.has(t.id));
  if (source === "all") return bac;
  const list = playlists.find((p) => p.id === listId);
  if (!list) return [];
  const byId = new Map(allTracks.map((t) => [t.id, t]));
  return list.trackIds.map((id) => byId.get(id)).filter((t): t is LibTrack => !!t);
}

export interface OrderTuning {
  harmonyWeight?: number;
  artists?: "alternate" | "blocks" | "free";
}

export function computeOrder(tracks: LibTrack[], arc: SetArc, durationMin: number, startId: string, seed: number | null, tuning: OrderTuning = {}): string[] {
  return buildSet(
    tracks.map((t) => ({ id: t.id, bpm: t.bpm ?? 0, camelot: t.camelot ?? "", durationSec: t.durationSec ?? 0, group: t.group })),
    { arc, targetMin: durationMin || undefined, startId: startId || undefined, seed: seed ?? undefined, ...tuning }
  );
}

// roughly how many titles a set of that length will hold (what the shape step shows before computing)
export function estimateCount(tracks: LibTrack[], durationMin: number): number {
  const known = tracks.filter((t) => (t.bpm ?? 0) > 0);
  if (!durationMin) return known.length;
  const durs = known.map((t) => t.durationSec ?? 0).filter((d) => d > 0);
  const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 240;
  return Math.max(1, Math.min(known.length, Math.round((durationMin * 60) / avg)));
}

// titles whose tempo or key is unknown: the set can't be ordered or judged without them
export function needsAnalysis(tracks: LibTrack[]): LibTrack[] {
  return tracks.filter((t) => !(t.bpm && t.bpm > 0) || !t.camelot);
}
