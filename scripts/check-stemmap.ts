// npx tsx scripts/check-stemmap.ts [hash] : sections of a synthetic song, and of a real cached one when a hash is given
import assert from "node:assert/strict";
import { analyseEnvelopes, sectionAt, nextSection, analyseStems } from "../lib/stemAnalysis";
const hop = 0.5;
const rep = (v: number, s: number) => Array(Math.round(s / hop)).fill(v);
const drums = [...rep(0.3, 10), ...rep(0.6, 20), ...rep(0, 3), ...rep(0.9, 20), ...rep(0.3, 15)];
const other = drums.map((d) => (d === 0 ? 0 : d * 0.8 + 0.01));
const m = analyseEnvelopes({ drums, other, bass: other, vocals: drums.map(() => 0.05) }, hop);
console.log(m.sections.map((s) => `${s.kind} ${s.start}-${s.end}`).join(" | "));
assert.equal(sectionAt(m, 1)?.kind, "slow");
assert.equal(sectionAt(m, 31.5)?.kind, "blank");
assert.equal(sectionAt(m, 45)?.kind, "peak");
assert.equal(nextSection(m, 0, "peak")?.kind, "peak");
assert.deepEqual(analyseEnvelopes({}, hop).sections, []);
const h = process.argv[2];
if (h) analyseStems(h, "htdemucs", { ultra: true, lossless: true }).then((r) => console.log(r ? r.sections.map((s) => `${s.kind} ${s.start.toFixed(0)}-${s.end.toFixed(0)}`).join(" | ") : "no stems"));
else console.log("stemmap ok");
