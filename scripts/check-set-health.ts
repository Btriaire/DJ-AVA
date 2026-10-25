// npx tsx scripts/check-set-health.ts — status and next step of a set
import assert from "node:assert/strict";
import { setHealth } from "../lib/setHealth";
import type { LibTrack } from "../lib/library";

const mk = (id: string, bpm: number | undefined, camelot: string | undefined, dur = 300): LibTrack =>
  ({ id, name: id, source: "local", deck: null, addedAt: 0, bpm, camelot, durationSec: dur }) as LibTrack;
const map = (...t: LibTrack[]) => new Map(t.map((x) => [x.id, x]));
const none = () => false;
const all = () => true;

// empty / one title
let h = setHealth([], map(), none);
assert.equal(h.status, "empty");
assert.equal(h.next.id, "add");
h = setHealth(["a"], map(mk("a", 120, "8A")), none);
assert.equal(h.status, "draft");
assert.equal(h.next.id, "add");

// missing tempo or key -> analyse, counts the worst of the two
const T = map(mk("a", 120, "8A"), mk("b", undefined, "9A"), mk("c", 124, undefined), mk("d", 126, undefined));
h = setHealth(["a", "b", "c", "d"], T, none);
assert.equal(h.bpmMissing, 1);
assert.equal(h.keyMissing, 2);
assert.equal(h.next.id, "analyze");
assert.match(h.next.label, /2 titres/);
assert.equal(h.status, "draft");

// clean keys, nothing prepared -> stems (not a draft any more: it can already be played)
const G = map(mk("a", 120, "8A"), mk("b", 122, "9A"), mk("c", 124, "10A"));
h = setHealth(["a", "b", "c"], G, none);
assert.equal(h.status, "ready");
assert.equal(h.smooth, 2);
assert.equal(h.clash, 0);
assert.equal(h.next.id, "stems");
assert.deepEqual([h.bpmMin, h.bpmMax], [120, 124]);
assert.equal(h.seconds, 900);

// everything ready -> play
h = setHealth(["a", "b", "c"], G, all);
assert.equal(h.status, "perfect");
assert.equal(h.next.id, "play");

// clashing keys: reorder comes before stems
const C = map(mk("a", 120, "8A"), mk("b", 121, "2B"), mk("c", 122, "5A"));
h = setHealth(["a", "b", "c"], C, none);
assert.equal(h.clash, 2);
assert.equal(h.next.id, "order");
assert.equal(setHealth(["a", "b", "c"], C, all).status, "ready", "clashes keep a set from being perfect");

// ids that no longer exist in the library are ignored
h = setHealth(["a", "ghost", "b"], map(mk("a", 120, "8A"), mk("b", 121, "8A")), none);
assert.equal(h.count, 2);
console.log("set health ok");
