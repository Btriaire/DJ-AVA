// npx tsx scripts/check-key-zones.ts — each keyboard zone plays its stem at the original pitch on its own first C
import assert from "node:assert/strict";
import { SampleKeys } from "../lib/atelier/players";

// minimal fake AudioContext: SampleKeys only needs gain/filter nodes at construction
const param = () => ({ value: 0, setTargetAtTime() {} });
const node = () => ({ connect: () => node(), disconnect() {}, gain: param(), frequency: param(), Q: param(), delayTime: param(), type: "" });
const ctx = { currentTime: 0, sampleRate: 44100, createGain: node, createBiquadFilter: node, createDelay: node } as unknown as BaseAudioContext;
const buf = { duration: 1 } as AudioBuffer;
const keys = new SampleKeys(ctx, node() as unknown as AudioNode);

keys.addZone(buf, "BASSE");
keys.addZone(buf, "VOIX");
const [a, b] = keys.zoneList();
assert.deepEqual([a.lo, a.hi, a.root], [36, 59, 36]); // C2–B3, original pitch on C2
assert.deepEqual([b.lo, b.hi, b.root], [60, 83, 60]); // C4–B5, original pitch on C4

keys.addZone(buf, "BATTERIE"); // 3 zones: 36–51, 52–67, 68–83
assert.deepEqual(keys.zoneList().map((z) => z.root), [36, 60, 72]);

keys.configure({ root: 62 }); // global shift +2 moves every zone's original-pitch key
assert.deepEqual(keys.zoneList().map((z) => z.root), [38, 62, 74]);
console.log("key zones ok");
