import { loadLibrary, saveLibrary, uid, type LibTrack, type Playlist } from "@/lib/library";
import { analyzeLibraryTrack } from "@/lib/analyzeTrack";
import { ARC_LABEL, computeOrder } from "@/lib/setWizard";
import { getMemLevel } from "@/lib/memoryGovernor";
import { DEFAULT_DJ, planMix, type DjOptions, type MixStep } from "@/lib/mixPlan";
import { enqueuePrep } from "@/lib/stemPrep";
import { prepareTracks, wantsStems, type PrepProgress } from "@/lib/setPrep";
import { findCollection, pickSongs } from "@/lib/styles";
import { GENRES } from "@/lib/djForce";
import { findComposer, pickWorks, type ClassicalFilters, type Era, type Instrument, type Mood } from "@/lib/classical";
import type { SetArc } from "@/lib/setBuilder";

// Radio-AVA: from favourite artists to ready-to-play sets.
//   1. search each artist on YouTube and keep the real songs (no live, mix, cover...)
//   2. add them to the library and analyse tempo + key
//   3. compose sets (one mix of every artist, optionally one set per artist) that chain well
// The pipeline lives at module level, like the stem preparation: it keeps running when the view is left.

export interface RadioArtist {
  id: string;
  name: string;
  topic?: boolean; // not an artist but a style or a mood ("zen", "bossa nova"): the radio looks for its best-known songs
  love: 1 | 2 | 3; // 1 = a few songs, 3 = many
}

export interface RadioPrefs {
  artists: RadioArtist[];
  perArtist: 3 | 5 | 8; // songs per artist, multiplied by the love
  arc: SetArc;
  durationMin: number; // 0 = every analysed song
  soloSets: boolean; // one extra set per artist
  // advanced
  version: "original" | "remix" | "any"; // which versions of the songs to look for
  content: "studio" | "live" | "instrumental" | "acapella" | "acoustic"; // what kind of recording to look for
  mode: "artists" | "classical" | "style" | "collection" | "zen" | "calm"; // zen: ambient and meditation, calm: quiet piano (soft blends, almost no effect); artists, composers and their works, a music style (its artists), a collection (named songs)
  analysis: "full" | "none"; // "none": the sets are built without analysing tempo and key (instant, ordered by artist alternation)
  classical: { eras: Era[]; instrument: Instrument | "all"; mood: Mood | "all" };
  maxTrackMin: 5 | 8 | 12 | 20; // longest song kept
  tempoMin: number; // BPM window of the songs used (0 = no limit)
  tempoMax: number;
  tempoSpread: 4 | 8 | 15; // widest tempo gap inside one set, in %
  harmony: "strict" | "balanced" | "free"; // how much the keys must agree
  mixArtists: "alternate" | "free" | "blocks"; // order of the artists inside a set
  avoidUsed: boolean; // leave out the songs already in one of my sets
  maxShows: 1 | 2 | 3; // mixes proposed at most (one per tempo zone)
  // DJ
  dj: DjOptions;
  prepStems: boolean; // prepare the stems of the first two songs when a show is prepared
}

export const DEFAULT_PREFS: RadioPrefs = {
  artists: [],
  perArtist: 5,
  arc: "peak",
  durationMin: 60,
  soloSets: false,
  version: "original",
  content: "studio",
  mode: "artists",
  analysis: "full",
  classical: { eras: [], instrument: "all", mood: "all" },
  maxTrackMin: 8,
  tempoMin: 0,
  tempoMax: 0,
  tempoSpread: 15,
  harmony: "balanced",
  mixArtists: "alternate",
  avoidUsed: false,
  maxShows: 2,
  dj: DEFAULT_DJ,
  prepStems: false,
};

const pick = <T,>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

// classical, zen and calm radios are programmes, not dance sets: long soft blends, no beat-matching, no tempo zones
export const isGentle = (p: Pick<RadioPrefs, "mode">) => p.mode === "classical" || p.mode === "zen" || p.mode === "calm";

const LS_KEY = "djsynth.radio.v1";

function normalizePrefs(p: Partial<RadioPrefs>): RadioPrefs {
  const D = DEFAULT_PREFS;
  const num = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v < 400 ? v : d);
  return {
    artists: Array.isArray(p.artists) ? p.artists.filter((a) => a && typeof a.name === "string" && a.name.trim()).slice(0, 24) : [],
    perArtist: pick(p.perArtist, [3, 5, 8] as const, D.perArtist),
    arc: pick(p.arc, ["flow", "rise", "fall", "peak", "wave"] as const, D.arc),
    durationMin: typeof p.durationMin === "number" ? p.durationMin : D.durationMin,
    soloSets: !!p.soloSets,
    version: pick(p.version, ["original", "remix", "any"] as const, D.version),
    content: pick(p.content, ["studio", "live", "instrumental", "acapella", "acoustic"] as const, D.content),
    mode: pick(p.mode, ["artists", "classical", "style", "collection", "zen", "calm"] as const, D.mode),
    analysis: pick(p.analysis, ["full", "none"] as const, D.analysis),
    classical: {
      eras: Array.isArray(p.classical?.eras) ? p.classical!.eras.filter((e) => ["baroque", "classique", "romantique", "impressionniste", "moderne"].includes(e)) : [],
      instrument: pick(p.classical?.instrument, ["all", "piano", "orchestre", "cordes", "orgue", "voix", "guitare"] as const, "all"),
      mood: pick(p.classical?.mood, ["all", "calme", "joyeux", "dramatique", "intense"] as const, "all"),
    },
    maxTrackMin: pick(p.maxTrackMin, [5, 8, 12, 20] as const, D.maxTrackMin),
    tempoMin: num(p.tempoMin, 0),
    tempoMax: num(p.tempoMax, 0),
    tempoSpread: pick(p.tempoSpread, [4, 8, 15] as const, D.tempoSpread),
    harmony: pick(p.harmony, ["strict", "balanced", "free"] as const, D.harmony),
    mixArtists: pick(p.mixArtists, ["alternate", "free", "blocks"] as const, D.mixArtists),
    avoidUsed: !!p.avoidUsed,
    maxShows: pick(p.maxShows, [1, 2, 3] as const, D.maxShows),
    dj: {
      ...DEFAULT_DJ,
      ...(p.dj ?? {}),
      voice: pick(p.dj?.voice, ["off", "discret", "radio"] as const, "off"),
      voiceEngine: pick(p.dj?.voiceEngine, ["dj", "system"] as const, "dj"),
      voiceEvery: pick(p.dj?.voiceEvery, [0, 1, 2] as const, 1),
      endOfSet: pick(p.dj?.endOfSet, ["loop", "stop"] as const, "loop"),
      stems: pick(p.dj?.stems, ["off", "smooth", "punchy"] as const, "punchy"),
      genre: pick(p.dj?.genre, GENRES, "auto"),
    },
    prepStems: !!p.prepStems,
  };
}

// the user's radios: each one is a list of artists with its own settings
export interface Station {
  id: string;
  name: string;
  prefs: RadioPrefs;
}
export interface StationsData {
  current: string;
  stations: Station[];
}
const LS_STATIONS = "djsynth.radio.stations.v1";

export function loadStations(): StationsData {
  try {
    const raw = localStorage.getItem(LS_STATIONS);
    if (raw) {
      const d = JSON.parse(raw) as Partial<StationsData>;
      const stations = (Array.isArray(d.stations) ? d.stations : [])
        .filter((s): s is Station => !!s && typeof s.id === "string" && typeof s.name === "string")
        .map((s) => ({ id: s.id, name: s.name, prefs: normalizePrefs(s.prefs ?? {}) }));
      if (stations.length) return { current: stations.some((s) => s.id === d.current) ? d.current! : stations[0].id, stations };
    }
    // first run with stations: the single radio of the previous version becomes "Ma radio"
    const old = localStorage.getItem(LS_KEY);
    return { current: "main", stations: [{ id: "main", name: "Ma radio", prefs: normalizePrefs(old ? (JSON.parse(old) as Partial<RadioPrefs>) : {}) }] };
  } catch {
    return { current: "main", stations: [{ id: "main", name: "Ma radio", prefs: DEFAULT_PREFS }] };
  }
}

export function saveStations(d: StationsData): void {
  try {
    localStorage.setItem(LS_STATIONS, JSON.stringify(d));
  } catch {
    // storage blocked: the radios only last for this session
  }
}

export function loadPrefs(): RadioPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? normalizePrefs(JSON.parse(raw) as Partial<RadioPrefs>) : DEFAULT_PREFS;
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

const BAD_WORDS = "live|en concert|concert|cover|karaoke|reaction|r[ée]action|compilation|best of|greatest hits|megamix|dj mix|mixtape|non-?stop|medley|full album|album complet|tutorial|interview|nightcore|slowed|sped up|8d audio|1 hour|10 hours|trailer|teaser|making of|parodie|parody|lesson";
const BAD_TITLE = new RegExp(`\\b(${BAD_WORDS})\\b`, "i");
// same list without the words that are the point of a live search
const BAD_TITLE_LIVE = new RegExp(`\\b(${BAD_WORDS.replace("live|en concert|concert|", "")})\\b`, "i");
export type Content = "studio" | "live" | "instrumental" | "acapella" | "acoustic";
// what a title must say to be of the wanted kind (studio: nothing special, it must not be one of the others)
const CONTENT_RULE: Record<Exclude<Content, "studio">, RegExp> = {
  live: /\b(live|en concert|concert|en direct|unplugged|session|tour)\b/i,
  instrumental: /\b(instrumental|no vocals|sans voix)\b/i,
  acapella: /a ?cappella|acappella|acapella|vocals? only|isolated vocals?|voice only|vocal stem|voix seule/i,
  acoustic: /\b(acoustic|acoustique|unplugged|stripped|piano version)\b/i,
};

export interface YtResult {
  id: string;
  title: string;
  artist: string; // uploader
  duration: number; // seconds
  artwork: string | null;
  views?: number; // popularity, when known
}

// the title of a song with the noise removed, to spot the same song uploaded twice
export function normTitle(title: string, artist: string): string {
  let s = strip(title).replace(/\(.*?\)|\[.*?\]/g, " ");
  const a = normArtist(artist);
  if (a) s = s.replace(new RegExp(a.split(" ").join("[^a-z0-9]*"), "g"), " ");
  return s
    .replace(/\b(feat|ft|featuring|avec)\b.*$/, " ") // credits of guests: the same song with or without them
    .replace(/\b(official|audio|video|videoclip|clip|lyrics?|paroles|hd|hq|4k|remastered|remaster|music|musique)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isRelevant(r: YtResult, artist: string): boolean {
  const a = normArtist(artist);
  if (!a) return false;
  return normArtist(r.title).includes(a) || normArtist(r.artist).includes(a);
}

// the songs worth keeping among the search results of one artist
const REMIXISH = /remix|\bedit\b|extended|club mix|rework|bootleg/i;
export function pickCandidates(
  results: YtResult[],
  artist: string,
  count: number,
  skipKeys: ReadonlySet<string> = new Set(),
  opts: { maxSec?: number; version?: RadioPrefs["version"]; content?: Content; classical?: boolean; topic?: boolean } = {}
): YtResult[] {
  const content = opts.content ?? "studio";
  // a concert recording runs longer than the studio song
  const maxSec = Math.max(opts.maxSec ?? 480, content === "live" ? 720 : 0);
  const bad = content === "live" ? BAD_TITLE_LIVE : BAD_TITLE;
  const seen = new Set<string>();
  const scored: { r: YtResult; score: number; rank: number }[] = [];
  results.forEach((r, rank) => {
    if (!r.id || skipKeys.has(r.id) || bad.test(r.title)) return;
    if (r.duration < 130 || r.duration > maxSec) return;
    if (content !== "studio") {
      if (!CONTENT_RULE[content].test(r.title)) return;
      if (/karaoke/i.test(r.title)) return;
    } else if (!opts.classical) {
      // a studio search keeps clear of the other kinds, whatever the version asked
      if (/\b(live|instrumental|acoustic|a ?cappella)\b/i.test(r.title) && !/\b(live|instrumental|acoustic)\b/i.test(artist)) return;
      if (opts.version === "original" && /remix|bootleg|mashup|rework/i.test(r.title)) return;
      if (opts.version === "remix" && !REMIXISH.test(r.title)) return;
    }
    if (!opts.topic && !isRelevant(r, artist)) return; // a style has no name to find in the title
    const key = normTitle(r.title, artist);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const a = normArtist(artist);
    // a style: the best-known songs come first (how often they were watched), whoever sings them
    if (opts.topic) {
      scored.push({ r, score: r.views ? Math.log10(r.views + 1) * 10 : 0, rank });
      return;
    }
    const score = (normArtist(r.title).includes(a) ? 2 : 0) + (normArtist(r.artist).includes(a) || /topic|vevo|official/i.test(r.artist) ? 1 : 0) + (/official audio|audio officiel/i.test(r.title) ? 1 : 0);
    scored.push({ r, score, rank });
  });
  const sorted = scored.sort((x, y) => y.score - x.score || x.rank - y.rank);
  if (!opts.topic) return sorted.slice(0, count).map((s) => s.r);
  // a style is not one artist's radio: at most two songs of the same channel, so the list has variety
  const perChannel = new Map<string, number>();
  const out: YtResult[] = [];
  for (const { r } of sorted) {
    const n = perChannel.get(r.artist) ?? 0;
    if (n >= 2) continue;
    perChannel.set(r.artist, n + 1);
    out.push(r);
    if (out.length >= count) break;
  }
  return out;
}

export const wantedCount = (a: RadioArtist, perArtist: number) => a.love * perArtist;

export interface RadioShow {
  key: string;
  name: string;
  arc: SetArc;
  artist?: string; // set when the show is about one artist
  trackIds: string[]; // library ids
  plan: MixStep[]; // how to go from each song to the next, decided in advance (lib/mixPlan.ts)
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

const HARMONY_WEIGHT = { strict: 1.3, balanced: 0.5, free: 0.15 } as const;

// the DJ options a radio really uses: a classical one never beat-matches, swaps bass or brakes
export function djFor(prefs: RadioPrefs): DjOptions {
  return isGentle(prefs) ? { ...prefs.dj, style: "classical", sync: false, bassSwap: false, tails: false, keyFix: false } : { ...prefs.dj, style: "club" };
}

// order without analysis: artists take turns (or follow each other in blocks / at random), the seed shuffles the rest,
// and the set stops when it reaches the asked length
export function plainOrder(tracks: LibTrack[], minutes: number, seed: number, artists: RadioPrefs["mixArtists"]): string[] {
  let x = (seed + 1) * 2654435761;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  const shuffled = [...tracks].map((t) => ({ t, r: rnd() })).sort((a, b) => a.r - b.r).map((o) => o.t);
  const by = new Map<string, LibTrack[]>();
  for (const t of shuffled) by.set(normArtist(t.group ?? ""), [...(by.get(normArtist(t.group ?? "")) ?? []), t]);
  let out: LibTrack[];
  if (artists === "free") out = shuffled;
  else if (artists === "blocks") out = [...by.values()].flat();
  else {
    out = [];
    const lists = [...by.values()];
    for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  }
  if (minutes > 0) {
    let sec = 0;
    out = out.filter((t) => (sec < minutes * 60 ? ((sec += t.durationSec || 240), true) : false));
  }
  return out.map((t) => t.id);
}

// the sets to propose from the analysed songs: mixes of everybody, each inside one tempo zone
// (a second one when enough songs are left), plus one set per artist if asked. Each comes with its mix plan.
export function composeShows(tracks: LibTrack[], prefs: RadioPrefs, seed: number, avoid: ReadonlySet<string> = new Set()): RadioShow[] {
  // the same song uploaded twice (library copies of old runs included) is used once; a remix stays a different song
  const seenSongs = new Set<string>();
  tracks = tracks.filter((t) => {
    const key = `${normTitle(t.name, t.group ?? "")}${REMIXISH.test(t.name) ? "#remix" : ""}`;
    if (!key.trim() || seenSongs.has(key)) return !key.trim();
    seenSongs.add(key);
    return true;
  });
  const plain = prefs.analysis === "none"; // no tempo or key: the songs are only alternated between artists
  let ready = plain ? tracks : tracks.filter((t) => (t.bpm ?? 0) > 0 && (!prefs.tempoMin || t.bpm! >= prefs.tempoMin) && (!prefs.tempoMax || t.bpm! <= prefs.tempoMax));
  if (prefs.avoidUsed) {
    const fresh = ready.filter((t) => !avoid.has(t.id));
    if (fresh.length >= 6) ready = fresh; // never starve the radio: with too few new songs the old ones stay
  }
  const tuning = { harmonyWeight: HARMONY_WEIGHT[prefs.harmony], artists: prefs.mixArtists };
  const order = (pool: LibTrack[], arc: SetArc, minutes: number) => (plain ? plainOrder(pool, minutes, seed, prefs.mixArtists) : computeOrder(pool, arc, minutes, "", seed || null, tuning));
  const planFor = (ids: string[], arc: SetArc) => {
    const byId = new Map(tracks.map((t) => [t.id, t]));
    return planMix(ids.map((id) => byId.get(id)).filter((t): t is LibTrack => !!t), arc, djFor(prefs));
  };
  const shows: RadioShow[] = [];
  if (ready.length >= 2) {
    // a classical concert is one programme: tempos are not matched, so the songs are not split into tempo zones
    const groups = isGentle(prefs) || plain ? [] : tempoGroups(ready, 1 + prefs.tempoSpread / 100, 5, prefs.maxShows);
    (groups.length ? groups : [ready]).forEach((g, i) => {
      const ids = order(g, prefs.arc, prefs.durationMin);
      const label = prefs.mode === "classical" ? `Classique · ${ARC_LABEL[prefs.arc]}` : prefs.mode === "zen" ? "Zen" : prefs.mode === "calm" ? "Calm · piano" : plain ? "sans analyse" : `${ARC_LABEL[prefs.arc]} · ${bpmSpan(g)}`;
      shows.push({ key: i === 0 ? "mix" : `mix-${i + 1}`, name: `Radio-AVA · ${label}`, arc: prefs.arc, trackIds: ids, plan: planFor(ids, prefs.arc) });
    });
  }
  if (prefs.soloSets) {
    for (const a of prefs.artists) {
      const mine = ready.filter((t) => t.group && normArtist(t.group) === normArtist(a.name));
      if (mine.length >= 3) {
        const ids = plain ? plainOrder(mine, 0, seed, "free") : computeOrder(mine, "flow", 0, "", seed || null, { harmonyWeight: tuning.harmonyWeight });
        shows.push({ key: `solo-${a.id}`, name: `Radio-AVA · ${a.name}`, arc: "flow", artist: a.name, trackIds: ids, plan: planFor(ids, "flow") });
      }
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
  spare?: boolean; // a reserve song: only analysed when another song of the artist failed
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
  etaSec: number | null; // estimated time left for the analysis
  fresh: boolean; // the last run looked for new songs only
  prep: Record<string, ShowPrep>; // show key -> state of its preparation
}

// "Préparer l'émission": songs copied to the disk cache of the app (instant start, no gap), stems of the first songs
export type ShowPrep = PrepProgress;

const EMPTY: RadioState = { phase: "idle", artists: [], items: [], shows: [], prefs: null, seed: 0, savedShows: {}, etaSec: null, fresh: false, prep: {} };
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// the theme written on the songs a radio adds, so that a live radio does not reuse studio songs (and the reverse)
export function themeFor(prefs: RadioPrefs): string {
  return prefs.mode === "classical" ? "Radio-AVA · classique" : prefs.mode === "collection" ? "Radio-AVA · collection" : prefs.mode === "zen" ? "Radio-AVA · zen" : prefs.mode === "calm" ? "Radio-AVA · calm" : prefs.content === "studio" ? "Radio-AVA" : `Radio-AVA · ${prefs.content}`;
}

const CONTENT_QUERY: Record<Exclude<Content, "studio">, string[]> = {
  live: ["live", "concert live performance"],
  instrumental: ["instrumental", "instrumental version"],
  acapella: ["acapella", "vocals only"],
  acoustic: ["acoustic", "unplugged"],
};

async function runQueries(queries: string[], name: string, count: number, skip: ReadonlySet<string>, maxSec: number, prefs: RadioPrefs, classical = false): Promise<YtResult[]> {
  const all: YtResult[] = [];
  let picked: YtResult[] = [];
  for (const q of queries) {
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&n=40&min=${classical ? 90 : 130}&max=${Math.max(maxSec, prefs.content === "live" ? 720 : 0)}`);
      if (!res.ok) continue;
      const data = (await res.json()) as { tracks?: YtResult[] };
      all.push(...(data.tracks ?? []));
      picked = pickCandidates(all, name, count, skip, { maxSec, version: prefs.version, content: prefs.content, classical });
      if (picked.length >= count) break;
    } catch {
      // one failed query: the next one (or the next artist) goes on
    }
  }
  return picked;
}

// A style or a mood typed instead of an artist ("zen", "bossa nova", "rock années 80"): the songs most watched for it.
// Several searches are put together first, so the choice is made among many songs, not the first query's.
async function searchTopic(name: string, count: number, skip: ReadonlySet<string>, prefs: RadioPrefs, maxSec: number): Promise<YtResult[]> {
  const gentle = isGentle(prefs);
  const all: YtResult[] = [];
  for (const q of [`${name} official audio`, `${name} music`, `${name} best songs`]) {
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&n=40&min=${gentle ? 90 : 130}&max=${maxSec}`);
      if (!res.ok) continue;
      const data = (await res.json()) as { tracks?: YtResult[] };
      for (const t of data.tracks ?? []) if (!all.some((x) => x.id === t.id)) all.push(t);
    } catch {
      // one failed query: the others go on
    }
  }
  return pickCandidates(all, name, count, skip, { maxSec, version: prefs.version, content: prefs.content, classical: gentle, topic: true });
}

// `offset` moves a classical radio along the works of the composer: each regeneration gets other pieces
async function searchArtist(name: string, count: number, skip: ReadonlySet<string>, prefs: RadioPrefs, offset = 0, topic = false): Promise<YtResult[]> {
  const maxSec = prefs.maxTrackMin * 60;
  if (topic) return searchTopic(name, count, skip, prefs, maxSec);
  if (prefs.mode === "classical") {
    const composer = findComposer(name);
    const filters: ClassicalFilters = { instrument: prefs.classical.instrument, mood: prefs.classical.mood };
    const kind = prefs.content === "live" ? " live concert" : prefs.content === "instrumental" ? "" : "";
    if (!composer) return runQueries([`${name} best works${kind}`, `${name} orchestra${kind}`, `${name} piano`], name, count, skip, maxSec, prefs, true);
    // one search per work: precise, and the pieces are the ones named in the catalogue
    const taken = new Set(skip);
    const out: YtResult[] = [];
    for (const work of pickWorks(composer, count + 2, filters, offset)) {
      if (out.length >= count) break;
      const [hit] = await runQueries([`${composer.name} ${work.q}${kind}`], composer.name, 1, taken, maxSec, prefs, true);
      if (hit) {
        out.push(hit);
        taken.add(hit.id);
      }
    }
    return out;
  }
  {
    const col = findCollection(name); // a named list works in every radio type
    // zen and calm songs are long and often called "instrumental" or "live": no studio filter
    const gentle = isGentle(prefs) || col?.genre === "zen" || col?.genre === "calm";
    if (col) {
      // one search per named song of the collection
      const taken = new Set(skip);
      const out: YtResult[] = [];
      for (const song of pickSongs(col, count + 2, offset)) {
        if (out.length >= count) break;
        const [hit] = await runQueries(gentle ? [`${song.artist} ${song.title}`] : [`${song.artist} ${song.title} official audio`, `${song.artist} ${song.title}`], song.artist, 1, taken, maxSec, prefs, gentle);
        if (hit) {
          out.push(hit);
          taken.add(hit.id);
        }
      }
      return out;
    }
  }
  const queries =
    prefs.content !== "studio"
      ? CONTENT_QUERY[prefs.content].map((w) => `${name} ${w}`)
      : prefs.version === "remix"
        ? [`${name} remix`, `${name} club mix`]
        : prefs.version === "any"
          ? [`${name} official audio`, `${name} remix`, `${name} topic`]
          : [`${name} official audio`, `${name} topic`];
  return runQueries(queries, name, count, skip, maxSec, prefs);
}

// the library as the pipeline sees it: songs already there (same YouTube id) are reused, not duplicated
function ensureTracks(found: { artist: string; r: YtResult }[], theme: string): Map<string, LibTrack> {
  const lib = loadLibrary();
  const out = new Map<string, LibTrack>();
  const fresh: LibTrack[] = [];
  for (const { artist, r } of found) {
    const had = lib.tracks.find((t) => t.source === "youtube" && t.url === r.id);
    if (had) {
      out.set(r.id, had);
      continue;
    }
    const t: LibTrack = { id: uid(), name: r.title, source: "youtube", url: r.id, deck: null, art: r.artwork ?? undefined, durationSec: r.duration, later: true, theme, group: artist, addedAt: Date.now() };
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

interface Tempo {
  bpm: number;
  bpmConfidence: number;
  camelot: string;
}

// tempo and key from a short excerpt (server route, cached by video); the whole-file path is the fallback
async function analyzeItem(track: LibTrack, ytId: string, durationSec: number): Promise<Tempo | null> {
  try {
    const res = await fetch(`/api/radio/analyze?id=${encodeURIComponent(ytId)}&dur=${Math.round(durationSec)}`);
    if (res.ok) {
      const j = (await res.json()) as Partial<Tempo>;
      if (j.bpm) return { bpm: j.bpm, bpmConfidence: j.bpmConfidence ?? 0, camelot: j.camelot ?? "" };
    }
  } catch {
    // route unavailable (not the local app): analyse the whole file in the browser instead
  }
  const r = await analyzeLibraryTrack(track);
  return r ? { bpm: r.bpm, bpmConfidence: r.bpmConfidence, camelot: r.camelot } : null;
}

let avoidIds: ReadonlySet<string> = new Set(); // songs already in one of the user's sets when the radio started

export function composeNow(seed: number) {
  const lib = loadLibrary();
  const byId = new Map(lib.tracks.map((t) => [t.id, t]));
  const ids = state.items.filter((i) => i.status === "ready").map((i) => i.trackId);
  const tracks = ids.map((id) => byId.get(id)).filter((t): t is LibTrack => !!t);
  emit({ shows: state.prefs ? composeShows(tracks, state.prefs, seed, avoidIds) : [], seed, savedShows: {}, prep: {} });
}

export function recomposeRadio() {
  if (state.phase === "done") composeNow(state.seed + 1);
}

export function cancelRadio() {
  if (!radioBusy()) return;
  runId++;
  emit({ phase: "cancelled", etaSec: null, items: state.items.filter((i) => !(i.spare && i.status === "found")) });
  composeNow(state.seed);
}

export function resetRadio() {
  if (radioBusy()) return;
  emit(EMPTY);
}

const SEARCH_PARALLEL = 2;
const ANALYZE_PARALLEL = 3;
const SPARES = 2;

const setItem = (key: string, patch: Partial<RadioItem>) => emit({ items: state.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });

// Analysis, three songs at a time: reserve songs only replace a song that failed.
// `searching` says whether more songs may still arrive (the queue is then waited for).
async function analyzeQueue(alive: () => boolean, wantedOf: ReadonlyMap<string, number>, searching: () => boolean): Promise<void> {
  const start = Date.now();
  let finished = 0;
  const missing = (artist: string) => (wantedOf.get(artist) ?? 0) - state.items.filter((i) => i.artist === artist && (i.status === "ready" || i.status === "analyzing")).length;
  const pick = () => {
    const next = state.items.find((i) => i.status === "found" && !i.spare) ?? state.items.find((i) => i.status === "found" && i.spare && missing(i.artist) > 0);
    if (next) setItem(next.key, { status: "analyzing" });
    return next;
  };
  const updateEta = () => {
    const left = state.items.filter((i) => (i.status === "found" && !i.spare) || i.status === "analyzing").length;
    emit({ etaSec: finished > 0 ? Math.round((((Date.now() - start) / finished) * left) / 1000) : null });
  };
  // memory tight: only the first analyst keeps working; critical: nobody starts a new song
  const analyst = async (index: number) => {
    for (;;) {
      if (!alive()) return;
      const level = getMemLevel();
      if (level === "critical" || (level === "warn" && index > 0)) {
        await sleep(1000);
        continue;
      }
      const item = pick();
      if (!item) {
        if (!searching() && !state.items.some((i) => i.status === "analyzing")) return;
        await sleep(150);
        continue;
      }
      const track = loadLibrary().tracks.find((t) => t.id === item.trackId);
      const r = track ? await analyzeItem(track, item.key, item.durationSec) : null;
      if (!alive()) return;
      finished++;
      if (!track || !r) {
        setItem(item.key, { status: "failed" });
      } else {
        patchTrack(track.id, { bpm: r.bpm, bpmEstimated: true, bpmConfidence: r.bpmConfidence, camelot: r.camelot });
        setItem(item.key, { status: "ready", bpm: r.bpm, camelot: r.camelot });
      }
      updateEta();
    }
  };
  await Promise.all(Array.from({ length: ANALYZE_PARALLEL }, (_, i) => analyst(i)));
}

const regenerations = new Map<string, number>(); // artist id -> times searched again (moves a classical radio / a collection along its list)
let runWanted: Map<string, number> = new Map(); // titles wanted per artist in the run in progress (shared with its analysts)
let sideJobs = 0; // "Autre" / "Régénérer" searches in progress: the analysts of a running radio wait for their songs

const artistIsReady = (name: string) => state.items.some((i) => i.artist === name && i.status === "ready");
// "Autre" and "Régénérer" are offered as soon as the first titles of the artist are analysed, even while the radio runs
export function canExtendArtist(artistId: string): boolean {
  const entry = state.artists.find((a) => a.id === artistId);
  if (!entry || !state.prefs) return false;
  if (entry.status === "empty") return state.phase === "done" || state.phase === "cancelled";
  return (entry.status === "done" || entry.status === "error") && (artistIsReady(entry.name) || state.phase === "done" || state.phase === "cancelled");
}

// "Autre" (replace = false): more titles by the same artist, the ones already there are kept.
// "Régénérer" (replace = true): a new list for the artist. The other artists keep their songs; the sets are composed
// again. Resolves to the number of new songs (0 = nothing new was found).
export async function extendArtist(artistId: string, replace: boolean): Promise<number> {
  const prefs = state.prefs;
  const entry = state.artists.find((a) => a.id === artistId);
  const artist = prefs?.artists.find((a) => a.id === artistId);
  if (!prefs || !entry || !artist || !canExtendArtist(artistId) || entry.status === "search" || entry.status === "wait") return 0;
  const wanted = wantedCount(artist, prefs.perArtist);
  const upd = (patch: Partial<RadioArtistState>) => emit({ artists: state.artists.map((x) => (x.id === artistId ? { ...x, ...patch } : x)) });
  const noAnalysis = prefs.analysis === "none";
  sideJobs++; // a running radio keeps its analysts waiting until the new songs are queued
  upd({ status: "search" });
  try {
    // everything known (shown now, or already in the library from earlier radios) is not proposed again
    const lib = loadLibrary();
    const known = new Set<string>([
      ...state.items.map((i) => i.key),
      ...lib.tracks.filter((t) => t.source === "youtube" && t.url && t.group && normArtist(t.group) === normArtist(artist.name)).map((t) => t.url!),
    ]);
    const offset = (regenerations.get(artistId) ?? 0) + 1;
    regenerations.set(artistId, offset);
    const results = await searchArtist(artist.name, wanted + (noAnalysis ? 0 : SPARES), known, prefs, offset, artist.topic);
    if (results.length === 0) {
      upd({ status: "done" });
      return 0;
    }
    const tracks = ensureTracks(results.map((r) => ({ artist: artist.name, r })), themeFor(prefs));
    const fresh: RadioItem[] = results.map((r, i) => {
      const t = tracks.get(r.id)!;
      return { key: r.id, artist: artist.name, title: r.title, durationSec: r.duration, art: r.artwork ?? undefined, trackId: t.id, status: t.bpm || noAnalysis ? "ready" : "found", spare: i >= wanted, bpm: t.bpm, camelot: t.camelot };
    });
    const kept = replace ? state.items.filter((i) => i.artist !== artist.name) : state.items;
    const mainRunning = radioBusy();
    const mine = fresh.filter((i) => !i.spare).length;
    runWanted.set(artist.name, replace ? wanted : (runWanted.get(artist.name) ?? wanted) + wanted);
    emit({ items: [...kept, ...fresh] });
    upd({ status: "done", found: replace ? mine : entry.found + mine });
    if (mainRunning) return mine; // the analysts of the running radio take the new songs; the sets are composed when it ends

    const run = ++runId;
    const alive = () => run === runId;
    emit({ phase: "analyze", etaSec: null });
    if (!noAnalysis) await analyzeQueue(alive, runWanted, () => sideJobs > 1);
    if (!alive()) return 0;
    emit({ phase: "done", etaSec: null, items: state.items.filter((i) => !(i.spare && i.status === "found")) });
    composeNow(state.seed);
    return mine;
  } finally {
    sideJobs--;
  }
}

export const regenerateArtist = (artistId: string) => extendArtist(artistId, true);
export const moreOfArtist = (artistId: string) => extendArtist(artistId, false);

// after a radio built without analysis: analyse tempo and key now, then compose the sets again, properly ordered
export async function analyzeAndRecompose(): Promise<void> {
  const prefs = state.prefs;
  if (!prefs || prefs.analysis !== "none" || radioBusy()) return;
  const run = ++runId;
  const alive = () => run === runId;
  const full: RadioPrefs = { ...prefs, analysis: "full" };
  const lib = loadLibrary();
  const byId = new Map(lib.tracks.map((t) => [t.id, t]));
  runWanted = new Map(full.artists.map((a) => [a.name, Number.MAX_SAFE_INTEGER]));
  emit({
    prefs: full,
    phase: "analyze",
    items: state.items.map((i) => (i.status === "ready" && !byId.get(i.trackId)?.bpm ? { ...i, status: "found" as const, spare: false } : i)),
  });
  await analyzeQueue(alive, runWanted, () => false);
  if (!alive()) return;
  emit({ phase: "done", etaSec: null });
  composeNow(state.seed + 1);
}

// Songs of the artist already in the library (and analysed) are reused: a second radio is instant.
// `fresh` looks for songs not heard yet instead (the cached ones only fill the gaps).
export async function startRadio(prefs: RadioPrefs, opts: { fresh?: boolean } = {}): Promise<void> {
  if (radioBusy() || prefs.artists.length === 0) return;
  const fresh = !!opts.fresh;
  regenerations.clear();
  const run = ++runId;
  const alive = () => run === runId;
  emit({
    phase: "search",
    prefs,
    seed: 0,
    shows: [],
    items: [],
    savedShows: {},
    etaSec: null,
    fresh,
    prep: {},
    artists: prefs.artists.map((a) => ({ id: a.id, name: a.name, status: "wait", wanted: wantedCount(a, prefs.perArtist), found: 0 })),
  });

  const lib0 = loadLibrary();
  avoidIds = new Set(lib0.playlists.flatMap((p) => p.trackIds));
  const cachedOf = (name: string) =>
    lib0.tracks
      .filter((t) => t.source === "youtube" && !!t.url && !!t.group && normArtist(t.group) === normArtist(name) && (prefs.analysis === "none" || (t.bpm ?? 0) > 0) && (t.theme ?? "Radio-AVA") === themeFor(prefs))
      .sort((x, y) => y.addedAt - x.addedAt);
  const wantedOf = new Map(prefs.artists.map((a) => [a.name, wantedCount(a, prefs.perArtist)]));
  runWanted = wantedOf;
  sideJobs = 0;
  const noAnalysis = prefs.analysis === "none";
  const taken = new Set<string>();
  let searching = true;

  const toItem = (t: LibTrack, ready: boolean, spare = false): RadioItem => ({
    key: t.url ?? t.id,
    artist: t.group ?? "",
    title: t.name,
    durationSec: t.durationSec ?? 0,
    art: t.art,
    trackId: t.id,
    status: ready ? "ready" : "found",
    spare,
    bpm: t.bpm,
    camelot: t.camelot,
  });

  // 1. search (two artists at a time); songs are queued for analysis as soon as an artist is done
  const searchTask = async (a: RadioArtist) => {
    const upd = (patch: Partial<RadioArtistState>) => emit({ artists: state.artists.map((x) => (x.id === a.id ? { ...x, ...patch } : x)) });
    upd({ status: "search" });
    const wanted = wantedOf.get(a.name) ?? 0;
    const have = cachedOf(a.name);
    let keep: LibTrack[] = [];
    let results: YtResult[] = [];
    if (!fresh && have.length >= wanted) {
      keep = have.slice(0, wanted);
    } else {
      const need = fresh ? wanted : wanted - have.length;
      results = await searchArtist(a.name, need + (noAnalysis ? 0 : SPARES), new Set([...have.map((t) => t.url!), ...taken]), prefs, 0, a.topic);
      if (!alive()) return;
      keep = fresh ? have.slice(0, Math.max(0, wanted - results.length)) : have;
    }
    results.forEach((r) => taken.add(r.id));
    const tracks = ensureTracks(results.map((r) => ({ artist: a.name, r })), themeFor(prefs));
    const need = Math.max(0, wanted - keep.length);
    const items = [
      ...keep.map((t) => toItem(t, true)),
      ...results.map((r, i) => toItem(tracks.get(r.id)!, noAnalysis && i < need, i >= need)),
    ];
    if (items.length === 0) {
      upd({ status: "empty" });
      return;
    }
    emit({ items: [...state.items, ...items] });
    upd({ status: "done", found: items.filter((i) => !i.spare).length });
  };
  const searchQueue = [...prefs.artists];
  const searcher = async () => {
    for (let a = searchQueue.shift(); a; a = searchQueue.shift()) {
      if (!alive()) return;
      await searchTask(a);
    }
  };

  const searchDone = Promise.all(Array.from({ length: SEARCH_PARALLEL }, searcher)).then(() => {
    searching = false;
  });
  emit({ phase: "analyze" });
  await Promise.all([searchDone, noAnalysis ? Promise.resolve() : analyzeQueue(alive, wantedOf, () => searching || sideJobs > 0)]);
  while (alive() && sideJobs > 0) await sleep(150); // an "Autre" search still running adds its songs first
  if (!alive()) return;

  // 3. compose from what is ready (unused reserve songs are dropped from the list)
  emit({ phase: "done", etaSec: null, items: state.items.filter((i) => !(i.spare && i.status === "found")) });
  composeNow(0);
}

// ---- editing, preparing and saving the proposed sets ---------------------------------------

const tracksOfShow = (ids: string[]): LibTrack[] => {
  const byId = new Map(loadLibrary().tracks.map((t) => [t.id, t]));
  return ids.map((id) => byId.get(id)).filter((t): t is LibTrack => !!t);
};

// the order changed: the plan follows (steps fixed by hand are kept)
export function updateShow(key: string, trackIds: string[]) {
  const saved = { ...state.savedShows };
  delete saved[key]; // edited: no longer the saved version
  const prep = { ...state.prep };
  delete prep[key];
  emit({
    shows: state.shows.map((s) => (s.key === key ? { ...s, trackIds, plan: planMix(tracksOfShow(trackIds), s.arc, state.prefs ? djFor(state.prefs) : DEFAULT_DJ, s.plan) } : s)),
    savedShows: saved,
    prep,
  });
}

export function renameShow(key: string, name: string) {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!clean) return;
  const saved = { ...state.savedShows };
  delete saved[key]; // saved under the old name: saving again renames the set
  emit({ shows: state.shows.map((s) => (s.key === key ? { ...s, name: clean } : s)), savedShows: saved });
}

// the user picks another style / length for one transition: it sticks, whatever the plan says
export function setStep(key: string, index: number, patch: Partial<MixStep>) {
  const saved = { ...state.savedShows };
  delete saved[key];
  emit({
    shows: state.shows.map((s) => (s.key === key ? { ...s, plan: s.plan.map((st, i) => (i === index ? { ...st, ...patch, manual: true } : st)) } : s)),
    savedShows: saved,
  });
}

// everything that can be done before the show is played: songs copied to the disk cache, one at a time (no memory used
// in the app), then the stems of the first two songs if asked. Plan and order are already there.
export async function prepareShow(key: string): Promise<void> {
  const show = state.shows.find((s) => s.key === key);
  if (!show || state.prep[key]?.state === "running") return;
  const tracks = tracksOfShow(show.trackIds);
  const setPrep = (p: ShowPrep) => emit({ prep: { ...state.prep, [key]: p } });
  const last = await prepareTracks(tracks, state.prefs?.dj, setPrep, () => state.shows.some((s) => s.key === key));
  if (!state.shows.some((s) => s.key === key)) return; // the show was cleared meanwhile
  // the stems of every song of the show, in playing order, when asked or when the DJ plays with stems
  if (state.prefs?.prepStems || wantsStems(state.prefs?.dj)) enqueuePrep(tracks);
  setPrep(last);
}

// writes the show as a set (a playlist) of the library, with its mix plan; saving it again updates the same set
export function saveShow(key: string): string | null {
  const show = state.shows.find((s) => s.key === key);
  if (!show || show.trackIds.length < 2) return null;
  const lib = loadLibrary();
  const existingId = state.savedShows[key];
  const id = existingId ?? uid();
  const taken = new Set(lib.playlists.filter((p) => p.id !== id).map((p) => p.name));
  let name = show.name;
  for (let n = 2; taken.has(name); n++) name = `${show.name} (${n})`;
  const set: Playlist = { id, name, trackIds: show.trackIds, transitionSec: 8, transitionType: "smooth", preloadSec: 15, mixPlan: show.plan, dj: state.prefs ? djFor(state.prefs) : DEFAULT_DJ };
  const has = lib.playlists.some((p) => p.id === id);
  saveLibrary({ ...lib, playlists: has ? lib.playlists.map((p) => (p.id === id ? set : p)) : [...lib.playlists, set] });
  emit({ savedShows: { ...state.savedShows, [key]: id } });
  return id;
}
