// Human variations of the vocal stem (double, harmonies in the voice's scale, octave, other voices, whisper, crowd),
// rendered once at preparation by scripts/vocal_layers.py from the vocal and its pitch contour, then played in sync live.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { stemPath, type StemModel, type StemOpts } from "@/lib/stems";

export const VOICE_LAYERS = ["double", "third_up", "third_down", "fifth_up", "octave_down", "girl", "man", "child", "whisper", "crowd"] as const;
export type VoiceLayer = (typeof VOICE_LAYERS)[number];

const dirOf = (hash: string, model: StemModel, opts?: StemOpts) => join(dirname(stemPath(hash, model, "vocals", opts)), "layers");

export function layersReady(hash: string, model: StemModel, opts?: StemOpts): VoiceLayer[] {
  try {
    const j = JSON.parse(readFileSync(join(dirOf(hash, model, opts), "layers.json"), "utf-8")) as { version: number; layers: VoiceLayer[] };
    return j.version === 1 ? j.layers.filter((l) => VOICE_LAYERS.includes(l)) : [];
  } catch {
    return [];
  }
}

export function layerPath(hash: string, model: StemModel, name: VoiceLayer, opts?: StemOpts): string {
  return join(dirOf(hash, model, opts), `${name}.ogg`);
}

let queue: Promise<void> = Promise.resolve();

// rendered in the background, one song at a time, once its vocal pitch exists
export function backfillVoiceLayers(hash: string, model: StemModel, opts?: StemOpts): void {
  const vocals = stemPath(hash, model, "vocals", opts);
  const pitch = join(dirname(vocals), "pitch.json");
  const python = process.env.PITCH_PYTHON || join(homedir(), ".djsynth-pitch/bin/python");
  if (!existsSync(vocals) || !existsSync(pitch) || !existsSync(python) || layersReady(hash, model, opts).length) return;
  const out = dirOf(hash, model, opts);
  queue = queue
    .then(
      () =>
        new Promise<void>((resolve) => {
          if (layersReady(hash, model, opts).length) return resolve();
          const child = spawn("nice", ["-n", "19", python, join(process.cwd(), "scripts", "vocal_layers.py"), vocals, pitch, out], { timeout: 15 * 60 * 1000, env: { ...process.env, PYTHONPATH: "" } }); // a stalled folder on PYTHONPATH freezes Python at startup
          let stdout = "";
          child.stdout.on("data", (c) => (stdout += c));
          child.on("error", () => resolve());
          child.on("close", (code) => {
            try {
              if (code === 0) writeFileSync(join(out, "layers.json"), stdout.trim().split("\n").pop() ?? "");
            } catch {
              /* not written: rendered again next time */
            }
            resolve();
          });
        })
    )
    .catch(() => undefined);
}
