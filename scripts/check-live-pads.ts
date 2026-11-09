// npx tsx scripts/check-live-pads.ts — LIVE pads of the Stem Sample Pad: the last whole bars of one stem, on an empty pad
import assert from "node:assert/strict";
import { StemSamplePad } from "../lib/audio/stemSamplePad";

const buf = { duration: 200 } as unknown as AudioBuffer;
const deck = {
  stemHash: "abcdef0123",
  stemNames: ["drums", "bass", "other", "vocals", "guitar", "piano"],
  bpm: 120, // one bar = 2 s
  beatGridOffset: 0.5,
  duration: 200,
  pos: 37.3,
  getStemBuffer: (i: number) => (i < 6 ? buf : null),
  position() { return this.pos; },
};
const engine = { deckA: deck, deckB: deck, ctx: { currentTime: 0 } } as never;
(globalThis as { setInterval: unknown }).setInterval = () => 0; // no timers in a check
const pad = new StemSamplePad(engine);

// no samples found on the server: every stem still has its row (so it can be sampled live), all pads empty
assert.equal(pad.rows().length, 6);
assert.ok(pad.rows().every((r) => r.pads.every((p) => p === undefined)));

// 2 bars of guitar at 37.3 s: bar lines at 0.5 + 2k, the last one before the playhead is 36.5, so 32.5 -> 36.5
pad.liveBars = 2;
assert.equal(pad.captureLive("guitar", 4), null);
const g = pad.rows().find((r) => r.stem === "guitar")!.pads[4]!;
assert.deepEqual([g.start, g.end, g.kind, g.bars], [32.5, 36.5, "loop", 2]);
assert.ok(pad.isLive("guitar", 4));

// at the very start of the song: its first bars
deck.pos = 1.2;
pad.liveBars = 4;
assert.equal(pad.captureLive("bass", 0), null);
const b = pad.rows().find((r) => r.stem === "bass")!.pads[0]!;
assert.deepEqual([b.start, b.end], [0.5, 8.5]);

// late in the song: still the bars just played
deck.pos = 199;
pad.liveBars = 1;
assert.equal(pad.captureLive("drums", 1), null);
assert.deepEqual([pad.rows()[0].pads[1]!.start, pad.rows()[0].pads[1]!.end], [196.5, 198.5]);
// a song shorter than the bars asked, captured at its start: refused
deck.pos = 1; deck.duration = 5; pad.liveBars = 4;
assert.match(pad.captureLive("drums", 2) ?? "", /fin/);
// no tempo: refused
deck.duration = 200; deck.bpm = 0;
assert.match(pad.liveBlocked("drums") ?? "", /Tempo/);

// removing it leaves the pad empty again
deck.bpm = 120;
(pad as unknown as { stop: () => void }).stop = () => {};
pad.clearLive("guitar", 4);
assert.equal(pad.rows().find((r) => r.stem === "guitar")!.pads[4], undefined);
// the usual case: the 5 found pads are full, the 3 LIVE pads after them still take a capture
const found = Array.from({ length: 6 }, (_, i) => ({ start: i * 2, end: i * 2 + 2, kind: "loop" as const, bars: 1, score: 1, label: `B${i}` }));
pad.samples = { bass: found };
const bassRow = () => pad.rows().find((r) => r.stem === "bass")!;
assert.equal(bassRow().pads.length, 8);
assert.ok(bassRow().pads.slice(0, 5).every((p) => p && p.label.startsWith("B")));
deck.pos = 50; pad.liveBars = 1;
assert.equal(pad.captureLive("bass", 5), null);
assert.equal(bassRow().pads[5]!.label, "Live 1 mes.");
assert.ok(pad.isLive("bass", 5) && !pad.isLive("bass", 0));
console.log("live pads: ok");
