// npx tsx scripts/check-pad-release.ts — RELEASE of the stem pads (lib/audio/padRelease.ts)
import assert from "node:assert/strict";
import { RELEASES, fadeOut } from "../lib/audio/padRelease";

// a gain whose scheduled moves are written down
function gain() {
  const calls: [string, number, number, number?][] = [];
  const p = {
    value: 0.8,
    cancelScheduledValues: (t: number) => void calls.push(["cancel", t, 0]),
    setValueAtTime: (v: number, t: number) => void calls.push(["set", v, t]),
    linearRampToValueAtTime: (v: number, t: number) => void calls.push(["ramp", v, t]),
    setTargetAtTime: (v: number, t: number, tau: number) => void calls.push(["target", v, t, tau]),
  };
  return { g: { gain: p } as unknown as GainNode, calls };
}

// Off: the old quick cut
{
  const { g, calls } = gain();
  const stopAt = fadeOut(g, 10, 0, 0.012);
  assert.deepEqual(calls.at(-1), ["ramp", 0, 10.012]);
  assert.ok(Math.abs(stopAt - 10.022) < 1e-9);
}
// Long (1 s): an exponential fade that is ~1 % at the end, and the source stops after it
{
  const { g, calls } = gain();
  const stopAt = fadeOut(g, 10, 1);
  const t = calls.at(-1)!;
  assert.equal(t[0], "target");
  assert.ok(Math.abs(Math.exp(-1 / t[3]!) - 0.01) < 0.001, "about 1 % left after the release");
  assert.ok(stopAt >= 11);
}
// the choices
assert.deepEqual(RELEASES.map((r) => r.sec), [0, 0.15, 0.4, 1, 2]);
console.log("pad release: ok");
