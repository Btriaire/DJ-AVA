import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface SpotdlTrack {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration: number;
  artwork: string | null;
  explicit: boolean;
  source: "youtube";
}

export const SPOTDL_PAGES = [20, 60, 120, 200, 300] as const;

export function spotdlLimit(page: number): number {
  return SPOTDL_PAGES[Math.min(SPOTDL_PAGES.length - 1, Math.max(0, Math.floor(page)))];
}

export function pageSlice<T>(list: T[], page: number): T[] {
  const p = Math.max(0, Math.floor(page));
  if (p >= SPOTDL_PAGES.length) return [];
  return list.slice(p === 0 ? 0 : SPOTDL_PAGES[p - 1], SPOTDL_PAGES[p]);
}

export function rankClean<T extends { title: string }>(list: T[]): T[] {
  const DIRTY = /\b(live|lyrics?|paroles|karaok[eé]|cover|reaction|slowed|sped up|8d|1 ?hour)\b/i;
  return [...list.filter((x) => !DIRTY.test(x.title)), ...list.filter((x) => DIRTY.test(x.title))];
}

export function cacheKey(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

const PY = join(process.cwd(), ".venv-spotdl", "bin", "python");
const SCRIPT = join(process.cwd(), "scripts", "spotdl_search.py");

let child: ChildProcessWithoutNullStreams | null = null;
let ready: Promise<void> | null = null;
const pending = new Map<string, { resolve: (t: SpotdlTrack[]) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let seq = 0;
const cache = new Map<string, { at: number; tracks: SpotdlTrack[]; limit: number }>();
const inflight = new Map<string, Promise<SpotdlTrack[]>>();

function start(): Promise<void> {
  if (ready) {
    return ready;
  }
  if (!existsSync(PY)) {
    return Promise.reject(new Error("spotDL n'est pas installé : python3.11 -m venv .venv-spotdl puis .venv-spotdl/bin/pip install spotdl"));
  }
  child = spawn(PY, [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
  child.stderr.resume();

  ready = new Promise((res, rej) => {
    const readline = createInterface({ input: child!.stdout });
    readline.on("line", (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.ready) {
          res();
        } else if (msg.id && pending.has(msg.id)) {
          const { resolve, reject, timer } = pending.get(msg.id)!;
          clearTimeout(timer);
          pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error));
          } else {
            resolve(msg.tracks ?? []);
          }
        }
      } catch (e) {
        rej(e);
      }
    });
    child!.once("error", (e) => rej(e));
  });

  child.once("exit", () => {
    child = null;
    ready = null;
    for (const [id, { timer, reject }] of pending) {
      clearTimeout(timer);
      reject(new Error("spotDL s'est arrêté"));
    }
    pending.clear();
  });

  return ready;
}

export function warmSpotdl(): void {
  void start().catch(() => {});
}

async function ask(q: string, limit: number, timeoutMs = 15000): Promise<SpotdlTrack[]> {
  await start();
  const id = String(++seq);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("spotDL ne répond pas"));
      child?.kill();
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child!.stdin.write(JSON.stringify({ id, q, limit }) + "\n");
  });
}

async function fetchList(key: string, limit: number): Promise<SpotdlTrack[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 600000 && (hit.limit >= limit || hit.tracks.length < hit.limit)) {
    return hit.tracks;
  }
  const fk = `${key}|${limit}`;
  let p = inflight.get(fk);
  if (!p) {
    p = ask(key, limit).finally(() => inflight.delete(fk));
    inflight.set(fk, p);
  }
  const tracks = await p;
  const rankedTracks = rankClean(tracks);
  const existingHit = cache.get(key);
  if (!existingHit || existingHit.tracks.length < rankedTracks.length || Date.now() - existingHit.at > 600000) {
    cache.set(key, { at: Date.now(), tracks: rankedTracks, limit });
  }
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }
  return cache.get(key)!.tracks;
}

export async function searchSpotdl(q: string, page = 0): Promise<SpotdlTrack[]> {
  const key = cacheKey(q);
  if (!key) {
    return [];
  }
  const limit = spotdlLimit(page);
  const list = await fetchList(key, limit);
  if (page + 1 < SPOTDL_PAGES.length && list.length >= spotdlLimit(page)) {
    void fetchList(key, spotdlLimit(page + 1)).catch(() => {});
  }
  return pageSlice(list, page);
}
