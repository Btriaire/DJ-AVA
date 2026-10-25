import { useSyncExternalStore } from "react";
import type { LibTrack } from "@/lib/library";
import { getPrepState, subscribePrep, type PrepReady } from "@/lib/stemPrep";

// Stems are made by several parts of the app (the preparation queue, a deck separating a track in the Console, the
// radio). Whoever made them, every view answers "are this song's stems ready?" the same way: from the preparation
// list, or from the stems the server already holds for the song's audio (its hash is recorded on the library track).

let hashes = new Set<string>();
const listeners = new Set<() => void>();
let loading = false;

export function refreshStemHashes(): void {
  if (typeof window === "undefined" || loading) return;
  loading = true;
  fetch("/api/stems/list")
    .then((r) => r.json())
    .then((j: { hashes?: string[] }) => {
      if (!Array.isArray(j.hashes)) return;
      hashes = new Set(j.hashes);
      listeners.forEach((l) => l());
    })
    .catch(() => {})
    .finally(() => {
      loading = false;
    });
}

export const getStemHashes = () => hashes;
export const subscribeStemHashes = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function trackHasStems(t: Pick<LibTrack, "id" | "stemHash"> | undefined, ready: readonly PrepReady[], known: ReadonlySet<string> = hashes): boolean {
  if (!t) return false;
  return ready.some((r) => r.trackId === t.id) || (!!t.stemHash && known.has(t.stemHash));
}

// for components: re-renders when the preparation list or the server's list changes
export function useStemsShared(): { has: (t: Pick<LibTrack, "id" | "stemHash"> | undefined) => boolean; known: ReadonlySet<string> } {
  const prep = useSyncExternalStore(subscribePrep, getPrepState, getPrepState);
  const known = useSyncExternalStore(subscribeStemHashes, getStemHashes, getStemHashes);
  return { has: (t) => trackHasStems(t, prep.ready, known), known };
}

if (typeof window !== "undefined") {
  refreshStemHashes();
  // a finished preparation adds hashes to the server: look again
  let last = getPrepState().ready.length;
  subscribePrep(() => {
    const n = getPrepState().ready.length;
    if (n !== last) {
      last = n;
      refreshStemHashes();
    }
  });
}
