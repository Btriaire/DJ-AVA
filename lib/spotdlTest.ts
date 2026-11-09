// Fixed contract of the spotDL search: pages, cache keys, and the wiring of the tab (no network here)
import { existsSync, readFileSync } from "node:fs";
import { SPOTDL_PAGES, cacheKey, pageSlice, rankClean, spotdlLimit } from "./spotdl";
import { searchUrl } from "./searchMore";
import { thumbSrc } from "./thumb";

export function spotdlTest(): string[] {
  const fails: string[] = [];
  const check = (ok: boolean, m: string) => { if (!ok) fails.push(m); };
  // the first 20 come back in about half a second; each later page is fetched ahead in the background
  check(SPOTDL_PAGES.join() === "20,60,120,200,300", "page limits");
  check(spotdlLimit(0) === 20 && spotdlLimit(1) === 60 && spotdlLimit(4) === 300, "each page asks for its limit");
  check(spotdlLimit(99) === 300 && spotdlLimit(-3) === 20, "bounded pages");
  const list = Array.from({ length: 150 }, (_, i) => i);
  check(pageSlice(list, 0).length === 20 && pageSlice(list, 0)[0] === 0, "first page: 20");
  check(pageSlice(list, 1).length === 40 && pageSlice(list, 1)[0] === 20, "second page: the next 40");
  check(pageSlice(list, 3).length === 30 && pageSlice(list, 3)[0] === 120, "a short page");
  check(pageSlice(list, 4).length === 0, "past the end");
  // live, lyrics, karaoke versions go after the studio ones, in their order
  const tr = (title: string) => ({ title });
  check(rankClean([tr("A (Live)"), tr("B"), tr("C lyrics"), tr("D"), tr("E Paroles")]).map((x) => x.title).join() === "B,D,A (Live),C lyrics,E Paroles", "studio versions first");
  check(rankClean([tr("Alive"), tr("Delivery")]).map((x) => x.title).join() === "Alive,Delivery", "a word that only contains live is not a live version");
  check(rankClean([]).length === 0, "empty");
  check(cacheKey("  Daft   PUNK  ") === cacheKey("daft punk"), "the cache ignores case and spaces");
  check(cacheKey("daft punk") !== cacheKey("daft punks"), "different searches, different keys");
  check(searchUrl("spotdl", "a b", 0) === "/api/spotdl/search?q=a%20b" && searchUrl("spotdl", "x", 2) === "/api/spotdl/search?q=x&page=2", "the tab asks the spotDL route");

  // YouTube Music covers are served at the size shown (twice it for sharp screens), at most 544
  const g = "https://yt3.googleusercontent.com/abc=w544-h544-l90-rj";
  check(thumbSrc(g, 64) === "https://yt3.googleusercontent.com/abc=w128-h128-l90-rj", "a 64 px cover asks for 128 px");
  check(thumbSrc(g, 400) === "https://yt3.googleusercontent.com/abc=w544-h544-l90-rj", "never more than 544");
  check(thumbSrc("https://lh3.googleusercontent.com/x=w60-h60", 52) === "https://lh3.googleusercontent.com/x=w104-h104", "lh3 too");
  check(thumbSrc("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", 64) === "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg", "YouTube covers as before");
  check(thumbSrc("data:image/jpeg;base64,xx", 64) === "data:image/jpeg;base64,xx" && thumbSrc(undefined, 64) === undefined, "other covers untouched");
  const read = (p: string) => readFileSync(p, "utf8");
  check(existsSync("app/api/spotdl/search/route.ts"), "the route exists");
  const py = read("scripts/spotdl_search.py");
  check(py.includes("get_ytm_client") && py.includes('filter="songs"'), "the worker searches songs through spotDL");
  check(py.includes("ThreadPoolExecutor"), "several searches run at once");
  check(!/client_id|client_secret/.test(py), "no Spotify credentials: they are rate-limited for everyone");
  const lib = read("lib/spotdl.ts");
  check(lib.includes(".venv-spotdl") && lib.includes("spotdl_search.py"), "the project's own spotDL");
  const ml = read("components/MediaLibrary.tsx");
  check((ml.match(/"spotdl"/g) ?? []).length >= 6, "the spotDL tab is in the search");
  check(ml.includes("(t.source ?? tab) as TrackSource"), "a result plays and saves as the YouTube track it is");
  check(ml.includes("/api/spotdl/search?warm=1"), "opening the tab warms spotDL up");
  check(ml.includes("src={thumbSrc(t.artwork ?? undefined, 64) ?? \"\"}"), "the result list loads small covers");
  // googleusercontent refuses covers asked with the app as referrer: every cover image goes without one
  for (const f of ["components/MediaLibrary.tsx", "components/PlatineView.tsx", "components/playlist/ArtistSearch.tsx"]) for (const tag of read(f).match(/<img [^>]*>/g) ?? []) if (/art|cover|thumb/i.test(tag)) check(tag.includes('referrerPolicy="no-referrer"'), `${f}: a cover image sends a referrer`);
  return fails;
}
