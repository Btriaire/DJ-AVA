// "One click": a set of `count` songs of the library that chain well, saved as a playlist (MaRuche/Falken)
import { loadLibrary, saveLibrary, uid, type LibTrack, type Playlist } from "@/lib/library";
import { pickNext, type Cue } from "@/lib/setPicker";
import { planMix, DEFAULT_DJ } from "@/lib/mixPlan";

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function toCue(t: LibTrack): Cue {
  return { id: t.id, bpm: t.bpm ?? 0, camelot: t.camelot ?? "" };
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

export function pickOneClick(tracks: LibTrack[], count: number, rand: () => number = Math.random): string[] {
  const clamped = Math.max(2, Math.min(100, count));
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  const result: string[] = [];
  const played = new Set<string>();

  // Deduplicate tracks by normalized name
  const unique = tracks.filter(t => {
    const n = normalizeName(t.name);
    if (seenNames.has(n)) return false;
    seenNames.add(n);
    return true;
  });

  // Build pool from unique tracks with valid BPM and duration
  const pool = unique.filter(t => (t.bpm ?? 0) > 0 && (t.durationSec === undefined || (t.durationSec >= 90 && t.durationSec <= 900)));
  const use = pool.length >= clamped ? pool : unique;

  if (use.length === 0) return [];

  // Create a map for faster lookups by ID
  const trackMap = new Map<string, LibTrack>();
  use.forEach(t => trackMap.set(t.id, t));

  const cues = use.map(toCue);
  const startIdx = Math.floor(rand() * use.length);
  let cur = toCue(use[startIdx]);
  result.push(cur.id);
  played.add(cur.id);
  seenIds.add(cur.id);

  while (result.length < clamped) {
    const candidates = cues.filter(c => !played.has(c.id) && !seenIds.has(c.id));
    if (candidates.length === 0) break;

    // Filter candidates by group rule
    const curTrack = trackMap.get(cur.id);
    const byGroup = candidates.filter(c => {
      if (!curTrack?.group) return true; // Current track has no group, accept all
      const candidateTrack = trackMap.get(c.id);
      return !candidateTrack?.group || candidateTrack.group !== curTrack.group;
    });

    const next = pickNext(cur, byGroup.length > 0 ? byGroup : candidates, played);
    if (!next) break;

    cur = next;
    result.push(cur.id);
    played.add(cur.id);
    seenIds.add(cur.id);
  }

  return result;
}

export function saveOneClick(ids: string[], now: Date = new Date()): string | null {
  if (ids.length < 2) return null;
  const lib = loadLibrary();
  const tracksInOrder = ids.map(id => lib.tracks.find(t => t.id === id)).filter(Boolean) as LibTrack[];
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  let name = `One click · ${ids.length} titres · ${hh}h${mm}`;
  let suffix = 1;
  while (lib.playlists.some(p => p.name === name)) {
    suffix++;
    name = `One click · ${ids.length} titres · ${hh}h${mm} (${suffix})`;
  }
  const playlist: Playlist = {
    id: uid(),
    name,
    trackIds: ids,
    transitionSec: 8,
    transitionType: "smooth",
    preloadSec: 15,
    mixPlan: planMix(tracksInOrder, "flow", DEFAULT_DJ),
    dj: DEFAULT_DJ,
  };
  lib.playlists.push(playlist);
  saveLibrary(lib);
  return playlist.id;
}

export function selfTest(): void {
  const fake: LibTrack[] = [
    { id: "1", name: "Song", bpm: 120, camelot: "8A", durationSec: 180, addedAt: 0, source: "local", deck: null },
    { id: "2", name: "Song (Official Video)", bpm: 122, camelot: "8A", durationSec: 200, addedAt: 1, source: "local", deck: null },
    { id: "3", name: "Track", bpm: 124, camelot: "9A", durationSec: 190, addedAt: 2, source: "local", deck: null },
    { id: "4", name: "Another", bpm: 126, camelot: "10A", durationSec: 210, addedAt: 3, source: "local", deck: null },
    { id: "5", name: "Melody", bpm: 128, camelot: "11A", durationSec: 220, addedAt: 4, source: "local", deck: null },
    { id: "6", name: "Beat", bpm: 130, camelot: "12A", durationSec: 230, addedAt: 5, source: "local", deck: null },
  ];
  const res4 = pickOneClick(fake, 4, () => 0);
  assert(res4.length === 4, "count 4 returns 4");
  assert(new Set(res4).size === 4, "4 distinct ids");
  assert(!res4.includes("1") || !res4.includes("2"), "no name duplicates");
  const res10 = pickOneClick(fake, 10, () => 0);
  assert(res10.length === 5, "count > pool returns pool size");
  const resDet = pickOneClick(fake, 4, () => 0);
  assert(JSON.stringify(resDet) === JSON.stringify(res4), "deterministic with fixed rand");
}
