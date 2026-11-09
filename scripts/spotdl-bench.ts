// Deep check of the spotDL search on the real network: speed, relevance, robustness, against the YouTube tab.
// Run: npx tsx scripts/spotdl-bench.ts   (needs internet; not part of check-rules)
import { searchSpotdl, warmSpotdl } from "../lib/spotdl";
import { searchYouTube } from "../lib/youtube";

const ms = (t: number) => Math.round(performance.now() - t);
const KNOWN: [string, string, string][] = [
  ["daft punk one more time", "daft punk", "one more time"], ["fisher losing it", "fisher", "losing it"], ["angèle balance ton quoi", "angèle", "balance ton quoi"],
  ["stromae alors on danse", "stromae", "alors on danse"], ["david guetta titanium", "david guetta", "titanium"], ["avicii levels", "avicii", "levels"],
  ["bob sinclar love generation", "bob sinclar", "love generation"], ["justice d.a.n.c.e", "justice", "d.a.n.c.e"], ["kavinsky nightcall", "kavinsky", "nightcall"],
  ["dua lipa levitating", "dua lipa", "levitating"], ["the weeknd blinding lights", "the weeknd", "blinding lights"], ["calvin harris summer", "calvin harris", "summer"],
  ["martin garrix animals", "martin garrix", "animals"], ["swedish house mafia don't you worry child", "swedish house mafia", "worry child"], ["eric prydz call on me", "eric prydz", "call on me"],
  ["modjo lady", "modjo", "lady"], ["stardust music sounds better with you", "stardust", "music sounds better"], ["aya nakamura djadja", "aya nakamura", "djadja"],
  ["purple disco machine hypnotized", "purple disco machine", "hypnotized"], ["peggy gou starry night", "peggy gou", "starry night"], ["fred again marea", "fred again", "marea"],
  ["dj snake turn down for what", "dj snake", "turn down for what"], ["mylène farmer désenchantée", "mylène farmer", "désenchantée"], ["indochine j'ai demandé à la lune", "indochine", "lune"],
  ["michael jackson billie jean", "michael jackson", "billie jean"],
];
const DIRTY = /\b(live|lyrics?|paroles|karaoke|cover|clip|official video|vid[ée]o officielle|reaction|1 ?hour|slowed|sped up|8d)\b/i;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function main() {
  const out: Record<string, unknown> = {};
  let t = performance.now(); warmSpotdl(); await searchSpotdl("warm up query"); out.froid_ms = ms(t);
  const times: number[] = [];
  let top1 = 0, top3 = 0, dirty = 0, total = 0; const misses: string[] = [];
  for (const [q, artist, title] of KNOWN) {
    t = performance.now(); const r = await searchSpotdl(q); times.push(ms(t));
    const hit = (x: { artist: string; title: string }) => norm(x.artist).includes(norm(artist)) && norm(x.title).includes(norm(title));
    if (r[0] && hit(r[0])) top1++; else misses.push(`${q} -> ${r[0]?.artist} / ${r[0]?.title}`);
    if (r.slice(0, 3).some(hit)) top3++;
    dirty += r.slice(0, 10).filter((x) => DIRTY.test(x.title)).length; total += Math.min(10, r.length);
  }
  times.sort((a, b) => a - b);
  out.recherche_ms = { mediane: times[times.length >> 1], p90: times[Math.floor(times.length * 0.9)], max: times[times.length - 1] };
  out.pertinence = { top1: `${top1}/${KNOWN.length}`, top3: `${top3}/${KNOWN.length}`, ratesTop1: misses };
  out.titres_parasites_top10 = `${(100 * dirty / total).toFixed(1)} %`;
  t = performance.now(); await searchSpotdl("daft punk one more time"); out.cache_ms = ms(t);
  // "PLUS DE TITRES": the next page was fetched while the first one was read
  await searchSpotdl("daft punk"); await new Promise((r) => setTimeout(r, 2500));
  t = performance.now(); const p1 = await searchSpotdl("daft punk", 1); out.page2_apres_lecture = { ms: ms(t), n: p1.length };
  t = performance.now(); const p1b = await searchSpotdl("justice genesis", 1); out.page2_sans_attente = { ms: ms(t), n: p1b.length };
  t = performance.now(); const par = await Promise.all(["moderat a new error", "bicep glue", "caribou can't do without you", "ross from friends talk to me", "four tet baby", "jamie xx gosh"].map((q) => searchSpotdl(q))); out.six_en_parallele_ms = ms(t); out.six_resultats = par.map((r) => r.length);
  t = performance.now(); const same = await Promise.all([1, 2, 3].map(() => searchSpotdl("kungs this girl"))); out.trois_identiques = { ms: ms(t), meme_liste: same[0] === same[1] || JSON.stringify(same[0]) === JSON.stringify(same[2]) };
  const odd = ["", "   ", "a".repeat(400), "\"; rm -rf / ; '", "C'est la vie & co | <b>", "宇多田ヒカル first love", "\n\n"];
  out.entrees_bizarres = await Promise.all(odd.map(async (q) => { try { const r = await searchSpotdl(q); return r.length; } catch (e) { return "erreur: " + (e as Error).message; } }));
  // the worker dies in the middle of a search: that search fails cleanly, the next one works
  const { execSync } = await import("node:child_process");
  const doomed = searchSpotdl("worker crash test query unique 42");
  await new Promise((r) => setTimeout(r, 150));
  try { execSync("pkill -f scripts/spotdl_search.py"); } catch { /* none */ }
  out.pendant_arret = await doomed.then((r) => `ok ${r.length}`, (e) => `erreur propre: ${(e as Error).message}`);
  t = performance.now(); out.apres_redemarrage = await searchSpotdl("worker restart test unique 43").then((r) => `ok ${r.length} en ${ms(t)} ms`, (e) => `erreur: ${(e as Error).message}`);
  // the current YouTube tab, same first 10 queries
  const yt: number[] = []; let ytDirty = 0, ytTotal = 0, ytTop1 = 0;
  for (const [q, artist, title] of KNOWN.slice(0, 10)) {
    t = performance.now(); const r = await searchYouTube(q, { n: 20 } as never).catch(() => []); yt.push(ms(t));
    ytDirty += r.slice(0, 10).filter((x: { title: string }) => DIRTY.test(x.title)).length; ytTotal += Math.min(10, r.length);
    if (r[0] && norm(`${(r[0] as { artist?: string }).artist ?? ""} ${r[0].title}`).includes(norm(title)) && norm(`${(r[0] as { artist?: string }).artist ?? ""} ${r[0].title}`).includes(norm(artist))) ytTop1++;
  }
  yt.sort((a, b) => a - b);
  out.onglet_youtube_actuel = { mediane_ms: yt[yt.length >> 1], max_ms: yt[yt.length - 1], parasites_top10: `${(100 * ytDirty / Math.max(1, ytTotal)).toFixed(1)} %`, top1: `${ytTop1}/10` };
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}
main();
