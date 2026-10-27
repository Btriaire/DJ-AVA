import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { stemPath } from "@/lib/stems";
import type { StemModel, StemOpts } from "@/lib/stems";

export interface KeyInfo {
  tonic: string;
  mode: "maj" | "min";
  score: number;
}

export interface VocalPitch {
  version: 1;
  hop: number;
  voicedRatio: number;
  voiceKey?: KeyInfo;
  songKey?: KeyInfo;
  contour: number[];
}

const CACHE_FILE = "pitch.json";
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function analyseVocalPitch(
  hash: string,
  model: StemModel,
  opts?: StemOpts
): Promise<VocalPitch | null> {
  const vocalsPath = stemPath(hash, model, "vocals", opts);
  const cachePath = join(dirname(vocalsPath), CACHE_FILE);

  // Check cache first
  const cached = readVocalPitch(hash, model, opts);
  if (cached) return cached;

  // Check if Python script exists
  const python = process.env.PITCH_PYTHON || join(homedir(), ".djsynth-pitch/bin/python");
  if (!existsSync(python)) return null;

  const script = join(process.cwd(), "scripts", "pitch_vocals.py");
  const otherPath = stemPath(hash, model, "other", opts);

  try {
    const args = [script, vocalsPath];
    if (otherPath) args.push(otherPath);

    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(python, args, { timeout: TIMEOUT_MS });

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

    const data: VocalPitch = JSON.parse(result);
    if (data.version !== 1) return null;

    writeFileSync(cachePath, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export function readVocalPitch(
  hash: string,
  model: StemModel,
  opts?: StemOpts
): VocalPitch | null {
  const vocalsPath = stemPath(hash, model, "vocals", opts);
  const cachePath = join(dirname(vocalsPath), CACHE_FILE);

  if (!existsSync(cachePath)) return null;

  try {
    const data = JSON.parse(readFileSync(cachePath, "utf-8")) as VocalPitch;
    return data.version === 1 ? data : null;
  } catch {
    return null;
  }
}

const CAMEROT_MAP: Record<string, string> = {
  "C maj": "8B",
  "C# maj": "3B",
  "D maj": "10B",
  "D# maj": "5B",
  "E maj": "12B",
  "F maj": "7B",
  "F# maj": "2B",
  "G maj": "9B",
  "G# maj": "4B",
  "A maj": "11B",
  "A# maj": "6B",
  "B maj": "1B",
  "C min": "5A",
  "C# min": "12A",
  "D min": "7A",
  "D# min": "2A",
  "E min": "9A",
  "F min": "4A",
  "F# min": "11A",
  "G min": "6A",
  "G# min": "1A",
  "A min": "8A",
  "A# min": "3A",
  "B min": "10A",
};

export function camelot(k: KeyInfo): string {
  const keyStr = `${k.tonic} ${k.mode}`;
  return CAMEROT_MAP[keyStr] || "1B"; // Default to C maj if not found
}

export function keyDistance(a: KeyInfo, b: KeyInfo): number {
  const aCamelot = camelot(a);
  const bCamelot = camelot(b);

  if (aCamelot === bCamelot) return 0;

  const aNum = parseInt(aCamelot.slice(0, -1));
  const bNum = parseInt(bCamelot.slice(0, -1));
  const aMode = aCamelot.slice(-1);
  const bMode = bCamelot.slice(-1);

  const numDiff = Math.min(Math.abs(aNum - bNum), 12 - Math.abs(aNum - bNum));
  const modeDiff = aMode !== bMode ? 1 : 0;

  return Math.min(numDiff + modeDiff, 6);
}
