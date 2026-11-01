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
