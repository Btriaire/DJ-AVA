// npx tsx scripts/check-deck-automation.ts — punch-in merge and replay cursor of the deck REC
import assert from "node:assert/strict";
import { mergeEvents, cursorAfter, type AutoEvent } from "../lib/audio/deckAutomation";

const ev = (t: number, m = "setVolume"): AutoEvent => ({ t, o: "deck", m, a: [t] });
const old = [ev(1), ev(5), ev(10), ev(20)];

// a pass over 4..12 s replaces old events inside that range only, result sorted
const merged = mergeEvents(old, [ev(6, "setEQ"), ev(4.5, "setFilter")], 4, 12);
assert.deepEqual(merged.map((e) => e.t), [1, 4.5, 6, 20]);
assert.deepEqual(merged.map((e) => e.m), ["setVolume", "setFilter", "setEQ", "setVolume"]);

// cursor points at the first event still to play
assert.equal(cursorAfter(old, 0), 0);
assert.equal(cursorAfter(old, 5), 2);
assert.equal(cursorAfter(old, 99), 4);
console.log("deck automation ok");
