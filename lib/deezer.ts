// Server-side Deezer helpers. Deezer's full catalogue is DRM-protected, so only
// the official 30-second preview MP3 is freely streamable. We use the public
// api.deezer.com search endpoint for metadata + artwork, keep the numeric track
// id, and the stream route resolves that id to its preview URL and proxies it
// same-origin (so the browser can decode the PCM for live FX / synth).
const API = "https://api.deezer.com";

export interface DeezerTrack {
  id: string; // numeric Deezer track id
  title: string;
  artist: string;
  duration: number; // preview is always ~30s
  artwork: string | null;
}

interface RawTrack {
  id?: number | string;
  title?: string;
  duration?: number;
  preview?: string;
  artist?: { name?: string };
  album?: { cover_big?: string; cover_medium?: string; cover_xl?: string };
}

export async function searchDeezer(query: string): Promise<DeezerTrack[]> {
  if (!query.trim()) return [];
  const url = `${API}/search?q=${encodeURIComponent(query)}&limit=60`;
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Deezer ${r.status}`);
  const j = (await r.json()) as { data?: RawTrack[] };
  return (j.data ?? [])
    .filter((t) => t.id != null && t.title)
    .map((t) => ({
      id: String(t.id),
      title: t.title ?? "—",
      artist: t.artist?.name ?? "Deezer",
      duration: Math.round(t.duration ?? 30),
      artwork: t.album?.cover_big ?? t.album?.cover_medium ?? t.album?.cover_xl ?? null,
    }));
}

// Resolve a track id to its 30s preview MP3 URL via the official track endpoint.
export async function deezerPreviewUrl(id: string): Promise<string | null> {
  const r = await fetch(`${API}/track/${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as RawTrack;
  return j.preview && j.preview.startsWith("http") ? j.preview : null;
}
