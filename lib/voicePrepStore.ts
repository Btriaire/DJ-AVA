import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isCached, stemPath, type StemModel, type StemOpts } from "./stems";
import { decode } from "./fxAnalysis";
import { summarizeVoice, type VoicePrep } from "./voicePrep";

export function readVoicePrep(hash: string, model: StemModel, opts?: StemOpts): VoicePrep | null {
  try {
    const data = JSON.parse(readFileSync(join(dirname(stemPath(hash, model, "vocals", opts)), "voiceprep.json"), "utf8"));
    return data.version === 3 ? data : null;
  } catch {
    return null;
  }
}

export async function analyseVoice(hash: string, model: StemModel, opts?: StemOpts): Promise<VoicePrep | null> {
  if (!isCached(hash, model, opts)) return null;
  const cache = readVoicePrep(hash, model, opts);
  if (cache) return cache;
  const x = await decode(stemPath(hash, model, "vocals", opts)).catch(() => null);
  if (!x) return null;
  const r = summarizeVoice(x, 44100);
  if (!r) return null;
  await writeFile(join(dirname(stemPath(hash, model, "vocals", opts)), "voiceprep.json"), JSON.stringify(r)).catch(() => undefined);
  return r;
}
