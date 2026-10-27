import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ffmpegPath, stemPath, isCached, MODEL_STEMS, type StemModel, type StemOpts } from "@/lib/stems";

export type SectionKind = "peak" | "slow" | "blank" | "normal";
export interface StemSection { start: number; end: number; kind: SectionKind; drums: number; vocals: number; level: number }
export interface StemMap { version: 1; stems?: Record<string, number[]>; hop: number; duration: number; sections: StemSection[]; energy: number[]; drums: number[]; vocals: number[]; voice?: number[]; voiceStep?: number }

const HOP = 0.5; // seconds
const MIN_SECTION = 2; // seconds
const BLANK_THRESHOLD = 0.06;
const PEAK_THRESHOLD = 0.8;
const SLOW_THRESHOLD = 0.35;
const DRUMS_THRESHOLD = 0.5;
const SMOOTH_WINDOW = 4; // 2 seconds (4 samples)

export function analyseEnvelopes(env: Record<string, number[]>, hop: number): StemMap {
    const stems = Object.keys(env);
    const length = Math.max(...stems.map(s => env[s].length), 0);
    const energy: number[] = Array(length).fill(0);
    const drums: number[] = Array(length).fill(0);
    const vocals: number[] = Array(length).fill(0);

    // Compute total energy and stem-specific energies
    for (let i = 0; i < length; i++) {
        let total = 0;
        for (const stem of stems) {
            const val = env[stem][i] || 0;
            total += val * val;
            if (stem === "drums") drums[i] = val;
            if (stem === "vocals") vocals[i] = val;
        }
        energy[i] = Math.sqrt(total);
    }

    // Normalize energy by 95th percentile
    const sortedEnergy = [...energy].sort((a, b) => a - b);
    const percentile95 = sortedEnergy[Math.floor(sortedEnergy.length * 0.95)] || 1;
    const normalizedEnergy = energy.map(e => Math.min(e / percentile95, 1));

    // Smooth energy with 2-second window
    const smoothedEnergy = normalizedEnergy.map((_, i) => {
        const start = Math.max(0, i - SMOOTH_WINDOW / 2);
        const end = Math.min(length - 1, i + SMOOTH_WINDOW / 2);
        return normalizedEnergy.slice(start, end + 1).reduce((a, b) => a + b, 0) / (end - start + 1);
    });

    // Detect sections using both raw and smoothed energy
    const sections: StemSection[] = [];
    let currentKind: SectionKind | null = null;
    let currentStart = 0;

    for (let i = 0; i < length; i++) {
        const rawE = normalizedEnergy[i];
        const smoothE = smoothedEnergy[i];
        const d = drums[i] || 0;
        const v = vocals[i] || 0;
        let kind: SectionKind;

        if (rawE < BLANK_THRESHOLD) {
            kind = "blank";
        } else if (smoothE > PEAK_THRESHOLD && d > DRUMS_THRESHOLD) {
            kind = "peak";
        } else if (smoothE < SLOW_THRESHOLD) {
            kind = "slow";
        } else {
            kind = "normal";
        }

        if (kind !== currentKind) {
            if (currentKind !== null) {
                const duration = (i - currentStart) * hop;
                if (duration >= MIN_SECTION) {
                    sections.push({
                        start: currentStart * hop,
                        end: i * hop,
                        kind: currentKind,
                        drums: drums.slice(currentStart, i).reduce((a, b) => a + b, 0) / (i - currentStart),
                        vocals: vocals.slice(currentStart, i).reduce((a, b) => a + b, 0) / (i - currentStart),
                        level: smoothedEnergy.slice(currentStart, i).reduce((a, b) => a + b, 0) / (i - currentStart)
                    });
                }
            }
            currentKind = kind;
            currentStart = i;
        }
    }

    // Add last section if valid
    if (currentKind !== null && (length - currentStart) * hop >= MIN_SECTION) {
        sections.push({
            start: currentStart * hop,
            end: length * hop,
            kind: currentKind,
            drums: drums.slice(currentStart).reduce((a, b) => a + b, 0) / (length - currentStart),
            vocals: vocals.slice(currentStart).reduce((a, b) => a + b, 0) / (length - currentStart),
            level: smoothedEnergy.slice(currentStart).reduce((a, b) => a + b, 0) / (length - currentStart)
        });
    }

    // Merge adjacent sections of same kind
    const mergedSections: StemSection[] = [];
    for (const section of sections) {
        if (mergedSections.length > 0) {
            const last = mergedSections[mergedSections.length - 1];
            if (last.kind === section.kind) {
                last.end = section.end;
                last.drums = (last.drums * (last.end - last.start) + section.drums * (section.end - section.start)) / (section.end - last.start);
                last.vocals = (last.vocals * (last.end - last.start) + section.vocals * (section.end - section.start)) / (section.end - last.start);
                last.level = (last.level * (last.end - last.start) + section.level * (section.end - section.start)) / (section.end - last.start);
                continue;
            }
        }
        mergedSections.push(section);
    }

    // Ensure sections cover entire duration
    if (mergedSections.length > 0) {
        mergedSections[0].start = 0;
        mergedSections[mergedSections.length - 1].end = length * hop;
    }

    return {
        version: 1,
        hop,
        duration: length * hop,
        sections: mergedSections,
        energy: normalizedEnergy,
        drums,
        vocals,
        stems: Object.fromEntries(stems.map((n) => { const m = Math.max(...env[n], 1e-6); return [n, env[n].map((v) => Math.round((v / m) * 100) / 100)]; })) // per-stem energy 0..1, for the cascade
    };
}

export async function analyseStems(hash: string, model: StemModel, opts?: StemOpts): Promise<StemMap | null> {
    if (!isCached(hash, model, opts)) return null;

    const mapPath = join(dirname(stemPath(hash, model, "drums", opts)), "map.json");
    try {
        const existing = await readFile(mapPath, "utf-8");
        const map = JSON.parse(existing) as StemMap;
        if (map.version === 1 && map.stems) return map;
    } catch {}

    const envelopes: Record<string, number[]> = {};
    const stems = MODEL_STEMS[model];

    for (const stem of stems) {
        const path = stemPath(hash, model, stem, opts);
        // mono, 4 kHz, 16-bit samples on stdout: nothing is written to disk
        const ffmpeg = spawn(ffmpegPath(), ["-v", "error", "-i", path, "-ac", "1", "-ar", "4000", "-f", "s16le", "-"], { stdio: ["ignore", "pipe", "ignore"] });
        const chunks: Buffer[] = [];
        ffmpeg.stdout.on("data", (d: Buffer) => chunks.push(d));
        const code = await new Promise<number | null>((resolve) => {
          ffmpeg.on("error", () => resolve(-1));
          ffmpeg.on("close", resolve);
        });
        if (code !== 0) return null;
        const pcm = Buffer.concat(chunks);
        const win = 4000 * HOP; // samples per window
        const rms: number[] = [];
        for (let i = 0; i + win <= pcm.length / 2; i += win) {
          let sum = 0;
          for (let k = 0; k < win; k++) {
            const v = pcm.readInt16LE((i + k) * 2) / 32768;
            sum += v * v;
          }
          rms.push(Math.sqrt(sum / win));
        }
        envelopes[stem] = rms;
    }

    const map = analyseEnvelopes(envelopes, HOP);
    await writeFile(mapPath, JSON.stringify(map), "utf-8");
    return map;
}

export function readStemMap(hash: string, model: StemModel, opts?: StemOpts): StemMap | null {
    try {
        const mapPath = join(dirname(stemPath(hash, model, "drums", opts)), "map.json");
        const content = readFileSync(mapPath, "utf-8");
        const map = JSON.parse(content) as StemMap;
        return map.version === 1 && map.stems ? map : null;
    } catch {
        return null;
    }
}

export function sectionAt(map: StemMap, t: number): StemSection | null {
    return map.sections.find(s => s.start <= t && s.end > t) || null;
}

export function nextSection(map: StemMap, t: number, kind: SectionKind): StemSection | null {
    return map.sections.find(s => s.kind === kind && s.start > t) || null;
}
