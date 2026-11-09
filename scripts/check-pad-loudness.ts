// npx tsx scripts/check-pad-loudness.ts — pads of different stems brought to the same loudness (lib/audio/padLoudness.ts)
import assert from "node:assert/strict";
import { PAD_TARGET_RMS, normGain, sliceRms } from "../lib/audio/padLoudness";

const sr = 8000;
function buffer(parts: { amp: number; sec: number }[]): AudioBuffer {
  const total = parts.reduce((s, p) => s + p.sec, 0);
  const d = new Float32Array(Math.round(total * sr));
  let i = 0;
  for (const p of parts) for (let k = 0; k < p.sec * sr; k++, i++) d[i] = p.amp * Math.sin((2 * Math.PI * 220 * k) / sr);
  return { sampleRate: sr, length: d.length, numberOfChannels: 1, getChannelData: () => d } as unknown as AudioBuffer;
}

// a loud drum slice (0..1 s) and a quiet pad slice (1..2 s) of the same stem buffer
const b = buffer([{ amp: 0.4, sec: 1 }, { amp: 0.1, sec: 1 }, { amp: 0.001, sec: 1 }, { amp: 0, sec: 1 }, { amp: 0.99, sec: 1 }]);
const loud = normGain(b, 0, 1) * sliceRms(b, 0, 1);
const quiet = normGain(b, 1, 1) * sliceRms(b, 1, 1);
assert.ok(Math.abs(loud - PAD_TARGET_RMS) < 0.01 && Math.abs(quiet - PAD_TARGET_RMS) < 0.01, `same level: ${loud} vs ${quiet}`);
// a near-silent slice is raised by 12 dB at most, a silent one is left alone
assert.equal(normGain(b, 2, 1), 4);
assert.equal(normGain(b, 3, 1), 1);
// a very loud slice is lowered by 12 dB at most
assert.equal(normGain(b, 4, 1), 0.25);
// measured once: the same slice gives the same gain
assert.equal(normGain(b, 0, 1), normGain(b, 0, 1));
console.log("pad loudness: ok");
