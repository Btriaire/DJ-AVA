import { idbGetBlob, idbPutBlob, loadLibrary, saveLibrary, uid, extractCover, type LibTrack, type TrackSource } from "@/lib/library";

// htdemucs_ft overruns the Metal GPU watchdog on MLX; htdemucs stays reliable
export const PREP_MODEL = "htdemucs";
export const PREP_SHIFTS = 2;
export const PREP_STEMS: readonly string[] = ["drums", "bass", "other", "vocals"];

export type PrepStatus = "queued" | "running" | "done" | "error";

export interface PrepJob {
  trackId: string;
  name: string;
  source: TrackSource;
  url?: string;
  status: PrepStatus;
  progress: number;
  error?: string;
  addedAt: number;
}

export interface PrepReady {
  trackId: string;
  name: string;
  source: TrackSource;
  url?: string;
  hash: string;
  model: string;
  preparedAt: number;
  durationSec?: number;
}

export interface PrepState {
  jobs: PrepJob[];
  ready: PrepReady[];
}

const STORAGE_KEY = "djsynth.stemprep.v1";
let state: PrepState = loadState();
const subscribers = new Set<() => void>();
let worker: Promise<void> | null = null;

// Set by the app: false while a deck is playing, so no separation runs during playback.
let canRun: () => boolean = () => true;
export function setPrepGate(fn: () => boolean): void {
  canRun = fn;
}

function loadState(): PrepState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PrepState;
      // Reset running jobs to queued on load
      return {
        jobs: parsed.jobs.map(j => j.status === "running" ? { ...j, status: "queued", progress: 0 } : j),
        ready: parsed.ready,
      };
    }
  } catch {
    // Ignore storage errors
  }
  return { jobs: [], ready: [] };
}

function saveState(newState: PrepState): void {
  state = newState;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
  subscribers.forEach(cb => cb());
}

function ensureWorker(): void {
  if (!worker) {
    worker = processQueue().finally(() => {
      worker = null;
    });
  }
}

async function processQueue(): Promise<void> {
  while (true) {
    const job = state.jobs.find(j => j.status === "queued");
    if (!job) break;
    while (!canRun()) await new Promise(r => setTimeout(r, 2000)); // wait for playback to stop

    saveState({
      ...state,
      jobs: state.jobs.map(j => j.trackId === job.trackId ? { ...j, status: "running" } : j),
    });

    try {
      const bytes = await fetchTrackBytes(job);
      const { hash } = await startSeparation(bytes);
      await monitorSeparation(job.trackId, hash);
    } catch (error) {
      saveState({
        ...state,
        jobs: state.jobs.map(j =>
          j.trackId === job.trackId
            ? { ...j, status: "error", error: error instanceof Error ? error.message : "unknown error" }
            : j
        ),
      });
    }
  }
}

async function fetchTrackBytes(job: PrepJob): Promise<ArrayBuffer> {
  if (job.source === "local") {
    const blob = await idbGetBlob(job.trackId);
    if (!blob) throw new Error("fichier introuvable");
    return await blob.arrayBuffer();
  } else {
    const res = await fetch(`/api/${job.source}/stream?id=${encodeURIComponent(job.url ?? "")}`);
    if (!res.ok) throw new Error(`erreur ${res.status}`);
    return await res.arrayBuffer();
  }
}

async function startSeparation(bytes: ArrayBuffer): Promise<{ hash: string }> {
  const res = await fetch(
    `/api/stems/separate?prefetch=1&model=${PREP_MODEL}&shifts=${PREP_SHIFTS}&ultra=1&wav=1`,
    { method: "POST", body: bytes }
  );
  if (!res.ok) throw new Error(`erreur ${res.status}`);
  return await res.json() as { hash: string };
}

async function monitorSeparation(trackId: string, hash: string): Promise<void> {
  let idlePolls = 0; // consecutive polls with nothing running on the server
  while (true) {
    const job = state.jobs.find(j => j.trackId === trackId);
    if (!job) return; // Job was canceled

    const s = await (await fetch(
      `/api/stems/status?hash=${hash}&model=${PREP_MODEL}&ultra=1&wav=1`
    )).json() as { cached?: boolean; progress?: number };

    if (s.cached) {
      const lib = loadLibrary();
      const track = lib.tracks.find(t => t.id === trackId);
      saveState({
        jobs: state.jobs.filter(j => j.trackId !== trackId),
        ready: [
          ...state.ready,
          {
            trackId,
            name: job.name,
            source: job.source,
            url: job.url,
            hash,
            model: PREP_MODEL,
            preparedAt: Date.now(),
            durationSec: track?.durationSec,
          },
        ],
      });
      return;
    }

    idlePolls = s.progress == null ? idlePolls + 1 : 0;
    if (idlePolls >= 10) throw new Error("calcul interrompu côté serveur");

    saveState({
      ...state,
      jobs: state.jobs.map(j =>
        j.trackId === trackId ? { ...j, progress: s.progress ?? j.progress } : j
      ),
    });

    await new Promise(r => setTimeout(r, 3000));
  }
}

export function getPrepState(): PrepState {
  return state;
}

export function subscribePrep(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function enqueuePrep(tracks: LibTrack[]): number {
  const existingIds = new Set([
    ...state.jobs.map(j => j.trackId),
    ...state.ready.map(r => r.trackId),
  ]);

  const newJobs = tracks
    .filter(t => !existingIds.has(t.id))
    .map(t => ({
      trackId: t.id,
      name: t.name,
      source: t.source,
      url: t.url,
      status: "queued" as const,
      progress: 0,
      addedAt: Date.now(),
    }));

  if (newJobs.length > 0) {
    saveState({
      ...state,
      jobs: [...state.jobs, ...newJobs],
    });
    ensureWorker();
  }

  return newJobs.length;
}

export function cancelPrep(trackId: string): void {
  saveState({
    ...state,
    jobs: state.jobs.filter(j => j.trackId !== trackId || j.status === "running"),
  });
}

export function forgetPrep(trackId: string): void {
  saveState({
    ...state,
    ready: state.ready.filter(r => r.trackId !== trackId),
  });
}

export async function saveFileToLibrary(file: File): Promise<LibTrack> {
  const lib = loadLibrary();
  const name = file.name.replace(/\.[^/.]+$/, "");
  const existing = lib.tracks.find(t =>
    t.source === "local" && t.name === name
  );

  if (existing) return existing;

  const id = uid();
  await idbPutBlob(id, file);
  const art = (await extractCover(file)) ?? undefined;

  const track: LibTrack = {
    id,
    name,
    source: "local",
    deck: null,
    art,
    addedAt: Date.now(),
  };

  if (!await saveLibrary({ ...lib, tracks: [track, ...lib.tracks] })) {
    throw new Error("stockage du navigateur plein");
  }

  return track;
}

// Resume queued jobs after app reload
if (typeof window !== "undefined") {
  // Check if there are queued jobs on load
  if (state.jobs.some(j => j.status === "queued")) {
    // Schedule worker restart after small delay to ensure UI is ready
    setTimeout(() => ensureWorker(), 3000);
  }
}
