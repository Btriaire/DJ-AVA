// npx tsx scripts/check-set-wizard.ts — source resolution, order, estimate, analysis needs
import assert from "node:assert/strict";
import { computeOrder, durationLabel, estimateCount, needsAnalysis, resolveSource } from "../lib/setWizard";
import type { LibTrack, Playlist } from "../lib/library";

const mk = (id: string, bpm?: number, camelot?: string, dur = 300): LibTrack => ({ id, name: id, source: "local", deck: null, addedAt: 0, bpm, camelot, durationSec: dur }) as LibTrack;
const bac = [mk("a", 120, "8A"), mk("b", 124, "9A"), mk("c", undefined, "9A"), mk("d", 128, undefined)];
const all = [...bac, mk("z", 100, "1A")];
const pls: Playlist[] = [{ id: "p", name: "P", trackIds: ["z", "ghost", "a"] }];

assert.deepEqual(resolveSource("all", "", bac, all, new Set(), pls).map((t) => t.id), ["a", "b", "c", "d"]);
assert.deepEqual(resolveSource("checked", "", bac, all, new Set(["b", "d", "z"]), pls).map((t) => t.id), ["b", "d"], "checked = ticked titles of the bac only");
assert.deepEqual(resolveSource("list", "p", bac, all, new Set(), pls).map((t) => t.id), ["z", "a"], "list keeps its order and skips missing titles");
assert.deepEqual(resolveSource("list", "nope", bac, all, new Set(), pls), []);

assert.deepEqual(needsAnalysis(bac).map((t) => t.id), ["c", "d"]);
assert.equal(estimateCount(bac, 0), 3, "unknown tempo is left out");
assert.equal(estimateCount(bac, 5), 1);
assert.equal(estimateCount(bac, 600), 3, "never more than the known titles");

const order = computeOrder(bac, "rise", 0, "", null);
assert.equal(order.length, 4, "unknown-tempo titles are kept at the end when no length is asked");
assert.deepEqual(computeOrder(bac, "rise", 0, "d", null)[0], "d", "start title is honoured");
assert.equal(durationLabel(0), "Tous les titres");
assert.equal(durationLabel(45), "45 min");
assert.equal(durationLabel(60), "1 h");
assert.equal(durationLabel(90), "1 h 30");
console.log("set wizard ok");
