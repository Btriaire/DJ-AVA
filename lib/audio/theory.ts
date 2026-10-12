export type ScaleId = "minor" | "major" | "dorian" | "phrygian" | "pentmin" | "pentmaj" | "harmin" | "blues" | "chrom";
export type ChordKind = "off" | "triad" | "seventh" | "sus4" | "power" | "octave";
export type ArpPattern = "up" | "down" | "updown" | "random" | "played";

export const NOTE_NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];

export const SCALES: { id: ScaleId; label: string; steps: number[] }[] = [
  { id: "minor", label: "Mineur", steps: [0,2,3,5,7,8,10] },
  { id: "major", label: "Majeur", steps: [0,2,4,5,7,9,11] },
  { id: "dorian", label: "Dorien", steps: [0,2,3,5,7,9,10] },
  { id: "phrygian", label: "Phrygien", steps: [0,1,3,5,7,8,10] },
  { id: "pentmin", label: "Pentat. mineure", steps: [0,3,5,7,10] },
  { id: "pentmaj", label: "Pentat. majeure", steps: [0,2,4,7,9] },
  { id: "harmin", label: "Mineur harm.", steps: [0,2,3,5,7,8,11] },
  { id: "blues", label: "Blues", steps: [0,3,5,6,7,10] },
  { id: "chrom", label: "Chromatique", steps: [0,1,2,3,4,5,6,7,8,9,10,11] }
];

export const CHORDS: { id: ChordKind; label: string }[] = [
  { id: "off", label: "Note" },
  { id: "triad", label: "Triade" },
  { id: "seventh", label: "7e" },
  { id: "sus4", label: "Sus4" },
  { id: "power", label: "Quinte" },
  { id: "octave", label: "Octave" }
];

export const ARP_PATTERNS: { id: ArpPattern; label: string }[] = [
  { id: "up", label: "↑ Montant" },
  { id: "down", label: "↓ Descendant" },
  { id: "updown", label: "↕ Aller-retour" },
  { id: "random", label: "? Aléatoire" },
  { id: "played", label: "→ Ordre joué" }
];

export function midiFreq(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

export function midiName(m: number): string {
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

export function degreeToMidi(base: number, scale: ScaleId, degree: number): number {
  const steps = SCALES.find(s => s.id === scale)!.steps;
  const n = steps.length;
  const oct = Math.floor(degree / n);
  const idx = degree - oct * n;
  return base + 12 * oct + steps[idx];
}

export function chordDegrees(kind: ChordKind, degree: number, scale: ScaleId): number[] {
  if (scale === "chrom") {
    switch (kind) {
      case "off": return [degree];
      case "triad": return [degree, degree + 4, degree + 7];
      case "seventh": return [degree, degree + 4, degree + 7, degree + 11];
      case "sus4": return [degree, degree + 5, degree + 7];
      case "power": return [degree, degree + 7, degree + 12];
      case "octave": return [degree, degree + 12];
    }
  } else {
    const n = SCALES.find(s => s.id === scale)!.steps.length;
    switch (kind) {
      case "off": return [degree];
      case "triad": return [degree, degree + 2, degree + 4];
      case "seventh": return [degree, degree + 2, degree + 4, degree + 6];
      case "sus4": return [degree, degree + 3, degree + 4];
      case "power": return [degree, degree + 4, degree + n];
      case "octave": return [degree, degree + n];
    }
  }
}

export function arpSequence(notes: number[], pattern: ArpPattern, octaves: number): number[] {
  octaves = Math.max(1, Math.min(3, octaves));
  if (pattern === "played") {
    return Array.from({ length: octaves }, (_, o) => notes.map(n => n + 12 * o)).flat();
  }

  const base = [...new Set(notes)].sort((a, b) => a - b);
  const extended = Array.from({ length: octaves }, (_, o) => base.map(n => n + 12 * o)).flat();

  switch (pattern) {
    case "up": return extended;
    case "down": return [...extended].reverse();
    case "updown": {
      if (extended.length <= 1) return extended;
      const reversed = [...extended].reverse();
      return [...extended, ...reversed.slice(1, -1)];
    }
    case "random": {
      const shuffled = [...extended];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }
    default: return [];
  }
}
