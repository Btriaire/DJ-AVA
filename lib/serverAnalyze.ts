import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { downloadAudioClip } from "@/lib/youtube";

// Server-side tempo / key analysis (ffmpeg + scripts/analyze_audio.py), shared by the upload route and the radio.

export async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-ac', '1', '-ar', '22050', outputPath];

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, args);
    ffmpeg.on('close', (code) => code === 0 ? resolve(undefined) : reject(new Error(`FFmpeg failed with code ${code}`)));
  });
}

export async function analyzeAudio(wavPath: string): Promise<Record<string, unknown>> {
  const pythonPath = process.env.PYTHON3_PATH || join(process.cwd(), '.venv-stems', 'bin', 'python');
  const scriptPath = join(process.cwd(), 'scripts', 'analyze_audio.py');

  return new Promise((resolve, reject) => {
    const python = spawn(pythonPath, [scriptPath, wavPath], { timeout: 240_000 });
    let output = '';

    python.stdout.on('data', (data) => { output += data.toString(); });
    python.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Python script failed with code ${code}`));

      const lines = output.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      try {
        resolve(lastLine.startsWith('{') ? JSON.parse(lastLine) : { error: 'Invalid output format' });
      } catch {
        reject(new Error('Failed to parse JSON output'));
      }
    });
  });
}

export interface ClipAnalysis {
  bpm: number;
  bpmConfidence: number;
  camelot: string;
  keyName: string;
}

// tempo and key of a YouTube video from a 90 s excerpt of the middle of the song; cached by video id
export async function analyzeYoutubeClip(id: string, durationSec: number): Promise<ClipAnalysis | null> {
  const cacheDir = join(process.cwd(), ".analysis-cache");
  const cachePath = join(cacheDir, `yt-${id}.json`);
  await mkdir(cacheDir, { recursive: true });
  const cached = await readFile(cachePath, "utf-8").catch(() => null);
  if (cached) return JSON.parse(cached) as ClipAnalysis;

  const dir = await mkdtemp(join(tmpdir(), "radio-"));
  try {
    const start = durationSec > 150 ? Math.min(45, Math.max(0, durationSec / 2 - 45)) : 0;
    const clip = await downloadAudioClip(id, dir, start, 90);
    if (!clip) return null;
    const wav = join(dir, "clip.wav");
    await convertToWav(clip, wav);
    const raw = (await analyzeAudio(wav)) as { bpm?: number; bpmConfidence?: number; key?: { camelot?: string; name?: string }; error?: string };
    if (!raw || raw.error || !raw.bpm) return null;
    const out: ClipAnalysis = { bpm: raw.bpm, bpmConfidence: raw.bpmConfidence ?? 0, camelot: raw.key?.camelot ?? "", keyName: raw.key?.name ?? "" };
    await writeFile(cachePath, JSON.stringify(out));
    return out;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
