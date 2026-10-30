// Real instruments: FluidR3 GM (Frank Wen, CC BY 3.0), Musyng Kite and FatBoy (CC BY-SA 3.0) soundfonts, one mp3 per note (MaRuche/Codestral)
export type InstrumentFamily = "Claviers" | "Percussions mélodiques" | "Cordes" | "Voix" | "Vents" | "Guitares" | "Nappes" | "Basses" | "Cuivres" | "Orchestre";

export interface Instrument {
  id: string;
  label: string;
  family: InstrumentFamily;
  lo: number;
  hi: number;
  pad: boolean;
  font?: "MusyngKite" | "FatBoy";
  src?: string;
}

export const INSTRUMENTS: Instrument[] = [
  { id: "acoustic_grand_piano", label: "Piano à queue", family: "Claviers", lo: 33, hi: 96, pad: false },
  { id: "electric_piano_1", label: "Piano électrique", family: "Claviers", lo: 36, hi: 96, pad: false },
  { id: "electric_piano_2", label: "Piano FM", family: "Claviers", lo: 36, hi: 96, pad: false },
  { id: "harpsichord", label: "Clavecin", family: "Claviers", lo: 36, hi: 89, pad: false },
  { id: "drawbar_organ", label: "Orgue Hammond", family: "Claviers", lo: 36, hi: 96, pad: true },
  { id: "church_organ", label: "Orgue d'église", family: "Claviers", lo: 36, hi: 96, pad: true },
  { id: "celesta", label: "Célesta", family: "Percussions mélodiques", lo: 60, hi: 96, pad: false },
  { id: "vibraphone", label: "Vibraphone", family: "Percussions mélodiques", lo: 48, hi: 89, pad: false },
  { id: "marimba", label: "Marimba", family: "Percussions mélodiques", lo: 48, hi: 89, pad: false },
  { id: "music_box", label: "Boîte à musique", family: "Percussions mélodiques", lo: 60, hi: 96, pad: false },
  { id: "kalimba", label: "Kalimba", family: "Percussions mélodiques", lo: 48, hi: 89, pad: false },
  { id: "steel_drums", label: "Steel drum", family: "Percussions mélodiques", lo: 48, hi: 84, pad: false },
  { id: "string_ensemble_1", label: "Cordes", family: "Cordes", lo: 36, hi: 96, pad: true },
  { id: "pizzicato_strings", label: "Cordes pizzicato", family: "Cordes", lo: 36, hi: 84, pad: false },
  { id: "orchestral_harp", label: "Harpe", family: "Cordes", lo: 36, hi: 96, pad: false },
  { id: "cello", label: "Violoncelle", family: "Cordes", lo: 36, hi: 72, pad: true },
  { id: "choir_aahs", label: "Chœur", family: "Voix", lo: 48, hi: 84, pad: true },
  { id: "voice_oohs", label: "Voix douces", family: "Voix", lo: 48, hi: 84, pad: true },
  { id: "brass_section", label: "Cuivres", family: "Cuivres", lo: 41, hi: 84, pad: true },
  { id: "trumpet", label: "Trompette", family: "Cuivres", lo: 52, hi: 84, pad: true },
  { id: "alto_sax", label: "Saxophone alto", family: "Vents", lo: 49, hi: 81, pad: true },
  { id: "flute", label: "Flûte", family: "Vents", lo: 60, hi: 96, pad: true },
  { id: "pan_flute", label: "Flûte de Pan", family: "Vents", lo: 60, hi: 96, pad: true },
  { id: "acoustic_guitar_nylon", label: "Guitare classique", family: "Guitares", lo: 40, hi: 84, pad: false },
  { id: "electric_guitar_clean", label: "Guitare électrique", family: "Guitares", lo: 40, hi: 86, pad: false },
  { id: "pad_2_warm", label: "Nappe chaude", family: "Nappes", lo: 36, hi: 96, pad: true },
  { id: "pad_1_new_age", label: "Nappe new age", family: "Nappes", lo: 36, hi: 96, pad: true },
  { id: "acoustic_bass", label: "Contrebasse", family: "Basses", lo: 28, hi: 60, pad: false },
  { id: "electric_bass_finger", label: "Basse aux doigts", family: "Basses", lo: 28, hi: 67, pad: false },
  { id: "electric_bass_pick", label: "Basse au médiator", family: "Basses", lo: 28, hi: 67, pad: false },
  { id: "fretless_bass", label: "Basse fretless", family: "Basses", lo: 28, hi: 67, pad: false },
  { id: "slap_bass_1", label: "Basse slap", family: "Basses", lo: 28, hi: 67, pad: false },
  { id: "synth_bass_1", label: "Basse synthé 1", family: "Basses", lo: 28, hi: 72, pad: false },
  { id: "synth_bass_2", label: "Basse synthé 2", family: "Basses", lo: 28, hi: 72, pad: false },
  { id: "mk_choir_aahs", label: "Chœur · Musyng", family: "Voix", lo: 48, hi: 84, pad: true, font: "MusyngKite", src: "choir_aahs" },
  { id: "fb_choir_aahs", label: "Chœur · FatBoy", family: "Voix", lo: 48, hi: 84, pad: true, font: "FatBoy", src: "choir_aahs" },
  { id: "mk_voice_oohs", label: "Voix douces · Musyng", family: "Voix", lo: 48, hi: 84, pad: true, font: "MusyngKite", src: "voice_oohs" },
  { id: "fb_voice_oohs", label: "Voix douces · FatBoy", family: "Voix", lo: 48, hi: 84, pad: true, font: "FatBoy", src: "voice_oohs" },
  { id: "synth_choir", label: "Chœur synthé", family: "Voix", lo: 36, hi: 84, pad: true },
  { id: "mk_synth_choir", label: "Chœur synthé · Musyng", family: "Voix", lo: 36, hi: 84, pad: true, font: "MusyngKite", src: "synth_choir" },
  { id: "lead_6_voice", label: "Voix lead synthé", family: "Voix", lo: 48, hi: 84, pad: true },
  { id: "violin", label: "Violon", family: "Cordes", lo: 55, hi: 96, pad: true },
  { id: "viola", label: "Alto", family: "Cordes", lo: 48, hi: 84, pad: true },
  { id: "contrabass", label: "Contrebasse à l'archet", family: "Cordes", lo: 28, hi: 60, pad: true },
  { id: "string_ensemble_2", label: "Cordes lentes", family: "Cordes", lo: 36, hi: 96, pad: true },
  { id: "tremolo_strings", label: "Cordes trémolo", family: "Cordes", lo: 36, hi: 96, pad: true },
  { id: "mk_string_ensemble_1", label: "Orchestre à cordes · Musyng", family: "Cordes", lo: 36, hi: 96, pad: true, font: "MusyngKite", src: "string_ensemble_1" },
  { id: "fb_string_ensemble_1", label: "Orchestre à cordes · FatBoy", family: "Cordes", lo: 36, hi: 96, pad: true, font: "FatBoy", src: "string_ensemble_1" },
  { id: "mk_violin", label: "Violon · Musyng", family: "Cordes", lo: 55, hi: 96, pad: true, font: "MusyngKite", src: "violin" },
  { id: "mk_cello", label: "Violoncelle · Musyng", family: "Cordes", lo: 36, hi: 72, pad: true, font: "MusyngKite", src: "cello" },
  { id: "synth_strings_1", label: "Cordes synthé", family: "Cordes", lo: 36, hi: 96, pad: true },
  { id: "mk_brass_section", label: "Section de cuivres · Musyng", family: "Cuivres", lo: 41, hi: 84, pad: true, font: "MusyngKite", src: "brass_section" },
  { id: "fb_brass_section", label: "Section de cuivres · FatBoy", family: "Cuivres", lo: 41, hi: 84, pad: true, font: "FatBoy", src: "brass_section" },
  { id: "trombone", label: "Trombone", family: "Cuivres", lo: 40, hi: 77, pad: true },
  { id: "tuba", label: "Tuba", family: "Cuivres", lo: 28, hi: 58, pad: true },
  { id: "french_horn", label: "Cor d'harmonie", family: "Cuivres", lo: 41, hi: 77, pad: true },
  { id: "mk_french_horn", label: "Cors · Musyng", family: "Cuivres", lo: 41, hi: 77, pad: true, font: "MusyngKite", src: "french_horn" },
  { id: "muted_trumpet", label: "Trompette bouchée", family: "Cuivres", lo: 52, hi: 84, pad: true },
  { id: "mk_trumpet", label: "Trompette · Musyng", family: "Cuivres", lo: 52, hi: 84, pad: true, font: "MusyngKite", src: "trumpet" },
  { id: "synth_brass_1", label: "Cuivres synthé 80s", family: "Cuivres", lo: 36, hi: 84, pad: true },
  { id: "synth_brass_2", label: "Cuivres synthé doux", family: "Cuivres", lo: 36, hi: 84, pad: true },
  { id: "orchestra_hit", label: "Orchestra hit", family: "Orchestre", lo: 48, hi: 84, pad: false },
  { id: "mk_orchestra_hit", label: "Orchestra hit · Musyng", family: "Orchestre", lo: 48, hi: 84, pad: false, font: "MusyngKite", src: "orchestra_hit" },
  { id: "timpani", label: "Timbales", family: "Orchestre", lo: 36, hi: 60, pad: false },
  { id: "mk_synth_bass_1", label: "Basse synthé 1 · Musyng", family: "Basses", lo: 28, hi: 72, pad: false, font: "MusyngKite", src: "synth_bass_1" },
  { id: "fb_synth_bass_1", label: "Basse synthé 1 · FatBoy", family: "Basses", lo: 28, hi: 72, pad: false, font: "FatBoy", src: "synth_bass_1" },
  { id: "mk_synth_bass_2", label: "Basse synthé 2 · Musyng", family: "Basses", lo: 28, hi: 72, pad: false, font: "MusyngKite", src: "synth_bass_2" },
  { id: "fb_synth_bass_2", label: "Basse synthé 2 · FatBoy", family: "Basses", lo: 28, hi: 72, pad: false, font: "FatBoy", src: "synth_bass_2" },
  { id: "lead_8_bass__lead", label: "Basse et lead synthé", family: "Basses", lo: 28, hi: 72, pad: false }
];

export function instrument(id: string): Instrument | undefined {
  return INSTRUMENTS.find(i => i.id === id);
}

export function sampleUrl(inst: Instrument, note: string): string {
  return `https://gleitz.github.io/midi-js-soundfonts/${inst.font ?? "FluidR3_GM"}/${inst.src ?? inst.id}-mp3/${note}.mp3`;
}

export function instrumentsOf(family: InstrumentFamily): Instrument[] {
  return INSTRUMENTS.filter(i => i.family === family);
}

export function noteName(midi: number): string {
  const notes = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
  return notes[midi % 12] + (Math.floor(midi / 12) - 1);
}

export function zonesFor(inst: Instrument): number[] {
  const zones: number[] = [];
  for (let n = inst.lo; n <= inst.hi; n += 3) zones.push(n);
  if (zones[zones.length - 1] !== inst.hi) zones.push(inst.hi);
  return zones;
}

export function nearestZone(midi: number, zones: number[]): { zone: number; rate: number } {
  if (zones.length === 0) return { zone: midi, rate: 1 };
  let closest = zones[0];
  let minDiff = Math.abs(midi - closest);
  for (const z of zones) {
    const diff = Math.abs(midi - z);
    if (diff < minDiff || (diff === minDiff && z < closest)) {
      closest = z;
      minDiff = diff;
    }
  }
  return { zone: closest, rate: 2 ** ((midi - closest) / 12) };
}

export function selfTest(): void {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
  assert(noteName(60) === "C4", "noteName(60) !== C4");
  assert(noteName(70) === "Bb4", "noteName(70) !== Bb4");
  assert(noteName(21) === "A0", "noteName(21) !== A0");
  assert(zonesFor({id:"x",label:"x",family:"Claviers",lo:60,hi:66,pad:false}).join() === "60,63,66", "zonesFor(60-66) incorrect");
  assert(zonesFor({...INSTRUMENTS[0],lo:60,hi:67}).join() === "60,63,66,67", "zonesFor(60-67) incorrect");
  assert(nearestZone(64, [60,63,66]).zone === 63, "nearestZone(64,[60,63,66]) incorrect");
  assert(Math.abs(nearestZone(64,[60,63,66]).rate - 2 ** (1/12)) < 1e-9, "nearestZone rate incorrect");
  assert(nearestZone(62,[60,63]).zone === 63, "nearestZone(62,[60,63]) incorrect");
  assert(instrument("cello")?.family === "Cordes", "instrument(cello) incorrect");
  const ids = new Set(INSTRUMENTS.map(i => i.id));
  assert(ids.size === INSTRUMENTS.length, "duplicate instrument ids");
  INSTRUMENTS.forEach(i => assert(i.lo < i.hi, `invalid range for ${i.id}`));
  assert(instrumentsOf("Basses").length === 12, "instrumentsOf(Basses) incorrect");
  assert(instrument("slap_bass_1")?.lo === 28, "slap_bass_1 lo incorrect");
  assert(INSTRUMENTS.every((inst, i) => INSTRUMENTS.findIndex((other) => other.id === inst.id) === i), "Duplicate instrument IDs");
  assert(INSTRUMENTS.every((inst) => inst.lo < inst.hi), "Invalid note range");
  assert(sampleUrl(INSTRUMENTS.find((inst) => inst.id === "mk_choir_aahs")!, "C4") === "https://gleitz.github.io/midi-js-soundfonts/MusyngKite/choir_aahs-mp3/C4.mp3", "Incorrect sample URL for mk_choir_aahs");
  assert(sampleUrl(INSTRUMENTS.find((inst) => inst.id === "trumpet")!, "C4") === "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/trumpet-mp3/C4.mp3", "Incorrect sample URL for trumpet");
  assert(["Claviers", "Percussions mélodiques", "Cordes", "Voix", "Vents", "Guitares", "Nappes", "Basses", "Cuivres", "Orchestre"].every((family) => INSTRUMENTS.some((inst) => inst.family === family)), "Missing instrument family");
}
