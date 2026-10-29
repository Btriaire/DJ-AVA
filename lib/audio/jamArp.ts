// Arpeggio orders for the Synth (MaRuche/Codestral)
export type ArpShape = "up" | "down" | "updown" | "random" | "gate" | "converge" | "pinky";

export function arpSequence(chord: number[], shape: Exclude<ArpShape, "gate">, octaves: 1 | 2): number[] {
  const top = chord[0] + 12 * octaves;
  const pool = [...chord, ...(octaves === 2 ? chord.map(n => n + 12) : []), top];
  switch (shape) {
    case "up": return pool;
    case "down": return [...pool].reverse();
    case "updown": return [...pool, ...pool.slice(1, -1).reverse()];
    case "converge": {
      const res: number[] = [];
      for (let i = 0; i < Math.ceil(pool.length / 2); i++) {
        res.push(pool[i], pool[pool.length - 1 - i]);
      }
      return res.filter((_, i) => i < pool.length);
    }
    case "pinky": {
      const res: number[] = [];
      const notesWithoutTop = pool.slice(0, -1);
      for (let i = 0; i < notesWithoutTop.length; i++) {
        res.push(notesWithoutTop[i], top);
      }
      return res;
    }
    case "random": return pool;
  }
}

export function arpNoteAt(seq: number[], k: number, random: boolean): number {
  const n = seq.length;
  if (random) {
    const hash = (Math.imul(k + 7, 2654435761) >>> 0) % n;
    return seq[hash];
  }
  return seq[((k % n) + n) % n];
}

export function selfTest(): void {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };
  const chord = [60, 64, 67];
  assert(JSON.stringify(arpSequence(chord, "up", 1)) === JSON.stringify([60, 64, 67, 72]), "up 1");
  assert(JSON.stringify(arpSequence(chord, "down", 1)) === JSON.stringify([72, 67, 64, 60]), "down 1");
  assert(JSON.stringify(arpSequence(chord, "updown", 1)) === JSON.stringify([60, 64, 67, 72, 67, 64]), "updown 1");
  assert(JSON.stringify(arpSequence(chord, "up", 2)) === JSON.stringify([60, 64, 67, 72, 76, 79, 84]), "up 2");
  assert(JSON.stringify(arpSequence(chord, "converge", 1)) === JSON.stringify([60, 72, 64, 67]), "converge 1");
  assert(JSON.stringify(arpSequence(chord, "pinky", 1)) === JSON.stringify([60, 72, 64, 72, 67, 72]), "pinky 1");
  assert(arpNoteAt([1, 2, 3], -1, false) === 3, "arpNoteAt -1");
  assert(arpNoteAt([1, 2, 3], 4, false) === 2, "arpNoteAt 4");
}
