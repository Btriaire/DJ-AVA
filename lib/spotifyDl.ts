// Server-side spotDL (https://github.com/spotDL/spotify-downloader): search Spotify's catalogue, find the
// matching audio (spotDL looks for it on YouTube / YouTube Music), and download it as a tagged MP3.
//   - search:   scripts/spotify_search.py, run with spotDL's own Python (read from the `spotdl` launcher)
//   - stream:   `spotdl url <track>` gives the matching audio page; lib/youtube.ts streams it like any other
//   - download: `spotdl download <track>` writes an MP3 with its tags and cover, sent as a file
// Needs spotdl (pip install spotdl), yt-dlp and ffmpeg on the machine; the VPS image installs them.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bin, cookiePath } from "./youtube";

export interface SpotifyTrack {
  id: string; // Spotify track id
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  artwork: string | null;
  url: string; // open.spotify.com link
}

const SPOTDL = bin("spotdl", "SPOTDL_PATH");
const FFMPEG = bin("ffmpeg", "FFMPEG_PATH");

export const isSpotifyId = (s: string | null | undefined): s is string => !!s && /^[A-Za-z0-9]{22}$/.test(s);
export const trackUrl = (id: string) => `https://open.spotify.com/track/${id}`;

// spotDL's Python: the one its launcher starts (pip, pipx and Homebrew installs each have their own)
function spotdlPython(): string {
  if (process.env.SPOTDL_PYTHON) return process.env.SPOTDL_PYTHON;
  try {
    if (existsSync(SPOTDL)) {
      const first = readFileSync(SPOTDL, "utf8").slice(0, 300).split("\n")[0];
      const m = first.match(/^#!\s*(\S+python[\d.]*)\s*$/);
      if (m && existsSync(m[1])) return m[1];
    }
  } catch {
    // not a script (a binary build): fall back to python3
  }
  return "python3";
}

function run(cmd: string, args: string[], timeoutMs: number, cwd?: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("error", (e) => {
      clearTimeout(t);
      reject(e); // ENOENT: spotdl / python is not installed here
    });
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

// the options every spotdl command gets: our ffmpeg and the YouTube cookies of the VPS (spotDL handles YouTube's challenges itself)
function commonArgs(): string[] {
  const args = ["--ffmpeg", FFMPEG, "--log-level", "ERROR"];
  const c = cookiePath();
  if (c) args.push("--cookie-file", c);
  return args;
}

export async function searchSpotify(query: string, limit = 30): Promise<SpotifyTrack[]> {
  if (!query.trim()) return [];
  const script = join(process.cwd(), "scripts", "spotify_search.py");
  const r = await run(spotdlPython(), [script, query, String(limit)], 30_000);
  const line = r.out.trim().split("\n").pop() ?? "";
  let j: { tracks?: SpotifyTrack[]; error?: string; missing?: boolean };
  try {
    j = JSON.parse(line);
  } catch {
    throw new Error(r.err.trim().split("\n").pop() || "spotDL n'a rien renvoyé");
  }
  if (j.missing) throw Object.assign(new Error(j.error), { code: "ENOENT" }); // Python is here, spotDL is not
  if (j.error) throw new Error(j.error);
  return j.tracks ?? [];
}

// the matching audio page for a Spotify track, remembered for the life of the server
const matched = new Map<string, string>();
export async function audioUrlFor(id: string): Promise<string> {
  const hit = matched.get(id);
  if (hit) return hit;
  const r = await run(SPOTDL, ["url", trackUrl(id), ...commonArgs()], 90_000);
  const url = r.out.split("\n").map((l) => l.trim()).reverse().find((l) => /^https?:\/\//.test(l));
  if (!url) throw new Error(r.err.trim().split("\n").pop() || "spotDL n'a pas trouvé l'audio de ce titre");
  matched.set(id, url);
  return url;
}

// a tagged MP3 (title, artist, album, cover) made by spotDL; the temporary folder is removed afterwards
export async function downloadMp3(id: string): Promise<{ name: string; data: Buffer }> {
  const dir = await mkdtemp(join(tmpdir(), "djsynth-spotdl-"));
  try {
    const r = await run(
      SPOTDL,
      ["download", trackUrl(id), "--format", "mp3", "--bitrate", "320k", "--output", "{artists} - {title}.{output-ext}", ...commonArgs()],
      280_000,
      dir
    );
    const mp3 = (await readdir(dir)).find((f) => f.toLowerCase().endsWith(".mp3"));
    if (!mp3) throw new Error(r.err.trim().split("\n").pop() || "spotDL n'a pas pu télécharger ce titre");
    return { name: mp3, data: await readFile(join(dir, mp3)) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// spotdl (or its Python) is not installed on this machine: the routes then ask the VPS
export const notInstalled = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT";
