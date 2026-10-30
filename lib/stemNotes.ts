import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { stemPath } from "@/lib/stems";
import type { StemModel, StemOpts } from "@/lib/stems";

export interface StemNotes {
  version: 1;
  other?: [number, number, number, number][];
  bass?: [number, number, number, number][];
  drums?: number[][]; // time, strength, class (0 kick, 1 snare, 2 hat) — class from rev 2
  rev?: number; // 2: cleaned notes (no split held notes), classified drums, tuning
  tuning?: number; // semitones from A440, -0.5..0.5
}

export const NOTES_REV = 3; // 3: drums on the real attack, notes 10 ms earlier (timing measured on the stems)

const CACHE_FILE = "notes.json";
const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

let backfillQueue: Promise<void> = Promise.resolve();

export async function analyseStemNotes(
  hash: string,
  model: StemModel,
  opts?: StemOpts,
  force = false
): Promise<StemNotes | null> {
  const vocalsPath = stemPath(hash, model, "vocals", opts);
  const cachePath = join(dirname(vocalsPath), CACHE_FILE);

  // Check cache first
  const cached = readStemNotes(hash, model, opts);
  if (cached && !force) return cached;

  // Check if Python script exists
  const python = process.env.NOTES_PYTHON || join(homedir(), ".djsynth-midi/bin/python");
  if (!existsSync(python)) return null;

  const script = join(process.cwd(), "scripts", "midi_notes.py");
  const stemsDir = dirname(stemPath(hash, model, "vocals", opts));

  try {
    const args = [script, stemsDir];

    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn("nice", ["-n", "19", python, ...args], { timeout: TIMEOUT_MS });

      let stdout = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", () => {}); // Ignore stderr

      child.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`Python script exited with code ${code}`));
      });

      child.on("error", reject);
      child.on("timeout", () => {
        child.kill();
        reject(new Error("Python script timeout"));
      });
    });

    const data: StemNotes = JSON.parse(result);
    if (data.version !== 1) return null;

    writeFileSync(cachePath, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export function readStemNotes(
  hash: string,
  model: StemModel,
  opts?: StemOpts
): StemNotes | null {
  const vocalsPath = stemPath(hash, model, "vocals", opts);
  const cachePath = join(dirname(vocalsPath), CACHE_FILE);

  if (!existsSync(cachePath)) return null;

  try {
    const data = JSON.parse(readFileSync(cachePath, "utf-8")) as StemNotes;
    return data.version === 1 ? data : null;
  } catch {
    return null;
  }
}

export async function backfillStemNotes(
  hash: string,
  model: StemModel,
  opts?: StemOpts
): Promise<void> {
  backfillQueue = backfillQueue.then(async () => {
    const cachePath = join(dirname(stemPath(hash, model, "vocals", opts)), CACHE_FILE);
    if (existsSync(cachePath)) return;

    await analyseStemNotes(hash, model, opts);
  });
}

// songs analysed with an older version are redone once, in the background, one at a time
export function upgradeStemNotes(hash: string, model: StemModel, opts?: StemOpts): void {
  const cur = readStemNotes(hash, model, opts);
  if (!cur || cur.rev === NOTES_REV) return;
  backfillQueue = backfillQueue.then(async () => { await analyseStemNotes(hash, model, opts, true); });
}
