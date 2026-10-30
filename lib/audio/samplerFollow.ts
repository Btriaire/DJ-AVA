import type { DJEngine } from "./engine";
import type { Deck } from "./Deck";
import { chordAt, onJamTick, songToCtx } from "./stemJam";
import { chordHits, cleanNotes, type Hit } from "./jamReplay";

// the chord moved as close as possible to the sample's own note, so it is stretched as little as possible
export function voiceNear(chord: number[], root: number): number[] {
  return [...new Set(chord.map(n => {
    const k = Math.floor((n - (root - 6)) / 12); // octaves above the window [root - 6, root + 6)
    return n - 12 * k;
  }))].sort((a, b) => a - b);
}

export class SamplerFollow {
  on = false;
  private cache = new WeakMap<object, Hit[]>();
  constructor(private engine: DJEngine) { onJamTick(engine, (deck, from, to) => this.tick(deck, from, to)); }
  private tick(deck: Deck, from: number, to: number): void {
    if (!this.on || deck !== this.engine.masterDeck() || !deck.playing || !deck.stemNotes?.other?.length) return;
    let hits = this.cache.get(deck.stemNotes);
    if (!hits) {
      hits = chordHits(cleanNotes(deck.stemNotes.other));
      this.cache.set(deck.stemNotes, hits);
    }
    let i = 0;
    while (i < hits.length && hits[i].t < from) i++;
    for (; i < hits.length && hits[i].t < to; i++) {
      const hit = hits[i];
      const notes = voiceNear(chordAt(deck, hit.t), this.engine.superSampler.getParams().rootNote);
      const at = songToCtx(deck, hit.t);
      const len = Math.max(0.08, hit.dur / Math.max(0.25, deck.playbackRate));
      const vel = 0.35 + 0.5 * hit.vel;
      notes.forEach(note => this.engine.superSampler.playStep(note, len, at, vel / Math.sqrt(notes.length)));
    }
  }
}

const follows = new WeakMap<DJEngine, SamplerFollow>();
export function samplerFollow(engine: DJEngine): SamplerFollow {
  let follow = follows.get(engine);
  if (!follow) {
    follow = new SamplerFollow(engine);
    follows.set(engine, follow);
  }
  return follow;
}

export function selfTest(): void {
  function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(msg);
  }
  assert(JSON.stringify(voiceNear([48, 52, 55], 60)) === JSON.stringify([55, 60, 64]), "voiceNear([48, 52, 55], 60) -> [55, 60, 64]");
  assert(JSON.stringify(voiceNear([57, 60, 64], 45)) === JSON.stringify([40, 45, 48]), "voiceNear([57, 60, 64], 45) -> [40, 45, 48]");
  assert(JSON.stringify(voiceNear([50, 62], 62)) === JSON.stringify([62]), "voiceNear([50, 62], 62) -> [62]");
}
