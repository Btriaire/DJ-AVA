import assert from "node:assert/strict";
import { djFor, isGentle, plainOrder, artistOfName, composeShows, tempoGroups, isRelevant, normTitle, pickCandidates, suggestArtists, DEFAULT_PREFS, type YtResult } from "../lib/radio";
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
// advanced options: tempo window, versions, artist rule, plan per show
const advanced = { ...prefs, tempoMin: 0, tempoMax: 0, avoidUsed: false, maxShows: 1 as const };
const wide = [100, 102, 104, 106, 108, 110, 140, 142, 144, 146, 148, 150].map((b, i): LibTrack => ({ id: "w" + i, name: "W" + i, source: "youtube", deck: null, addedAt: 0, bpm: b, camelot: "8A", durationSec: 200, group: i % 2 ? "A" : "B" }));
assert.equal(composeShows(wide, { ...advanced, soloSets: false }, 0).length, 1, "maxShows 1: one tempo zone only");
assert.equal(composeShows(wide, { ...advanced, soloSets: false, maxShows: 2 }, 0).length, 2, "two zones: two mixes");
const windowed = composeShows(wide, { ...advanced, soloSets: false, tempoMin: 140 }, 0)[0];
assert.ok(windowed.trackIds.every((id) => Number(id.slice(1)) >= 6), "tempo window keeps only 140+");
assert.equal(windowed.plan.length, windowed.trackIds.length - 1, "one plan step per transition");
const used = new Set(["w0", "w1", "w2", "w3", "w4", "w5"]);
const avoided = composeShows(wide, { ...advanced, soloSets: false, avoidUsed: true }, 0, used);
assert.ok(avoided.every((s) => s.trackIds.every((id) => !used.has(id))), "songs already in a set are left out");
const alt = composeShows(wide, { ...advanced, soloSets: false, mixArtists: "alternate", tempoSpread: 15 }, 0)[0];
const grp = (id: string) => wide.find((t) => t.id === id)!.group;
let sameInARow = 0;
alt.trackIds.forEach((id, i) => { if (i && grp(id) === grp(alt.trackIds[i - 1])) sameInARow++; });
assert.ok(sameInARow <= 1, `artists alternate (${sameInARow} repeats)`);
const orig = pickCandidates([yt("o1", "Daft Punk - Around The World"), yt("o2", "Daft Punk - Around The World (Hardwell Remix)")], "Daft Punk", 5, new Set(), { version: "original" });
assert.deepEqual(orig.map((r) => r.id), ["o1"]);
const rmx = pickCandidates([yt("o1", "Daft Punk - Around The World"), yt("o2", "Daft Punk - Around The World (Hardwell Remix)")], "Daft Punk", 5, new Set(), { version: "remix" });
assert.deepEqual(rmx.map((r) => r.id), ["o2"]);
assert.equal(pickCandidates([yt("l", "Daft Punk - Veridis Quo", "Daft Punk - Topic", 400)], "Daft Punk", 5, new Set(), { maxSec: 300 }).length, 0, "max length honoured");
// guests do not make a different song; a remix does
assert.equal(normTitle("Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams, Nile Rodgers", "Daft Punk"), normTitle("Daft Punk - Get Lucky (Feat. Pharrell Williams)", "Daft Punk"));
const dup = ["Daft Punk - Get Lucky (Official Audio) ft. Pharrell", "Daft Punk - Get Lucky (Feat. Pharrell Williams)", "Daft Punk - Get Lucky (Hardwell Remix)", "Daft Punk - Digital Love", "Daft Punk - Aerodynamic", "Daft Punk - Robot Rock"].map((n, i): LibTrack => ({ id: "d" + i, name: n, source: "youtube", deck: null, addedAt: 0, bpm: 120 + i, camelot: "8A", durationSec: 200, group: "Daft Punk" }));
assert.equal(composeShows(dup, { ...advanced, soloSets: false, durationMin: 0 }, 0)[0].trackIds.length, 5, "the duplicate upload is dropped, the remix kept");
// kinds of recording: each search keeps only titles of the wanted kind
const kinds = [yt("k1", "Daft Punk - Around The World (Official Audio)"), yt("k2", "Daft Punk - Around The World (Live at Coachella)"), yt("k3", "Daft Punk - Around The World (Instrumental)"), yt("k4", "Daft Punk - Around The World (Acapella)"), yt("k5", "Daft Punk - Around The World (Karaoke Instrumental)"), yt("k6", "Daft Punk - Around The World (Acoustic Version)")];
const ids = (content: "studio" | "live" | "instrumental" | "acapella" | "acoustic") => pickCandidates(kinds.map((k, i) => ({ ...k, title: k.title + " " + "x".repeat(0), id: k.id })), "Daft Punk", 9, new Set(), { content }).map((r) => r.id);
assert.deepEqual(ids("studio").sort(), ["k1"]);
assert.deepEqual(ids("live"), ["k2"]);
assert.deepEqual(ids("instrumental"), ["k3"], "karaoke is not an instrumental");
assert.deepEqual(ids("acapella"), ["k4"]);
assert.deepEqual(ids("acoustic"), ["k6"]);
assert.equal(pickCandidates([yt("l1", "Daft Punk - Alive (Live)", "Daft Punk", 600)], "Daft Punk", 5, new Set(), { content: "live", maxSec: 480 }).length, 1, "a concert may run longer");
// classical radio: one programme, a classical plan (no beat-matching), whatever the tempos
const classic = ["Bach", "Bach", "Bach", "Bach", "Bach"].map((g, i): LibTrack => ({ id: "c" + i, name: "Bach - piece " + i, source: "youtube", deck: null, addedAt: 0, bpm: [60, 72, 100, 130, 80][i], camelot: `${i + 1}A`, durationSec: 360, group: g }));
const cs = composeShows(classic, { ...prefs, mode: "classical", durationMin: 0, soloSets: false }, 0);
assert.equal(cs.length, 1, "no tempo zones for a concert");
assert.ok(cs[0].name.includes("Classique"));
assert.ok(cs[0].plan.every((st) => st.type === "smooth" && !st.sync && !st.bassSwap));
// no analysis: songs without tempo still make a set, artists take turns, length is honoured
const bare = ["A", "A", "A", "B", "B", "C"].map((g, i): LibTrack => ({ id: "n" + i, name: `${g} - t${i}`, source: "youtube", deck: null, addedAt: 0, durationSec: 240, group: g }));
const ps = composeShows(bare, { ...prefs, analysis: "none", durationMin: 0, soloSets: false, mixArtists: "alternate" }, 0);
assert.equal(ps.length, 1);
assert.equal(ps[0].trackIds.length, 6, "every song is used");
assert.deepEqual(ps[0].trackIds.slice(0, 3).map((id) => bare.find((t) => t.id === id)!.group).sort(), ["A", "B", "C"], "artists alternate");
assert.ok(plainOrder(bare, 8, 1, "free").length <= 3, "stops at the asked length");
assert.equal(plainOrder(bare, 0, 3, "blocks").join(","), plainOrder(bare, 0, 3, "blocks").join(","), "deterministic for a seed");
// styles and collections
import { COLLECTIONS, STYLES, findCollection, pickSongs } from "../lib/styles";
assert.ok(STYLES.every((st) => st.artists.length >= 5) && COLLECTIONS.every((c) => c.songs.length >= 8));
const col = findCollection("hits des années 80")!;
assert.equal(pickSongs(col, 4, 0).length, 4);
assert.notDeepEqual(pickSongs(col, 4, 0), pickSongs(col, 4, 1), "another offset gives other songs");
// zen and calm: one soft programme, a classical plan (long blends, no beat-matching), whatever the tempos
const zenTracks = ["Brian Eno", "Marconi Union", "Max Richter", "Hammock", "Brian Eno", "Max Richter"].map((g, i): LibTrack => ({ id: "z" + i, name: `${g} - piece ${i}`, source: "youtube", deck: null, addedAt: 0, bpm: [70, 90, 128, 60, 100, 80][i], camelot: `${i + 1}A`, durationSec: 420, group: g }));
for (const mode of ["zen", "calm"] as const) {
  const zs = composeShows(zenTracks, { ...prefs, mode, durationMin: 0, soloSets: false }, 0);
  assert.equal(zs.length, 1, `${mode}: no tempo zones`);
  assert.ok(zs[0].plan.every((st) => st.type === "smooth" && !st.sync && !st.bassSwap && st.sec >= 5), `${mode}: soft blends only`);
  assert.equal(djFor({ ...prefs, mode }).style, "classical");
  assert.ok(isGentle({ mode }));
}
assert.ok(!isGentle({ mode: "style" }) && !isGentle({ mode: "artists" }));
import { CALM_COLLECTIONS, ZEN_COLLECTIONS } from "../lib/styles";
assert.ok(ZEN_COLLECTIONS.every((c) => c.genre === "zen" && c.songs.length >= 8) && CALM_COLLECTIONS.every((c) => c.genre === "calm" && c.songs.length >= 8));
assert.equal(findCollection("piano calme")?.genre, "calm", "zen and calm lists are found by name");
// a style typed instead of an artist: most-watched first, no name needed in the title, two songs per channel at most
const pop = (id: string, title: string, artist: string, views?: number): YtResult => ({ id, title, artist, duration: 240, artwork: null, views });
const topicRes = [pop("t1", "Quiet Waves", "Chan A", 1_000), pop("t2", "Calm Forest", "Chan B", 9_000_000), pop("t3", "Deep Rest", "Chan C", 500_000), pop("t4", "Sleepy Rain", "Chan B", 8_000_000), pop("t5", "Soft Dawn", "Chan B", 7_000_000), pop("t6", "Long Mix 1 hour", "Chan D", 99_000_000)];
const topicPick = pickCandidates(topicRes, "", 4, new Set(), { topic: true }).map((r) => r.id);
assert.deepEqual(topicPick, ["t2", "t4", "t3", "t1"], "most watched first, a mix of one hour left out, two songs per channel at most");
assert.deepEqual(pickCandidates(topicRes, "", 2, new Set(["t2"]), { topic: true }).map((r) => r.id), ["t4", "t5"], "songs already taken are not proposed again");
assert.equal(pickCandidates(topicRes, "Daft Punk", 5).length, 0, "an artist radio still needs the name in the title");
// a typed style is answered with the lists made for it, before any search
import { curatedFor } from "../lib/styles";
const cf = (t: string) => curatedFor(t);
assert.equal(cf("zen").collections.length, 4);
assert.ok(cf("zen").collections.every((c) => c.genre === "zen"));
assert.ok(cf("Méditation").collections.every((c) => c.genre === "zen") && cf("musique relaxante ambient").collections.length === 4);
assert.ok(cf("piano relaxant").collections.length === 4 && cf("piano relaxant").collections.every((c) => c.genre === "calm"), "a piano request is a calm one");
assert.deepEqual(cf("piano de film").collections.map((c) => c.key), ["calm-cinema"]);
assert.ok(cf("musique pour dormir").collections.some((c) => c.key === "zen-sleep"));
assert.ok(cf("rock années 80").collections.map((c) => c.key).includes("80s"));
assert.equal(cf("jazz").collections.length, 0);
assert.equal(cf("jazz").style?.key, "jazz");
assert.equal(cf("rap français").style?.key, "rap-fr");
assert.equal(cf("bossa nova").style, undefined, "unknown: searched by popularity");
assert.equal(cf("popular songs").style, undefined, "pop is a word, not the start of popular");
console.log("radio ok");
