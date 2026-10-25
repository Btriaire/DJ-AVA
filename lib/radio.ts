import { loadLibrary, saveLibrary, uid, type LibTrack, type Playlist } from "@/lib/library";
import { analyzeLibraryTrack } from "@/lib/analyzeTrack";
import { ARC_LABEL, computeOrder } from "@/lib/setWizard";
import type { SetArc } from "@/lib/setBuilder";

// Radio-AVA: from favourite artists to ready-to-play sets.
//   1. search each artist on YouTube and keep the real songs (no live, mix, cover...)
//   2. add them to the library and analyse tempo + key
//   3. compose sets (one mix of every artist, optionally one set per artist) that chain well
// The pipeline lives at module level, like the stem preparation: it keeps running when the view is left.

export interface RadioArtist {
  id: string;
  name: string;
  love: 1 | 2 | 3; // 1 = a few songs, 3 = many
}

export interface RadioPrefs {
  artists: RadioArtist[];
  perArtist: 3 | 5 | 8; // songs per artist, multiplied by the love
  arc: SetArc;
  durationMin: number; // 0 = every analysed song
  soloSets: boolean; // one extra set per artist
}

export const DEFAULT_PREFS: RadioPrefs = { artists: [], perArtist: 5, arc: "peak", durationMin: 60, soloSets: false };

const LS_KEY = "djsynth.radio.v1";

export function loadPrefs(): RadioPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<RadioPrefs>;
    return {
      artists: Array.isArray(p.artists) ? p.artists.filter((a) => a && typeof a.name === "string" && a.name.trim()).slice(0, 24) : [],
      perArtist: p.perArtist === 3 || p.perArtist === 8 ? p.perArtist : 5,
      arc: p.arc && ["flow", "rise", "fall", "peak", "wave"].includes(p.arc) ? p.arc : "peak",
      durationMin: typeof p.durationMin === "number" ? p.durationMin : 60,
      soloSets: !!p.soloSets,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: RadioPrefs): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    // storage blocked: the choices only last for this session
  }
}

// ---- pure helpers (checked by scripts/check-radio.ts) ----------------------------------------

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const normArtist = (s: string) => strip(s).replace(/[^a-z0-9]+/g, " ").trim();

// "Artist - Title" is the usual YouTube naming: the part before the dash is the artist
export function artistOfName(name: string): string | null {
  const m = /^(.{2,40}?)\s[-–—]\s\S/.exec(name.trim());
  if (!m) return null;
  const a = m[1].replace(/\s+/g, " ").trim();
  return /[a-z]/i.test(a) ? a : null;
}

// artists found in the library names, most frequent first, minus the ones already chosen
export function suggestArtists(tracks: { name: string }[], chosen: string[], max = 8): { name: string; count: number }[] {
  const have = new Set(chosen.map(normArtist));
  const counts = new Map<string, { name: string; count: number }>();
  for (const t of tracks) {
    const a = artistOfName(t.name);
    if (!a) continue;
    const k = normArtist(a);
    if (!k || have.has(k)) continue;
    const cur = counts.get(k);
    if (cur) cur.count++;
    else counts.set(k, { name: a, count: 1 });
  }
  return [...counts.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)).slice(0, max);
}

const BAD_TITLE =
  /\b(live|en concert|concert|cover|karaoke|reaction|r[ée]action|compilation|best of|greatest hits|megamix|dj mix|mixtape|non-?stop|medley|full album|album complet|tutorial|interview|nightcore|slowed|sped up|8d audio|1 hour|10 hours|trailer|teaser|making of|parodie|parody|lesson)\b/i;

export interface YtResult {
  id: string;
  title: string;
  artist: string; // uploader
  duration: number; // seconds
  artwork: string | null;
}

// the title of a song with the noise removed, to spot the same song uploaded twice
export function normTitle(title: string, artist: string): string {
  let s = strip(title).replace(/\(.*?\)|\[.*?\]/g, " ");
  const a = normArtist(artist);
  if (a) s = s.replace(new RegExp(a.split(" ").join("[^a-z0-9]*"), "g"), " ");
  return s
    .replace(/\b(official|audio|video|videoclip|clip|lyrics?|paroles|hd|hq|4k|remastered|remaster|music|musique|feat|ft)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isRelevant(r: YtResult, artist: string): boolean {
  const a = normArtist(artist);
  if (!a) return false;
  return normArtist(r.title).includes(a) || normArtist(r.artist).includes(a);
}

// the songs worth keeping among the search results of one artist
export function pickCandidates(results: YtResult[], artist: string, count: number, skipKeys: ReadonlySet<string> = new Set()): YtResult[] {
  const seen = new Set<string>();
  const scored: { r: YtResult; score: number; rank: number }[] = [];
  results.forEach((r, rank) => {
    if (!r.id || skipKeys.has(r.id) || BAD_TITLE.test(r.title)) return;
    if (r.duration < 130 || r.duration > 480) return;
    if (!isRelevant(r, artist)) return;
    const key = normTitle(r.title, artist);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const a = normArtist(artist);
    const score = (normArtist(r.title).includes(a) ? 2 : 0) + (normArtist(r.artist).includes(a) || /topic|vevo|official/i.test(r.artist) ? 1 : 0) + (/official audio|audio officiel/i.test(r.title) ? 1 : 0);
    scored.push({ r, score, rank });
  });
  return scored
    .sort((x, y) => y.score - x.score || x.rank - y.rank)
    .slice(0, count)
    .map((s) => s.r);
}

export const wantedCount = (a: RadioArtist, perArtist: number) => a.love * perArtist;

export interface RadioShow {
  key: string;
  name: string;
  arc: SetArc;
  artist?: string; // set when the show is about one artist
  trackIds: string[]; // library ids
}

// Groups of songs whose tempos stay within `spread` of each other (largest first): a set drawn from one group never
// needs a big tempo jump, whatever the shape asked for. Songs left over may form a second group.
export function tempoGroups(tracks: LibTrack[], spread = 1.15, minTracks = 5, maxGroups = 2): LibTrack[][] {
  let rest = tracks.filter((t) => (t.bpm ?? 0) > 0).sort((a, b) => (a.bpm ?? 0) - (b.bpm ?? 0));
  const groups: LibTrack[][] = [];
  while (groups.length < maxGroups && rest.length >= minTracks) {
    let best: LibTrack[] = [];
    let lo = 0;
    for (let i = 0; i < rest.length; i++) {
      while ((rest[i].bpm ?? 0) > (rest[lo].bpm ?? 0) * spread) lo++;
      if (i - lo + 1 > best.length) best = rest.slice(lo, i + 1);
    }
    if (best.length < minTracks) break;
    groups.push(best);
    const used = new Set(best.map((t) => t.id));
    rest = rest.filter((t) => !used.has(t.id));
  }
  return groups;
}

const bpmSpan = (ts: LibTrack[]) => {
  const b = ts.map((t) => t.bpm ?? 0).filter((x) => x > 0);
  return `${Math.round(Math.min(...b))}–${Math.round(Math.max(...b))} BPM`;
};

// the sets to propose from the analysed songs: mixes of everybody, each inside one tempo zone
// (a second one when enough songs are left), plus one set per artist if asked
export function composeShows(tracks: LibTrack[], prefs: RadioPrefs, seed: number): RadioShow[] {
  const ready = tracks.filter((t) => (t.bpm ?? 0) > 0);
  const shows: RadioShow[] = [];
  if (ready.length >= 2) {
    const groups = tempoGroups(ready);
    (groups.length ? groups : [ready]).forEach((g, i) => {
      shows.push({ key: i === 0 ? "mix" : `mix-${i + 1}`, name: `Radio-AVA · ${ARC_LABEL[prefs.arc]} · ${bpmSpan(g)}`, arc: prefs.arc, trackIds: computeOrder(g, prefs.arc, prefs.durationMin, "", seed || null) });
    });
  }
  if (prefs.soloSets) {
    for (const a of prefs.artists) {
      const mine = ready.filter((t) => t.group && normArtist(t.group) === normArtist(a.name));
      if (mine.length >= 3) shows.push({ key: `solo-${a.id}`, name: `Radio-AVA · ${a.name}`, arc: "flow", artist: a.name, trackIds: computeOrder(mine, "flow", 0, "", seed || null) });
    }
  }
  return shows;
}

// ---- the pipeline (module state, observable) ------------------------------------------------

export interface RadioItem {
  key: string; // YouTube id
  artist: string;
  title: string;
  durationSec: number;
  art?: string;
  trackId: string; // library id
  status: "found" | "analyzing" | "ready" | "failed";
  bpm?: number;
  camelot?: string;
}

export interface RadioArtistState {
  id: string;
  name: string;
  status: "wait" | "search" | "done" | "empty" | "error";
  wanted: number;
  found: number;
}

export interface RadioState {
  phase: "idle" | "search" | "analyze" | "done" | "cancelled";
  artists: RadioArtistState[];
  items: RadioItem[];
  shows: RadioShow[];
  prefs: RadioPrefs | null;
  seed: number;
  savedShows: Record<string, string>; // show key -> saved playlist id
}

const EMPTY: RadioState = { phase: "idle", artists: [], items: [], shows: [], prefs: null, seed: 0, savedShows: {} };
let state: RadioState = EMPTY;
let runId = 0;
const listeners = new Set<() => void>();

function emit(next: Partial<RadioState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
export const getRadioState = () => state;
export const subscribeRadio = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const radioBusy = () => state.phase === "search" || state.phase === "analyze";

async function searchArtist(name: string, wanted: number, skip: ReadonlySet<string>): Promise<YtResult[]> {
  const queries = [`${name} official audio`, `${name} topic`];
  let picked: YtResult[] = [];
  const all: YtResult[] = [];
  for (const q of queries) {
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&n=40&min=130&max=480`);
      if (!res.ok) continue;
      const data = (await res.json()) as { tracks?: YtResult[] };
      all.push(...(data.tracks ?? []));
      picked = pickCandidates(all, name, wanted + 2, skip);
      if (picked.length >= wanted + 2) break;
    } catch {
      // one failed query: the next one (or the next artist) goes on
    }
  }
  return picked;
}

// the library as the pipeline sees it: songs already there (same YouTube id) are reused, not duplicated
function ensureTracks(found: { artist: string; r: YtResult }[]): Map<string, LibTrack> {
  const lib = loadLibrary();
  const out = new Map<string, LibTrack>();
  const fresh: LibTrack[] = [];
  for (const { artist, r } of found) {
    const had = lib.tracks.find((t) => t.source === "youtube" && t.url === r.id);
    if (had) {
      out.set(r.id, had);
      continue;
    }
    const t: LibTrack = { id: uid(), name: r.title, source: "youtube", url: r.id, deck: null, art: r.artwork ?? undefined, durationSec: r.duration, later: true, theme: "Radio-AVA", group: artist, addedAt: Date.now() };
    fresh.push(t);
    out.set(r.id, t);
  }
  if (fresh.length) saveLibrary({ ...lib, tracks: [...lib.tracks, ...fresh] });
  return out;
}

function patchTrack(id: string, patch: Partial<LibTrack>) {
  const lib = loadLibrary();
  saveLibrary({ ...lib, tracks: lib.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
}

export function composeNow(seed: number) {
  const lib = loadLibrary();
  const byId = new Map(lib.tracks.map((t) => [t.id, t]));
  const ids = state.items.filter((i) => i.status === "ready").map((i) => i.trackId);
  const tracks = ids.map((id) => byId.get(id)).filter((t): t is LibTrack => !!t);
  emit({ shows: state.prefs ? composeShows(tracks, state.prefs, seed) : [], seed, savedShows: {} });
}

export function recomposeRadio() {
  if (state.phase === "done") composeNow(state.seed + 1);
}

export function cancelRadio() {
  if (!radioBusy()) return;
  runId++;
  emit({ phase: "cancelled" });
  composeNow(state.seed);
}

export function resetRadio() {
  if (radioBusy()) return;
  emit(EMPTY);
}

export async function startRadio(prefs: RadioPrefs): Promise<void> {
  if (radioBusy() || prefs.artists.length === 0) return;
  const run = ++runId;
  const alive = () => run === runId;
  emit({
    phase: "search",
    prefs,
    seed: 0,
    shows: [],
    items: [],
    savedShows: {},
    artists: prefs.artists.map((a) => ({ id: a.id, name: a.name, status: "wait", wanted: wantedCount(a, prefs.perArtist), found: 0 })),
  });

  // 1. search, artist by artist; a song already picked for another artist is not picked twice
  const taken = new Set<string>();
  for (const a of prefs.artists) {
    if (!alive()) return;
    const upd = (patch: Partial<RadioArtistState>) => emit({ artists: state.artists.map((s) => (s.id === a.id ? { ...s, ...patch } : s)) });
    upd({ status: "search" });
    const results = await searchArtist(a.name, wantedCount(a, prefs.perArtist), taken);
    if (!alive()) return;
    if (results.length === 0) {
      upd({ status: "empty" });
      continue;
    }
    results.forEach((r) => taken.add(r.id));
    const tracks = ensureTracks(results.map((r) => ({ artist: a.name, r })));
    const items: RadioItem[] = results.map((r) => {
      const t = tracks.get(r.id)!;
      const known = !!(t.bpm && t.camelot);
      return { key: r.id, artist: a.name, title: r.title, durationSec: r.duration, art: r.artwork ?? undefined, trackId: t.id, status: known ? "ready" : "found", bpm: t.bpm, camelot: t.camelot };
    });
    emit({ items: [...state.items, ...items] });
    upd({ status: "done", found: results.length });
  }

  // 2. analyse tempo and key, two songs at a time (download of one overlaps the analysis of the other)
  emit({ phase: "analyze" });
  const queue = state.items.filter((i) => i.status === "found").map((i) => i.key);
  const setItem = (key: string, patch: Partial<RadioItem>) => emit({ items: state.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });
  const worker = async () => {
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      if (!alive()) return;
      const item = state.items.find((i) => i.key === key);
      const track = item && loadLibrary().tracks.find((t) => t.id === item.trackId);
      if (!item || !track) continue;
      setItem(key, { status: "analyzing" });
      const r = await analyzeLibraryTrack(track);
      if (!alive()) return;
      if (!r) {
        setItem(key, { status: "failed" });
        continue;
      }
      patchTrack(track.id, { bpm: r.bpm, bpmEstimated: true, bpmConfidence: r.bpmConfidence, camelot: r.camelot });
      setItem(key, { status: "ready", bpm: r.bpm, camelot: r.camelot });
    }
  };
  await Promise.all([worker(), worker()]);
  if (!alive()) return;

  // 3. compose
  emit({ phase: "done" });
  composeNow(0);
}

// ---- editing and saving the proposed sets ----------------------------------------------------

export function updateShow(key: string, trackIds: string[]) {
  const saved = { ...state.savedShows };
  delete saved[key]; // edited: no longer the saved version
  emit({ shows: state.shows.map((s) => (s.key === key ? { ...s, trackIds } : s)), savedShows: saved });
}

// writes the show as a set (a playlist) of the library; saving it again updates the same set
export function saveShow(key: string): string | null {
  const show = state.shows.find((s) => s.key === key);
  if (!show || show.trackIds.length < 2) return null;
  const lib = loadLibrary();
  const existingId = state.savedShows[key];
  const id = existingId ?? uid();
  const taken = new Set(lib.playlists.filter((p) => p.id !== id).map((p) => p.name));
  let name = show.name;
  for (let n = 2; taken.has(name); n++) name = `${show.name} (${n})`;
  const set: Playlist = { id, name, trackIds: show.trackIds, transitionSec: 8, transitionType: "smooth", preloadSec: 15 };
  const has = lib.playlists.some((p) => p.id === id);
  saveLibrary({ ...lib, playlists: has ? lib.playlists.map((p) => (p.id === id ? set : p)) : [...lib.playlists, set] });
  emit({ savedShows: { ...state.savedShows, [key]: id } });
  return id;
}
