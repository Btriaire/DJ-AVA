// The stem modules of the Console (BASS LAB, VOX FX, SYNTH, BEAT LAB) share this core: which deck they play on,
// song time to audio clock, the key's scale, the song's chord at a moment, and ONE lookahead scheduler for all four.
import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";

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
export function degreeChord(deck: Deck, degree: number, octaveMidi = 48): number[] {
  const { pcs } = jamScale(deck);
  const pc = pcs[((degree % 7) + 7) % 7];
  const root = octaveMidi - (octaveMidi % 12) + pc;
  const up = (n: number) => (pcs[(degree + n) % 7] - pc + 12) % 12;
  return [root, root + up(2), root + up(4)];
}

// chord names of the 7 degrees, for the pads ("Am", "C", "Bdim")
export function degreeNames(deck: Deck): string[] {
  const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const { pcs } = jamScale(deck);
  return pcs.map((pc, i) => {
    const third = (pcs[(i + 2) % 7] - pc + 12) % 12;
    const fifth = (pcs[(i + 4) % 7] - pc + 12) % 12;
    return NAMES[pc] + (fifth === 6 ? "dim" : third === 3 ? "m" : "");
  });
}

// the song's own chord at song time t, from the notes of the "other" stem sounding then, snapped to the key;
// none sounding -> the tonic triad. Notes are moved by the heard shift.
export function chordAt(deck: Deck, t: number): number[] {
  const { pcs } = jamScale(deck);
  const shift = heardShift(deck);
  const pcsOn = new Set<number>();
  for (const [s, e, m] of deck.stemNotes?.other ?? []) {
    if (s <= t + 0.05 && e > t) pcsOn.add((((m + shift) % 12) + 12) % 12);
    if (s > t + 0.05) break;
  }
  // root = the lowest scale degree that has its third or fifth sounding too, else the tonic
  for (let deg = 0; deg < 7; deg++) {
    const r = pcs[deg];
    if (pcsOn.has(r) && (pcsOn.has(pcs[(deg + 2) % 7]) || pcsOn.has(pcs[(deg + 4) % 7]))) return degreeChord(deck, deg);
  }
  return degreeChord(deck, 0);
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
}
