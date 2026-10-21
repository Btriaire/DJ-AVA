// Property checks for the per-stem DSP core (lib/atelier/stemEdit.ts): same length, no clicks at
// region edges, limiter ceiling, gate, strip silence, beat repeat, shift, DC.
// Run: npx esbuild scripts/check-stem-edit.ts --bundle --platform=node --outfile=/tmp/cse.js && node /tmp/cse.js
import * as E from "../lib/atelier/stemEdit";

const sr = 8000;
const N = sr * 2; // 2 s
const sine = (f: number, amp: number) => Float32Array.from({ length: N }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / sr));
const st = (): E.Channels => [sine(220, 0.5), sine(220, 0.5)];
const R = { a: 0.5011, b: 1.0007 }; // edges off the zero crossings, so a hard cut would show
const fails: string[] = [];
const ok = (name: string, cond: boolean, info = "") => { if (!cond) fails.push(`${name} ${info}`); };
const maxJump = (x: Float32Array) => { let m = 0; for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return m; };
const peak = (x: Float32Array, a = 0, b = x.length) => { let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(x[i])); return m; };
const natural = maxJump(st()[0]); // biggest step of the untouched sine
const noClick = (name: string, out: E.Channels) => ok(`${name}: no click`, maxJump(out[0]) <= natural * 1.6 + 1e-6, `maxJump=${maxJump(out[0]).toFixed(4)} natural=${natural.toFixed(4)}`);

const ops: [string, () => E.Channels][] = [
  ["keepOnly", () => E.coreKeepOnly(st(), sr, R)],
  ["silence", () => E.coreSilence(st(), sr, R)],
  ["fadeIn s", () => E.coreFade(st(), sr, R, "in", "s")],
  ["fadeOut exp", () => E.coreFade(st(), sr, R, "out", "exp")],
  ["gain", () => E.coreGain(st(), sr, R, -6)],
  ["normalize", () => E.coreNormalize(st(), sr, R, -1)],
  ["reverse", () => E.coreReverse(st(), sr, R)],
  ["polarity", () => E.coreInvertPolarity(st(), sr, R)],
  ["mono", () => E.coreMono(st(), sr, R)],
  ["dc", () => E.coreRemoveDC(st())],
  ["gate", () => E.coreGate(st(), sr, R, -20)],
  ["strip", () => E.coreStripSilence(st(), sr, -50, 250)],
  ["limit", () => E.coreLimit(st(), sr, R, -12)],
  ["beatRepeat", () => E.coreBeatRepeat(st(), sr, R, 4)],
  ["transient", () => E.coreTransient(st(), sr, R, 6, -6)],
  ["shift", () => E.coreShift(st(), sr, 0.25)],
];
for (const [name, run] of ops) {
  const input = st();
  const before = input[0].slice();
  const out = run();
  ok(`${name}: same length`, out.length === 2 && out[0].length === N && out[1].length === N);
  ok(`${name}: input untouched`, input[0].every((v, i) => v === before[i]));
}

// clicks at region edges (the operations that cut the signal on purpose)
noClick("silence", E.coreSilence(st(), sr, R));
noClick("keepOnly", E.coreKeepOnly(st(), sr, R));
noClick("reverse", E.coreReverse(st(), sr, R));
noClick("polarity", E.coreInvertPolarity(st(), sr, R));
noClick("gain", E.coreGain(st(), sr, R, -12));
noClick("beatRepeat", E.coreBeatRepeat(st(), sr, R, 4));

// silence really is silent inside (away from the 5 ms edges), untouched outside
const sil = E.coreSilence(st(), sr, R)[0];
ok("silence: zero inside", peak(sil, Math.round(0.52 * sr), Math.round(0.98 * sr)) === 0);
ok("silence: untouched far outside", Math.abs(sil[100] - st()[0][100]) < 1e-9);
// keepOnly keeps the region, silences the rest
const keep = E.coreKeepOnly(st(), sr, R)[0];
ok("keepOnly: zero outside", peak(keep, 0, Math.round(0.49 * sr)) === 0 && peak(keep, Math.round(1.01 * sr)) === 0);
// gain -6 dB inside the region
const g = E.coreGain(st(), sr, R, -6)[0];
ok("gain: -6 dB inside", Math.abs(peak(g, Math.round(0.6 * sr), Math.round(0.9 * sr)) - 0.5 * 10 ** (-6 / 20)) < 0.01, `peak=${peak(g, 4800, 7200)}`);
// normalize to -1 dBFS
const nrm = E.coreNormalize(st(), sr, R, -1)[0];
ok("normalize: peak -1 dBFS", Math.abs(peak(nrm, 4000, 8000) - 10 ** (-1 / 20)) < 0.01, `peak=${peak(nrm, 4000, 8000)}`);
// limiter never exceeds the ceiling
const lim = E.coreLimit(st(), sr, R, -12)[0];
const ra = Math.round(R.a * sr), rb = Math.round(R.b * sr);
ok("limit: ceiling", peak(lim, ra, rb) <= 10 ** (-12 / 20) + 1e-4, `peak=${peak(lim, ra, rb)}`);
ok("limit: untouched outside", Math.abs(lim[100] - st()[0][100]) < 1e-9);
// gate: a quiet signal (-40 dB) under a -20 dB threshold gets closed inside the region
const quiet = (): E.Channels => [sine(220, 0.01), sine(220, 0.01)];
const gq = E.coreGate(quiet(), sr, R, -20)[0];
ok("gate: closes quiet signal", peak(gq, Math.round(0.7 * sr), Math.round(0.95 * sr)) < 0.001, `peak=${peak(gq, 5600, 7600)}`);
const gl = E.coreGate(st(), sr, R, -20)[0];
ok("gate: keeps loud signal", peak(gl, Math.round(0.7 * sr), Math.round(0.95 * sr)) > 0.45);
// strip silence zeroes a long quiet passage, keeps loud ones
const mixed = (): E.Channels => { const x = sine(220, 0.5); for (let i = Math.round(0.5 * sr); i < Math.round(1.5 * sr); i++) x[i] = 0.0001 * Math.sin(i); return [x, x.slice()]; };
const strip = E.coreStripSilence(mixed(), sr, -50, 250)[0];
ok("strip: quiet zeroed", peak(strip, Math.round(0.7 * sr), Math.round(1.3 * sr)) === 0);
ok("strip: loud kept", peak(strip, Math.round(0.1 * sr), Math.round(0.4 * sr)) > 0.45);
// beat repeat: second quarter of the region equals the first (away from the 3 ms crossfades)
const br = E.coreBeatRepeat([Float32Array.from({ length: N }, (_, i) => Math.sin(i * 0.37) * 0.5), new Float32Array(N)], sr, R, 4)[0];
const a0 = Math.round(R.a * sr), q = Math.floor((Math.round(R.b * sr) - a0) / 4);
let rep = 0; for (let i = 40; i < q - 40; i++) rep = Math.max(rep, Math.abs(br[a0 + q + i] - br[a0 + i]));
ok("beatRepeat: repeats first slice", rep < 1e-6, `diff=${rep}`);
// shift moves the signal later by 0.25 s
const imp = (): E.Channels => { const x = new Float32Array(N); x[100] = 1; return [x, x.slice()]; };
const sh = E.coreShift(imp(), sr, 0.25)[0];
ok("shift: moved", sh[100 + Math.round(0.25 * sr)] === 1 && sh[100] === 0);
// dc removal
const dc = E.coreRemoveDC([Float32Array.from({ length: N }, () => 0.2), new Float32Array(N)])[0];
ok("dc: removed", Math.abs(dc[500]) < 1e-6);

// transient designer: neutral settings leave the audio alone; +attack lifts a hit's onset
const tn = E.coreTransient(st(), sr, R, 0, 0)[0];
let tdiff = 0; for (let i = 0; i < N; i++) tdiff = Math.max(tdiff, Math.abs(tn[i] - st()[0][i]));
ok("transient: neutral is a no-op", tdiff < 1e-6, `diff=${tdiff}`);
const hits = (): E.Channels => { const x = new Float32Array(N); for (let k = 0; k < 8; k++) { const o = Math.round((0.52 + k * 0.06) * sr); for (let j = 0; j < 400 && o + j < N; j++) x[o + j] = 0.3 * Math.exp(-j / 80) * Math.sin(j * 0.9); } return [x, x.slice()]; };
const onset = Math.round(0.58 * sr);
const tb = E.coreTransient(hits(), sr, R, 9, 0)[0], th = hits()[0];
ok("transient: attack boost", peak(tb, onset, onset + 40) > peak(th, onset, onset + 40) * 1.2, `${peak(tb, onset, onset + 40)} vs ${peak(th, onset, onset + 40)}`);

console.log(fails.length ? "FAIL\n" + fails.join("\n") : "ALL OK");
