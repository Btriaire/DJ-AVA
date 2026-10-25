import assert from "node:assert/strict";
import { artistOfName, composeShows, tempoGroups, isRelevant, normTitle, pickCandidates, suggestArtists, DEFAULT_PREFS, type YtResult } from "../lib/radio";
import type { LibTrack } from "../lib/library";

const yt = (id: string, title: string, artist = "Daft Punk - Topic", duration = 240): YtResult => ({ id, title, artist, duration, artwork: null });

// artist from a "Artist - Title" name
assert.equal(artistOfName("Daft Punk - One More Time"), "Daft Punk");
assert.equal(artistOfName("Titre sans tiret"), null);
assert.deepEqual(suggestArtists([{ name: "Air - Kelly" }, { name: "Air - Sexy Boy" }, { name: "Justice - D.A.N.C.E" }], ["justice"]), [{ name: "Air", count: 2 }]);

// the same song uploaded twice counts once; live, mixes, other artists and too long or short videos are dropped
const results = [
  yt("a", "Daft Punk - One More Time (Official Audio)"),
  yt("b", "Daft Punk - One More Time (Official Video)", "DaftPunkVEVO"),
  yt("c", "Daft Punk - Around The World (Live Alive 2007)"),
  yt("d", "Daft Punk Megamix", "DJ X"),
  yt("e", "Daft Punk - Digital Love", "Daft Punk - Topic", 301),
  yt("f", "Some Other Band - Hello", "Other"),
  yt("g", "Daft Punk - Intro", "Daft Punk - Topic", 60),
  yt("h", "Daft Punk - Get Lucky (Remix)"),
];
const picked = pickCandidates(results, "Daft Punk", 10).map((r) => r.id);
assert.deepEqual(picked.sort(), ["a", "e", "h"], "keeps the real songs once");
assert.equal(normTitle("Daft Punk - One More Time (Official Audio)", "Daft Punk"), normTitle("DAFT PUNK – One More Time [HD]", "Daft Punk"));
assert.ok(!isRelevant(yt("x", "Hello", "Other"), "Daft Punk"));
assert.deepEqual(pickCandidates(results, "Daft Punk", 10, new Set(["a"])).map((r) => r.id).includes("a"), false, "skips songs already taken");
assert.equal(pickCandidates(results, "Daft Punk", 2).length, 2, "honours the count");

// composition: a mix of everybody, plus one set per artist with 3 songs or more
const mk = (i: number, group: string): LibTrack => ({ id: "t" + i, name: "T" + i, source: "youtube", deck: null, addedAt: 0, bpm: 120 + i, camelot: `${(i % 12) + 1}A`, durationSec: 200, group });
const tracks = [...[0, 1, 2].map((i) => mk(i, "Air")), ...[3, 4].map((i) => mk(i, "Justice"))];
const prefs = { ...DEFAULT_PREFS, soloSets: true, durationMin: 0, artists: [{ id: "1", name: "Air", love: 2 as const }, { id: "2", name: "Justice", love: 1 as const }] };
const shows = composeShows(tracks, prefs, 0);
assert.equal(shows[0].key, "mix");
assert.equal(shows[0].trackIds.length, 5);
assert.deepEqual(shows.map((s) => s.key), ["mix", "solo-1"], "Justice has only 2 songs: no solo set");
assert.equal(composeShows(tracks.slice(0, 1), prefs, 0).length, 0, "one song is not a set");
// tempo zones: a gap in tempo splits the songs instead of forcing a jump
const tempo = (bpms: number[]): LibTrack[] => bpms.map((b, i) => ({ id: "b" + i, name: "B" + i, source: "youtube" as const, deck: null, addedAt: 0, bpm: b, camelot: "8A" }));
const zones = tempoGroups(tempo([95, 100, 103, 120, 121, 123, 123, 125, 128, 130, 112, 112, 112]));
assert.ok(zones[0].every((t) => t.bpm! >= 112 && t.bpm! <= 129), "the biggest zone is the 112-128 one");
assert.ok(zones[0].length >= 8);
assert.equal(tempoGroups(tempo([100, 101, 102])).length, 0, "too few songs for a zone: the caller falls back to everything");
assert.ok(composeShows(tempo([100, 101, 102]), prefs, 0)[0].trackIds.length === 3, "small pools are still composed");
console.log("radio ok");
