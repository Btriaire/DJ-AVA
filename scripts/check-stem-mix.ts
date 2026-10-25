import assert from "node:assert/strict";
import { crossCurve, pickTech, stemFrame, STEM_TECH_LABEL, type StemMode, type StemTech } from "../lib/stemMix";

const techs = Object.keys(STEM_TECH_LABEL) as StemTech[];
for (const mode of ["smooth", "punchy"] as StemMode[]) {
  for (const t of techs) {
    // every level stays in 0..1, at every point
    for (let i = 0; i <= 100; i++) {
      const f = stemFrame(t, i / 100, mode);
      for (const v of [...Object.values(f.out), ...Object.values(f.inn), f.outEcho, f.cross]) assert.ok(v >= -1e-9 && v <= 1 + 1e-9, `${t} ${mode} ${i}: ${v}`);
    }
    // the outgoing stems start at full level and end at zero; the incoming ones end at full level
    const a = stemFrame(t, 0, mode);
    const z = stemFrame(t, 1, mode);
    for (const v of Object.values(a.out)) assert.equal(v, 1, `${t} out starts full`);
    for (const v of Object.values(z.out)) assert.ok(v < 1e-9, `${t} out ends silent`);
    for (const v of Object.values(z.inn)) assert.ok(Math.abs(v - 1) < 1e-9, `${t} in ends full`);
    assert.equal(z.outEcho, t === "vocalhandoff" || t === "stripout" ? 0.9 : 0);
    assert.equal(a.cross, 0);
    assert.equal(z.cross, 1);
  }
}
// the incoming song of a build starts with the drums alone
const b = stemFrame("build", 0.1, "smooth");
assert.ok((b.inn.drums ?? 0) > 0.2 && (b.inn.bass ?? 0) === 0 && (b.inn.vocals ?? 0) === 0);
// the bass slam is nearly a step in punchy mode, a ramp in smooth mode
const sl = (m: StemMode) => [0.49, 0.5, 0.52, 0.54].map((k) => stemFrame("bassslam", k, m).inn.bass ?? 0);
assert.ok(sl("punchy")[3] > 0.9 && sl("smooth")[3] < 0.2);
// vocal hand-over: the old vocals still sing when the new instruments are in
const vh = stemFrame("vocalhandoff", 0.6, "smooth");
assert.ok((vh.out.vocals ?? 0) > 0.99 && (vh.inn.drums ?? 0) > 0.9 && (vh.out.drums ?? 1) < 0.3);
assert.equal(crossCurve(0.5), 0.5);
// choice: nothing without stems, nothing on a cut or a short blend, rotation over the set
const base = { index: 0, mode: "punchy" as StemMode, type: "smooth" as const, sec: 12 };
assert.equal(pickTech({ ...base, outStems: false, inStems: false }), null);
assert.equal(pickTech({ ...base, outStems: false, inStems: true }), "build");
assert.equal(pickTech({ ...base, outStems: true, inStems: false }), "stripout");
assert.equal(pickTech({ ...base, outStems: true, inStems: true, type: "cut" }), null);
assert.equal(pickTech({ ...base, outStems: true, inStems: true, sec: 4 }), null);
assert.equal(pickTech({ ...base, outStems: true, inStems: true, mode: "off" }), null);
const seq = [0, 1, 2, 3, 4].map((index) => pickTech({ ...base, index, outStems: true, inStems: true }));
assert.deepEqual(seq, ["drumswap", "vocalhandoff", "bassslam", "build", "drumswap"]);
assert.ok(!["drumswap", "bassslam"].includes(pickTech({ ...base, mode: "smooth", index: 0, outStems: true, inStems: true })!), "smooth mode: no hard slams");
console.log("stem mix ok");
