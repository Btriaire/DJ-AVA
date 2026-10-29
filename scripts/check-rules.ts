// npx tsx scripts/check-rules.ts : the rules of the intelligent DJ keep forbidden moves, blends and techniques out
import assert from "node:assert/strict";
import { voiceStateAt, fitsVoice, pickAccent, pickTransitionMove, STEM_MOVES, type AccentKind } from "../lib/djForce";
import { capAmount, fadeFactor, hasRules, moveAllowed, techAllowed, transitionAllowed } from "../lib/djRules";
import { pickTech } from "../lib/stemMix";
import { planStep, DEFAULT_DJ } from "../lib/mixPlan";
import type { LibTrack } from "../lib/library";

const feel = { bpm: 124, stems: ["drums", "bass", "other", "vocals"] as const, genre: "club" as const };
const noStem = { noMoves: [...STEM_MOVES] };
for (let n = 0; n < 60; n++) {
  const k = pickAccent(5, n, { ...feel, stems: [...feel.stems] }, noStem);
  assert(!k || !STEM_MOVES.includes(k), `stem move ${k} despite the rule`);
  const v = pickAccent(5, n, { ...feel, stems: [...feel.stems] }, { touchVoices: false });
  assert(!v || !["voiceout", "vocalsolo", "vocalecho"].includes(v as AccentKind), `voice move ${v}`);
  const m = pickTransitionMove(5, n, { bpm: 124, genre: "club" }, { noMoves: ["riserbuild", "echoexit", "buildup", "phaserswirl"] });
  assert(m === null, `transition move ${m}`);
}
assert(!techAllowed("vocalhandoff", { touchVoices: false }) && techAllowed("build", { touchVoices: false }));
for (let i = 0; i < 20; i++) {
  const t = pickTech({ outStems: true, inStems: true, index: i, mode: "punchy", type: "fade", sec: 12, rules: { noTechs: ["drumswap", "bassslam"], touchVoices: false } });
  assert(!t || !["drumswap", "bassslam", "vocalhandoff", "stripout"].includes(t), `tech ${t}`);
}
const a = { id: "a", name: "a", bpm: 124, durationSec: 240 } as LibTrack;
const b = { id: "b", name: "b", bpm: 126, durationSec: 240 } as LibTrack;
const allFx = ["echo", "dub", "wash", "flanger", "gate", "noise", "roll", "brake", "reverse", "loop", "highpass", "eq", "drop", "filter"] as const;
for (let i = 0; i < 12; i++) {
  const s = planStep(a, b, "flow", { ...DEFAULT_DJ, force: 5, rules: { noTransitions: [...allFx] } }, i);
  assert(!allFx.includes(s.type as (typeof allFx)[number]), `blend ${s.type} despite the rules`);
  const s2 = planStep(a, b, "flow", { ...DEFAULT_DJ, force: 5, rules: { noTransitions: ["echo", "gate"] } }, i);
  assert(s2.type !== "echo" && s2.type !== "gate");
}
assert(moveAllowed("echothrow") && transitionAllowed("echo") && !hasRules({}) && hasRules({ maxAmount: 0.5 }));
assert(capAmount(1, { maxAmount: 0.5 }) === 0.5 && capAmount(1, { maxAmount: 0.1 }) === 0.3 && capAmount(0.4, { maxAmount: 0.5 }) === 0.4);
assert(fadeFactor({ stemFade: "soft" }) > fadeFactor() && fadeFactor({ stemFade: "quick" }) < 1);
console.log("check-rules: ok");
import { fitsSection, nextSectionStart, sectionKindAt } from "../lib/djForce";
const map = { sections: [{ start: 0, end: 10, kind: "slow" as const }, { start: 10, end: 20, kind: "peak" as const }, { start: 20, end: 25, kind: "blank" as const }] };
assert.equal(sectionKindAt(map, 12), "peak");
assert.equal(nextSectionStart(map, 2, "peak"), 10);
assert(!fitsSection("roll", "slow") && fitsSection("reverbwash", "slow") && !fitsSection("reverbwash", "peak") && fitsSection("roll", "peak") && !fitsSection("roll", "blank") && fitsSection("echoexit", "blank") && fitsSection("roll", undefined));
for (let n = 0; n < 40; n++) assert(pickAccent(5, n, { bpm: 124, genre: "club", section: "slow", stems: [] }) !== "roll");
console.log("check-rules sections ok");
const vmap = { voice: [-1, -1, 60, 60, -1, -1, -1, -1, -1, -1, -1, -1], voiceStep: 1 };
assert.equal(voiceStateAt(vmap, 2), "sung");
assert.equal(voiceStateAt(vmap, 9), "gap");
assert.equal(voiceStateAt(null, 2), undefined);
assert(!fitsVoice("tapestop", "sung") && fitsVoice("tapestop", "gap") && fitsVoice("reverbwash", "sung") && fitsVoice("roll", undefined));
for (let n = 0; n < 40; n++) assert(pickAccent(5, n, { bpm: 124, genre: "club", voice: "sung", stems: [] }) !== "tapestop");
console.log("check-rules voice ok");
import { nextAttack, notesAt } from "../lib/stemNotesPure";
const sn = { version: 1 as const, drums: [[1, 0.9], [2, 0.8]] as [number, number][], bass: [[1.5, 1.8, 36, 0.7]] as [number, number, number, number][], other: [[1.6, 2, 64, 0.5]] as [number, number, number, number][] };
assert.equal(nextAttack(sn, 0.9, 0.3), 1);
assert.equal(nextAttack(sn, 1.01, 0.3), null);
assert.equal(nextAttack(sn, 1.01, 0.6), 1.5);
assert.equal(nextAttack(null, 1, 1), null);
assert.deepEqual(notesAt(sn, 1.7).sort(), [0, 4]);
console.log("check-rules notes ok");

import { selfTest as rhythmMathTest } from "../lib/audio/rhythmMath";
rhythmMathTest();
console.log("check-rules rhythm math ok");

import { selfTest as trackSearchTest } from "../lib/trackSearch";
trackSearchTest();
console.log("check-rules track search ok");

import { selfTest as trackRankTest } from "../lib/trackRank";
trackRankTest();
console.log("check-rules track rank ok");

import { selfTest as recipesTest } from "../lib/rhythmRecipes";
recipesTest();
console.log("check-rules recipes ok");
import { selfTest as oneClickTest } from "../lib/oneClick";
oneClickTest();
console.log("check-rules one click ok");
import { selfTest as trackTitleTest } from "../lib/trackTitle";
trackTitleTest();
console.log("check-rules track title ok");
import { selfTest as stemJamTest } from "../lib/audio/stemJam";
stemJamTest();
console.log("check-rules stem jam ok");
import { selfTest as jamArpTest } from "../lib/audio/jamArp";
import { selfTest as jamProgTest } from "../lib/audio/jamProgressions";
import { selfTest as jamSweepTest } from "../lib/audio/jamSweep";
jamArpTest();
jamProgTest();
jamSweepTest();
console.log("check-rules jam arp, progressions, sweep ok");
import { selfTest as jamFillTest } from "../lib/audio/jamFill";
import { selfTest as jamChorusTest } from "../lib/audio/jamChorus";
jamFillTest();
jamChorusTest();
console.log("check-rules jam fills, chorus ok");
