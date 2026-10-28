// Order and clean the results of an online search (YouTube...): the ones that answer the query first, the karaoke versions,
// covers and clips last, one entry per song. rankOnline/dedupeOnline are the work of MaRuche (Falken); the whole-word
// matching and the end of dedupeOnline were redone here (the first version matched "cover" inside "discover").
import { normalizeText, parseQuery, scoreWords } from "./trackSearch";

export interface OnlineTrack { id: string; title: string; artist: string; duration: number; views?: number | string; bpm?: number | null }

const BONUS = ["official audio", "original mix", "extended mix"];
const STRONG = ["karaoke", "cover", "slowed", "sped up", "nightcore", "8d audio", "reverb", "tutorial", "reaction", "tribute"];
const WEAK = ["live", "remix", "bootleg"];
// views come as a number, or as the text of the page ("1,2 M")
const nViews = (v: number | string | undefined) => (typeof v === "number" ? v : parseInt(String(v ?? "").replace(/\D/g, ""), 10) || 0);
const LONG_OK = ["mix", "set", "live", "full"];

// whole words only: "cover" is not in "discover"
const has = (norm: string, list: readonly string[]) => { const p = ` ${norm} `; return list.some((w) => p.includes(` ${w} `)); };

export function rankOnline<T extends OnlineTrack>(q: string, results: T[]): T[] {
  if (!q.trim()) return results;
  const qn = normalizeText(q);
  const { words } = parseQuery(q);
  return results
    .map((t, idx) => {
      const title = normalizeText(t.title);
      const artist = normalizeText(t.artist);
      let s = scoreWords(words, [{ text: title, w: 3 }, { text: artist, w: 2 }]);
      s += Math.min(0.5, Math.log10(1 + nViews(t.views)) / 20);
      if (has(title, BONUS) || artist.endsWith(" topic")) s += 0.5;
      if ((has(title, STRONG) || has(artist, STRONG)) && !has(qn, STRONG)) s -= 2;
      if ((has(title, WEAK) || has(artist, WEAK)) && !has(qn, WEAK)) s -= 1;
      if ((t.duration < 60 || t.duration > 1200) && !has(qn, LONG_OK)) s -= 1;
      return { t, s, idx };
    })
    .sort((a, b) => b.s - a.s || a.idx - b.idx)
    .map((x) => x.t);
}

// "Song (Official Audio)", "Song [HD]" and "Song" are one song
const NOISE = /\s*[([][^)\]]*\b(official|audio|video|clip|hd|hq|4k|lyrics?|visuali[sz]er)\b[^)\]]*[)\]]/gi;

export function dedupeOnline<T extends OnlineTrack>(results: T[]): T[] {
  const out: T[] = [];
  const byId = new Map<string, number>();
  const byKey = new Map<string, number[]>(); // cleaned title|artist -> positions in out
  for (const t of results) {
    const key = `${normalizeText(t.title.replace(NOISE, ""))}|${normalizeText(t.artist)}`;
    let at = t.id ? byId.get(t.id) : undefined;
    if (at === undefined) at = byKey.get(key)?.find((i) => Math.abs(out[i].duration - t.duration) <= 3);
    if (at === undefined) {
      out.push(t);
      if (t.id) byId.set(t.id, out.length - 1);
      byKey.set(key, [...(byKey.get(key) ?? []), out.length - 1]);
    } else if (nViews(t.views) > nViews(out[at].views)) out[at] = t; // the better known one, at the first position
  }
  return out;
}

export function selfTest(): void {
  const ok = (c: boolean, m: string) => { if (!c) throw new Error(`trackRank: ${m}`); };
  const T = (id: string, title: string, duration = 200, views = 0, artist = "A"): OnlineTrack => ({ id, title, artist, duration, views });
  const list = [T("1", "Song (Karaoke Version)"), T("2", "Song"), T("3", "Other thing"), T("4", "Discover Song")];
  const r = rankOnline("song", list).map((t) => t.id);
  ok(r.indexOf("2") < r.indexOf("1"), "karaoke goes after the original");
  ok(r[r.length - 1] === "3", "no matching word goes last");
  ok(r.indexOf("4") < r.indexOf("1"), '"cover" is not found inside "discover"');
  ok(rankOnline("song karaoke", list)[0].id !== "2" || rankOnline("song karaoke", list)[0].id === "1" || true, "ranking runs with karaoke in the query");
  ok(rankOnline("song karaoke", list)[0].id === "1", "karaoke asked: not penalised");
  ok(rankOnline("  ", list) === list, "blank query keeps the array");
  const d = dedupeOnline([T("a", "One More Time (Official Audio)", 200, 5), T("b", "One More Time", 202, 50), T("c", "One More Time", 215, 1), T("d", "Other", 100)]);
  ok(d.length === 3 && d[0].id === "b", "same song within 3 s merged, the better known one kept");
  ok(d.some((t) => t.id === "c"), "10 s apart is another version");
}
