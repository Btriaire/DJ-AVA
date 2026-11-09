import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isCached, stemPath, type StemModel, type StemOpts } from "./stems";
import { decode } from "./fxAnalysis";
import { analyse, type DrumPrep } from "./drumPrep";

export function readDrumPrep(hash: string, model: StemModel, opts?: StemOpts): DrumPrep | null {
  try {
    const data = JSON.parse(readFileSync(join(dirname(stemPath(hash, model, "drums", opts)), "drumprep.json"), "utf8"));
    return data.version === 1 ? data : null;
  } catch {
    return null;
  }
}

export async function analyseDrums(hash: string, model: StemModel, opts?: StemOpts, bpm = 0, offset = 0): Promise<DrumPrep | null> {
  if (!isCached(hash, model, opts)) return null;
  const cache = readDrumPrep(hash, model, opts);
  if (cache && (bpm <= 0 || Math.abs(cache.bpm - bpm) <= 0.5)) return cache;
  const x = await decode(stemPath(hash, model, "drums", opts)).catch(() => null);
  if (!x) return null;
  const r = analyse(x, 44100, bpm, offset);
  if (!r) return null;
  await writeFile(join(dirname(stemPath(hash, model, "drums", opts)), "drumprep.json"), JSON.stringify(r)).catch(() => undefined);
  return r;
}
