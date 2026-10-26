import assert from "node:assert/strict";
import { appNameOf, buildGroups, claudePids, isLocalRequest, parsePs, pidsToClose, protectedPids } from "../lib/ramOptimizer";

const ME = 501;
const HOME = "/Users/bruno";
const ps = `
    1     0     0   1000 /sbin/launchd
  100     1   501  50000 /Applications/DJSynth.app/Contents/MacOS/DJSynth
  101   100   501  90000 /Applications/DJSynth.app/Contents/Frameworks/DJSynth Helper (Renderer).app/Contents/MacOS/DJSynth Helper (Renderer) --type=renderer
  102   100   501 120000 /Applications/DJSynth.app/Contents/MacOS/DJSynth /Users/bruno/dj-app/mac/server.cjs /Users/bruno/dj-app 3217
  103   102   501  60000 /opt/homebrew/bin/ffmpeg -i x.mp3 y.wav
  104   102   501 700000 /Users/bruno/dj-app/.venv-stems/bin/python demucs
  200     1   501 900000 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
  201   200   501 400000 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper --type=renderer
  300     1   501  80000 /Applications/Claude.app/Contents/MacOS/Claude
  301   300   501  70000 /opt/homebrew/bin/node /Users/bruno/.npm/_npx/abc/server-pdf.js
  400     1   501  30000 /opt/homebrew/bin/node /Users/bruno/projects/other/server.js
  401     1   501  20000 /opt/homebrew/bin/ollama serve
  500     1   501  10000 /System/Library/CoreServices/Finder.app/Contents/MacOS/Finder
  501     1   501   9000 /System/Library/CoreServices/Dock.app/Contents/MacOS/Dock
  502     1   501   8000 /usr/libexec/cfprefsd agent
  503     1   501   8000 /bin/zsh -l
  600     1   502 500000 /Applications/Other User App.app/Contents/MacOS/Other User App
  700     1     0 300000 /usr/sbin/coreaudiod
  800     1   501  40000 /System/Applications/Music.app/Contents/MacOS/Music
`;
const procs = parsePs(ps);
assert.equal(procs.length, 19);
assert.equal(appNameOf("/Applications/Google Chrome.app/Contents/Frameworks/X.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/x"), "Google Chrome");
assert.equal(appNameOf("/opt/homebrew/bin/ollama serve"), null);

const ctx = { uid: ME, selfPid: 102, home: HOME };
const keep = protectedPids(procs, 102);
for (const pid of [100, 101, 102, 103, 104]) assert.ok(keep.has(pid), `${pid} belongs to DJSynth`);
assert.ok(!keep.has(200) && !keep.has(400));
assert.ok(claudePids(procs).has(301) && claudePids(procs).has(300), "Claude and its tools");

const groups = buildGroups(procs, ctx);
const by = (id: string) => groups.find((g) => g.id === id);
assert.ok(by("app:Google Chrome") && by("app:Google Chrome")!.pids.length === 2 && by("app:Google Chrome")!.rssMB === Math.round(1300000 / 1024), "an app counts all its helpers");
assert.equal(by("app:Google Chrome")!.locked, null);
assert.ok(by("app:DJSynth")!.locked, "DJSynth is locked");
assert.ok(by("app:Claude")!.locked, "the Claude session is locked");
assert.ok(by("tool:ffmpeg")!.locked && by("tool:python")!.locked, "what DJSynth started is locked");
assert.equal(by("tool:node")!.locked, "session Claude en cours", "a group with a Claude tool in it is locked as a whole");
assert.equal(by("tool:ollama")!.locked, null);
assert.ok(!by("app:Finder") && !by("app:Dock"), "system apps are not even listed");
assert.ok(!groups.some((g) => /cfprefsd|zsh|coreaudiod|Other User/.test(g.name)), "system daemons, shells and other users' programs are never listed");
assert.ok(by("app:Music") && by("app:Music")!.locked === null, "an app of /System/Applications can be closed");
assert.deepEqual(groups.map((g) => g.rssMB), [...groups.map((g) => g.rssMB)].sort((a, b) => b - a), "biggest first");

// closing: unknown ids, locked ids and ids not in the list are ignored
const t = pidsToClose(groups, ["app:Google Chrome", "app:DJSynth", "app:Finder", "tool:ollama", "app:Nope"]);
assert.deepEqual(t.pids.sort(), [200, 201, 401]);
assert.deepEqual(t.apps, ["Google Chrome"]);
assert.ok(!pidsToClose(groups, ["app:Claude", "tool:ffmpeg", "tool:python"]).pids.length, "locked ones are never closed");

// the route answers only the app on this Mac
assert.ok(isLocalRequest("localhost:3217", "http://localhost:3217", "1"));
assert.ok(isLocalRequest("127.0.0.1:3217", null, "1"));
assert.ok(!isLocalRequest("192.168.1.20:3217", null, "1"), "not from the network");
assert.ok(!isLocalRequest("localhost:3217", "https://evil.example", "1"), "not from another site");
assert.ok(!isLocalRequest("localhost:3217", "http://localhost:3217", null), "the app's own header is required");
assert.ok(!isLocalRequest(null, null, "1"));
console.log("ram ok");
