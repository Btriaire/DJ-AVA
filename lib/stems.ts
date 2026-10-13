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
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type StemModel = "htdemucs" | "htdemucs_ft" | "htdemucs_6s";

const MLX_BIN = bin("demucs-mlx", "DEMUCS_MLX_PATH", [join(process.cwd(), ".venv-mlx", "bin", "demucs-mlx"), "/Users/bruno/dj-app/.venv-mlx/bin/demucs-mlx"]);
const USE_MLX = process.env.STEMS_BACKEND !== "torch" && (process.env.STEMS_BACKEND === "mlx" || (process.platform === "darwin" && process.arch === "arm64")) && existsSync(MLX_BIN);

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
const DEMUCS = bin("demucs", "DEMUCS_PATH", [
  "/Users/bruno/dj-app/.venv-stems/bin/demucs",
]);

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
// yield CPU to the live app and any on-demand separation. `onProgress`, when
// given, is fed every stderr chunk so the caller can scrape a percentage out
// of it (Demucs writes a tqdm bar there — see doSeparate below).
// separations are suspended (SIGSTOP) while a deck plays; the client refreshes the request,
// and the watchdog below resumes them if it stops (tab closed)
const children = new Set<ChildProcess>();
let stopped = false;
let suspendedUntil = 0;
function signalAll(sig: NodeJS.Signals): void {
  for (const c of children) {
    try {
      if (c.pid) process.kill(c.pid, sig);
    } catch {
      // already exited
    }
  }
}
export function requestSuspend(ms = 15000): void {
  suspendedUntil = Date.now() + ms;
  if (!stopped) {
    stopped = true;
    signalAll("SIGSTOP");
  }
}
export function resumeSeparations(): void {
  suspendedUntil = 0;
  if (stopped) {
    stopped = false;
    signalAll("SIGCONT");
  }
}
setInterval(() => {
  if (stopped && Date.now() > suspendedUntil) resumeSeparations();
}, 3000).unref();

function run(cmd: string, args: string[], niceness?: number, onProgress?: (chunk: string) => void, env?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    let exe = cmd;
    let exeArgs = args;
    if (niceness && existsSync("/usr/bin/nice")) {
      exe = "/usr/bin/nice";
      exeArgs = ["-n", String(niceness), cmd, ...args];
    }
    const p = spawn(exe, exeArgs, { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, ...(env || {}) } });
    children.add(p);
    p.once("exit", () => children.delete(p));
    if (stopped && p.pid) process.kill(p.pid, "SIGSTOP");
    let err = "";
    p.stderr.on("data", (d) => {
      err += d;
      onProgress?.(d.toString());
    });
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}: ${err.slice(-400)}`))
    );
  });
}

// live progress (0..100) of any separation currently running or queued, keyed
// the same way as `inflight` below. Demucs runs its Python-side apply_model
// with `progress=True` unconditionally, which prints a tqdm bar to stderr
// ("  45%|████▌     | 112.50/250.00 [...]") — parsed out in doSeparate. With
// --shifts > 1 the bar restarts once per shift, so progress isn't perfectly
// linear across the whole job, but it's a faithful "how far along is THIS
// pass" reading, which is what a DJ waiting on a badge actually wants.
const progress = new Map<string, number>();

function progressKey(hash: string, model: StemModel, opts: StemOpts): string {
  return `${hash}:${model}:${dirSuffix(opts)}`;
}

// null = nothing running for this hash/model/opts combo right now (either
// finished, failed, or never started) — the caller falls back to isCached().
export function getProgress(hash: string, model: StemModel, opts: StemOpts = {}): number | null {
  const v = progress.get(progressKey(hash, model, opts));
  return v == null ? null : v;
}

// This box is CPU-bound (often a single core), so run at most ONE Demucs at a
// time. On-demand jobs (priority 1) are dequeued before background prefetch jobs
// (priority 0); a job already running can't be interrupted but won't be jumped. The GPU is also shared, so this lock remains necessary with MLX.
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

interface SepArgs {
  model: StemModel;
  wav: string;
  out: string;
  opts: SeparateOpts;
  shifts: number;
  niceness: number | undefined;
  pKey: string;
}

async function separateWithTorch(a: SepArgs): Promise<string> {
  const overlap = a.opts.ultra ? "0.25" : process.env.STEMS_OVERLAP || "0.1";
  const ext = stemExt(a.opts);
  const device = process.env.DEMUCS_DEVICE || "cpu";
  const args = ["-n", a.model, "-d", device, "--overlap", overlap];
  if (ext === "mp3") args.push("--mp3", "--mp3-bitrate", "256");
  if (process.env.STEMS_SEGMENT) args.push("--segment", process.env.STEMS_SEGMENT);
  const shiftsEff = a.opts.ultra ? Math.max(a.shifts, 2) : a.shifts;
  if (shiftsEff > 0) args.push("--shifts", String(Math.min(shiftsEff, 10)));
  args.push("-o", a.out, a.wav);
  // Demucs prints a tqdm bar to stderr while separating ("  45%|███ |...");
  // scrape the last percentage out of each chunk (tqdm redraws via \r, so a
  // single chunk can contain several updates — keep only the latest).
  await run(DEMUCS, args, a.niceness, (chunk) => {
    const matches = chunk.match(/(\d{1,3})%\|/g);
    if (!matches || !matches.length) return;
    const pct = parseInt(matches[matches.length - 1], 10);
    if (!isNaN(pct)) progress.set(a.pKey, Math.min(99, pct)); // 100 reserved for "done"
  });
  return join(a.out, a.model, "source");
}

async function separateWithMlx(a: SepArgs): Promise<string> {
  const mlxOut = join(a.out, "mlx");
  if (existsSync(mlxOut)) await rm(mlxOut, { recursive: true, force: true });
  const overlap = a.opts.ultra ? "0.25" : process.env.STEMS_OVERLAP || "0.1";
  const shiftsEff = String(Math.min(a.opts.ultra ? Math.max(a.shifts, 2) : a.shifts, 10));
  const args = ["-n", a.model, "--overlap", overlap, "-b", "1", "--shifts", shiftsEff, "-v", "-o", mlxOut, a.wav];
  await run(MLX_BIN, args, a.niceness, (chunk) => {
    const matches = chunk.match(/segments:\s*(\d{1,3})%\|/g);
    if (!matches || !matches.length) return;
    const pct = parseInt(matches[matches.length - 1], 10);
    if (!isNaN(pct)) progress.set(a.pKey, Math.min(99, pct)); // 100 reserved for "done"
  }, { MLX_MAX_OPS_PER_BUFFER: process.env.MLX_MAX_OPS_PER_BUFFER || "8" });

  const produced = join(mlxOut, "source");
  const ext = stemExt(a.opts);
  for (const stem of MODEL_STEMS[a.model]) {
    if (!existsSync(join(produced, `${stem}.wav`))) {
      throw new Error("mlx: stems manquants");
    }
  }

  if (ext === "mp3") {
    await Promise.all(MODEL_STEMS[a.model].map(async (stem) => {
      const wavPath = join(produced, `${stem}.wav`);
      const mp3Path = join(produced, `${stem}.mp3`);
      await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", wavPath, "-codec:a", "libmp3lame", "-b:a", "256k", mp3Path], a.niceness);
    }));
  }

  return produced;
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
  const pKey = progressKey(hash, model, opts);
  progress.set(pKey, 0); // visible immediately, even while still queued behind another job
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
    const ext = stemExt(opts);
    const sepArgs: SepArgs = {
      model,
      wav,
      out,
      opts,
      shifts,
      niceness,
      pKey,
    };

    let produced: string | null = null;
    if (USE_MLX) {
      for (let attempt = 1; attempt <= 2 && !produced; attempt++) {
        try {
          produced = await separateWithMlx(sepArgs);
        } catch (e) {
          const msg = (e as Error).message;
          // a GPU watchdog timeout repeats on retry, and torch on CPU is far slower: fail fast
          if (/GPU Timeout/.test(msg)) throw new Error("calcul trop lourd pour le GPU : essaie une qualité plus légère");
          console.warn(`[stems] MLX tentative ${attempt}/2 échouée : ${msg.slice(0, 200)}`);
        }
      }
    }

    const producedDir: string = produced ?? (await separateWithTorch(sepArgs));

    // 3. optional vocal cleanup: ffmpeg's afftdn adaptive noise-reduction filter
    //    on the vocals stem only (there's no true de-reverb filter in ffmpeg —
    //    this cuts hiss/bleed/background noise, framed honestly as that, not
    //    "reverb removal")
    if (opts.denoiseVocals && MODEL_STEMS[model].includes("vocals")) {
      const vocalsIn = join(producedDir, `vocals.${ext}`);
      const vocalsOut = join(producedDir, `vocals.dn.${ext}`);
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
      await moveFile(join(producedDir, `${s}.${ext}`), join(dir, `${s}.${ext}`));
    }
  } finally {
    releaseSlot();
    progress.delete(pKey); // done (or failed) — getProgress() falls back to isCached()
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
