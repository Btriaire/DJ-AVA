// Real instruments: FluidR3 GM (Frank Wen, CC BY 3.0), Musyng Kite and FatBoy (CC BY-SA 3.0) soundfonts, one mp3 per note (MaRuche/Codestral)
export type InstrumentFamily = "Acoustique" | "Claviers" | "Percussions mélodiques" | "Cordes" | "Voix" | "Vents" | "Guitares" | "Nappes" | "Basses" | "Cuivres" | "Orchestre" | "Monde";

export interface Instrument {
  id: string;
  label: string;
  family: InstrumentFamily;
  lo: number;
  hi: number;
  pad: boolean;
  font?: "MusyngKite" | "FatBoy";
  src?: string;
  sfz?: string; // a multisampled bank of danigb/samples (velocity layers, round robins): its websfz path
  sfzPath?: string; // the sample folder, when the bank's own description points to the wrong one
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
  { id: "lead_8_bass__lead", label: "Basse et lead synthé", family: "Basses", lo: 28, hi: 72, pad: false },
  { id: "mk_acoustic_grand_piano", label: "Piano à queue · Musyng", family: "Claviers", lo: 33, hi: 96, pad: false, font: "MusyngKite", src: "acoustic_grand_piano" },
  { id: "fb_acoustic_grand_piano", label: "Piano à queue · FatBoy", family: "Claviers", lo: 33, hi: 96, pad: false, font: "FatBoy", src: "acoustic_grand_piano" },
  { id: "bright_acoustic_piano", label: "Piano brillant", family: "Claviers", lo: 33, hi: 96, pad: false },
  { id: "honkytonk_piano", label: "Piano bastringue", family: "Claviers", lo: 33, hi: 96, pad: false },
  { id: "mk_electric_piano_1", label: "Piano électrique · Musyng", family: "Claviers", lo: 36, hi: 96, pad: false, font: "MusyngKite", src: "electric_piano_1" },
  { id: "clavinet", label: "Clavinet", family: "Claviers", lo: 36, hi: 89, pad: false },
  { id: "rock_organ", label: "Orgue rock", family: "Claviers", lo: 36, hi: 96, pad: true },
  { id: "accordion", label: "Accordéon", family: "Claviers", lo: 48, hi: 84, pad: true },
  { id: "xylophone", label: "Xylophone", family: "Percussions mélodiques", lo: 60, hi: 96, pad: false },
  { id: "glockenspiel", label: "Glockenspiel", family: "Percussions mélodiques", lo: 72, hi: 105, pad: false },
  { id: "tubular_bells", label: "Cloches tubulaires", family: "Percussions mélodiques", lo: 60, hi: 84, pad: false },
  { id: "dulcimer", label: "Tympanon", family: "Percussions mélodiques", lo: 48, hi: 84, pad: false },
  { id: "acoustic_guitar_steel", label: "Guitare folk", family: "Guitares", lo: 40, hi: 84, pad: false },
  { id: "mk_acoustic_guitar_nylon", label: "Guitare classique · Musyng", family: "Guitares", lo: 40, hi: 84, pad: false, font: "MusyngKite", src: "acoustic_guitar_nylon" },
  { id: "electric_guitar_jazz", label: "Guitare jazz", family: "Guitares", lo: 40, hi: 84, pad: false },
  { id: "electric_guitar_muted", label: "Guitare étouffée", family: "Guitares", lo: 40, hi: 84, pad: false },
  { id: "overdriven_guitar", label: "Guitare saturée", family: "Guitares", lo: 40, hi: 84, pad: true },
  { id: "distortion_guitar", label: "Guitare distorsion", family: "Guitares", lo: 40, hi: 84, pad: true },
  { id: "oboe", label: "Hautbois", family: "Vents", lo: 58, hi: 91, pad: true },
  { id: "english_horn", label: "Cor anglais", family: "Vents", lo: 52, hi: 84, pad: true },
  { id: "clarinet", label: "Clarinette", family: "Vents", lo: 50, hi: 91, pad: true },
  { id: "bassoon", label: "Basson", family: "Vents", lo: 34, hi: 72, pad: true },
  { id: "piccolo", label: "Piccolo", family: "Vents", lo: 74, hi: 108, pad: true },
  { id: "recorder", label: "Flûte à bec", family: "Vents", lo: 60, hi: 96, pad: true },
  { id: "mk_flute", label: "Flûte · Musyng", family: "Vents", lo: 60, hi: 96, pad: true, font: "MusyngKite", src: "flute" },
  { id: "soprano_sax", label: "Saxophone soprano", family: "Vents", lo: 56, hi: 87, pad: true },
  { id: "tenor_sax", label: "Saxophone ténor", family: "Vents", lo: 44, hi: 75, pad: true },
  { id: "baritone_sax", label: "Saxophone baryton", family: "Vents", lo: 36, hi: 69, pad: true },
  { id: "mk_alto_sax", label: "Saxophone alto · Musyng", family: "Vents", lo: 49, hi: 81, pad: true, font: "MusyngKite", src: "alto_sax" },
  { id: "harmonica", label: "Harmonica", family: "Vents", lo: 60, hi: 84, pad: true },
  { id: "sitar", label: "Sitar", family: "Monde", lo: 48, hi: 84, pad: false },
  { id: "banjo", label: "Banjo", family: "Monde", lo: 48, hi: 84, pad: false },
  { id: "shamisen", label: "Shamisen", family: "Monde", lo: 48, hi: 84, pad: false },
  { id: "koto", label: "Koto", family: "Monde", lo: 48, hi: 89, pad: false },
  { id: "bagpipe", label: "Cornemuse", family: "Monde", lo: 55, hi: 84, pad: true },
  { id: "fiddle", label: "Violon folk", family: "Monde", lo: 55, hi: 96, pad: true },
  { id: "shakuhachi", label: "Shakuhachi", family: "Monde", lo: 55, hi: 89, pad: false },
  { id: "ocarina", label: "Ocarina", family: "Monde", lo: 60, hi: 89, pad: false },
  // multisampled banks, several velocity layers per note: VCSL (CC0), Splendid Grand Piano (public domain), Greg Sullivan E-Pianos (CC BY 3.0), jRhodes3d (CC BY-NC), Smolken double bass (CC0)
  { id: "sfz_steinway", label: "Piano à queue Steinway", family: "Acoustique", lo: 21, hi: 108, pad: false, sfz: "vcsl/Zithers/grand-piano-steinway-b.websfz.json" },
  { id: "sfz_splendid", label: "Piano Steinway Splendid", family: "Acoustique", lo: 21, hi: 108, pad: false, sfz: "splendid-grand-piano/websfz.json", sfzPath: "" },
  { id: "sfz_kawai", label: "Piano à queue Kawai", family: "Acoustique", lo: 21, hi: 108, pad: false, sfz: "vcsl/Zithers/grand-piano-kawai.websfz.json" },
  { id: "sfz_upright", label: "Piano droit Yamaha", family: "Acoustique", lo: 21, hi: 100, pad: false, sfz: "vcsl/Zithers/upright-piano-yamaha.websfz.json" },
  { id: "sfz_upright_old", label: "Piano droit ancien", family: "Acoustique", lo: 21, hi: 108, pad: false, sfz: "vcsl/Zithers/upright-piano-knight.websfz.json" },
  { id: "sfz_harpsichord", label: "Clavecin français", family: "Acoustique", lo: 24, hi: 84, pad: false, sfz: "vcsl/Zithers/harpsichord-french.websfz.json" },
  { id: "sfz_organ_soft", label: "Orgue d'église doux", family: "Acoustique", lo: 36, hi: 94, pad: true, sfz: "vcsl/Edge-blown Aerophones/pipe-organ-quiet.websfz.json" },
  { id: "sfz_organ_full", label: "Orgue d'église plein", family: "Acoustique", lo: 36, hi: 94, pad: true, sfz: "vcsl/Edge-blown Aerophones/pipe-organ-loud.websfz.json" },
  { id: "sfz_harp", label: "Harpe de concert", family: "Acoustique", lo: 28, hi: 102, pad: false, sfz: "vcsl/Composite Chordophones/concert-harp.websfz.json" },
  { id: "sfz_folk_harp", label: "Harpe celtique", family: "Acoustique", lo: 36, hi: 93, pad: false, sfz: "vcsl/Composite Chordophones/folk-harp.websfz.json" },
  { id: "sfz_marimba", label: "Marimba", family: "Acoustique", lo: 41, hi: 97, pad: false, sfz: "vcsl/Struck Idiophones/marimba.websfz.json" },
  { id: "sfz_vibes", label: "Vibraphone", family: "Acoustique", lo: 53, hi: 89, pad: false, sfz: "vcsl/Struck Idiophones/vibraphone-soft-mallets.websfz.json" },
  { id: "sfz_vibes_bowed", label: "Vibraphone à l'archet", family: "Acoustique", lo: 57, hi: 84, pad: true, sfz: "vcsl/Struck Idiophones/vibraphone-bowed.websfz.json" },
  { id: "sfz_glock", label: "Glockenspiel", family: "Acoustique", lo: 67, hi: 97, pad: false, sfz: "vcsl/Struck Idiophones/glockenspiel.websfz.json" },
  { id: "sfz_xylo", label: "Xylophone", family: "Acoustique", lo: 55, hi: 97, pad: false, sfz: "vcsl/Struck Idiophones/xylophone-medium-mallets.websfz.json" },
  { id: "sfz_bells", label: "Cloches tubulaires", family: "Acoustique", lo: 60, hi: 77, pad: false, sfz: "vcsl/Struck Idiophones/tubular-bells-1.websfz.json" },
  { id: "sfz_kalimba", label: "Kalimba", family: "Acoustique", lo: 59, hi: 82, pad: false, sfz: "vcsl/Plucked Idiophones/kalimba-kenya.websfz.json" },
  { id: "sfz_timpani", label: "Timbales d'orchestre", family: "Acoustique", lo: 41, hi: 55, pad: false, sfz: "vcsl/Struck Membranophones/timpani-1-hit.websfz.json" },
  { id: "sfz_tenor_sax", label: "Saxophone ténor", family: "Acoustique", lo: 44, hi: 85, pad: true, sfz: "vcsl/Reed Aerophones/tenor-saxophone-vibrato.websfz.json" },
  { id: "sfz_harmonica", label: "Harmonica", family: "Acoustique", lo: 48, hi: 97, pad: true, sfz: "vcsl/Free Aerophones/harmonicahohnersuper64-normal.websfz.json" },
  { id: "sfz_recorder", label: "Flûte à bec", family: "Acoustique", lo: 65, hi: 87, pad: true, sfz: "vcsl/Edge-blown Aerophones/baroque-alto-recorder-sustain.websfz.json" },
  { id: "sfz_ocarina", label: "Ocarina", family: "Acoustique", lo: 69, hi: 86, pad: true, sfz: "vcsl/Edge-blown Aerophones/ocarina-typical-sus.websfz.json" },
  { id: "sfz_psaltery", label: "Psaltérion", family: "Monde", lo: 67, hi: 89, pad: false, sfz: "vcsl/Zithers/psaltery-bowed-and-plucked-pluck.websfz.json" },
  { id: "sfz_dan_tranh", label: "Đàn tranh", family: "Monde", lo: 47, hi: 84, pad: false, sfz: "vcsl/Zithers/dan-tranh-normal.websfz.json" },
  { id: "sfz_balafon", label: "Balafon", family: "Monde", lo: 60, hi: 91, pad: false, sfz: "vcsl/Struck Idiophones/balafon-soft-mallet.websfz.json" },
  { id: "sfz_mbira", label: "Mbira", family: "Monde", lo: 46, hi: 84, pad: false, sfz: "vcsl/Plucked Idiophones/mbira-dzavadzimu-nyamaropa-zimbabwe-low-b.websfz.json" },
  { id: "sfz_cp80", label: "Yamaha CP80", family: "Claviers", lo: 21, hi: 108, pad: false, sfz: "gs-e-pianos/CP80/cp80.websfz.json" },
  { id: "sfz_wurli", label: "Wurlitzer EP200", family: "Claviers", lo: 33, hi: 96, pad: false, sfz: "gs-e-pianos/Wurlitzer EP200/wurlitzer-ep200.websfz.json" },
  { id: "sfz_pianet", label: "Hohner Pianet T", family: "Claviers", lo: 29, hi: 88, pad: false, sfz: "gs-e-pianos/Pianet T/pianet-t.websfz.json" },
  { id: "sfz_rhodes", label: "Fender Rhodes MKI", family: "Claviers", lo: 21, hi: 108, pad: false, sfz: "jlearman/rhodes-mki/jrhodes3dst.websfz.json", sfzPath: "jRhodes3d-st/" },
  { id: "sfz_upright_bass", label: "Contrebasse pizz", family: "Basses", lo: 21, hi: 108, pad: false, sfz: "dsmolken/double-bass/dsmolkenrubnerbasspizz.websfz.json" },
  { id: "sfz_upright_bass_arco", label: "Contrebasse à l'archet", family: "Basses", lo: 21, hi: 107, pad: true, sfz: "dsmolken/double-bass/dsmolkenrubnerbassarco.websfz.json" },
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
  assert(instrumentsOf("Basses").length === 14, "instrumentsOf(Basses) incorrect");
  assert(instrument("slap_bass_1")?.lo === 28, "slap_bass_1 lo incorrect");
  assert(INSTRUMENTS.every((inst, i) => INSTRUMENTS.findIndex((other) => other.id === inst.id) === i), "Duplicate instrument IDs");
  assert(INSTRUMENTS.every((inst) => inst.lo < inst.hi), "Invalid note range");
  assert(sampleUrl(INSTRUMENTS.find((inst) => inst.id === "mk_choir_aahs")!, "C4") === "https://gleitz.github.io/midi-js-soundfonts/MusyngKite/choir_aahs-mp3/C4.mp3", "Incorrect sample URL for mk_choir_aahs");
  assert(sampleUrl(INSTRUMENTS.find((inst) => inst.id === "trumpet")!, "C4") === "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/trumpet-mp3/C4.mp3", "Incorrect sample URL for trumpet");
  assert(["Claviers", "Percussions mélodiques", "Cordes", "Voix", "Vents", "Guitares", "Nappes", "Basses", "Cuivres", "Orchestre", "Monde"].every((family) => INSTRUMENTS.some((inst) => inst.family === family)), "Missing instrument family");
}
