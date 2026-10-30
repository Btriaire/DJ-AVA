// Real sung notes from the jittery voice contour (MaRuche/Codestral)
// Real sung notes from the jittery voice contour (MaRuche/Codestral)
export interface VoiceNote { k0: number; k1: number; midi: number }

export function voiceNotes(contour: number[], step: number, minLen = 0.15, gapBridge = 0.12): VoiceNote[] {
  if (contour.length === 0 || step <= 0) return [];

  const s = contour.map((v, k) => {
    if (v < 0) return -1;
    const window = contour.slice(Math.max(0, k - 2), Math.min(contour.length, k + 3)).filter(x => x >= 0);
    window.sort((a, b) => a - b);
    return window[Math.floor((window.length - 1) / 2)];
  });

  for (let k = 0; k < s.length; k++) {
    if (s[k] < 0) {
      const start = k;
      while (k < s.length && s[k] < 0) k++;
      if (start > 0 && k < s.length && (k - start) * step < gapBridge) {
        for (let i = start; i < k; i++) s[i] = s[start - 1];
      }
    }
  }

  const notes: VoiceNote[] = [];
  let currentNote: VoiceNote | null = null;
  const n = Math.ceil(minLen / step);

  for (let k = 0; k < s.length; k++) {
    if (s[k] < 0) {
      if (currentNote) {
        currentNote.k1 = k;
        notes.push(currentNote);
        currentNote = null;
      }
    } else {
      if (!currentNote) {
        currentNote = { k0: k, k1: k + 1, midi: Math.round(s[k]) };
      } else if (Math.abs(s[k] - currentNote.midi) >= 0.75) {
        let isGlitch = false;
        for (let i = k; i < k + n && i < s.length; i++) {
          if (s[i] < 0 || Math.abs(s[i] - s[k]) >= 0.75) {
            isGlitch = true;
            break;
          }
        }
        if (!isGlitch) {
          currentNote.k1 = k;
          notes.push(currentNote);
          currentNote = { k0: k, k1: k + 1, midi: Math.round(s[k]) };
        }
      }
    }
  }

  if (currentNote) {
    currentNote.k1 = s.length;
    notes.push(currentNote);
  }

  return notes.filter(note => (note.k1 - note.k0) * step >= minLen / 2);
}

export function selfTest(): void {
  const step = 0.05;
  const minLen = 0.15;
  const gapBridge = 0.12;

  // vibrato
  const vibrato = Array(20).fill(0).map((_, i) => [59.7, 60.3, 60.4, 59.6][i % 4]);
  const vibratoNotes = voiceNotes(vibrato, step, minLen, gapBridge);
  assert(vibratoNotes.length === 1, "vibrato: expected 1 note");
  assert(vibratoNotes[0].k0 === 0 && vibratoNotes[0].k1 === 20 && vibratoNotes[0].midi === 60, "vibrato: wrong note");

  // two notes
  const twoNotes = Array(10).fill(60).concat(Array(10).fill(62));
  const twoNotesResult = voiceNotes(twoNotes, step, minLen, gapBridge);
  assert(twoNotesResult.length === 2, "two notes: expected 2 notes");
  assert(twoNotesResult[0].k0 === 0 && twoNotesResult[0].k1 === 10 && twoNotesResult[0].midi === 60, "two notes: wrong first note");
  assert(twoNotesResult[1].k0 === 10 && twoNotesResult[1].k1 === 20 && twoNotesResult[1].midi === 62, "two notes: wrong second note");

  // glitch
  const glitch = Array(10).fill(60).concat([64]).concat(Array(10).fill(60));
  const glitchNotes = voiceNotes(glitch, step, minLen, gapBridge);
  assert(glitchNotes.length === 1, "glitch: expected 1 note");
  assert(glitchNotes[0].k0 === 0 && glitchNotes[0].k1 === 21 && glitchNotes[0].midi === 60, "glitch: wrong note");

  // short gap
  const shortGap = Array(10).fill(60).concat([-1]).concat(Array(10).fill(60));
  const shortGapNotes = voiceNotes(shortGap, step, minLen, gapBridge);
  assert(shortGapNotes.length === 1, "short gap: expected 1 note");
  assert(shortGapNotes[0].k0 === 0 && shortGapNotes[0].k1 === 21 && shortGapNotes[0].midi === 60, "short gap: wrong note");

  // long gap
  const longGap = Array(10).fill(60).concat(Array(5).fill(-1)).concat(Array(10).fill(60));
  const longGapNotes = voiceNotes(longGap, step, minLen, gapBridge);
  assert(longGapNotes.length === 2, "long gap: expected 2 notes");
  assert(longGapNotes[0].k0 === 0 && longGapNotes[0].k1 === 10 && longGapNotes[0].midi === 60, "long gap: wrong first note");
  assert(longGapNotes[1].k0 === 15 && longGapNotes[1].k1 === 25 && longGapNotes[1].midi === 60, "long gap: wrong second note");

  // empty
  assert(voiceNotes([], step, minLen, gapBridge).length === 0, "empty contour: expected empty");
  assert(voiceNotes([60, 60], 0).length === 0, "zero step: expected empty");
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}
