// Real instruments of the Synth: FluidR3 GM soundfont (Frank Wen, CC BY 3.0), one mp3 per note (MaRuche/Codestral)
export type InstrumentFamily = "Claviers" | "Percussions mélodiques" | "Cordes" | "Voix" | "Vents" | "Guitares" | "Nappes";
export interface Instrument { id: string; label: string; family: InstrumentFamily; lo: number; hi: number; pad: boolean }

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
  { id: "brass_section", label: "Cuivres", family: "Vents", lo: 41, hi: 84, pad: true },
  { id: "trumpet", label: "Trompette", family: "Vents", lo: 52, hi: 84, pad: true },
  { id: "alto_sax", label: "Saxophone alto", family: "Vents", lo: 49, hi: 81, pad: true },
  { id: "flute", label: "Flûte", family: "Vents", lo: 60, hi: 96, pad: true },
  { id: "pan_flute", label: "Flûte de Pan", family: "Vents", lo: 60, hi: 96, pad: true },
  { id: "acoustic_guitar_nylon", label: "Guitare classique", family: "Guitares", lo: 40, hi: 84, pad: false },
  { id: "electric_guitar_clean", label: "Guitare électrique", family: "Guitares", lo: 40, hi: 86, pad: false },
  { id: "pad_2_warm", label: "Nappe chaude", family: "Nappes", lo: 36, hi: 96, pad: true },
  { id: "pad_1_new_age", label: "Nappe new age", family: "Nappes", lo: 36, hi: 96, pad: true }
];

export function instrument(id: string): Instrument | undefined {
  return INSTRUMENTS.find(i => i.id === id);
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
}
