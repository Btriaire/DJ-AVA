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
assert.equal(planStep(t(124, "8A"), t(124, "3B"), "peak", DEFAULT_DJ, 1).type, "highpass");
assert.equal(planStep(t(124, "8A"), t(125, "8A"), "flow", DEFAULT_DJ, 4).type, "loop");
// double time folds onto the same beat and is not synced
assert.ok(tempoGap(65, 130).folded && Math.abs(tempoGap(65, 130).pct) < 1);
assert.equal(planStep(t(65, "8A"), t(130, "8A"), "flow").sync, false);
assert.equal(planStep(t(65, "8A"), t(130, "8A"), "flow").type, "echo");
// options switch the extras off; a rise tightens, a fall loosens
assert.ok(!planStep(t(124, "8A"), t(125, "8A"), "flow", { ...DEFAULT_DJ, sync: false, bassSwap: false }).sync);
assert.ok(planStep(t(124, "8A"), t(125, "8A"), "rise").sec < planStep(t(124, "8A"), t(125, "8A"), "fall").sec);
// short songs never get a blend longer than a fifth of them
assert.ok(planStep(t(124, "8A", { durationSec: 60 }), t(125, "8A"), "flow").sec <= 12);
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
console.log("mixplan ok");
