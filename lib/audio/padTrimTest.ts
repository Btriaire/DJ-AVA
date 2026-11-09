// npx tsx lib/audio/padTrimTest.ts
import assert from "node:assert/strict";
import { REPEATS, isFull, loopSteps, snapTrim, trimmed } from "./padTrim";

// handles land on the grid of steps
assert.deepEqual(snapTrim([0.26, 0.74], 16), [0.25, 0.75]);
// never closer than one step: the moved handle is pushed back
assert.deepEqual(snapTrim([0.5, 0.5], 16, 1), [0.5, 0.5625]);
assert.deepEqual(snapTrim([0.5, 0.5], 16, 0), [0.4375, 0.5]);
// the end handle at the very start keeps one step
assert.deepEqual(snapTrim([1, 1], 16, 0), [0.9375, 1]);
assert.deepEqual(snapTrim([-1, 2], 16), [0, 1]);
assert.ok(isFull([0, 1]) && !isFull([0, 0.5]));
// a 2 s slice from 10 s, trimmed to its middle half
assert.deepEqual(trimmed(10, 12, [0.25, 0.75]), [10.5, 11.5]);
assert.equal(loopSteps(1), 16);
assert.equal(loopSteps(4), 64);
assert.deepEqual([...REPEATS], [1, 2, 4, 8, 0]);
console.log("padTrim ok");
