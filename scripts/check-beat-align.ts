import assert from "node:assert/strict";
import { alignDelaySec, type BeatDeck } from "../lib/audio/beatAlign";

const deck = (bpm: number, eff: number, offset: number, pos: number): BeatDeck => ({ bpm, effectiveBPM: eff, beatGridOffset: offset, position: () => pos });

// outgoing 120 BPM (0.5 s a beat), grid at 0.1 s, at 10.2 s: last beat 10.1, next at 10.6 -> 0.4 s away.
// Incoming 120 BPM, first beat at 0.1 s, cued at 0: starting after w, its first beat falls at w + 0.1: w = 0.3.
const w = alignDelaySec(deck(120, 120, 0.1, 10.2), deck(120, 120, 0.1, 0));
assert.ok(Math.abs(w - 0.3) < 1e-9, `got ${w}`);
// the wait is always shorter than a beat, whatever the phases
for (const pos of [0, 3.37, 99.9]) for (const off of [0, 0.2, 0.45]) {
  const x = alignDelaySec(deck(128, 128, off, pos), deck(128, 128, 0.31, 0));
  assert.ok(x > 0 && x <= 60 / 128 + 0.031, `wait ${x}`);
}
// synced tempo: incoming 100 BPM pitched to 120 plays 1.2x faster: its beats are 0.4167 s apart in real time, still on the out beat
const s = alignDelaySec(deck(120, 120, 0, 5.0), deck(100, 120, 0, 0));
assert.ok(s >= 0.03 && s < 0.5 + 0.031);
// unknown tempo: no wait
assert.equal(alignDelaySec(deck(0, 0, 0, 0), deck(120, 120, 0, 0)), 0);
// on a bar (4 beats) the wait can be up to four times longer, and still lands on a bar of the outgoing song
const bar = alignDelaySec(deck(120, 120, 0.1, 10.2), deck(120, 120, 0.1, 0), 4);
assert.ok(bar > 0.03 && bar <= 2 + 0.031, `bar wait ${bar}`);
assert.ok(Math.abs(((10.2 - 0.1 + bar + 0.1) % 2) ) < 1e-6 || Math.abs(((10.2 - 0.1 + bar + 0.1) % 2) - 2) < 1e-6, "lands on a bar line");
console.log("beat align ok");
