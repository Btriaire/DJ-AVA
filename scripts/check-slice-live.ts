// npx tsx scripts/check-slice-live.ts — LIVE pads of Basse / Autres / Guitare / Piano du morceau
import assert from "node:assert/strict";

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
(globalThis as Record<string, unknown>).setInterval = () => 0;

void (async () => {
const { StemSlicer, LIVE_PADS } = await import("../lib/audio/stemSlicer");

const buf = { duration: 200, sampleRate: 44100, getChannelData: () => new Float32Array(0) } as unknown as AudioBuffer;
const deck = {
  stemHash: "abc123", stemNames: ["drums", "bass", "other", "vocals", "guitar", "piano"],
  bpm: 120, beatGridOffset: 0.25, duration: 200, pos: 20.1, playing: false, playRate: 1,
  getStemBuffer: () => buf, position() { return this.pos; },
};
// a stand-in for the Web Audio graph: every node, param and method answers, nothing sounds
const any = (): unknown => new Proxy(function () {}, { get: (_t, k) => (k === "value" || k === "currentTime" ? 0 : k === Symbol.toPrimitive ? () => 0 : any()), apply: () => any() });
const engine = { deckA: deck, deckB: deck, ctx: any(), masterIn: any() } as never;
// the module's deck and its loaded stem, without the audio graph
const proto = StemSlicer.prototype as unknown as Record<string, unknown>;
proto.deck = () => deck;
proto.gateModule = () => {};
const g = new StemSlicer(engine, "guitar");
(g as unknown as { lastBuf: AudioBuffer }).lastBuf = buf; // the stem as if loaded

const live = () => g.pads().filter((p) => p.id.startsWith("live"));
assert.equal(live().length, LIVE_PADS);
assert.ok(live().every((p) => p.label === "● LIVE"));
// the brake and half-tempo pads keep their places (their keys stay the same)
assert.deepEqual(g.pads().slice(8, 10).map((p) => p.id), ["brake", "half"]);

// 4 beats at 20.1 s, beat = 0.5 s, beat lines at 0.25 + 0.5k: the last one before the playhead is 19.75 -> 17.75..19.75
g.liveBeats = 4;
assert.equal(g.captureLive(0), null);
const s0 = g.slice(100)!;
assert.deepEqual([s0.t, s0.dur], [17.75, 2]);
assert.equal(live()[0].label, "LIVE 1");
assert.ok(g.hasLive());

// kept per song: another instance on the same song finds it
const g2 = new StemSlicer(engine, "guitar");
assert.deepEqual([g2.slice(100)?.t, g2.slice(100)?.dur], [17.75, 2]);

// no tempo: refused
deck.bpm = 0;
assert.match(g.liveBlocked() ?? "", /Tempo/);
deck.bpm = 120;

// a 4-track song has no guitar stem: the module says so
deck.stemNames = ["drums", "bass", "other", "vocals"];
assert.match(g.warning() ?? "", /6 pistes/);
deck.stemNames = ["drums", "bass", "other", "vocals", "guitar", "piano"];

// emptied
(g as unknown as { repeatSlice: () => void }).repeatSlice = () => {};
g.clearLive();
assert.equal(g.slice(100), null);
assert.ok(!g.hasLive());
console.log("slice live pads: ok");
})();
