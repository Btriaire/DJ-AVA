// The song part made replayable: cleaned notes and the moments it strikes its chords (MaRuche/Codestral)
type Note = [number, number, number, number];

export function cleanNotes(notes: Note[], minLen = 0.08, minVel = 0.25, maxVoices = 5): Note[] {
  const out: Note[] = [];
  let sounding: Note[] = []; // kept notes still ringing, the same arrays as in out
  for (const [s, e, m, v] of notes) {
    if (e - s < minLen || v < minVel) continue;
    sounding = sounding.filter((n) => n[1] > s);
    if (sounding.length >= maxVoices) {
      const quietest = sounding.reduce((a, b) => (b[3] < a[3] ? b : a));
      if (v <= quietest[3]) continue; // too many voices and not louder: a transcription ghost
      quietest[1] = s; // the louder new note takes the voice of the quietest one
      sounding = sounding.filter((n) => n !== quietest);
    }
    const kept: Note = [s, e, m, v];
    out.push(kept);
    sounding.push(kept);
  }
  return out;
}

export interface Hit { t: number; dur: number; vel: number }

export function chordHits(notes: Note[], window = 0.04, minNotes = 2): Hit[] {
  // group the starts that fall together, keep the real strikes (a chord, or one loud note)
  const groups: Note[][] = [];
  for (const n of notes) {
    const g = groups[groups.length - 1];
    if (g && n[0] - g[0][0] <= window) g.push(n); else groups.push([n]);
  }
  const kept = groups.filter((g) => g.length >= minNotes || (g.length === 1 && g[0][3] >= 0.7));
  return kept.map((g, i) => {
    const durs = g.map((n) => n[1] - n[0]).sort((x, y) => x - y);
    const next = kept[i + 1]?.[0][0] ?? Infinity;
    const dur = Math.max(0.08, Math.min(durs[(durs.length - 1) >> 1], next - g[0][0]));
    return { t: g[0][0], dur, vel: g.reduce((sum, n) => sum + n[3], 0) / g.length };
  });
}

export function selfTest(): void {
    const notes: Note[] = [[0, 0.05, 60, 0.9], [0, 1, 62, 0.1], [0, 1, 64, 0.8]];
    const cleaned = cleanNotes(notes);
    assert(cleaned.length === 1 && cleaned[0][2] === 64, "cleanNotes should drop short and quiet notes");
    assert(notes.length === 3, "cleanNotes should not mutate input");

    const notes2: Note[] = [[0, 2, 60, 0.5], [0, 2, 64, 0.6], [0.5, 1, 67, 0.4]];
    const cleaned2 = cleanNotes(notes2, 0.08, 0.25, 2);
    assert(cleaned2.length === 2, "cleanNotes should drop the quietest note");

    const notes3: Note[] = [[0, 2, 60, 0.5], [0, 2, 64, 0.6], [0.5, 1, 67, 0.9]];
    const cleaned3 = cleanNotes(notes3, 0.08, 0.25, 2);
    assert(cleaned3.length === 3, "cleanNotes should cut the quietest note and keep the louder one");

    const notes4: Note[] = [[0, 1, 60, 0.6], [0.01, 1, 64, 0.6], [0.02, 1, 67, 0.6], [0.5, 0.7, 72, 0.3], [2, 3, 60, 0.8]];
    const hits = chordHits(notes4);
    assert(hits.length === 2, "chordHits should find two hits");
    assert(hits[0].t === 0 && Math.abs(hits[0].dur - 0.99) < 1e-9, "chordHits should calculate correct t and dur for first hit");
    assert(hits[1].t === 2 && hits[1].dur === 1, "chordHits should calculate correct t and dur for second hit");

    assert(chordHits([]).length === 0, "chordHits should return empty array for empty input");
}

function assert(cond: boolean, msg: string): void {
    if (!cond) throw new Error(msg);
}
