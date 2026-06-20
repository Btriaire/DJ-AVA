// Server-side YouTube helpers backed by yt-dlp (+ ffmpeg). The browser can't
// pull raw PCM from YouTube's player, so to (a) route a track through Web Audio
// and (b) offer an MP3 download, we extract the audio server-side with yt-dlp
// and transcode to MP3 with ffmpeg, streaming the bytes same-origin.
import { spawn } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface YTTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  artwork: string | null;
}

// resolve a binary, preferring Homebrew/usr-local locations (PATH may be slim
// when Next is launched outside an interactive shell)
function bin(name: string, envKey: string): string {
  const fromEnv = process.env[envKey];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const p of [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`]) {
    if (existsSync(p)) return p;
  }
  return name; // fall back to PATH lookup
}

const YTDLP = bin("yt-dlp", "YT_DLP_PATH");
const FFMPEG = bin("ffmpeg", "FFMPEG_PATH");

// On a datacenter/VPS IP, YouTube bot-blocks anonymous requests ("Sign in to
// confirm you're not a bot"). Pointing yt-dlp at an exported cookies.txt makes
// it authenticate like a logged-in browser, which unblocks extraction. Set
// YT_DLP_COOKIES to the path of a Netscape cookie file (mounted on the VPS).
//
// yt-dlp rewrites the cookie jar after each run (to keep the session fresh), so
// we copy the (read-only mounted) source to a writable temp once and hand that
// to yt-dlp — the original secret file stays pristine and can't be corrupted.
let cookieFile: string | null | undefined; // undefined = not yet resolved
function cookiePath(): string | null {
  if (cookieFile === undefined) {
    const src = process.env.YT_DLP_COOKIES;
    if (src && existsSync(src)) {
      try {
        const dst = join(tmpdir(), "djsynth-yt-cookies.txt");
        copyFileSync(src, dst);
        cookieFile = dst;
      } catch {
        cookieFile = src; // fall back to the source directly
      }
    } else {
      cookieFile = null;
    }
  }
  return cookieFile;
}
function cookieArgs(): string[] {
  const f = cookiePath();
  return f ? ["--cookies", f] : [];
}

export function videoUrl(idOrUrl: string): string {
  const s = idOrUrl.trim();
  if (/^[\w-]{11}$/.test(s)) return `https://www.youtube.com/watch?v=${s}`;
  return s;
}

interface RawEntry {
  id?: string;
  title?: string;
  duration?: number;
  uploader?: string;
  channel?: string;
  thumbnail?: string;
  thumbnails?: { url: string }[];
}

// run a yt-dlp command and collect stdout
function ytdlpJson(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.slice(0, 300) || `yt-dlp exit ${code}`))));
  });
}

export interface YTSearchOpts {
  limit?: number; // how many candidates to pull from yt-dlp (clamped 1..50)
  minDur?: number; // seconds, inclusive lower bound (e.g. > 15 min → 900)
  maxDur?: number; // seconds, exclusive upper bound (0 / undefined = no cap)
}

// `--flat-playlist` keeps this fast (no per-video extraction) so we can ask for a
// much bigger pool than before. Duration bounds are applied here so the caller's
// "< 3 min" / "> 15 min" filters force a wider, more relevant set of choices.
export async function searchYouTube(q: string, opts: YTSearchOpts = {}): Promise<YTTrack[]> {
  const limit = Math.min(Math.max(Math.round(opts.limit ?? 30), 1), 50);
  const raw = await ytdlpJson([
    `ytsearch${limit}:${q}`,
    "--flat-playlist",
    "--dump-single-json",
    "--no-warnings",
    ...cookieArgs(),
  ]);
  const j = JSON.parse(raw) as { entries?: RawEntry[] };
  const min = opts.minDur && opts.minDur > 0 ? opts.minDur : 0;
  const max = opts.maxDur && opts.maxDur > 0 ? opts.maxDur : Infinity;
  return (j.entries ?? [])
    .filter((e) => {
      const d = e.duration ?? 0;
      return e.id && d > 0 && d >= min && d < max;
    })
    .map((e) => ({
      id: e.id!,
      title: e.title ?? "—",
      artist: e.uploader ?? e.channel ?? "YouTube",
      duration: Math.round(e.duration ?? 0),
      artwork: e.thumbnails?.length ? e.thumbnails[e.thumbnails.length - 1].url : e.thumbnail ?? null,
    }));
}

// best-effort track title for download filenames (fast, no yt-dlp call)
export async function getTitle(idOrUrl: string): Promise<string> {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl(idOrUrl))}&format=json`,
      { cache: "no-store", signal: AbortSignal.timeout(6000) }
    );
    if (r.ok) {
      const j = (await r.json()) as { title?: string };
      if (j.title) return j.title;
    }
  } catch {}
  return "youtube-audio";
}

// Spawn yt-dlp (bestaudio) piped into ffmpeg (mp3) and expose the result as a
// web ReadableStream. Both processes are torn down if the client cancels.
export function createMp3Stream(idOrUrl: string): ReadableStream<Uint8Array> {
  const url = videoUrl(idOrUrl);
  // --remote-components ejs:github lets yt-dlp fetch the EJS challenge-solver
  // script that deno runs to solve YouTube's signature/n challenges. Without it,
  // only storyboard (image) formats are returned and bestaudio is "unavailable".
  const dl = spawn(
    YTDLP,
    ["-f", "bestaudio", "-o", "-", "--no-warnings", "--no-playlist", "--remote-components", "ejs:github", ...cookieArgs(), url],
    { stdio: ["ignore", "pipe", "ignore"] }
  );
  const ff = spawn(
    FFMPEG,
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-f", "mp3", "-b:a", "192k", "pipe:1"],
    { stdio: ["pipe", "pipe", "ignore"] }
  );
  dl.stdout.pipe(ff.stdin);
  // swallow EPIPE if ffmpeg dies first
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
