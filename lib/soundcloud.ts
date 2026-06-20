// Server-side SoundCloud helpers backed by yt-dlp (+ ffmpeg), mirroring the
// YouTube pipeline. SoundCloud's HLS streams can't be decoded directly in the
// browser, so we search with yt-dlp's `scsearch` and transcode the chosen
// track to MP3 server-side, streaming the bytes same-origin (no CORS, decodable
// PCM for live FX / synth). Full tracks stream when public; private/go+ tracks
// may be unavailable.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export interface SCTrack {
  id: string; // SoundCloud permalink URL — used directly as the stream id
  title: string;
  artist: string;
  duration: number;
  artwork: string | null;
}

function bin(name: string, envKey: string): string {
  const fromEnv = process.env[envKey];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const p of [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`]) {
    if (existsSync(p)) return p;
  }
  return name;
}

const YTDLP = bin("yt-dlp", "YT_DLP_PATH");
const FFMPEG = bin("ffmpeg", "FFMPEG_PATH");

interface RawEntry {
  id?: string | number;
  url?: string;
  webpage_url?: string;
  permalink_url?: string;
  title?: string;
  duration?: number;
  uploader?: string;
  channel?: string;
  thumbnail?: string;
  thumbnails?: { url: string }[];
}

function ytdlpJson(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err.slice(0, 300) || `yt-dlp exit ${code}`))
    );
  });
}

export interface SCSearchOpts {
  limit?: number; // candidates to pull (clamped 1..50)
  minDur?: number; // seconds, inclusive lower bound
  maxDur?: number; // seconds, exclusive upper bound (0/undefined = no cap)
}

// `scsearch{N}:query` with `--flat-playlist` keeps this fast (no per-track
// extraction). The entry `url` is the SoundCloud permalink, which we keep as the
// id so the stream route can hand it straight to yt-dlp.
export async function searchSoundCloud(q: string, opts: SCSearchOpts = {}): Promise<SCTrack[]> {
  const limit = Math.min(Math.max(Math.round(opts.limit ?? 30), 1), 50);
  const raw = await ytdlpJson([
    `scsearch${limit}:${q}`,
    "--flat-playlist",
    "--dump-single-json",
    "--no-warnings",
  ]);
  const j = JSON.parse(raw) as { entries?: RawEntry[] };
  const min = opts.minDur && opts.minDur > 0 ? opts.minDur : 0;
  const max = opts.maxDur && opts.maxDur > 0 ? opts.maxDur : Infinity;
  return (j.entries ?? [])
    .map((e) => {
      const link = e.url ?? e.permalink_url ?? e.webpage_url ?? "";
      const d = e.duration ?? 0;
      return { e, link, d };
    })
    .filter(({ link, d }) => link.startsWith("http") && d >= min && d < max)
    .map(({ e, link, d }) => ({
      id: link,
      title: e.title ?? "—",
      artist: e.uploader ?? e.channel ?? "SoundCloud",
      duration: Math.round(d),
      artwork: e.thumbnails?.length
        ? e.thumbnails[e.thumbnails.length - 1].url
        : e.thumbnail ?? null,
    }));
}

// Spawn yt-dlp (bestaudio) piped into ffmpeg (mp3) and expose the result as a
// web ReadableStream. Identical pipeline to the YouTube one; yt-dlp resolves a
// SoundCloud permalink URL natively.
export function createScMp3Stream(url: string): ReadableStream<Uint8Array> {
  const dl = spawn(YTDLP, ["-f", "bestaudio", "-o", "-", "--no-warnings", "--no-playlist", url], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  const ff = spawn(
    FFMPEG,
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-f", "mp3", "-b:a", "192k", "pipe:1"],
    { stdio: ["pipe", "pipe", "ignore"] }
  );
  dl.stdout.pipe(ff.stdin);
  dl.stdout.on("error", () => {});
  ff.stdin.on("error", () => {});

  const kill = () => {
    try { dl.kill("SIGKILL"); } catch {}
    try { ff.kill("SIGKILL"); } catch {}
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      ff.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
        if ((controller.desiredSize ?? 1) <= 0) ff.stdout.pause();
      });
      ff.stdout.on("end", () => { try { controller.close(); } catch {} });
      ff.stdout.on("error", (e) => { try { controller.error(e); } catch {} kill(); });
      dl.on("error", (e) => { try { controller.error(e); } catch {} kill(); });
    },
    pull() {
      ff.stdout.resume();
    },
    cancel() {
      kill();
    },
  });
}
