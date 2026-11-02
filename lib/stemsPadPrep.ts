import { PREP_MODEL, PREP_QS } from "@/lib/stemPrep";

export interface PadSong { stemHash?: string; bpm?: number }
export interface PadJob { done: number; total: number; ok: number; running: boolean; current?: string; urgent?: string[] }

let job: PadJob = { done: 0, total: 0, ok: 0, running: false };
const listeners = new Set<() => void>();

// the same object until the state changes (useSyncExternalStore needs a stable snapshot, or React loops)
export function padJob(): PadJob {
  return job;
}

export function subscribePadJob(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function set(next: PadJob) {
  job = next;
  listeners.forEach(cb => cb());
}

// one title right now, beside a batch that may be running: it shows as "pads…" on its own pill
export async function runPadNow(song: PadSong): Promise<boolean> {
  const h = song.stemHash;
  if (!h) return false;
  set({ ...job, urgent: [...(job.urgent ?? []).filter(x => x !== h), h] });
  let ok = false;
  try {
    const bpm = song.bpm;
    const response = await fetch(`/api/stems/samples?deep=1&urgent=1&hash=${h}&model=${PREP_MODEL}${PREP_QS}${bpm ? `&bpm=${bpm}` : ""}`);
    ok = !!(await response.json()).deep;
  } catch {
    ok = false;
  }
  set({ ...job, urgent: (job.urgent ?? []).filter(x => x !== h) });
  return ok;
}

export async function runStemsPad(songs: PadSong[]): Promise<boolean> {
  if (job.running) return false;

  const list = [...new Map(songs.filter(s => s.stemHash).map(s => [s.stemHash, s])).values()];
  if (list.length === 0) return false;

  set({ done: 0, total: list.length, ok: 0, running: true });

  for (const { stemHash: h, bpm } of list) {
    set({ ...job, current: h }); // the song being searched right now (its pill shows it)
    try {
      const response = await fetch(`/api/stems/samples?deep=1&hash=${h}&model=${PREP_MODEL}${PREP_QS}${bpm ? `&bpm=${bpm}` : ""}`);
      const { deep } = await response.json();
      set({ ...job, ok: job.ok + (deep ? 1 : 0), done: job.done + 1 });
    } catch {
      set({ ...job, done: job.done + 1 });
    }
  }

  set({ ...job, running: false, current: undefined });
  return true;
}

export async function padReady(hashes: string[]): Promise<Set<string>> {
  try {
    const response = await fetch(`/api/stems/samples?status=1&model=${PREP_MODEL}${PREP_QS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes })
    });
    const { ready } = await response.json();
    return new Set(ready);
  } catch {
    return new Set();
  }
}
