// Fixed contract of the Acoustique harmony: the strongest chord of a bar and what each style plays on it
import { HARMONY_STYLES, chordLabel, chordNotes, harmonyStep, strongestChords, type HarmonyNote, type HarmonyOpts, type HarmonyStyleId } from "./chordHarmonyNotes";
import { instrument } from "@/lib/sampleFont";

type N = [number, number, number, number];
const held = (bar: number, midis: number[], vel = 0.8): N[] => midis.map((m) => [bar * 2, bar * 2 + 2, m, vel]);

export function chordHarmonyTest(): string[] {
  const fails: string[] = [];
  const check = (ok: boolean, m: string) => { if (!ok) fails.push(m); };

  // ---- the strongest chord of each bar, among all 24 ----
  const Am = [9, 11, 0, 2, 4, 5, 7]; // A minor scale
  const one = (other: N[], bass: N[]) => strongestChords(other, bass, Am, 2, 0, 2)[0];
  let c = one(held(0, [57, 60, 64]), held(0, [45]));
  check(c.root === 9 && c.minor && !c.rest, "A C E over A is A minor");
  c = one(held(0, [56, 59, 64]), held(0, [40]));
  check(c.root === 4 && !c.minor, "E G# B over E is E major, outside the A minor scale");
  c = one(held(0, [57, 60, 64, 63]), held(0, [45]));
  check(c.root === 9 && c.minor, "a passing note does not change the chord");
  // in the scale wins a close call: F major (in the scale) against a slightly stronger chord outside it
  const close = strongestChords([[0, 2, 53, 0.8], [0, 2, 57, 0.8], [0, 2, 60, 0.8], [0, 2, 56, 0.85]], [], Am, 2, 0, 2)[0];
  check(close.root === 5 && !close.minor, "a chord of the scale wins a close call");
  // a slightly stronger new chord does not replace the one playing
  const two = strongestChords([...held(0, [57, 60, 64]), [2, 4, 57, 0.72], [2, 4, 60, 0.72], [2, 4, 64, 0.72], [2, 4, 53, 0.75], [2, 4, 65, 0.1]], held(1, []), Am, 2, 0, 4);
  check(two[1].root === 9 && two[1].minor, "the playing chord stays on a close call");
  const song = strongestChords([...held(0, [57, 60, 64], 0.9), ...held(2, [48, 52, 55], 0.3)], [...held(0, [45], 0.9), ...held(2, [36], 0.3)], Am, 2, 0, 6);
  check(song.length === 3, "one chord per bar");
  check(song[1].rest && !song[0].rest, "a bar without notes rests");
  check(song[1].root === 9 && song[1].minor, "a rest keeps the last chord");
  check(song[2].root === 0 && !song[2].minor, "then C major");
  check(song[0].strength > song[2].strength && song[0].strength <= 1 && song[2].strength > 0, "a loud bar is stronger than a quiet one");
  check(strongestChords([], [], Am, 2, 0, 4).every((b) => b.rest), "no notes: everything rests");
  check(strongestChords([], [], Am, 0, 0, 4).length === 0, "no bar length: no bars");

  // ---- what the bar really plays: its bass note and its seventh ----
  const Cmaj = [0, 2, 4, 5, 7, 9, 11];
  const inv = strongestChords(held(0, [48, 52, 55, 60], 0.9), held(0, [40], 0.5), Cmaj, 2, 0, 2)[0];
  check(inv.root === 0 && !inv.minor && inv.bass === 4, "C over E: the chord stays C, its bass is E");
  check(strongestChords(held(0, [57, 60, 64]), held(0, [45]), Am, 2, 0, 2)[0].bass === 9, "a root in the bass");
  check(strongestChords(held(0, [57, 60, 64]), [], Am, 2, 0, 2)[0].bass === 9, "no bass part: the root");
  check(strongestChords(held(0, [48, 52, 55, 60], 0.9), held(0, [42], 0.5), Cmaj, 2, 0, 2)[0].bass === 0, "a bass note outside the chord is not followed");
  check(strongestChords(held(0, [57, 60, 64, 67]), held(0, [45]), Am, 2, 0, 2)[0].seventh, "A C E G has its seventh");
  check(!strongestChords(held(0, [57, 60, 64]), held(0, [45]), Am, 2, 0, 2)[0].seventh, "A C E has none");
  check(strongestChords([], [], Am, 2, 0, 2).every((b) => !b.seventh && b.bass === 9), "a rest: no seventh, the tonic in the bass");

  const C = [0, 2, 4, 5, 7, 9, 11];
  check(chordNotes(9, true, "triad", Am).join() === "57,60,64", "A minor triad");
  check(chordNotes(4, false, "triad", Am).join() === "52,56,59", "E major triad, out of the scale");
  check(chordNotes(9, true, "seventh", Am).join() === "57,60,64,67", "minor seventh");
  check(chordNotes(0, false, "seventh", C).join() === "48,52,55,59", "major seventh when the scale has it");
  check(chordNotes(7, false, "seventh", C).join() === "55,59,62,65", "dominant seventh otherwise");
  check(chordNotes(9, true, "ninth", Am).join() === "57,60,64,67,71", "ninth");
  check(chordLabel(9, true, false) === "Am" && chordLabel(10, false, true) === "Bb" && chordLabel(1, false, false) === "C#", "chord names");

  // ---- the styles ----
  const ids: HarmonyStyleId[] = ["piano", "cordes", "tenebreux", "flamenco"];
  check(HARMONY_STYLES.map((s) => s.id).join() === ids.join(), "the four styles, in order");
  const inst = (id: HarmonyStyleId) => HARMONY_STYLES.find((s) => s.id === id)?.instrument;
  check(inst("piano") === "sfz_steinway", "piano is the Steinway");
  check(inst("cordes") === "mk_string_ensemble_1", "strings are the orchestral ensemble");
  check(inst("flamenco") === "mk_acoustic_guitar_nylon", "flamenco is the nylon guitar");
  check(inst("tenebreux") === null, "the dark mode is a synth, no sample");
  for (const s of HARMONY_STYLES) if (s.instrument) check(!!instrument(s.instrument), `${s.id}: instrument exists`);

  const beat = 0.5;
  const chords = [[48, 52, 55], [50, 53, 57], [59, 62, 65], [57, 60, 64], [53, 57, 60], [52, 56, 59], [57, 60, 64, 67], [48, 52, 55, 59, 62]];
  const range: Record<HarmonyStyleId, [number, number]> = { piano: [36, 86], cordes: [36, 86], tenebreux: [36, 72], flamenco: [40, 84] };
  const barOf = (id: HarmonyStyleId, ch: number[], b = beat, opts: HarmonyOpts = {}) => {
    const out: { step: number; n: HarmonyNote }[] = [];
    for (let step = 0; step < 8; step++) for (const n of harmonyStep(id, step, ch, ch.map((m) => m + 12), b, opts)) out.push({ step, n });
    return out;
  };
  for (const id of ids) for (const ch of chords) for (const phrase of [0, 1, 2, 3]) {
    const pcs = ch.map((m) => m % 12);
    const bar = barOf(id, ch, beat, { phrase, seed: phrase * 7 });
    const first = bar.filter((x) => x.step === 0).map((x) => x.n);
    check(first.length > 0, `${id}: plays on the downbeat`);
    for (const { n } of bar) {
      check(pcs.includes(n.midi % 12), `${id} ${ch}: ${n.midi} is in the chord`);
      check(n.midi >= range[id][0] && n.midi <= range[id][1], `${id} ${ch}: ${n.midi} in range`);
      check(n.vel > 0 && n.vel <= 1 && n.dur > 0 && n.delay >= 0, `${id}: valid note`);
    }
    check(Math.min(...first.map((n) => n.midi)) % 12 === ch[0] % 12, `${id} ${ch}: the root is the lowest note of the downbeat`);
    for (const m of ch.slice(0, 3)) check(bar.some((x) => x.n.midi % 12 === m % 12), `${id} ${ch}: ${m} sounds in the bar`);
  }
  for (const id of ids) for (const ch of chords) check(new Set(barOf(id, ch).filter((x) => x.step === 0).map((x) => x.n.midi % 12)).size >= 3, `${id} ${ch}: a full chord on the first downbeat of a phrase`);
  check(barOf("flamenco", chords[7]).some((x) => x.n.midi % 12 === 62 % 12), "flamenco: the ninth is heard");
  check(barOf("tenebreux", chords[6]).some((x) => x.n.midi % 12 === 67 % 12), "dark: the seventh is heard");

  for (const id of ["cordes", "tenebreux"] as const) {
    const bar = barOf(id, chords[0]);
    check(bar.every((x) => x.step === 0 && x.n.kind === "pad"), `${id}: one held chord`);
    check(bar.every((x) => Math.abs(x.n.dur - 4 * beat) < 1e-6), `${id}: held for one bar by default`);
    check(barOf(id, chords[0], beat, { bars: 3 }).every((x) => Math.abs(x.n.dur - 12 * beat) < 1e-6), `${id}: legato over 3 bars`);
    check(barOf(id, chords[0], beat, { dur: 1.3 }).every((x) => Math.abs(x.n.dur - 1.3) < 1e-6), `${id}: an explicit length when it starts mid-bar`);
  }
  const piano = barOf("piano", chords[0]);
  check(piano.every((x) => x.n.kind === "pluck"), "piano notes are struck");
  check(piano.some((x) => x.step === 4), "piano answers on beat 3");
  const pianoArp = barOf("piano", chords[0], beat, { phrase: 1 });
  check(pianoArp.some((x) => x.step === 2) && pianoArp.filter((x) => x.step === 0).length < piano.filter((x) => x.step === 0).length, "piano: the odd bars of a phrase are broken chords");
  check(JSON.stringify(barOf("piano", chords[0], beat, { seed: 3 })) === JSON.stringify(barOf("piano", chords[0], beat, { seed: 3 })), "the human feel is reproducible");
  check(JSON.stringify(barOf("piano", chords[0], beat, { seed: 3 })) !== JSON.stringify(barOf("piano", chords[0], beat, { seed: 4 })), "and differs from bar to bar");
  for (const id of ids) for (const seed of [0, 1, 2, 3, 4, 5]) for (const { n } of barOf(id, chords[3], beat, { seed })) check(n.delay < 2 * beat, `${id}: a note stays near its place`);

  const fl = barOf("flamenco", chords[0]);
  check(fl.every((x) => x.n.kind === "pluck"), "guitar notes are plucked");
  const at = (s: number) => fl.filter((x) => x.step === s).map((x) => x.n);
  check(at(0).length === 6, "flamenco: six strings on the downbeat");
  const asc = at(0).every((n, i, a) => i === 0 || (n.delay > a[i - 1].delay && n.midi > a[i - 1].midi));
  check(asc, "flamenco: the downstroke goes from low to high, one string after the other");
  check(Math.max(...at(0).map((n) => n.delay)) <= 0.08, "flamenco: the strum is fast");
  for (const s of [3, 6]) check(at(s).length > 0, `flamenco: 3-3-2 accent on step ${s}`);
  const avg = (ns: HarmonyNote[]) => ns.reduce((a, n) => a + n.vel, 0) / ns.length;
  check(at(5).length > 0 && avg(at(5)) < avg(at(3)), "flamenco: the upstroke on step 5 is softer");
  check(at(5).length > 0 && at(5)[0].midi > at(5)[at(5).length - 1].midi, "flamenco: the upstroke goes from high to low");
  check(barOf("flamenco", chords[0], beat, { phrase: 3 }).length > fl.length, "flamenco: the last bar of a phrase has a fill");

  check(HARMONY_STYLES.every((s) => s.trim > 0 && s.trim <= 1), "trims");

  for (const id of ids) for (const bassPc of [4, 7]) for (const phrase of [0, 1, 3]) {
    const bar = barOf(id, chords[0], beat, { bass: bassPc, phrase });
    const first = bar.filter((x) => x.step === 0).map((x) => x.n);
    check(Math.min(...first.map((n) => n.midi)) % 12 === bassPc, `${id}: the chord stands on its real bass note ${bassPc}`);
    for (const { n } of bar) {
      check([0, 4, 7].includes(n.midi % 12), `${id} over ${bassPc}: ${n.midi} is in the chord`);
      check(n.midi >= range[id][0] && n.midi <= range[id][1], `${id} over ${bassPc}: ${n.midi} in range`);
    }
  }
  check(barOf("cordes", chords[0], beat, { bars: 0.5 }).every((x) => Math.abs(x.n.dur - 2 * beat) < 1e-6), "half a bar when chords change twice a bar");

  // SampledInstrument refuses a note above 24 alive: nothing may be lost, a release is 0.25 s
  for (const id of ["piano", "flamenco"] as const) for (const b of [0.33, 0.5, 1]) for (const ch of [chords[0], chords[7]]) {
    const ev = [0, 1, 2, 3].flatMap((p) => barOf(id, ch, b, { phrase: p, seed: p }).map(({ step, n }) => { const t = p * 8 * (b / 2) + step * (b / 2) + n.delay; return [t, t + n.dur + 0.25]; }));
    const worst = Math.max(...ev.map(([t]) => ev.filter(([s, e]) => s <= t && e > t).length));
    check(worst <= 24, `${id} at ${b} s a beat: ${worst} notes alive`);
  }
  return fails;
}
