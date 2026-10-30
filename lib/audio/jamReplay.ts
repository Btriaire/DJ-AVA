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
  // each chord is held while the song's part still rings, up to the next strike
  const groups: Note[][] = [];
  for (const n of notes) {
    const g = groups[groups.length - 1];
    if (g && n[0] - g[0][0] <= window) g.push(n); else groups.push([n]);
  }
  const kept = groups.filter((g) => g.length >= minNotes || (g.length === 1 && g[0][3] >= 0.7));
  let noteIndex = 0;
  return kept.map((g, i) => {
    const next = kept[i + 1]?.[0][0] ?? Infinity;
    let end = g[0][0];
    while (noteIndex < notes.length && notes[noteIndex][0] < next) {
      if (notes[noteIndex][0] >= g[0][0]) {
        end = Math.max(end, notes[noteIndex][1]);
      }
      noteIndex++;
    }
    const dur = Math.max(0.08, Math.min(end - g[0][0], next - g[0][0]));
    return { t: g[0][0], dur, vel: g.reduce((sum, n) => sum + n[3], 0) / g.length };
  });
}

// a bass part as a bass player plays it: one note at a time
export function monoBass(notes: Note[], minLen = 0.06, minVel = 0.2, merge = 0.03): Note[] {
    const kept: Note[] = [];
    for (const [s, e, m, v] of notes) {
        if (e - s < minLen || v < minVel) continue;
        const prev = kept[kept.length - 1];
        if (prev && s - prev[0] <= merge) {
            if (v > prev[3] || (v === prev[3] && m < prev[2])) {
                kept[kept.length - 1] = [prev[0], e, m, v];
            }
        } else {
            if (prev && prev[1] > s) {
                kept[kept.length - 1] = [prev[0], s, prev[2], prev[3]];
            }
            kept.push([s, e, m, v]);
        }
    }
    return kept;
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
    assert(hits[0].t === 0 && Math.abs(hits[0].dur - 1) < 1e-9, "chordHits should calculate correct t and dur for first hit");
    assert(hits[1].t === 2 && hits[1].dur === 1, "chordHits should calculate correct t and dur for second hit");

    const n5: Note[] = [[0,0.2,60,0.6],[0.01,0.2,64,0.6],[0.1,0.9,67,0.3],[1,1.1,60,0.6],[1.01,1.1,64,0.6]]; const h5 = chordHits(n5);
    assert(h5.length === 2, "Expected 2 hits"); assert(Math.abs(h5[0].dur - 0.9) < 1e-9, "Expected dur 0.9"); assert(Math.abs(h5[1].dur - 0.1) < 1e-9, "Expected dur 0.1");
    const n6: Note[] = [[0,3,60,0.6],[0.01,3,64,0.6],[1,1.5,60,0.6],[1.01,1.5,64,0.6]]; const h6 = chordHits(n6);
    assert(Math.abs(h6[0].dur - 1) < 1e-9, "Expected dur 1");
    const n7: Note[] = [[0,0.05,60,0.6],[0.01,0.05,64,0.6]]; assert(chordHits(n7)[0].dur === 0.08, "Expected dur 0.08");
    assert(chordHits([]).length === 0, "chordHits should return empty array for empty input");
  assert(monoBass([[0,1,40,0.5],[0.5,1.5,43,0.5]]).length === 2 && monoBass([[0,1,40,0.5],[0.5,1.5,43,0.5]])[0][1] === 0.5 && monoBass([[0,1,40,0.5],[0.5,1.5,43,0.5]])[1][2] === 43, "monoBass case 1 failed");
  assert(monoBass([[0,1,40,0.5],[0.01,1,52,0.8]]).length === 1 && monoBass([[0,1,40,0.5],[0.01,1,52,0.8]])[0][2] === 52, "monoBass case 2 failed");
  assert(monoBass([[0,1,52,0.5],[0.02,1,40,0.5]]).length === 1 && monoBass([[0,1,52,0.5],[0.02,1,40,0.5]])[0][2] === 40 && monoBass([[0,1,52,0.5],[0.02,1,40,0.5]])[0][0] === 0, "monoBass case 3 failed");
  assert(monoBass([[0,1,40,0.8],[0.01,1,52,0.3]]).length === 1 && monoBass([[0,1,40,0.8],[0.01,1,52,0.3]])[0][2] === 40, "monoBass case 4 failed");
  assert(monoBass([[0,0.03,40,0.8],[0.1,0.5,41,0.1],[1,2,43,0.6]]).length === 1 && monoBass([[0,0.03,40,0.8],[0.1,0.5,41,0.1],[1,2,43,0.6]])[0][2] === 43, "monoBass case 5 failed");
  const inp: Note[] = [[0,1,40,0.5],[0.5,1.5,43,0.5]]; monoBass(inp); assert(inp[0][1] === 1, "monoBass case 6 failed");
}

function assert(cond: boolean, msg: string): void {
    if (!cond) throw new Error(msg);
}
