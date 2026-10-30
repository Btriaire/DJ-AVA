// The stem modules of the Console (BASS LAB, VOX FX, SYNTH, BEAT LAB) share this core: which deck they play on,
// song time to audio clock, the key's scale, the song's chord at a moment, and ONE lookahead scheduler for all four.
import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { chordTrack } from "./jamChordTrack";

export type JamRole = "bass" | "vocals" | "other" | "drums";
export type JamDeckPref = "auto" | "A" | "B";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

// "auto": the deck playing with its stems on; both or none -> the side the crossfader leans to
export function jamDeck(engine: DJEngine, pref: JamDeckPref): Deck {
  if (pref === "A") return engine.deckA;
  if (pref === "B") return engine.deckB;
  const live = (d: Deck) => d.playing && d.stemsActive && d.stemReady;
  const a = live(engine.deckA), b = live(engine.deckB);
  if (a !== b) return a ? engine.deckA : engine.deckB;
  return engine.getCrossfade() <= 0.5 ? engine.deckA : engine.deckB;
}

// index of the stem, -1 when the deck has no such stem or does not play its stems
export function jamStem(deck: Deck, role: JamRole): number {
  return deck.stemsActive && deck.stemReady ? deck.stemIndex(role) : -1;
}

export function spb(deck: Deck): number {
  return deck.bpm > 0 ? 60 / deck.bpm / Math.max(0.25, deck.playbackRate) : 0.5;
}

// audio clock time at which the song reaches songT (already past -> now)
export function songToCtx(deck: Deck, songT: number): number {
  const ctx = deck.ctx;
  return ctx.currentTime + Math.max(0, (songT - deck.position()) / Math.max(0.25, deck.playbackRate));
}

// audio clock time of the next grid line every `div` beats (1 = beat, 0.25 = 16th), with its index
export function nextGrid(deck: Deck, div: number): { at: number; step: number } {
  const beatSong = deck.bpm > 0 ? 60 / deck.bpm : 0.5;
  const unit = beatSong * div;
  const rel = deck.position() - deck.beatGridOffset;
  const step = Math.floor(rel / unit) + 1;
  return { at: songToCtx(deck, deck.beatGridOffset + step * unit), step };
}

// semitones between the notes written in the song and what is heard now (pitch fader without key lock, key shift)
export function heardShift(deck: Deck): number {
  const k = deck.key, e = deck.effectiveKey;
  if (!k || !e) return 0;
  return ((e.pitchClass - k.pitchClass + 18) % 12) - 6;
}

// pitch classes of the key heard now; C minor when the key is unknown
export function jamScale(deck: Deck): { root: number; minor: boolean; pcs: number[] } {
  const k = deck.effectiveKey;
  const root = k?.pitchClass ?? 0;
  const minor = k ? k.mode === "minor" : true;
  return { root, minor, pcs: (minor ? MINOR : MAJOR).map((x) => (x + root) % 12) };
}

// nearest note of the scale (ties go down)
export function snapToScale(midi: number, pcs: number[]): number {
  for (let d = 0; d <= 6; d++) {
    if (pcs.includes((((midi - d) % 12) + 12) % 12)) return midi - d;
    if (pcs.includes((((midi + d) % 12) + 12) % 12)) return midi + d;
  }
  return midi;
}

// the diatonic triad on degree 0..6 of the scale, around the given octave (midi of its root)
export type ChordColor = "triad" | "seventh" | "ninth";
// the chord on degree 0..6 of the scale around the given octave: a triad, plus its 7th, plus its 9th (all in the key)
export function degreeChord(deck: Deck, degree: number, octaveMidi = 48, color: ChordColor = "triad"): number[] {
  const { pcs } = jamScale(deck);
  const pc = pcs[((degree % 7) + 7) % 7];
  const root = octaveMidi - (octaveMidi % 12) + pc;
  const up = (n: number) => (pcs[(degree + n) % 7] - pc + 12) % 12;
  const c = [root, root + up(2), root + up(4)];
  if (color !== "triad") c.push(root + up(6));
  if (color === "ninth") c.push(root + 12 + up(1));
  return c;
}

// the same chord, voiced as close as possible to the one before (each voice moves the least): it glides instead of jumping.
// Tries every inversion, an octave up or down, and keeps the notes between 45 and 84.
export function voiceLead(prev: number[] | null, next: number[]): number[] {
  if (!prev?.length) return next;
  const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
  const p = sorted(prev);
  let best = next, bestCost = Infinity;
  for (let inv = 0; inv < next.length; inv++) {
    const v = sorted(next.map((m, i) => (i < inv ? m + 12 : m)));
    for (const shift of [-12, 0, 12]) {
      const c = v.map((m) => m + shift);
      if (c[0] < 45 || c[c.length - 1] > 84) continue;
      let cost = 0;
      for (let i = 0; i < c.length; i++) cost += Math.abs(c[i] - p[Math.min(i, p.length - 1)]);
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
  }
  return best;
}

// chord names of the 7 degrees, for the pads ("Am", "C", "Bdim")
export function degreeNames(deck: Deck): string[] {
  const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const { pcs, root, minor } = jamScale(deck);
  // keys written with flats: F Bb Eb Ab Db Gb major, D G C F Bb Eb minor; the others with sharps
  const NAMES = (minor ? [2, 7, 0, 5, 10, 3] : [5, 10, 3, 8, 1, 6]).includes(root) ? FLAT : SHARP;
  return pcs.map((pc, i) => {
    const third = (pcs[(i + 2) % 7] - pc + 12) % 12;
    const fifth = (pcs[(i + 4) % 7] - pc + 12) % 12;
    return NAMES[pc] + (fifth === 6 ? "dim" : third === 3 ? "m" : "");
  });
}

// the song's own chord around song time t, in the chosen colour
export function chordAt(deck: Deck, t: number, color: ChordColor = "triad"): number[] {
  return degreeChord(deck, chordDegreeAt(deck, t), 48, color);
}
// which degree of the key the song is on at t: read from the chord track of the whole song (bass and "other" stems
// together, smoothed: see jamChordTrack), computed once per song in the written key (the degree does not move with a key shift)
const chordDegreeCache = new WeakMap<Deck, { notes: unknown; bpm: number; grid: number; key: string; track: number[]; offset: number; beatLen: number }>();
export function chordDegreeAt(deck: Deck, t: number): number {
  const { stemNotes, bpm, beatGridOffset, key } = deck;
  const keyStr = key ? `${key.pitchClass}${key.mode}` : "none";
  let c = chordDegreeCache.get(deck);
  if (!c || c.notes !== stemNotes || c.bpm !== bpm || c.grid !== beatGridOffset || c.key !== keyStr) {
    const other = stemNotes?.other ?? [], bass = stemNotes?.bass ?? [];
    const pcs = (key?.mode === "major" ? MAJOR : MINOR).map((x) => (x + (key?.pitchClass ?? 0)) % 12);
    const beatLen = bpm > 0 ? 60 / bpm : 0.5;
    const offset = beatGridOffset - Math.ceil(beatGridOffset / beatLen) * beatLen;
    let duration = 0;
    for (const n of other) if (n[1] > duration) duration = n[1];
    for (const n of bass) if (n[1] > duration) duration = n[1];
    c = { notes: stemNotes, bpm, grid: beatGridOffset, key: keyStr, track: chordTrack(other, bass, pcs, beatLen, offset, duration), offset, beatLen };
    chordDegreeCache.set(deck, c);
  }
  const { track } = c, b = Math.floor((t - c.offset) / c.beatLen);
  return track.length ? track[Math.min(track.length - 1, Math.max(0, b))] : 0;
}

// ---- one scheduler for every stem module: 30 ms tick, 0.15 s lookahead, song-time windows per deck ----
export type JamTick = (deck: Deck, fromSong: number, toSong: number) => void;
const ticks = new Set<{ engine: DJEngine; fn: JamTick }>();
const lastTo = new WeakMap<Deck, number>();
let timer: ReturnType<typeof setInterval> | null = null;

function run() {
  const decks = new Set<Deck>();
  for (const t of ticks) decks.add(t.engine.deckA).add(t.engine.deckB);
  for (const deck of decks) {
    if (!deck.playing) { lastTo.delete(deck); continue; }
    const pos = deck.position();
    const to = pos + 0.15 * Math.max(0.25, deck.playbackRate);
    const prev = lastTo.get(deck);
    // a jump (seek, loop, cue) restarts the window at the playhead instead of firing everything in between
    const from = prev === undefined || prev < pos - 0.3 || prev > to ? pos : prev;
    lastTo.set(deck, to);
    if (to <= from) continue;
    for (const t of ticks) if (t.engine.deckA === deck || t.engine.deckB === deck) t.fn(deck, from, to);
  }
}

export function onJamTick(engine: DJEngine, fn: JamTick): () => void {
  const entry = { engine, fn };
  ticks.add(entry);
  if (!timer) timer = setInterval(run, 30);
  return () => {
    ticks.delete(entry);
    if (ticks.size === 0 && timer) { clearInterval(timer); timer = null; }
  };
}

export function selfTest(): void {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  assert(snapToScale(61, MINOR) === 60, "C# snaps down to C in C minor");
  assert(snapToScale(64, MINOR) === 63, "E snaps to Eb in C minor");
  assert(snapToScale(62, MAJOR) === 62, "D stays in C major");
  const fake = { effectiveKey: { pitchClass: 9, mode: "minor" } } as unknown as Deck; // A minor
  assert(degreeChord(fake, 0).join() === "57,60,64", "A minor tonic is A C E");
  assert(degreeChord(fake, 2).join() === "48,52,55", "degree III of A minor is C E G");
  assert(degreeNames(fake).join() === "Am,Bdim,C,Dm,Em,F,G", "A minor chord names");
  const aMajor = { effectiveKey: { pitchClass: 9, mode: "major" } } as unknown as Deck;
  assert(degreeNames(aMajor).join() === "A,Bm,C#m,D,E,F#m,G#dim", "A major chord names use sharps");
  // the song's chord: weighed over the beat, kept when a beat has nothing clear
  const song = { bpm: 120, beatGridOffset: 0, key: { pitchClass: 9, mode: "minor" }, effectiveKey: { pitchClass: 9, mode: "minor" }, stemNotes: { other: [[0, 0.5, 60, 1], [0, 0.5, 64, 1], [0, 0.5, 67, 1], [0.5, 1, 62, 1], [0.5, 1, 65, 1], [0.5, 1, 69, 1], [1, 1.05, 71, 1]] } } as unknown as Deck;
  assert(chordAt(song, 0.1).join() === "48,52,55", "C major on beat 1");
  assert(chordAt(song, 0.7).join() === "50,53,57", "D minor on beat 2");
  assert(chordAt(song, 1.2).join() === "50,53,57", "a stray note keeps D minor");
  assert(degreeChord(fake, 0, 48, "seventh").join() === "57,60,64,67", "Am7");
  assert(degreeChord(fake, 0, 48, "ninth").join() === "57,60,64,67,71", "Am9");
  assert(voiceLead([60, 64, 67], [65, 69, 72]).join() === "60,65,69", "C to F moves to its second inversion");
}
