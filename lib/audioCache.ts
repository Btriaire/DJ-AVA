import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createMp3Stream } from "@/lib/youtube";

// Songs played from YouTube are kept on disk (never in memory): the second play, or a song prepared in advance
// for a radio show, starts at once instead of waiting for yt-dlp and ffmpeg. Oldest files go first past the limit.

const DIR = join(process.cwd(), ".audio-cache");
const MAX_BYTES = 2 * 1024 ** 3;
const inflight = new Map<string, Promise<boolean>>();

export const isVideoId = (s: string | null | undefined): s is string => !!s && /^[\w-]{11}$/.test(s);
const fileOf = (id: string) => join(DIR, `${id}.mp3`);

export function cachedFile(id: string): { size: number; stream: ReadableStream<Uint8Array> } | null {
  const f = fileOf(id);
  if (!existsSync(f)) return null;
  const size = statSync(f).size;
  if (size < 50_000) return null;
  return { size, stream: Readable.toWeb(createReadStream(f)) as unknown as ReadableStream<Uint8Array> };
}

function prune() {
  try {
    const files = readdirSync(DIR)
      .filter((n) => n.endsWith(".mp3"))
      .map((n) => ({ n, ...statSync(join(DIR, n)) }))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
    let total = files.reduce((sum, f) => sum + f.size, 0);
    for (const f of files) {
      if (total <= MAX_BYTES) break;
      unlinkSync(join(DIR, f.n));
      total -= f.size;
    }
  } catch {
    // the cache folder is only an accelerator
  }
}

// writes a stream to the cache file; the file only appears (renamed) once the whole song is there
async function writeAll(id: string, stream: ReadableStream<Uint8Array>): Promise<boolean> {
  mkdirSync(DIR, { recursive: true });
  const part = `${fileOf(id)}.part`;
  const out = createWriteStream(part);
  try {
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
    await new Promise<void>((r) => out.end(() => r()));
    if (statSync(part).size < 50_000) throw new Error("too small");
    renameSync(part, fileOf(id));
    prune();
    return true;
  } catch {
    out.destroy();
    try {
      unlinkSync(part);
    } catch {
      // nothing to remove
    }
    return false;
  }
}

// the stream sent to the player; a copy goes to the cache on the side
export function teeToCache(id: string, stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  if (inflight.has(id)) return stream;
  const [forPlayer, forDisk] = stream.tee();
  const job = writeAll(id, forDisk).finally(() => inflight.delete(id));
  inflight.set(id, job);
  return forPlayer;
}

// downloads a song into the cache (radio shows prepare their songs this way); true when it is there
export function warmAudio(id: string): Promise<boolean> {
  if (cachedFile(id)) return Promise.resolve(true);
  const running = inflight.get(id);
  if (running) return running;
  const job = writeAll(id, createMp3Stream(id)).finally(() => inflight.delete(id));
  inflight.set(id, job);
  return job;
}
