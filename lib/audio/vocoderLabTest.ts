// Fixed contract: the vocoder is its own module, it no longer lives in Vox FX
import { readFileSync } from "node:fs";
import { VOCODER_VARIANTS } from "./jamVocoder";
import { carrierNotes, cleanMelody, melodyAt, nextVariant, vocoderGain } from "./vocoderLab";

export function vocoderLabTest(): string[] {
  const fails: string[] = [];
  const check = (ok: boolean, m: string) => { if (!ok) fails.push(m); };
  const read = (p: string) => readFileSync(p, "utf8");
  check(!/vocoder/i.test(read("lib/audio/jamModules.ts")), "Vox FX no longer holds a vocoder");
  check(!/vocoder/i.test(read("components/jam/VoxFxPanel.tsx")), "the Vox FX panel no longer shows it");
  const lab = read("lib/audio/vocoderLab.ts");
  check(lab.includes('this.gateModule("vocoder")'), "the module listens to the picker");
  check(lab.includes("if (this.active)") && lab.includes("onJamTick("), "nothing is scheduled while closed");
  check(lab.includes("protected closed()"), "closing stops the vocoder");
  check(lab.includes("this.vocoder.out.connect(this.bus)"), "it plays through the module's bus");
  check(lab.includes("deck.crowdInput") === false, "it stays inside the voice stem's chain");
  check(lab.includes('super(engine, "vocals")'), "it listens to the voice");
  check(lab.includes("djsynth.vocoder.v1"), "its settings are remembered");
  const page = read("app/page.tsx");
  for (const k of ['"vocoder"', "vocoder: boolean", "vocoder: true", "modules.vocoder && <VocoderPanel", 'S("vocoder")', 'key: "vocoder"']) check(page.includes(k), `page: ${k}`);
  check(/vocoder:/.test(read("lib/moduleThumbs.ts")), "the module has a thumbnail");
  const ids = VOCODER_VARIANTS.map((v) => v.id);
  check(nextVariant("studio", 1) === ids[1], "next variant");
  check(nextVariant(ids[ids.length - 1], 1) === ids[0], "wraps forward");
  check(nextVariant(ids[0], -1) === ids[ids.length - 1], "wraps backward");
  check(nextVariant("unknown", 1) === ids[1], "an unknown id starts from Studio");
  // what the voice makes speak
  const chord = [57, 60, 64, 67];
  check(carrierNotes("chord", chord, 72, false).join() === "57,60,64,67", "chord: the melody is ignored");
  check(carrierNotes("melody", chord, 72, false).join() === "72", "melody: the sung note alone");
  check(carrierNotes("melody", chord, null, false).join() === "57,60,64,67", "melody without any sung note yet: the chord");
  check(carrierNotes("both", chord, 72, false).join() === "57,60,64,72", "both: the melody over the triad, the worklet has 4 voices");
  check(carrierNotes("both", chord, 64, false).join() === "57,60,64,67", "both: a note already in the chord is not doubled");
  check(carrierNotes("both", chord, null, false).join() === "57,60,64,67", "both without a sung note: the chord");
  check(carrierNotes("both", chord, 72, true).join() === "72", "a one-note variant keeps the melody, not the lowest note");
  const segs = [{ k0: 10, k1: 20, midi: 62 }, { k0: 30, k1: 40, midi: 65 }];
  check(melodyAt(segs, 0.1, 1.5) === 62, "inside a sung note");
  check(melodyAt(segs, 0.1, 2.5) === null, "between two sung notes");
  check(melodyAt(segs, 0.1, 3.0) === 65, "on its first instant");
  check(melodyAt([], 0.1, 1) === null, "no contour");
  // the raw contour has octave errors and stray notes: a machine voice would sing them out of tune
  const Eb = [3, 5, 7, 8, 10, 0, 2];
  const seg = (midi: number, k0 = 0, k1 = 10) => ({ k0, k1, midi });
  const clean = cleanMelody([seg(67), seg(68), seg(70), seg(72), seg(70), seg(86), seg(43)], Eb);
  check(clean.map((n) => n.midi).join() === "67,68,70,72,70,74,67", "a note an octave or more away from the sung range comes back into it");
  check(cleanMelody([seg(66), seg(66), seg(66)], Eb)[0].midi % 12 !== 6, "a note outside the key lands on the key");
  check(cleanMelody([seg(66), seg(66), seg(66)], Eb).every((n) => Eb.includes(n.midi % 12)), "every note is in the key");
  check(cleanMelody([], Eb).length === 0, "no notes");
  const kept = cleanMelody([seg(67, 5, 9)], Eb)[0];
  check(kept.k0 === 5 && kept.k1 === 9, "the timing does not move");
  const long = cleanMelody([seg(60, 0, 100), seg(72, 100, 101), seg(61, 101, 102)], [0, 2, 4, 5, 7, 9, 11]);
  check(long[1].midi === 60 + 12 - 12 || long[1].midi === 72, "the range comes from the time really sung");
  const notes = (id: string) => VOCODER_VARIANTS.find((v) => v.id === id)?.notes;
  check(notes("robot") === "melody" && notes("talk") === "melody" && notes("studio") === "chord" && notes("choeur") === "chord", "Robot and Talk sing the melody");
  check(lab.includes("DynamicsCompressorNode"), "the vocoder is compressed: louder without clipping");
  check(lab.includes("vocoderGain(this.level)"), "the level knob acts after the compressor");
  check(Math.abs(vocoderGain(0.8) - 1.25) < 1e-9 && Math.abs(vocoderGain(1.6) - 2.5) < 1e-9 && vocoderGain(0) === 0, "the knob is linear, 80 % is the measured default");
  check(lab.includes("cleanMelody("), "the module sings the cleaned melody");
  check(lab.includes("strongestChords("), "the chords come from the 24-chord detection");
  check(!lab.includes("chordDegreeAt"), "not from the scale-only one");
  check(lab.includes('["level", "params", "variant", "source"]'), "the choice is remembered");
  return fails;
}
