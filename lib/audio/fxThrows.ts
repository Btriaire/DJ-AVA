// Echo or reverb thrown on the last word of every sung phrase, found at preparation time.
// It goes through the vocals stem's SEND (not an insert), so the tail rings on after the send closes.
export type ThrowKind = "echo" | "reverb";
interface ThrowDeck {
  fxMap: { phraseEnds: number[] } | null;
  stemNames: string[];
  playing: boolean;
  bpm: number;
  playRate: number;
  position(): number;
  setStemDelaySend(i: number, v: number): void;
  setStemReverbSend(i: number, v: number): void;
  setStemDelayTime(sec: number): void;
  setStemDelayFeedback(v: number): void;
}

const running = new WeakMap<object, { kind: ThrowKind; timer: ReturnType<typeof setInterval> }>();

export function throwKind(deck: object): ThrowKind | null {
  return running.get(deck)?.kind ?? null;
}

// the phrase end due within `ahead` seconds after t, not yet thrown
export function dueEnd(ends: number[], t: number, ahead: number, last: number): number | null {
  for (const e of ends) if (e > last && e >= t && e < t + ahead) return e;
  return null;
}

export function setThrow(deck: ThrowDeck, kind: ThrowKind | null) {
  const cur = running.get(deck);
  if (cur) clearInterval(cur.timer);
  running.delete(deck);
  const v = deck.stemNames.indexOf("vocals");
  if (!kind || v < 0) return;
  const beat = () => 60 / (deck.bpm || 120) / (deck.playRate || 1);
  if (kind === "echo") {
    deck.setStemDelayTime(beat() * 0.75); // dotted eighth
    deck.setStemDelayFeedback(0.55);
  }
  let last = -1;
  const timer = setInterval(() => {
    const ends = deck.fxMap?.phraseEnds;
    if (!deck.playing || !ends?.length) return;
    const t = deck.position();
    if (t < last - 1) last = -1; // jumped back (loop, cue): the phrases ahead throw again
    const e = dueEnd(ends, t + 0.25, 0.06, last); // open on the last word, a quarter second before the phrase ends
    if (e === null) return;
    last = e;
    const lead = (Math.max(0, e - 0.25 - t) / (deck.playRate || 1)) * 1000;
    const send = kind === "echo" ? (x: number) => deck.setStemDelaySend(v, x) : (x: number) => deck.setStemReverbSend(v, x);
    setTimeout(() => send(kind === "echo" ? 0.9 : 0.8), lead);
    setTimeout(() => send(0), lead + (0.25 + beat() * 0.5) * 1000);
  }, 30);
  running.set(deck, { kind, timer });
}

export function fxThrowsTest(): void {
  const ends = [10, 20.5];
  if (dueEnd(ends, 9.97, 0.06, -1) !== 10) throw new Error("throw due");
  if (dueEnd(ends, 9.97, 0.06, 10) !== null) throw new Error("throw once");
  if (dueEnd(ends, 15, 0.06, 10) !== null) throw new Error("throw early");
}
