// What the aligner needs to know about a deck (the real Deck has all of these)
export interface BeatDeck {
  bpm: number; // tempo of the loaded song
  effectiveBPM: number; // tempo it plays at now (pitch included)
  beatGridOffset: number; // seconds to the first beat
  position(): number; // seconds in the song
}

// Seconds to wait before starting `inc` so that its beats fall exactly on the beats of `out`.
// Both are played at their effective tempo (call after syncing the tempos): the wait is shorter than one beat.
export function alignDelaySec(out: BeatDeck, inc: BeatDeck): number {
  if (!(out.bpm > 0 && inc.bpm > 0 && out.effectiveBPM > 0 && inc.effectiveBPM > 0)) return 0;
  const rateOut = out.effectiveBPM / out.bpm;
  const rateIn = inc.effectiveBPM / inc.bpm;
  const spbOut = 60 / out.bpm; // song seconds per beat
  const spbIn = 60 / inc.bpm;
  const wallBeat = spbOut / rateOut; // real seconds per beat
  const sinceBeat = (((out.position() - out.beatGridOffset) % spbOut) + spbOut) % spbOut;
  const toNextOut = (spbOut - sinceBeat) / rateOut; // real seconds until the next beat of the outgoing song
  const pos = inc.position();
  const toFirstIn = ((((inc.beatGridOffset - pos) % spbIn) + spbIn) % spbIn) / rateIn; // until the incoming song's next beat once started
  let wait = (((toNextOut - toFirstIn) % wallBeat) + wallBeat) % wallBeat;
  if (wait < 0.03) wait += wallBeat;
  return wait;
}
