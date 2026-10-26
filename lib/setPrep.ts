import { useSyncExternalStore } from "react";
import { loadLibrary, type LibTrack } from "@/lib/library";
import { getMemLevel } from "@/lib/memoryGovernor";
import { djLinesForShow } from "@/lib/djLines";
import { lineUrl } from "@/lib/djVoice";
import { enqueuePrep } from "@/lib/stemPrep";
import type { DjOptions } from "@/lib/mixPlan";
import { forceOf } from "@/lib/djForce";

// Everything that can be done before a set is played, for ANY set (Radio-AVA, Playlist, Préparation, Console):
// the songs copied to the disk cache of the app (instant start, no gap), the DJ voice clips made on the MaRuche
// server, and the stems of the songs (all of them when the DJ plays with stems). What one view prepares is ready for all the others.

export interface PrepProgress {
  state: "running" | "done";
  warmed: number;
  total: number;
  voiced: number; // DJ voice clips made (a minute or more each)
  voiceTotal: number;
  voiceFailed: boolean; // the voice server did not answer: the set plays without announcements
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function prepareTracks(tracks: LibTrack[], dj: DjOptions | undefined, onProgress: (p: PrepProgress) => void, alive: () => boolean = () => true): Promise<PrepProgress> {
  const yt = tracks.filter((t) => t.source === "youtube" && !!t.url);
  const lines = dj && dj.voice !== "off" && dj.voiceEngine === "dj" ? djLinesForShow(tracks, dj) : [];
  let warmed = 0;
  let voiced = 0;
  let voiceFailed = false;
  const cur = (state: PrepProgress["state"] = "running"): PrepProgress => ({ state, warmed, total: yt.length, voiced, voiceTotal: lines.length, voiceFailed });
  onProgress(cur());
  const queue = [...yt];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      while (getMemLevel() === "critical") await sleep(1500);
      try {
        await fetch(`/api/radio/warm?id=${encodeURIComponent(t.url!)}`);
      } catch {
        // this song will simply start the usual way
      }
      warmed++;
      if (!alive()) return;
      onProgress(cur());
    }
  };
  // the DJ voice: one clip at a time (the server has one voice model), while the songs download
  const voiceWorker = async () => {
    for (const text of lines) {
      if (voiceFailed || !alive()) return;
      try {
        const res = await fetch(lineUrl(text, false));
        if (!res.ok) throw new Error(String(res.status));
        await res.arrayBuffer();
        voiced++;
      } catch {
        voiceFailed = true; // server unreachable: stop asking
      }
      onProgress(cur());
    }
  };
  await Promise.all([worker(), worker(), voiceWorker()]); // two downloads at a time: they only use the disk and the network
  return cur("done");
}

// ---- the sets of the library ------------------------------------------------------------------

let progress: Record<string, PrepProgress> = {};
const listeners = new Set<() => void>();
const emit = (next: Record<string, PrepProgress>) => {
  progress = next;
  listeners.forEach((l) => l());
};
export const getSetPrep = () => progress;
export const subscribeSetPrep = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
export const useSetPrep = () => useSyncExternalStore(subscribeSetPrep, getSetPrep, getSetPrep);

// does this DJ play with stems? (force 3 and above, unless the set says no)
export const wantsStems = (dj: DjOptions | undefined): boolean => !!dj && dj.stems !== "off" && forceOf(dj) >= 3;

export async function prepareSet(playlistId: string, opts: { stems?: boolean } = {}): Promise<void> {
  if (progress[playlistId]?.state === "running") return;
  const lib = loadLibrary();
  const pl = lib.playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  const byId = new Map(lib.tracks.map((t) => [t.id, t]));
  const tracks = pl.trackIds.map((id) => byId.get(id)).filter((t): t is LibTrack => !!t);
  const set = (p: PrepProgress) => emit({ ...progress, [playlistId]: p });
  const last = await prepareTracks(tracks, pl.dj, set);
  // the stems of the WHOLE set, in playing order (the first songs are ready first): a DJ with stems on every song
  // can use them all along; with only two songs prepared it had stems for a minute and none after
  if (opts.stems ?? wantsStems(pl.dj)) enqueuePrep(tracks);
  set(last);
}
