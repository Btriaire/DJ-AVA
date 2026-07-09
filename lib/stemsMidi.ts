// Stems → MIDI: turn every separated stem of a track into ONE multi-track MIDI
// file (one instrument per stem, all in the same file). We reuse the Demucs stem
// cache, transcode each stem MP3 to a clean mono WAV, then hand them to the
// Python transcription script (basic-pitch for pitched stems, band-onset
// detection for drums). The combined MIDI is cached next to the stems so a track
// is only transcribed once per model.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rename, copyFile, unlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { MODEL_STEMS, StemModel, separate, stemPath, ffmpegPath, hashBytes } from "./stems";

const PYTHON = process.env.PYTHON3_PATH || "python3";

function scriptPath(): string {
  // present in dev (repo root) and copied into the standalone image at /app/scripts
  return join(process.cwd(), "scripts", "stems_to_midi.py");
}

// combined MIDI lives beside the cached stems: <cache>/<hash>/<model>/combined.mid
export function combinedMidiPath(hash: string, model: StemModel): string {
  return join(dirname(stemPath(hash, model, "x")), "combined.mid");
}

export function isMidiCached(hash: string, model: StemModel): boolean {
  return existsSync(combinedMidiPath(hash, model));
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${err.slice(-500)}`))
    );
  });
}

async function moveFile(src: string, dst: string): Promise<void> {
  try {
    await rename(src, dst);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await copyFile(src, dst);
    await unlink(src);
  }
}

// coalesce concurrent transcription requests for the same track+model
const inflight = new Map<string, Promise<void>>();

// Ensure the combined MIDI exists for this audio + model. First guarantees the
// stems are separated (reuses the Demucs cache + slot), then transcribes them.
// Returns the content hash. Idempotent and concurrency-safe.
export async function ensureMidi(data: ArrayBuffer, model: StemModel): Promise<string> {
  const hash = await separate(data, model); // blocks until stems are cached
  if (isMidiCached(hash, model)) return hash;
  const key = `${hash}:${model}`;
  const existing = inflight.get(key);
  if (existing) {
    await existing;
    return hash;
  }
  const job = transcribe(hash, model).finally(() => inflight.delete(key));
  inflight.set(key, job);
  await job;
  return hash;
}

async function transcribe(hash: string, model: StemModel): Promise<void> {
  const ff = ffmpegPath();
  const work = await mkdtemp(join(tmpdir(), "midi-"));
  try {
    const stemArgs: string[] = [];
    for (const stem of MODEL_STEMS[model]) {
      const mp3 = stemPath(hash, model, stem);
      if (!existsSync(mp3)) continue;
      const wav = join(work, `${stem}.wav`);
      // mono 22.05 kHz WAV — what basic-pitch / librosa want
      await run(ff, ["-hide_banner", "-loglevel", "error", "-y", "-i", mp3, "-ac", "1", "-ar", "22050", wav]);
      stemArgs.push("--stem", `${stem}:${wav}`);
    }
    if (!stemArgs.length) throw new Error("no stems to transcribe");

    const outTmp = join(work, "combined.mid");
    await run(PYTHON, [scriptPath(), "--out", outTmp, ...stemArgs]);
    await moveFile(outTmp, combinedMidiPath(hash, model));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// Non-blocking: kick off separation + transcription in the background if the
// combined MIDI isn't cached yet. Returns the hash so the caller can poll.
export function prefetchMidi(data: ArrayBuffer, model: StemModel): { hash: string; cached: boolean } {
  const hash = hashBytes(data);
  const cached = isMidiCached(hash, model);
  if (!cached) {
    ensureMidi(data, model).catch((e) => console.error("[stems→midi]", (e as Error).message));
  }
  return { hash, cached };
}

export async function readMidi(hash: string, model: StemModel): Promise<Buffer> {
  return readFile(combinedMidiPath(hash, model));
}
