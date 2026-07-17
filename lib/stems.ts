// Server-side stem separation backed by Demucs (Meta). The browser can't run a
// separation model, so we do it here: decode the upload to a clean WAV with
// ffmpeg, run Demucs on CPU, transcode each stem to MP3, and cache the result
// by content hash + model so a track is only ever separated once per setting.
//
// Three analysis qualities are exposed:
//   htdemucs     — standard, 4 stems (drums/bass/other/vocals), fastest
//   htdemucs_ft  — fine-tuned, 4 stems, ~4× slower but cleaner separation
//   htdemucs_6s  — 6 stems (adds guitar + piano), more channels
// `shifts` adds test-time augmentation (slower, more precise) when > 0.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type StemModel = "htdemucs" | "htdemucs_ft" | "htdemucs_6s";

// stems produced by each model, in Demucs' output order
export const MODEL_STEMS: Record<StemModel, readonly string[]> = {
  htdemucs: ["drums", "bass", "other", "vocals"],
  htdemucs_ft: ["drums", "bass", "other", "vocals"],
  htdemucs_6s: ["drums", "bass", "other", "vocals", "guitar", "piano"],
};

export function isModel(s: string): s is StemModel {
  return s === "htdemucs" || s === "htdemucs_ft" || s === "htdemucs_6s";
}

// resolve a binary, preferring known locations (PATH is slim when Next is
// launched outside an interactive shell)
function bin(name: string, envKey: string, extra: string[] = []): string {
  const fromEnv = process.env[envKey];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const p of [...extra, `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`]) {
    if (existsSync(p)) return p;
  }
  return name;
}

const FFMPEG = bin("ffmpeg", "FFMPEG_PATH");
const DEMUCS = bin("demucs", "DEMUCS_PATH", [join(process.cwd(), ".venv-stems/bin/demucs")]);

// ffmpeg path, reused by the stems→MIDI transcription pipeline
export function ffmpegPath(): string {
  return FFMPEG;
}

// cache root: <project>/.stems-cache/<hash>/<model>[_ultra][_wav][_dn]/<stem>.<ext>
// On the VPS, point STEMS_CACHE_DIR at a persistent volume (the standalone build
// runs from a temp-ish cwd, and Docker layers are ephemeral) so separations
// survive restarts and redeploys.
const CACHE = process.env.STEMS_CACHE_DIR || join(process.cwd(), ".stems-cache");

// Orthogonal quality knobs, stacked on top of whichever model is chosen:
//   ultra    — shifts≥2 + overlap 0.25 (vs 0.1 default): several extra Demucs
//              passes averaged together, ~3-4× slower, cleaner separation
//   lossless — cache stems as WAV instead of MP3 (bigger, no lossy artifacts)
//   denoiseVocals — ffmpeg afftdn noise-reduction pass on the vocals stem only
//              (cuts hiss/bleed, not real de-reverb — ffmpeg has no such filter)
export interface StemOpts {
  ultra?: boolean;
  lossless?: boolean;
  denoiseVocals?: boolean;
}

function dirSuffix(opts: StemOpts): string {
  return `${opts.ultra ? "_ultra" : ""}${opts.lossless ? "_wav" : ""}${opts.denoiseVocals ? "_dn" : ""}`;
}

function stemExt(opts: StemOpts): "wav" | "mp3" {
  return opts.lossless ? "wav" : "mp3";
}

function modelDir(hash: string, model: StemModel, opts: StemOpts = {}) {
  return join(CACHE, hash, model + dirSuffix(opts));
}

export function hashBytes(data: ArrayBuffer | Uint8Array): string {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  return createHash("sha1").update(buf).digest("hex").slice(0, 16);
}

// have all stems for this content hash + model (+ quality opts) already been separated?
export function isCached(hash: string, model: StemModel, opts: StemOpts = {}): boolean {
  const dir = modelDir(hash, model, opts);
  const ext = stemExt(opts);
  return MODEL_STEMS[model].every((s) => existsSync(join(dir, `${s}.${ext}`)));
}

export function stemPath(hash: string, model: StemModel, stem: string, opts: StemOpts = {}): string {
  return join(modelDir(hash, model, opts), `${stem}.${stemExt(opts)}`);
}

// every content hash that has at least one fully-cached model at default
// quality (for the library "stems available" badge — cheap directory listing)
export function listCachedHashes(): string[] {
  if (!existsSync(CACHE)) return [];
  const out: string[] = [];
  for (const hash of readdirSync(CACHE)) {
    const ok = (["htdemucs", "htdemucs_ft", "htdemucs_6s"] as StemModel[]).some((m) =>
      isCached(hash, m)
    );
    if (ok) out.push(hash);
  }
  return out;
}

// Move a file, falling back to copy+unlink when source and destination are on
// different filesystems. Demucs writes stems into the OS temp dir, but the cache
// lives on a mounted volume (/data/stems-cache on the VPS) — a plain rename()
// across that boundary throws EXDEV ("cross-device link not permitted"), which
// silently left every cache dir created-but-empty and made stems 404.
async function moveFile(src: string, dst: string): Promise<void> {
  try {
    await rename(src, dst);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await copyFile(src, dst);
    await unlink(src);
  }
}

// run a child process to completion, rejecting on non-zero exit. When `niceness`
// is set, the process is launched under `nice` so background (prefetch) jobs
// yield CPU to the live app and any on-demand separation.
function run(cmd: string, args: string[], niceness?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let exe = cmd;
    let exeArgs = args;
    if (niceness && existsSync("/usr/bin/nice")) {
      exe = "/usr/bin/nice";
      exeArgs = ["-n", String(niceness), cmd, ...args];
    }
    const p = spawn(exe, exeArgs, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${err.slice(-400)}`))
    );
  });
}

// This box is CPU-bound (often a single core), so run at most ONE Demucs at a
// time. On-demand jobs (priority 1) are dequeued before background prefetch jobs
// (priority 0); a job already running can't be interrupted but won't be jumped.
const slotWaiters: { prio: number; resolve: () => void }[] = [];
let slotBusy = false;
function acquireSlot(prio: number): Promise<void> {
  if (!slotBusy) {
    slotBusy = true;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    slotWaiters.push({ prio, resolve });
    slotWaiters.sort((a, b) => b.prio - a.prio); // higher priority served first
  });
}
function releaseSlot(): void {
  const next = slotWaiters.shift();
  if (next) next.resolve(); // stays busy, hand the slot straight to the next job
  else slotBusy = false;
}

// in-flight separations keyed by hash+model so concurrent requests for the same
// job share one Demucs run instead of launching it twice
const inflight = new Map<string, Promise<void>>();

export interface SeparateOpts extends StemOpts {
  priority?: number; // higher = scheduled first (on-demand 1, prefetch 0)
  nice?: boolean; // run Demucs under `nice` (background prefetch jobs)
}

// separate `data` into cached stems and return the content hash. Idempotent:
// returns immediately if already cached, and coalesces concurrent calls.
export async function separate(
  data: ArrayBuffer,
  model: StemModel = "htdemucs",
  shifts = 0,
  opts: SeparateOpts = {}
): Promise<string> {
  const hash = hashBytes(data);
  if (isCached(hash, model, opts)) return hash;
  const key = `${hash}:${model}:${dirSuffix(opts)}`;
  const existing = inflight.get(key);
  if (existing) {
    await existing;
    return hash;
  }
  const job = doSeparate(hash, model, shifts, data, opts).finally(() => inflight.delete(key));
  inflight.set(key, job);
  await job;
  return hash;
}

// Non-blocking: make sure stems exist for this content, scheduling a
// low-priority, niced background separation if they don't. Returns immediately
// with the content hash so the caller (deck prefetch) can poll the cache.
export function prefetch(
  data: ArrayBuffer,
  model: StemModel = "htdemucs",
  shifts = 0,
  opts: StemOpts = {}
): { hash: string; cached: boolean } {
  const hash = hashBytes(data);
  const cached = isCached(hash, model, opts);
  if (!cached) {
    separate(data, model, shifts, { ...opts, priority: 0, nice: true }).catch((e) =>
      console.error("[stems prefetch]", (e as Error).message)
    );
  }
  return { hash, cached };
}

async function doSeparate(
  hash: string,
  model: StemModel,
  shifts: number,
  data: ArrayBuffer,
  opts: SeparateOpts = {}
): Promise<void> {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "stems-"));
  const niceness = opts.nice ? 15 : undefined;
  // serialise the heavy work: only one Demucs at a time on this CPU-bound box
  await acquireSlot(opts.priority ?? 1);
  try {
    // 1. write the raw upload, then normalise to a clean stereo WAV with ffmpeg
    //    (guarantees Demucs can decode it regardless of the source container)
    const raw = join(work, "raw");
    await writeFile(raw, Buffer.from(data));
    const wav = join(work, "source.wav");
    await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-ac", "2", "-ar", "44100", wav], niceness);

    // 2. run Demucs (CPU) -> stems under <out>/<model>/source/<stem>.<ext>
    //    --overlap 0.1 (vs Demucs' 0.25 default) computes fewer overlapping
    //    windows → ~15% faster on CPU for a negligible quality cost. ULTRA mode
    //    inverts that trade: overlap 0.25 + ≥2 shifts (test-time augmentation,
    //    several offset passes averaged together) for the cleanest separation
    //    at several times the CPU cost. STEMS_SEGMENT caps the chunk length to
    //    bound peak RAM on memory-tight hosts. All env-tunable except ultra.
    const out = join(work, "out");
    const overlap = opts.ultra ? "0.25" : process.env.STEMS_OVERLAP || "0.1";
    const ext = stemExt(opts);
    const args = ["-n", model, "-d", "cpu", "--overlap", overlap];
    if (ext === "mp3") args.push("--mp3", "--mp3-bitrate", "256");
    if (process.env.STEMS_SEGMENT) args.push("--segment", process.env.STEMS_SEGMENT);
    const shiftsEff = opts.ultra ? Math.max(shifts, 2) : shifts;
    if (shiftsEff > 0) args.push("--shifts", String(Math.min(shiftsEff, 10)));
    args.push("-o", out, wav);
    await run(DEMUCS, args, niceness);

    // 3. optional vocal cleanup: ffmpeg's afftdn adaptive noise-reduction filter
    //    on the vocals stem only (there's no true de-reverb filter in ffmpeg —
    //    this cuts hiss/bleed/background noise, framed honestly as that, not
    //    "reverb removal")
    const produced = join(out, model, "source");
    if (opts.denoiseVocals && MODEL_STEMS[model].includes("vocals")) {
      const vocalsIn = join(produced, `vocals.${ext}`);
      const vocalsOut = join(produced, `vocals.dn.${ext}`);
      const dnArgs = ["-hide_banner", "-loglevel", "error", "-y", "-i", vocalsIn, "-af", "afftdn=nr=12:nf=-25"];
      if (ext === "mp3") dnArgs.push("-b:a", "256k");
      dnArgs.push(vocalsOut);
      await run(FFMPEG, dnArgs, niceness);
      await rename(vocalsOut, vocalsIn);
    }

    // 4. atomically publish into the cache dir
    const dir = modelDir(hash, model, opts);
    mkdirSync(dir, { recursive: true });
    for (const s of MODEL_STEMS[model]) {
      await moveFile(join(produced, `${s}.${ext}`), join(dir, `${s}.${ext}`));
    }
  } finally {
    releaseSlot();
    await rm(work, { recursive: true, force: true });
  }
}

export async function readStem(
  hash: string,
  model: StemModel,
  stem: string,
  opts: StemOpts = {}
): Promise<Buffer> {
  return readFile(stemPath(hash, model, stem, opts));
}
