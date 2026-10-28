// Search of tracks for the library: tolerant to accents, punctuation and typos, several words (all must match),
// "phrases", -exclusions and filters (bpm:120-130, key:8A, artist:, theme:, group:). The ranking of online results is in trackRank.ts.

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(feat\.?|ft\.?|featuring)\s/g, " ")
    .replace(/[._\-–—/\\,;:!?"'()*[\]{}<>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedQuery {
  words: string[];
  phrases: string[];
  exclude: string[];
  bpm?: [number, number];
  keys?: string[]; // key:8A or a list key:8A,9A
  artist: string[];
  theme: string[];
  group: string[];
}

// splits on spaces, but a "quoted part" stays whole, also after "field:" or "-"
function tokenize(q: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of q) {
    if (ch === '"') {
      cur += ch;
      quoted = !quoted;
    } else if (/\s/.test(ch) && !quoted) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

const unquote = (s: string) => s.replace(/^"|"$/g, "");

export function parseQuery(q: string): ParsedQuery {
  const r: ParsedQuery = { words: [], phrases: [], exclude: [], artist: [], theme: [], group: [] };
  for (const tok of tokenize(q)) {
    if (tok.startsWith("-") && tok.length > 1) {
      const x = normalizeText(unquote(tok.slice(1)));
      if (x) r.exclude.push(x);
      continue;
    }
    const m = /^(bpm|key|artist|theme|group):(.*)$/i.exec(tok);
    if (m) {
      const f = m[1].toLowerCase();
      const v = unquote(m[2]);
      if (f === "bpm") {
        const range = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(v);
        const gt = /^>(\d+(?:\.\d+)?)$/.exec(v);
        const lt = /^<(\d+(?:\.\d+)?)$/.exec(v);
        const one = /^(\d+(?:\.\d+)?)$/.exec(v);
        if (range) r.bpm = [Number(range[1]), Number(range[2])];
        else if (gt) r.bpm = [Number(gt[1]), Infinity];
        else if (lt) r.bpm = [0, Number(lt[1])];
        else if (one) r.bpm = [Number(one[1]) - 3, Number(one[1]) + 3];
      } else if (f === "key") {
        const ks = v.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
        if (ks.length) r.keys = ks;
      } else {
        const x = normalizeText(v);
        if (x) r[f as "artist" | "theme" | "group"].push(x);
      }
      continue;
    }
    if (tok.startsWith('"') && tok.endsWith('"') && tok.length > 2) {
      const p = normalizeText(unquote(tok));
      if (p) r.phrases.push(p);
      continue;
    }
    const w = normalizeText(unquote(tok));
    if (w) r.words.push(...w.split(" "));
  }
  return r;
}

// Damerau-Levenshtein distance (a transposition counts 1)
function damerau(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  const dp = Array.from({ length: al + 1 }, (_, i) => {
    const row = new Uint8Array(bl + 1);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= bl; j++) dp[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, dp[i - 2][j - 2] + 1);
      dp[i][j] = best;
    }
  }
  return dp[al][bl];
}

// how well one word is found among the words of a text: whole 3, start 2, inside 1, a typo away 0.8, nothing 0
function wordScore(word: string, tokens: string[]): number {
  let best = 0;
  for (const t of tokens) {
    if (t === word) return 3;
    if (t.startsWith(word)) best = Math.max(best, 2);
    else if (t.includes(word)) best = Math.max(best, 1);
  }
  if (best > 0 || word.length < 4) return best;
  const tol = word.length >= 8 ? 2 : 1;
  for (const t of tokens) {
    if (Math.abs(t.length - word.length) > tol && t.length < word.length + tol) continue;
    // the word may be a typo of the whole token, or of its start (a name being typed)
    if (damerau(word, t) <= tol || (t.length > word.length && damerau(word, t.slice(0, word.length)) <= tol)) return 0.8;
  }
  return 0;
}

// the sum over the words of their best weighted score; 0 as soon as one word is found nowhere (all the words must match)
export function scoreWords(words: string[], fields: { text: string; w: number }[]): number {
  const toks = fields.map((f) => (f.text ? f.text.split(" ") : []));
  let sum = 0;
  for (const w of words) {
    let best = 0;
    for (let i = 0; i < fields.length; i++) best = Math.max(best, wordScore(w, toks[i]) * fields[i].w);
    if (best === 0) return 0;
    sum += best;
  }
  return sum;
}

export interface SearchableTrack {
  name: string;
  theme?: string;
  group?: string;
  camelot?: string;
  bpm?: number;
  addedAt?: number;
  durationSec?: number;
}

const bpmOk = (bpm: number, [lo, hi]: [number, number]) => [bpm, bpm * 2, bpm / 2].some((b) => b >= lo && b <= hi); // half and double time count

// the tracks that match, best first (a blank query leaves the list as it is)
export function searchTracks<T extends SearchableTrack>(tracks: T[], q: string): T[] {
  if (!q.trim()) return tracks;
  const p = parseQuery(q);
  const out: { t: T; score: number; i: number }[] = [];
  tracks.forEach((t, i) => {
    if (p.bpm && (t.bpm == null || !bpmOk(t.bpm, p.bpm))) return;
    if (p.keys && !p.keys.includes((t.camelot ?? "").toUpperCase())) return;
    const name = normalizeText(t.name);
    const theme = normalizeText(t.theme ?? "");
    const group = normalizeText(t.group ?? "");
    const all = `${name} ${theme} ${group}`;
    if (p.exclude.some((x) => all.includes(x))) return;
    if (p.artist.some((x) => !name.includes(x)) || p.theme.some((x) => !theme.includes(x)) || p.group.some((x) => !group.includes(x))) return;
    let score = 1; // a query of filters only keeps what passed them
    if (p.phrases.length) {
      if (p.phrases.some((x) => !all.includes(x))) return;
      score += 3 * p.phrases.length;
    }
    if (p.words.length) {
      const s = scoreWords(p.words, [{ text: name, w: 3 }, { text: theme, w: 1.5 }, { text: group, w: 1.5 }]);
      if (s === 0) return;
      score += s;
      if (name.startsWith(p.words[0])) score += 1;
      let from = 0;
      const inOrder = p.words.every((w) => { const k = name.indexOf(w, from); if (k < 0) return false; from = k + w.length; return true; });
      if (inOrder) score += 1;
    }
    out.push({ t, score, i });
  });
  return out.sort((a, b) => b.score - a.score || (b.t.addedAt ?? 0) - (a.t.addedAt ?? 0) || a.i - b.i).map((x) => x.t);
}

// the keys that mix well with a Camelot key: itself, its two neighbours, its relative (MaRuche/Falken)
export function harmonicKeys(camelot: string): string[] {
  const m = camelot.toUpperCase().trim();
  const match = /^([1-9]|1[0-2])([AB])$/.exec(m);
  if (!match) return [];
  const num = parseInt(match[1], 10);
  const letter = match[2];
  const wrap = (n: number) => (n < 1 ? 12 : n > 12 ? 1 : n);
  return [m, `${wrap(num - 1)}${letter}`, `${wrap(num + 1)}${letter}`, `${num}${letter === "A" ? "B" : "A"}`];
}

// a query for the tracks that follow this one: harmonic keys, and the tempo a turntable reaches (±6 %)
export function compatibleQuery(t: { camelot?: string; bpm?: number }): string {
  const parts: string[] = [];
  const keys = t.camelot ? harmonicKeys(t.camelot) : [];
  if (keys.length) parts.push(`key:${keys.join(",")}`);
  if (t.bpm && t.bpm > 0) parts.push(`bpm:${Math.round(t.bpm * 0.94)}-${Math.round(t.bpm * 1.06)}`);
  return parts.join(" ");
}

export function selfTest(): void {
  const ok = (c: boolean, m: string) => { if (!c) throw new Error(`trackSearch: ${m}`); };
  ok(normalizeText("Café  Del_Mar (feat. X)") === "cafe del mar x", "normalize");
  const lib: SearchableTrack[] = [
    { name: "Daft Punk - One More Time", bpm: 123, camelot: "8A", addedAt: 1 },
    { name: "Around the World", bpm: 121, camelot: "9A", addedAt: 2 },
    { name: "Café del Mar (Energy 52)", bpm: 64, theme: "chill", addedAt: 3 },
    { name: "Mix de l'été", bpm: 90, group: "Berlin", addedAt: 4 },
  ];
  const names = (q: string) => searchTracks(lib, q).map((t) => t.name);
  ok(searchTracks(lib, "  ") === lib, "blank query keeps the list");
  ok(names("cafe").length === 1, "accents");
  ok(names("dafft pun")[0] === "Daft Punk - One More Time", "typo and start of a word");
  ok(names("daft world").length === 0, "all the words must match");
  ok(names("one -more").length === 0, "exclusion");
  ok(names('"more time"').length === 1 && names('"time more"').length === 0, "phrase");
  ok(names("bpm:120-130").length === 3, "bpm range (the 64 bpm track counts at double time)");
  ok(names("bpm:128").length === 1 && names("bpm:128")[0].startsWith("Café"), "half time counts");
  ok(names("key:8a")[0] === "Daft Punk - One More Time" && names("key:8a").length === 1, "key");
  ok(names("group:berlin").length === 1 && names("theme:chill").length === 1, "group and theme");
  ok(names('artist:"daft punk"').length === 1, "quoted field value");
  ok(names("del")[0].startsWith("Café") || names("del").length >= 1, "inside a word");
  ok(JSON.stringify(harmonicKeys("8a")) === JSON.stringify(["8A", "7A", "9A", "8B"]), "harmonicKeys 8a");
  ok(harmonicKeys("12B").includes("1B") && harmonicKeys("12B").includes("11B"), "harmonicKeys wraps 12 to 1");
  ok(harmonicKeys("x").length === 0, "harmonicKeys invalid");
  ok(searchTracks(lib, "key:8A,9A").length === 2, "a list of keys");
  ok(compatibleQuery({ camelot: "8A", bpm: 124 }) === "key:8A,7A,9A,8B bpm:117-131", "compatibleQuery");
  const ranked = searchTracks([{ name: "The One", addedAt: 1 }, { name: "One more", addedAt: 0 }, { name: "Someone", addedAt: 5 }], "one").map((t) => t.name);
  ok(ranked[0] !== "Someone", "a whole word beats the inside of a word");
}
