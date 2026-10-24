// npx tsx scripts/check-set-builder.ts — harmonic scoring and set building (arcs, duration, start, seed)
import assert from "node:assert/strict";
import { harmonicScore, tempoScore } from "../lib/setPicker";
import { arcTarget, buildSet, buildSmartSet, type SetArc, type SetCue } from "../lib/setBuilder";

// ---- harmonic scoring: same key 3, relative / neighbour 2, else 0, unknown 1; the wheel wraps 12 -> 1
assert.equal(harmonicScore("8A", "8A"), 3);
assert.equal(harmonicScore("8a", "8A"), 3);
assert.equal(harmonicScore("8A", "8B"), 2);
assert.equal(harmonicScore("8A", "9A"), 2);
assert.equal(harmonicScore("9A", "8A"), 2);
assert.equal(harmonicScore("12A", "1A"), 2, "12A and 1A are neighbours");
assert.equal(harmonicScore("1B", "12B"), 2, "1B and 12B are neighbours");
assert.equal(harmonicScore("12A", "1B"), 0, "wrap needs the same letter");
assert.equal(harmonicScore("8A", "10A"), 0);
assert.equal(harmonicScore("8A", "9B"), 0);
assert.equal(harmonicScore("", "8A"), 1);
assert.equal(harmonicScore("8A", ""), 1);
assert.equal(harmonicScore("13A", "1A"), 1, "invalid key is unknown");
assert.equal(harmonicScore("X", "1A"), 1);
assert.equal(tempoScore(128, 130), 2);
assert.equal(tempoScore(70, 140), 1);
assert.equal(tempoScore(0, 120), 1);

// ---- fixtures
const KEYS = ["8A", "9A", "10A", "8B", "3A", "11A", "12A", "1A", "5B", "6A", "2A", "7A"];
const fixture = (n = 12): SetCue[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}`, bpm: 110 + i * 3, camelot: KEYS[(i * 5) % KEYS.length], durationSec: 240 + (i % 4) * 60 }));
// shuffled input so that order does not help
const shuffled = (a: SetCue[]) => [...a].sort((x, y) => ((x.bpm * 7919) % 13) - ((y.bpm * 7919) % 13));
const bpmOf = (cues: SetCue[], ids: string[]) => ids.map((id) => cues.find((c) => c.id === id)!.bpm);
const corr = (xs: number[], ys: number[]) => {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};

// ---- arc curves
assert.equal(arcTarget("rise", 0), 0);
assert.equal(arcTarget("rise", 1), 1);
assert.equal(arcTarget("fall", 0), 1);
assert.equal(arcTarget("peak", 0.7), 1);
assert.ok(Math.abs(arcTarget("peak", 1) - 0.4) < 1e-9);
assert.ok(Math.abs(arcTarget("wave", 0.25) - 1) < 1e-9 && Math.abs(arcTarget("wave", 0.5)) < 1e-9 && Math.abs(arcTarget("wave", 0.75) - 1) < 1e-9);
assert.equal(arcTarget("rise", 5), 1, "t is clamped");

// ---- every arc returns each track exactly once, unknown-tempo ones at the end
const withUnknown: SetCue[] = [...shuffled(fixture()), { id: "u1", bpm: 0, camelot: "", durationSec: 200 }, { id: "u2", bpm: 0, camelot: "8A", durationSec: 200 }];
for (const arc of ["flow", "rise", "fall", "peak", "wave"] as SetArc[]) {
  const ids = buildSet(withUnknown, { arc });
  assert.equal(ids.length, withUnknown.length, `${arc}: all tracks`);
  assert.equal(new Set(ids).size, ids.length, `${arc}: no duplicate`);
  assert.deepEqual(ids.slice(-2), ["u1", "u2"], `${arc}: unknown tempos last, in input order`);
}

// ---- arcs follow their energy curve
const base = shuffled(fixture());
const follow = (arc: SetArc) => {
  const ids = buildSet(base, { arc });
  const bpms = bpmOf(base, ids);
  return corr(bpms, bpms.map((_, i) => arcTarget(arc, i / (bpms.length - 1))));
};
for (const arc of ["rise", "fall", "peak", "wave"] as SetArc[]) assert.ok(follow(arc) > 0.6, `${arc} follows its curve (r=${follow(arc).toFixed(2)})`);
const rise = bpmOf(base, buildSet(base, { arc: "rise" }));
assert.ok(rise[0] <= 116 && rise[rise.length - 1] >= 140, "rise starts low, ends high");
const fall = bpmOf(base, buildSet(base, { arc: "fall" }));
assert.ok(fall[0] >= 137 && fall[fall.length - 1] <= 113, "fall starts high, ends low");
const peak = bpmOf(base, buildSet(base, { arc: "peak" }));
const top = peak.indexOf(Math.max(...peak)) / (peak.length - 1);
assert.ok(top >= 0.5 && top <= 0.9, `peak tops in the middle-late part (at ${top.toFixed(2)})`);

// ---- start track and flow
assert.equal(buildSet(base, { arc: "rise", startId: "t7" })[0], "t7");
assert.equal(buildSet(base, { arc: "flow", startId: "t3" })[0], "t3");
assert.notEqual(buildSet(base, { arc: "rise", startId: "nope" })[0], "nope", "unknown start id is ignored");
assert.deepEqual(buildSmartSet(base.map(({ id, bpm, camelot }) => ({ id, bpm, camelot }))), buildSet(base, { arc: "flow" }));
// flow: tempo steps stay small when the set is dense (no jump bigger than 2 tracks of the grid)
const flow = bpmOf(base, buildSet(base, { arc: "flow" }));
assert.ok(flow.slice(1).every((b, i) => Math.abs(b - flow[i]) <= 9), "flow keeps neighbouring tempos");

// ---- target length: stop on duration, tight, never an unknown tempo
const longPool = shuffled(fixture(12)).concat([{ id: "u", bpm: 0, camelot: "", durationSec: 300 }]);
const dur = (ids: string[]) => ids.reduce((s, id) => s + longPool.find((c) => c.id === id)!.durationSec, 0);
for (const arc of ["flow", "rise", "peak"] as SetArc[]) {
  for (const targetMin of [10, 20, 30, 45]) {
    const ids = buildSet(longPool, { arc, targetMin });
    assert.ok(!ids.includes("u"), "unknown tempo excluded when a length is asked");
    assert.ok(dur(ids) >= targetMin * 60, `${arc} ${targetMin} min: reaches the target (${Math.round(dur(ids) / 60)} min)`);
    assert.ok(dur(ids.slice(0, -1)) < targetMin * 60, `${arc} ${targetMin} min: stops as soon as it is reached`);
  }
}
const all = buildSet(longPool, { arc: "flow", targetMin: 600 });
assert.equal(all.length, 12, "target above the pool total uses every known-tempo track");

// ---- seed: deterministic, and different seeds give different sets
assert.deepEqual(buildSet(base, { arc: "flow", seed: 3 }), buildSet(base, { arc: "flow", seed: 3 }));
assert.deepEqual(buildSet(base, { arc: "flow" }), buildSet(base, { arc: "flow" }));
const variants = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => buildSet(base, { arc: "flow", seed: s }).join(",")));
assert.ok(variants.size >= 3, `seeds give several sets (${variants.size})`);
for (const s of [1, 2, 3]) assert.equal(new Set(buildSet(base, { arc: "peak", seed: s })).size, base.length, "seeded set is still a permutation");

// ---- degenerate inputs
assert.deepEqual(buildSet([], { arc: "rise" }), []);
assert.deepEqual(buildSet([{ id: "a", bpm: 120, camelot: "8A", durationSec: 200 }], { arc: "peak", targetMin: 30 }), ["a"]);
assert.deepEqual(buildSet([{ id: "a", bpm: 0, camelot: "", durationSec: 0 }, { id: "b", bpm: 0, camelot: "", durationSec: 0 }], { arc: "rise" }), ["a", "b"]);
const same = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, bpm: 128, camelot: "8A", durationSec: 0 }));
assert.equal(buildSet(same, { arc: "wave" }).length, 5, "all-equal tempos do not break the range maths");
console.log("set builder ok");
