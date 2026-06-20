// Server-side Audius helpers. Audius is decentralized: we first ask the
// registry for a discovery node, then hit its v1 API. All requests go through
// our own API routes so the browser only ever talks same-origin (no CORS).
const APP = "DJSynth";

let cachedHost: string | null = null;
let hostTs = 0;

export async function getDiscoveryHost(): Promise<string> {
  if (cachedHost && Date.now() - hostTs < 3_600_000) return cachedHost;
  const r = await fetch("https://api.audius.co", { cache: "no-store" });
  const j = (await r.json()) as { data: string[] };
  const hosts = j.data?.filter(Boolean) ?? [];
  if (!hosts.length) throw new Error("Aucun nœud Audius disponible");
  cachedHost = hosts[Math.floor(Math.random() * hosts.length)];
  hostTs = Date.now();
  return cachedHost;
}

export function appName() {
  return APP;
}

export interface AudiusTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  artwork: string | null;
  genre?: string;
  bpm?: number | null;
  source?: "audius" | "youtube" | "soundcloud" | "deezer"; // which catalog the result came from
}

interface RawTrack {
  id: string;
  title: string;
  duration: number;
  genre?: string;
  bpm?: number | null;
  is_streamable?: boolean;
  user?: { name?: string };
  artwork?: { "150x150"?: string };
}

export function normalizeTrack(t: RawTrack): AudiusTrack {
  return {
    id: t.id,
    title: t.title,
    artist: t.user?.name ?? "Inconnu",
    duration: t.duration,
    artwork: t.artwork?.["150x150"] ?? null,
    genre: t.genre,
    bpm: t.bpm ?? null,
    source: "audius",
  };
}

// --- crate-digging helpers (server-side) used by the AI auto-playlist ---

function pickData(j: unknown): RawTrack[] {
  const d = (j as { data?: unknown[] })?.data;
  return Array.isArray(d) ? (d as RawTrack[]) : [];
}

// free-text track search
export async function audiusSearch(query: string): Promise<AudiusTrack[]> {
  if (!query.trim()) return [];
  try {
    const host = await getDiscoveryHost();
    const url = `${host}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${appName()}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    return pickData(await r.json()).map(normalizeTrack).filter((t) => t.title);
  } catch {
    return [];
  }
}

// most popular tracks (optionally within a genre) — a strong "same style" pool
export async function audiusTrending(genre?: string): Promise<AudiusTrack[]> {
  try {
    const host = await getDiscoveryHost();
    const g = genre ? `&genre=${encodeURIComponent(genre)}` : "";
    const url = `${host}/v1/tracks/trending?time=month${g}&app_name=${appName()}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    return pickData(await r.json()).map(normalizeTrack).filter((t) => t.title);
  } catch {
    return [];
  }
}

// Audius' own "related tracks" recommendation for a given track (best-effort —
// the full-node endpoint may be unavailable on some discovery hosts)
export async function audiusRelated(id: string): Promise<AudiusTrack[]> {
  try {
    const host = await getDiscoveryHost();
    const url = `${host}/v1/full/tracks/${id}/related?limit=20&app_name=${appName()}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    return pickData(await r.json()).map(normalizeTrack).filter((t) => t.title);
  } catch {
    return [];
  }
}

// full metadata for one track (used to enrich a seed with genre / bpm)
export async function audiusGetTrack(id: string): Promise<AudiusTrack | null> {
  try {
    const host = await getDiscoveryHost();
    const url = `${host}/v1/tracks/${id}?app_name=${appName()}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: RawTrack };
    return j.data ? normalizeTrack(j.data) : null;
  } catch {
    return null;
  }
}
