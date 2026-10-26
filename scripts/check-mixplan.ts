import assert from "node:assert/strict";
import { announcement, cleanTitle, planMix, planStep, tempoGap, DEFAULT_DJ } from "../lib/mixPlan";
import type { LibTrack } from "../lib/library";

const t = (bpm: number, camelot: string, extra: Partial<LibTrack> = {}): LibTrack => ({ id: `${bpm}${camelot}`, name: "X", source: "youtube", deck: null, addedAt: 0, bpm, camelot, durationSec: 240, ...extra });

// same tempo + friendly keys: long smooth blend, beat-matched, bass swap
let s = planStep(t(124, "8A"), t(125, "9A"), "peak");
assert.equal(s.type, "smooth");
assert.ok(s.sync && s.bassSwap && s.sec >= 12);
// same tempo but clashing keys: the filter hides it
assert.equal(planStep(t(124, "8A"), t(124, "3B"), "peak").type, "filter");
// a 15 % jump: an effect takes the old song away (rotating), or a bare cut when effects are off
s = planStep(t(100, "8A"), t(115, "8A"), "peak");
assert.equal(s.type, "echo");
assert.ok(!s.sync && !s.bassSwap && s.sec > 0);
assert.deepEqual([0, 1, 2, 3].map((i) => planStep(t(100, "8A"), t(115, "8A"), "peak", DEFAULT_DJ, i).type), ["echo", "brake", "wash", "reverse"]);
s = planStep(t(100, "8A"), t(115, "8A"), "peak", { ...DEFAULT_DJ, tails: false });
assert.equal(s.type, "cut");
assert.ok(!s.sync && s.sec === 0);
// clashing keys at the same tempo alternate low-pass and high-pass filters; friendly ones sometimes loop out
const NO_FX = { ...DEFAULT_DJ, force: 2 as const }; // force 2: no effect on the changes
assert.equal(planStep(t(124, "8A"), t(124, "3B"), "peak", NO_FX, 1).type, "highpass");
assert.equal(planStep(t(124, "8A"), t(125, "8A"), "flow", NO_FX, 4).type, "loop");
assert.ok([0, 1, 2, 3, 4, 5].filter((i) => !["smooth", "fade", "filter", "highpass", "loop"].includes(planStep(t(124, "8A"), t(125, "9A"), "flow", DEFAULT_DJ, i).type)).length === 2, "force 3: an effect on one change in three");
// double time folds onto the same beat and is not synced
assert.ok(tempoGap(65, 130).folded && Math.abs(tempoGap(65, 130).pct) < 1);
assert.equal(planStep(t(65, "8A"), t(130, "8A"), "flow").sync, false);
assert.equal(planStep(t(65, "8A"), t(130, "8A"), "flow").type, "echo");
// options switch the extras off; a rise tightens, a fall loosens
assert.ok(!planStep(t(124, "8A"), t(125, "8A"), "flow", { ...DEFAULT_DJ, sync: false, bassSwap: false }).sync);
assert.ok(planStep(t(124, "8A"), t(125, "8A"), "rise").sec < planStep(t(124, "8A"), t(125, "8A"), "fall").sec);
// short songs never get a blend longer than a fifth of them
assert.ok(planStep(t(124, "8A", { durationSec: 60 }), t(125, "8A"), "flow").sec <= 15);
// manual steps survive a re-plan
const tracks = [t(120, "8A"), t(121, "8A"), t(122, "9A")];
const first = planMix(tracks, "flow");
first[0] = { ...first[0], type: "cut", sec: 0, manual: true };
assert.equal(planMix(tracks, "flow", DEFAULT_DJ, first)[0].type, "cut");
assert.equal(planMix(tracks, "flow").length, 2);
// announcements
assert.equal(cleanTitle("Justice - Genesis (Official Audio)", "Justice"), "Genesis");
assert.equal(announcement(t(120, "8A", { name: "Justice - Genesis (Official Audio)", group: "Justice" }), "discret"), "Genesis, de Justice");
assert.ok(announcement(t(120, "8A", { name: "Justice - Genesis", group: "Justice" }), "radio", true).startsWith("Bienvenue"));
// key fix: a clash with the same tempo is repaired by transposing the incoming song, when asked
import { shiftCamelot } from "../lib/camelot";
import { djLineFor, djLinesForShow, INTRO_LINE, OUTRO_LINE } from "../lib/djLines";
import { matchTrimDb } from "../lib/audio/levelMatch";
assert.equal(shiftCamelot("8A", 1), "3A");
assert.equal(shiftCamelot("8A", -1), "1A");
assert.equal(shiftCamelot("8B", 0), "8B");
const clash = [t(124, "8A"), t(124, "3A")]; // 3A is a semitone above 8A on the wheel... and 3A vs 8A clash
const fixed = planMix(clash, "flow", { ...DEFAULT_DJ, keyFix: true });
assert.equal(fixed[0].keyShift, -1, "3A transposed down a semitone becomes 8A");
assert.equal(planMix(clash, "flow", DEFAULT_DJ)[0].keyShift, undefined, "off by default");
// the running shift of a transposed song is its key for the next transition
const chain = planMix([t(124, "8A"), t(124, "3A"), t(124, "10A")], "flow", { ...DEFAULT_DJ, keyFix: true });
assert.equal(chain.length, 2);
// hard cuts get a brake, unless switched off
assert.equal(planStep(t(100, "8A"), t(120, "8A"), "flow", { ...DEFAULT_DJ, tails: false }).type, "cut");

// loudness trim: cut at most 6 dB, boost at most 3 dB
assert.equal(matchTrimDb(-10, 0, -20), 3);
assert.equal(matchTrimDb(-20, 0, -10), -6);
assert.equal(matchTrimDb(-14, 0, -15), 1);
// DJ lines: frequency, styles, intro/outro
const songs = [t(120, "8A", { name: "Justice - Genesis (Official Audio)", group: "Justice" }), t(121, "8A", { name: "Justice - D.A.N.C.E", group: "Justice" }), t(122, "8A", { name: "Air - Sexy Boy", group: "Air" })];
const radio = { ...DEFAULT_DJ, voice: "radio" as const };
assert.equal(djLineFor(songs, 0, radio), "Let's start with Justice, with Genesis.");
assert.equal(djLineFor(songs, 1, { ...radio, voiceEvery: 0 }), null, "same artist: not announced");
assert.ok(djLineFor(songs, 2, { ...radio, voiceEvery: 0 })!.includes("Air, with Sexy Boy"));
assert.equal(djLineFor(songs, 1, { ...radio, voiceEvery: 2 }), null);
assert.equal(djLineFor(songs, 0, { ...DEFAULT_DJ, voice: "off" }), null);
assert.equal(djLineFor(songs, 2, { ...DEFAULT_DJ, voice: "discret" }), "Air, with Sexy Boy.");
const all = djLinesForShow(songs, radio);
assert.equal(all[0], INTRO_LINE);
assert.equal(all[all.length - 1], OUTRO_LINE);
assert.equal(new Set(all).size, all.length, "no duplicate clip");
// classical style: soft, long, never synced, whatever the tempos say
const cl = planStep(t(60, "8A", { durationSec: 600 }), t(140, "3B", { durationSec: 600 }), "flow", { ...DEFAULT_DJ, style: "classical" });
assert.equal(cl.type, "smooth");
assert.ok(!cl.sync && !cl.bassSwap && cl.tail === "none" && cl.sec >= 10 && cl.sec <= 14);
// force of the DJ: 1-2 never use effects, 5 puts one on every change, 4 on every other one
import { applyForce, accentDue, amountFor, fitsEffect, isCalm, pickAccent, PROFILE, FORCES, type Feel } from "../lib/djForce";
const a = t(124, "8A"), b2 = t(125, "9A");
for (const f of [1, 2] as const) assert.ok(!["echo", "dub", "wash", "flanger", "gate", "noise", "roll", "brake", "reverse", "drop"].includes(planStep(a, b2, "flow", applyForce(DEFAULT_DJ, f), 0).type), `force ${f}: no effect blend`);
const types = (f: 1 | 2 | 3 | 4 | 5) => [0, 1, 2, 3, 4, 5].map((i) => planStep(a, b2, "flow", applyForce(DEFAULT_DJ, f), i).type);
assert.ok(types(5).every((x) => !["smooth", "fade", "filter", "cut"].includes(x)), `force 5: an effect every time (${types(5)})`);
assert.equal(types(4).filter((x) => !["smooth", "fade", "filter", "cut"].includes(x)).length, 3, "force 4: every other one");
assert.ok(new Set(types(5)).size >= 5, "force 5: varied effects");
// blends can be long: a 3x blend of a long song goes past the old 20 s limit, but never beyond a quarter of the song
const long = planStep(t(124, "8A", { durationSec: 600 }), t(125, "8A", { durationSec: 600 }), "flow", { ...DEFAULT_DJ, force: 1, blend: "xlong" }, 0);
assert.ok(long.sec > 20 && long.sec <= 60, `xlong blend ${long.sec}`);
assert.ok(planStep(t(124, "8A", { durationSec: 100 }), t(125, "8A", { durationSec: 100 }), "flow", { ...DEFAULT_DJ, blend: "xlong" }, 0).sec <= 25, "short songs: a quarter at most");
assert.ok(planStep(a, b2, "flow", { ...DEFAULT_DJ, force: 1, blend: "short" }, 0).sec < planStep(a, b2, "flow", { ...DEFAULT_DJ, force: 1, blend: "normal" }, 0).sec);
// the forces switch the options on in order of power
assert.equal(applyForce(DEFAULT_DJ, 1).sync, false);
assert.equal(applyForce(DEFAULT_DJ, 5).keyFix, true);
assert.equal(applyForce(DEFAULT_DJ, 4).stems, "punchy");
// interventions during a song: more often as the force grows, never at the start or near the transition, stems moves need stems
const every = FORCES.map((f) => PROFILE[f].everyBars);
assert.deepEqual(every, [32, 20, 12, 6, 4]);
assert.ok(FORCES.every((f, i) => i === 0 || (PROFILE[f].amount > PROFILE[FORCES[i - 1]].amount && PROFILE[f].len >= PROFILE[FORCES[i - 1]].len)), "stronger and longer with the force");
assert.ok(PROFILE[5].amount >= 1 && PROFILE[5].len >= 2, "force 5 is clearly audible");
assert.equal(accentDue(5, 10, 0, 5, 200, 10), false, "not in the first seconds");
assert.equal(accentDue(5, 10, 0, 60, 20, 10), false, "not just before the transition");
assert.equal(accentDue(5, 10, 0, 60, 120, 10), true);
assert.equal(accentDue(1, 10, 0, 60, 120, 10), false, "force 1: rare");
const NEED_STEMS = ["drumsout", "vocalecho", "bassdrop", "drumsolo", "vocalsolo", "voiceout", "otherout"];
const FOUR = ["drums", "bass", "other", "vocals"];
for (let n = 0; n < 20; n++) assert.ok(!NEED_STEMS.includes(pickAccent(5, n, false)!), "no stem move without stems");
assert.ok(new Set(Array.from({ length: 40 }, (_, n) => pickAccent(5, n, true))).size >= 14, "force 5: varied moves");
assert.equal(pickAccent(1, 3, true), "filterbreath");
// the DJ reads the song: no fast effect on a calm song, no roll or gate at a slow tempo, classical gets the softest moves
const moves = (force: 1 | 2 | 3 | 4 | 5, feel: Feel) => new Set(Array.from({ length: 30 }, (_, n) => pickAccent(force, n, feel)));
const SPEEDY = ["gatechop", "roll", "noiseburst", "flangersweep", "drumsolo", "drumsout", "bassdrop"];
const slow = moves(5, { bpm: 72, stems: ["drums", "bass", "other", "vocals"] });
for (const k of SPEEDY) assert.ok(!slow.has(k as never), `${k} refused at 72 BPM`);
assert.ok(slow.has("reverbwash") && slow.has("vocalecho"), "gentle moves stay");
assert.ok(moves(5, { bpm: 128, stems: ["drums", "bass", "other", "vocals"] }).has("roll"), "roll fits a 128 BPM song");
const calmPiece = moves(5, { bpm: 60, classical: true, stems: ["drums", "bass", "other", "vocals"] });
assert.ok([...calmPiece].every((k) => ["filterbreath", "reverbwash", "echothrow", "vocalecho", "echoexit", "freezehold"].includes(k!)), "classical: soft moves only");
assert.ok(!moves(5, { bpm: 128, stems: ["other"] }).has("drumsolo" as never), "a stem move needs its stem");
assert.ok(isCalm({ bpm: 80 }) && !isCalm({ bpm: 120 }) && amountFor(1, { bpm: 80 }) < 1 && accentDue(5, 6, 0, 60, 120, 10, true) === true && accentDue(5, 5, 0, 60, 120, 10, true) === false, "calm songs: gentler and rarer");
// transitions: effects must suit the tempos of the two songs
assert.ok(!fitsEffect("roll", 90, 100) && fitsEffect("roll", 120, 128) && !fitsEffect("gate", 98, 100) && fitsEffect("echo", 60, 70));
for (let i = 0; i < 12; i++) assert.ok(!["roll", "gate", "noise", "drop", "flanger"].includes(planStep(t(80, "8A"), t(82, "8A"), "flow", applyForce(DEFAULT_DJ, 5), i).type), "slow pair: no fast effect");
// stem techniques: drum-on-drum needs a shared beat and a lively tempo, a slammed bass needs one too; a calm pair stays soft
import { pickTech, stemFrame } from "../lib/stemMix";
const both = { outStems: true, inStems: true, mode: "punchy" as const, type: "smooth" as const, sec: 12 };
const techs = (o: { bpm?: number; sync?: boolean }) => new Set(Array.from({ length: 10 }, (_, index) => pickTech({ ...both, index, ...o })));
assert.ok(techs({ bpm: 126, sync: true }).has("drumbridge"), "drum bridge on a lively synced pair");
assert.ok(!techs({ bpm: 126, sync: false }).has("drumbridge") && !techs({ bpm: 126, sync: false }).has("drumswap"), "no drums on drums without a shared beat");
assert.ok(![...techs({ bpm: 75, sync: true })].some((x) => ["drumbridge", "drumswap", "bassslam"].includes(x!)), "calm pair: soft techniques only");
const mid = stemFrame("drumbridge", 0.5, "punchy");
assert.ok((mid.out.drums ?? 0) > 0.9 && (mid.inn.drums ?? 0) > 0.9 && (mid.out.bass ?? 1) < 0.1 && (mid.inn.bass ?? 1) < 0.1, "midway only the two drums play");
// styles: each one has its own effects, and a stem-ready song gets its stems used on every other move
import { GENRES, genreOf, pickTransitionMove, transitionPalette, type Genre } from "../lib/djForce";
const g = (genre: Genre, bpm = 124) => moves(5, { bpm, genre, stems: FOUR });
assert.ok(g("club").has("riserbuild" as never) && g("club").has("roll" as never), "club: risers and rolls");
assert.ok(!g("pop").has("roll" as never) && !g("pop").has("gatechop" as never), "pop: no roll or gate");
assert.ok(g("hiphop").has("tapestop" as never) && !g("hiphop").has("noiseburst" as never), "hip-hop: tape stop, no riser noise");
assert.ok(g("dub", 80).has("dubthrow" as never) && g("dub", 80).has("echoexit" as never), "dub: echoes");
assert.ok(g("disco").has("phaserswirl" as never) && !g("disco").has("roll" as never), "disco: phaser, no roll");
assert.ok([...g("chill", 120)].every((k) => ["reverbwash", "echothrow", "echoexit", "filterbreath", "phaserswirl", "panswing", "freezehold", "tapestop", "vocalecho", "otherout"].includes(k!)), "chill: soft palette only");
assert.equal(genreOf({ bpm: 125 }), "club");
assert.equal(genreOf({ bpm: 105 }), "pop");
assert.equal(genreOf({ bpm: 80 }), "chill");
assert.equal(genreOf({ bpm: 80, genre: "hiphop" }), "hiphop");
assert.ok(GENRES.every((x) => x === "auto" || moves(5, { bpm: 124, genre: x, stems: FOUR }).size >= 4), "every style has enough moves");
const withStems = Array.from({ length: 10 }, (_, n) => pickAccent(5, n, { bpm: 124, genre: "club", stems: FOUR }));
assert.ok(withStems.filter((k, n) => n % 2 === 1 && NEED_STEMS.includes(k!)).length === 5, "stems on every other move");
// transitions: the style's own touch, none below force 3, every other change at force 4, every change at force 5
assert.equal(pickTransitionMove(2, 0, { bpm: 124 }), null);
assert.ok(pickTransitionMove(3, 0, { bpm: 124, genre: "club" }) !== null && pickTransitionMove(3, 1, { bpm: 124, genre: "club" }) === null);
assert.ok([0, 1, 2, 3].every((i) => pickTransitionMove(5, i, { bpm: 124, genre: "pop" }) !== null));
assert.ok(transitionPalette("pop", 110).includes("echo") && !transitionPalette("pop", 110).includes("roll"), "pop transitions: no roll");
assert.ok(!["roll", "gate", "noise", "drop"].includes(planStep(t(124, "8A"), t(125, "9A"), "flow", { ...applyForce(DEFAULT_DJ, 5), genre: "pop" }, 0).type), "pop: no club effect on the change");
assert.ok(["echo", "brake", "reverse", "drop", "dub", "roll"].includes(planStep(t(124, "8A"), t(125, "9A"), "flow", { ...applyForce(DEFAULT_DJ, 5), genre: "hiphop" }, 0).type), "hip-hop transitions come from its palette");
// zen and calm: only the softest moves, whatever the force and the tempo, and no touch on the changes
for (const genre of ["zen", "calm"] as const) {
  const soft = new Set(Array.from({ length: 30 }, (_, n) => pickAccent(5, n, { bpm: 124, genre, stems: FOUR })));
  assert.ok([...soft].every((k) => ["filterbreath", "reverbwash", "echothrow", "echoexit", "freezehold"].includes(k!)), `${genre}: soft moves only`);
  assert.ok(![...soft].some((k) => ["roll", "gatechop", "noiseburst", "drumsolo", "bassdrop", "riserbuild"].includes(k!)));
  assert.equal(pickTransitionMove(5, 0, { bpm: 124, genre }), null, `${genre}: no touch on the changes`);
  assert.ok(transitionPalette(genre, 124).every((x) => ["wash", "echo"].includes(x)));
}
assert.ok(!moves(5, { bpm: 124, genre: "calm", stems: FOUR }).has("echothrow" as never), "calm: no plain echo");
// tempos too far apart (10 BPM or more): the voices go off, and no technique built around a voice
import { VOCAL_GAP_BPM, bpmDiff } from "../lib/mixPlan";
assert.equal(VOCAL_GAP_BPM, 10);
assert.equal(bpmDiff(120, 130), 10);
assert.equal(bpmDiff(130, 65), 0, "double tempo is the same beat");
assert.ok(bpmDiff(128, 124) < VOCAL_GAP_BPM && bpmDiff(100, 118) >= VOCAL_GAP_BPM);
assert.equal(bpmDiff(0, 120), 0, "unknown tempo: nothing to decide");
const withVoice = new Set(Array.from({ length: 12 }, (_, index) => pickTech({ ...both, index, bpm: 126, sync: true })));
assert.ok(withVoice.has("vocalhandoff"), "voices on: the voice technique is available");
const noVoice = new Set(Array.from({ length: 12 }, (_, index) => pickTech({ ...both, index, bpm: 126, sync: true, noVocals: true })));
assert.ok(!noVoice.has("vocalhandoff") && !noVoice.has("stripout"), "voices off: no technique built around a voice");
assert.ok(pickTech({ outStems: true, inStems: false, index: 0, mode: "punchy", type: "smooth", sec: 12, noVocals: true }) === null, "stripout alone leaves only the voice: dropped");
// TRANS (gate) tuned to the tempo and the style
import { gateSetting } from "../lib/djForce";
for (const genre of ["club", "hiphop", "pop", "disco", "dub", "latino"] as const) {
  for (let bpm = 60; bpm <= 200; bpm += 10) {
    const g = gateSetting(bpm, genre)!;
    assert.ok(g, `${genre} ${bpm}: a setting`);
    assert.ok(g.beat >= 0 && g.beat <= 7 && g.p1 >= 0 && g.p1 <= 1 && g.p2 >= 0 && g.p2 <= 1);
    assert.ok((60 / bpm) * [1 / 16, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1, 2, 4][g.beat] >= 0.08 - 1e-9, `${genre} ${bpm}: never a buzz`);
  }
}
assert.equal(gateSetting(128, "club")!.beat, 3, "club at 128: eighth notes");
assert.equal(gateSetting(120, "club")!.beat, 2, "club at 120: sixteenth notes");
assert.ok(gateSetting(150, "club")!.p1 < gateSetting(90, "club")!.p1, "a fast song is cut shorter than a slow one");
assert.ok(gateSetting(124, "pop")!.p2 > gateSetting(124, "club")!.p2, "pop: a softer cut than club");
assert.ok(gateSetting(124, "dub")!.beat > gateSetting(124, "latino")!.beat, "dub chops slower than latino");
assert.equal(gateSetting(80, "zen"), null);
assert.equal(gateSetting(80, "calm"), null);
assert.equal(gateSetting(80, "club", true), null, "classical: never");
assert.equal(gateSetting(0, "club"), null, "unknown tempo: nothing to tune");
assert.ok(gateSetting(124, "auto") !== null && gateSetting(80, "auto") === null, "auto: club at 124, chill (no gate) at 80");
console.log("mixplan ok");
