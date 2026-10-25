import assert from "node:assert/strict";
import { COMPOSERS, findComposer, pickWorks } from "../lib/classical";

const bach = findComposer("bach")!;
assert.ok(bach && COMPOSERS.length >= 25);
assert.ok(COMPOSERS.every((c) => c.works.length >= 1 && c.name && c.works.every((x) => x.q.length > 3)), "every work is named");
// filters: matching works first, the rest fill in
const piano = pickWorks(bach, 3, { instrument: "piano", mood: "all" });
assert.equal(piano[0].i, "piano");
assert.equal(piano.length, 3);
const calm = pickWorks(findComposer("Chopin")!, 4, { instrument: "all", mood: "calme" });
assert.ok(calm.every((x) => x.m === "calme"));
// a strict filter never starves: Handel has no guitar, the radio still gets works
assert.equal(pickWorks(findComposer("Handel")!, 3, { instrument: "guitare", mood: "all" }).length, 3);
// each regeneration moves along the list, so the works differ, and it wraps without repeating inside one pick
const a = pickWorks(bach, 3, { instrument: "all", mood: "all" }, 0).map((x) => x.q);
const b = pickWorks(bach, 3, { instrument: "all", mood: "all" }, 1).map((x) => x.q);
assert.equal(a.filter((q) => b.includes(q)).length, 0, "next regeneration: other works");
assert.equal(new Set(pickWorks(bach, 20, { instrument: "all", mood: "all" }, 5).map((x) => x.q)).size, bach.works.length, "never more than it has");
console.log("classical ok");
