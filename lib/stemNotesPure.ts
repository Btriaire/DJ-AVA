// client-safe helpers on the note map of a song
import type { StemNotes } from "@/lib/stemNotes";

export function nextAttack(
  notes: StemNotes | null | undefined,
  t: number,
  maxWait: number
): number | null {
  if (!notes) return null;

  const endTime = t + maxWait;
  let closestAttack: number | null = null;

  // Check drums
  if (notes.drums) {
    const drumIndex = notes.drums.findIndex(([time]) => time > t && time <= endTime);
    if (drumIndex !== -1) {
      closestAttack = notes.drums[drumIndex][0];
    }
  }

  // Check bass notes (force >= 0.5)
  if (notes.bass) {
    const bassIndex = notes.bass.findIndex(
      ([start, , , force]) => start > t && start <= endTime && force >= 0.5
    );
    if (bassIndex !== -1) {
      const bassAttack = notes.bass[bassIndex][0];
      if (closestAttack === null || bassAttack < closestAttack) {
        closestAttack = bassAttack;
      }
    }
  }

  // Check other notes (force >= 0.5)
  if (notes.other) {
    const otherIndex = notes.other.findIndex(
      ([start, , , force]) => start > t && start <= endTime && force >= 0.5
    );
    if (otherIndex !== -1) {
      const otherAttack = notes.other[otherIndex][0];
      if (closestAttack === null || otherAttack < closestAttack) {
        closestAttack = otherAttack;
      }
    }
  }

  return closestAttack;
}

export function notesAt(notes: StemNotes | null | undefined, t: number): number[] {
  if (!notes) return [];

  const activeNotes = new Set<number>();

  // Check bass notes
  if (notes.bass) {
    for (const [start, end, note] of notes.bass) {
      if (t >= start && t <= end) {
        activeNotes.add(note % 12); // Convert to class (0-11)
      }
    }
  }

  // Check other notes
  if (notes.other) {
    for (const [start, end, note] of notes.other) {
      if (t >= start && t <= end) {
        activeNotes.add(note % 12); // Convert to class (0-11)
      }
    }
  }

  return Array.from(activeNotes).sort((a, b) => a - b);
}

