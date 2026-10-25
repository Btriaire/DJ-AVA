import { getMemLevel } from "@/lib/memoryGovernor";
import { idbGetBlob, idbPutBlob, loadLibrary, saveLibrary, uid, extractCover, type LibTrack, type TrackSource } from "@/lib/library";

// htdemucs_ft overruns the Metal GPU watchdog on MLX; htdemucs stays reliable
export const PREP_MODEL = "htdemucs";
export const PREP_SHIFTS = 2;
export const PREP_STEMS: readonly string[] = ["drums", "bass", "other", "vocals"];
// quality of the prepared stems; a deck must ask for the SAME variant to find them in the server cache
// (cache folder <hash>/<model>[_ultra][_wav]), see Deck.adoptPreparedStems()
export const PREP_OPTS = { ultra: true, lossless: true } as const;
const PREP_QS = `${PREP_OPTS.ultra ? "&ultra=1" : ""}${PREP_OPTS.lossless ? "&wav=1" : ""}`;

export type PrepStatus = "queued" | "running" | "done" | "error";

export interface PrepJob {
  trackId: string;
  name: string;
  source: TrackSource;
  url?: string;
  status: PrepStatus;
  progress: number;
  phase?: "download" | "separate";
  error?: string;
  addedAt: number;
  hash?: string;
}

export interface PrepReady {
  trackId: string;
  name: string;
  source: TrackSource;
  url?: string;
  hash: string;
  model: string;
  ultra?: boolean; // quality the stems were made with; missing on old entries = PREP_OPTS
  lossless?: boolean;
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
      // Reset running jobs to queued on load, but keep hash for resuming
      return {
        jobs: parsed.jobs.map(j =>
          j.status === "running"
            ? { ...j, status: j.hash ? "running" : "queued", progress: 0, phase: j.hash ? j.phase : undefined }
            : j
        ),
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
    const job = state.jobs.find(j => j.status === "queued" || (j.status === "running" && j.hash));
    if (!job) break;
    while (!canRun() || getMemLevel() === "critical") await new Promise(r => setTimeout(r, 2000)); // wait for playback to stop, and for memory to come back

    if (job.hash) {
      // Resume existing job
      saveState({
        ...state,
        jobs: state.jobs.map(j =>
          j.trackId === job.trackId
            ? { ...j, status: "running", progress: 0, phase: "separate" }
            : j
        ),
      });
      try {
        await monitorSeparation(job.trackId, job.hash);
      } catch (error) {
        saveState({
          ...state,
          jobs: state.jobs.map(j =>
            j.trackId === job.trackId
              ? {
                  ...j,
                  status: "error",
                  error: error instanceof Error ? error.message.substring(0, 200) : "unknown error",
                  hash: undefined,
                  phase: undefined,
                }
              : j
          ),
        });
      }
    } else {
      // New job
      saveState({
        ...state,
        jobs: state.jobs.map(j =>
          j.trackId === job.trackId
            ? { ...j, status: "running", progress: 0, phase: "download" }
            : j
        ),
      });

      try {
        const bytes = await fetchTrackBytes(job);
        saveState({
          ...state,
          jobs: state.jobs.map(j =>
            j.trackId === job.trackId
              ? { ...j, phase: "separate", progress: 0 }
              : j
          ),
        });
        const { hash } = await startSeparation(bytes);
        saveState({
          ...state,
          jobs: state.jobs.map(j =>
            j.trackId === job.trackId
              ? { ...j, hash, phase: "separate", progress: 0 }
              : j
          ),
        });
        await monitorSeparation(job.trackId, hash);
      } catch (error) {
        saveState({
          ...state,
          jobs: state.jobs.map(j =>
            j.trackId === job.trackId
              ? {
                  ...j,
                  status: "error",
                  error: error instanceof Error ? error.message.substring(0, 200) : "unknown error",
                  hash: undefined,
                  phase: undefined,
                }
              : j
          ),
        });
      }
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
    `/api/stems/separate?prefetch=1&model=${PREP_MODEL}&shifts=${PREP_SHIFTS}${PREP_QS}`,
    { method: "POST", body: bytes }
  );
  if (!res.ok) {
    // the server explains why (e.g. a too-heavy GPU job): show that text, not just the status
    const detail = await res.json().then((j: { error?: string }) => j.error).catch(() => undefined);
    throw new Error(detail || `erreur ${res.status}`);
  }
  return await res.json() as { hash: string };
}

async function monitorSeparation(trackId: string, hash: string): Promise<void> {
  let idlePolls = 0; // consecutive polls with nothing running on the server
  while (true) {
    const job = state.jobs.find(j => j.trackId === trackId);
    if (!job) return; // Job was canceled

    const s = await (await fetch(
      `/api/stems/status?hash=${hash}&model=${PREP_MODEL}${PREP_QS}`
    )).json() as { cached?: boolean; progress?: number | null; error?: string | null };

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
            ultra: PREP_OPTS.ultra,
            lossless: PREP_OPTS.lossless,
            preparedAt: Date.now(),
            durationSec: track?.durationSec,
          },
        ],
      });
      return;
    }

    if (s.error) throw new Error(s.error);

    idlePolls = s.progress == null ? idlePolls + 1 : 0;
    if (idlePolls >= 20) throw new Error("le serveur n'a plus de progression pour ce morceau (redémarrage de l'appli ?) : relance avec Stems");

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

// the prepared stems of a library track (what the deck should load instead of separating again)
export function getPreparedStems(trackId: string): PrepReady | undefined {
  return state.ready.find(r => r.trackId === trackId);
}

export function subscribePrep(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function enqueuePrep(tracks: LibTrack[]): number {
  // a job that failed is not "in progress": it can be queued again (its old error is replaced)
  const existingIds = new Set([
    ...state.jobs.filter(j => j.status !== "error").map(j => j.trackId),
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
    const requeued = new Set(newJobs.map(j => j.trackId));
    saveState({
      ...state,
      jobs: [...state.jobs.filter(j => !requeued.has(j.trackId)), ...newJobs],
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
  // Check if there are queued jobs or jobs to resume on load
  if (state.jobs.some(j => j.status === "queued" || (j.status === "running" && j.hash))) {
    // Schedule worker restart after small delay to ensure UI is ready
    setTimeout(() => ensureWorker(), 3000);
  }
}
