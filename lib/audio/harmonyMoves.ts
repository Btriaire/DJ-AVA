// Harmonic moves between the two decks: land one deck on a Camelot cell next to the other (energy up or down),
// walk a transposition back to the original key, and the a cappella of one deck over the other's instrumental.
import { transposeKey, type KeyResult } from "./key";
import type { Deck } from "./Deck";
import type { DJEngine } from "./engine";

export type HarmonyMove = "same" | "up1" | "down1" | "up2";
export const HARMONY_MOVES: [HarmonyMove, string, string][] = [
  ["same", "Même case", "Exactement la tonalité de l'autre deck (ou sa relative majeure ou mineure)"],
  ["up1", "+1 énergie", "Un cran plus haut sur la roue : ça monte sans choquer"],
  ["down1", "−1 calme", "Un cran plus bas : on redescend en douceur"],
  ["up2", "+2 boost", "Deux crans plus haut : un vrai coup d'énergie"],
];

// the smallest transposition (-6..6 semitones) that puts `from` on Camelot number `n` (its mode kept); null if none
export function shiftToNumber(from: KeyResult, n: number): number | null {
  let best: number | null = null;
  for (let s = -6; s <= 6; s++) {
    if (parseInt(transposeKey(from, s).camelot, 10) === n && (best === null || Math.abs(s) < Math.abs(best))) best = s;
  }
  return best;
}
export function moveTarget(other: KeyResult, move: HarmonyMove): number {
  const n = parseInt(other.camelot, 10);
  const d = move === "up1" ? 1 : move === "down1" ? -1 : move === "up2" ? 2 : 0;
  return ((n - 1 + d + 12) % 12) + 1;
}
// apply a move to `deck` relative to `other`: returns the new key shift, or null when a key is unknown
export function applyMove(deck: Deck, other: Deck, move: HarmonyMove): number | null {
  if (!deck.key || !other.effectiveKey) return null;
  const s = shiftToNumber(deck.key, moveTarget(other.effectiveKey, move));
  if (s === null) return null;
  deck.setKeyShift(s);
  return s;
}

// back to the original key one semitone at a time, one step every `barsPerStep` bars
const walks = new WeakMap<Deck, ReturnType<typeof setInterval>>();
export function walkHome(deck: Deck, barsPerStep = 2) {
  clearInterval(walks.get(deck));
  const bar = () => (deck.bpm ? (4 * 60) / (deck.bpm * (deck.playRate || 1)) : 2);
  const step = () => {
    if (deck.keyShift === 0) { clearInterval(walks.get(deck)); walks.delete(deck); return; }
    deck.setKeyShift(deck.keyShift - Math.sign(deck.keyShift));
  };
  walks.set(deck, setInterval(step, bar() * barsPerStep * 1000));
}
export function walking(deck: Deck): boolean { return walks.has(deck); }

// A CAPPELLA: the voice of `voice` over the instrumental of `music`, in its key and tempo; undo puts everything back
interface Mashup { voice: Deck; music: Deck; vols: [number[], number[]]; shift: number; pitch: number; xf: number; lock: boolean }
const mashups = new WeakMap<DJEngine, Mashup>();
export function mashupOn(e: DJEngine): Mashup | undefined { return mashups.get(e); }
export function startMashup(e: DJEngine, voiceSide: "A" | "B"): string | null {
  const voice = voiceSide === "A" ? e.deckA : e.deckB, music = voiceSide === "A" ? e.deckB : e.deckA;
  const vi = voice.stemNames.indexOf("vocals"), mi = music.stemNames.indexOf("vocals");
  if (!voice.stemsActive || vi < 0) return `Active les stems du deck ${voiceSide} (sa voix).`;
  if (!music.stemsActive || mi < 0) return `Active les stems du deck ${voiceSide === "A" ? "B" : "A"} (son instrumental).`;
  const m: Mashup = { voice, music, vols: [voice.stemNames.map((_, i) => voice.stemVol[i] ?? 1), music.stemNames.map((_, i) => music.stemVol[i] ?? 1)], shift: voice.keyShift, pitch: voice.pitchPct, xf: e.getCrossfade(), lock: voice.keyLock };
  mashups.set(e, m);
  const bar = music.bpm ? (4 * 60) / music.bpm : 2;
  voice.stemNames.forEach((_, i) => { if (i !== vi) voice.rampStemVol(i, 0, bar); });
  music.rampStemVol(mi, 0, bar);
  if (voice.key && music.effectiveKey) {
    const s = shiftToNumber(voice.key, parseInt(music.effectiveKey.camelot, 10));
    if (s !== null) voice.setKeyShift(s);
  }
  if (!voice.keyLock) voice.toggleKeyLock(); // the tempo change must not move the voice's pitch
  e.sync(voiceSide); // the voice follows the instrumental's tempo
  e.setCrossfade(0.5);
  return null;
}
export function stopMashup(e: DJEngine) {
  const m = mashups.get(e);
  if (!m) return;
  const bar = m.music.bpm ? (4 * 60) / m.music.bpm : 2;
  m.vols[0].forEach((v, i) => m.voice.rampStemVol(i, v, bar));
  m.vols[1].forEach((v, i) => m.music.rampStemVol(i, v, bar));
  m.voice.setKeyShift(m.shift);
  m.voice.setPitch(m.pitch);
  if (m.voice.keyLock !== m.lock) m.voice.toggleKeyLock();
  e.setCrossfade(m.xf);
  mashups.delete(e);
}

export function harmonyMovesTest(): void {
  const am: KeyResult = { pitchClass: 9, mode: "minor", name: "Am", camelot: "8A" };
  const em: KeyResult = { pitchClass: 4, mode: "minor", name: "Em", camelot: "9A" };
  if (shiftToNumber(am, 9) !== -5 && shiftToNumber(am, 9) !== 7) throw new Error("harmony to 9A");
  if (shiftToNumber(em, 8) !== 5 && shiftToNumber(em, 8) !== -7) throw new Error("harmony to 8A");
  if (moveTarget(em, "up1") !== 10 || moveTarget({ ...em, camelot: "12A" }, "up1") !== 1 || moveTarget({ ...em, camelot: "1A" }, "down1") !== 12) throw new Error("harmony wheel");
  if (transposeKey(am, shiftToNumber(am, 9)!).camelot !== "9A") throw new Error("harmony lands");
}
