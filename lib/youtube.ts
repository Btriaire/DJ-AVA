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
  for (const p of [
    `/Library/Frameworks/Python.framework/Versions/3.14/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
  ]) {
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

// Helper to parse human duration like '5:22' or '1:24:07' into seconds
function parseDurationSec(str?: string): number {
  if (!str) return 0;
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// Direct YouTube InnerTube search: 0 tokens, 0 external binaries, fast worldwide
export async function searchYouTubeInner(q: string, opts: YTSearchOpts = {}): Promise<YTTrack[]> {
  const url = "https://www.youtube.com/youtubei/v1/search?prettyPrint=false";
  const body = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20240410.01.00",
        hl: "fr",
        gl: "FR",
      },
    },
    query: q,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) throw new Error(`YouTube InnerTube HTTP ${res.status}`);
  const data = await res.json();
  const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const tracks: YTTrack[] = [];
  const min = opts.minDur && opts.minDur > 0 ? opts.minDur : 0;
  const max = opts.maxDur && opts.maxDur > 0 ? opts.maxDur : Infinity;
  const limit = Math.min(Math.max(Math.round(opts.limit ?? 30), 1), 50);

  for (const s of sections) {
    const items = s?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const v = item.videoRenderer;
      if (v && v.videoId) {
        const dur = parseDurationSec(v.lengthText?.simpleText);
        if (dur >= min && dur < max) {
          tracks.push({
            id: v.videoId,
            title: v.title?.runs?.[0]?.text || "—",
            artist: v.ownerText?.runs?.[0]?.text || "YouTube",
            duration: dur,
            artwork: v.thumbnail?.thumbnails?.slice(-1)[0]?.url || null,
          });
          if (tracks.length >= limit) break;
        }
      }
    }
    if (tracks.length >= limit) break;
  }
  return tracks;
}

// `--flat-playlist` keeps this fast (no per-video extraction) so we can ask for a
// much bigger pool than before. Duration bounds are applied here so the caller's
// "< 3 min" / "> 15 min" filters force a wider, more relevant set of choices.
export async function searchYouTube(q: string, opts: YTSearchOpts = {}): Promise<YTTrack[]> {
  // 1. Try fast InnerTube directly (zero dependencies, works on Vercel Edge/Serverless)
  try {
    const innerTracks = await searchYouTubeInner(q, opts);
    if (innerTracks.length > 0) return innerTracks;
  } catch (err) {
    console.warn("[youtube search] InnerTube failed, trying yt-dlp:", (err as Error).message);
  }

  // 2. Fallback to yt-dlp if installed
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
      let isClosed = false;
      ff.stdout.on("data", (chunk: Buffer) => {
        if (isClosed) return;
        try {
          controller.enqueue(new Uint8Array(chunk));
          if ((controller.desiredSize ?? 1) <= 0) ff.stdout.pause();
        } catch {
          isClosed = true;
          kill();
        }
      });
      ff.stdout.on("end", () => {
        if (isClosed) return;
        isClosed = true;
        try { controller.close(); } catch {}
      });
      ff.stdout.on("error", (e) => {
        if (isClosed) return;
        isClosed = true;
        try { controller.error(e); } catch {}
        kill();
      });
      dl.on("error", (e) => {
        if (isClosed) return;
        isClosed = true;
        try { controller.error(e); } catch {}
        kill();
      });
    },
    pull() {
      ff.stdout.resume();
    },
    cancel() {
      kill();
    },
  });
}
