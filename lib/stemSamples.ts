import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { stemPath, type StemModel, type StemOpts } from "@/lib/stems";

export interface PadSample { start: number; end: number; kind: "loop" | "shot"; bars: number; score: number; label: string }
export interface StemSamples { version: 1; bpm: number; offset: number; stems: Record<string, PadSample[]> }

function cacheFile(hash: string, model: StemModel, opts: StemOpts | undefined, bpm: number, offset: number): string {
  const stemsDir = dirname(stemPath(hash, model, "drums", opts));
  const bpmStr = bpm.toFixed(1);
  const offsetStr = offset.toFixed(2);
  return join(stemsDir, `samples-${bpmStr}-${offsetStr}.json`);
}

export function readStemSamples(hash: string, model: StemModel, opts: StemOpts | undefined, bpm: number, offset: number): StemSamples | null {
  const cachePath = cacheFile(hash, model, opts, bpm, offset);
  if (!existsSync(cachePath)) return null;
  try {
    const data = JSON.parse(readFileSync(cachePath, "utf8")) as StemSamples;
    return data.version === 1 ? data : null;
  } catch {
    return null;
  }
}

let queue: Promise<unknown> = Promise.resolve();

export function makeStemSamples(hash: string, model: StemModel, opts: StemOpts | undefined, bpm: number, offset: number): Promise<StemSamples | null> {
  const cachePath = cacheFile(hash, model, opts, bpm, offset);
  if (existsSync(cachePath)) return Promise.resolve(readStemSamples(hash, model, opts, bpm, offset));

  const python = process.env.PITCH_PYTHON || join(homedir(), ".djsynth-pitch/bin/python");
  if (!existsSync(python)) return Promise.resolve(null);

  const stemsDir = dirname(stemPath(hash, model, "drums", opts));
  if (!existsSync(stemsDir)) return Promise.resolve(null);

  const run = queue.then(() => new Promise<StemSamples | null>((resolve) => {
    const child = spawn("nice", ["-n", "19", python, join(process.cwd(), "scripts", "stem_samples.py"), stemsDir, String(bpm), String(offset), cachePath], {
      timeout: 5 * 60 * 1000,
      stdio: "ignore", // the script writes the cache file; its stdout copy is not read
      env: { ...process.env, PYTHONPATH: "" }
    });

    child.on("close", () => {
      resolve(readStemSamples(hash, model, opts, bpm, offset));
    });

    child.on("error", () => {
      resolve(null);
    });
  }));
  queue = run.catch(() => null);
  return run;
}

// PART 1
export interface DeepSamples { version: 2; deep: true; bpm: number; bars: number[]; stems: Record<string, PadSample[]> }

function deepFile(hash: string, model: StemModel, opts: StemOpts | undefined): string {
  return join(dirname(stemPath(hash, model, "drums", opts)), "samples-deep.json");
}

export function readDeepSamples(hash: string, model: StemModel, opts: StemOpts | undefined): DeepSamples | null {
  try {
    const file = deepFile(hash, model, opts);
    if (!existsSync(file)) return null;
    const data = readFileSync(file, "utf8");
    const samples = JSON.parse(data) as DeepSamples;
    return samples.version === 2 && samples.deep ? samples : null;
  } catch {
    return null;
  }
}

// urgent: one title asked from Préparation runs at once, beside the batch (it does not wait in the queue)
export function makeDeepSamples(hash: string, model: StemModel, opts: StemOpts | undefined, bpm?: number, urgent = false): Promise<DeepSamples | null> {
  const cached = readDeepSamples(hash, model, opts);
  if (cached) return Promise.resolve(cached);

  const python = process.env.PITCH_PYTHON || join(homedir(), ".djsynth-pitch/bin/python");
  if (!existsSync(python) || !existsSync(stemPath(hash, model, "drums", opts))) return Promise.resolve(null);

  const job = (urgent ? Promise.resolve() : queue).then(() => new Promise<DeepSamples | null>((resolve) => { // a batch job waits for the jobs before it
    const stemsDir = dirname(stemPath(hash, model, "drums", opts));
    const args = [stemsDir, deepFile(hash, model, opts)];
    if (bpm && bpm > 40) args.push(String(bpm));

    const child = spawn("nice", ["-n", "19", python, join(process.cwd(), "scripts", "stem_samples_deep.py"), ...args], {
      timeout: 10 * 60 * 1000,
      stdio: "ignore",
      env: { ...process.env, PYTHONPATH: "" }
    });

    child.on("close", () => resolve(readDeepSamples(hash, model, opts)));
    child.on("error", () => resolve(null));
  }));

  if (!urgent) queue = job.catch(() => null);
  return job;
}

// the in-depth analysis made by itself once a song's stems are on disk (the map route calls this for every prepared song)
export function backfillDeepSamples(hash: string, model: StemModel, opts?: StemOpts): void {
  if (readDeepSamples(hash, model, opts)) return;
  void makeDeepSamples(hash, model, opts).catch(() => null);
}
