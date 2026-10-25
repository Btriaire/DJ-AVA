import assert from "node:assert/strict";
import { levelFor, memoryLimits } from "../lib/memoryGovernor";
import { thumbSrc } from "../lib/thumb";

// 8 GB machine: warn from ~1.8 GB, critical from ~2.9 GB; small machines keep a floor, big ones scale
assert.deepEqual(memoryLimits(8192), { warnMB: 1802, criticalMB: 2949 });
assert.equal(memoryLimits(2048).warnMB, 1500);
assert.equal(memoryLimits(32768).criticalMB, 11796);
assert.equal(levelFor(1000, 8192), "ok");
assert.equal(levelFor(2000, 8192), "warn");
assert.equal(levelFor(3000, 8192), "critical");
// covers: a 720p YouTube thumbnail is replaced by the 320x180 one; other sources are left alone
assert.equal(thumbSrc("https://i.ytimg.com/vi/yydNF8tuVmU/hq720.jpg?sqp=abc", 40), "https://i.ytimg.com/vi/yydNF8tuVmU/mqdefault.jpg");
assert.equal(thumbSrc("https://i.ytimg.com/vi/yydNF8tuVmU/hq720.jpg", 400), "https://i.ytimg.com/vi/yydNF8tuVmU/hq720.jpg");
assert.equal(thumbSrc("data:image/png;base64,AA", 40), "data:image/png;base64,AA");
assert.equal(thumbSrc(undefined, 40), undefined);
console.log("memory ok");
