import type { DjSynth } from "./DjSynth";
import type { Deck } from "./Deck";
import { readMidiTrack, type MidiNote } from "../midiNotes";

const LOOKAHEAD = 0.3; // seconds scheduled ahead on the audio clock
const TICK_MS = 50;

// Plays a note list (the track's bass line) with the DJ synth in time with a deck: follows
// its position, tempo, pitch, loops and seeks. Stops by itself when the deck changes track.
export class NoteFollower {
  readonly hash: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private until = 0; // audio time up to which notes are already scheduled
  private lastNow = 0;
  private lastPos = 0;
  private wasPlaying = false;

  constructor(
    private ctx: BaseAudioContext,
    private synth: DjSynth,
    readonly deck: Deck,
    private notes: MidiNote[],
    private onEnd: () => void
  ) {
    this.hash = deck.stemHash;
  }

  start() {
    this.stop();
    this.timer = setInterval(() => this.pump(), TICK_MS);
    this.pump();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.wasPlaying) this.synth.releaseAll();
    this.wasPlaying = false;
  }

  private pump() {
    const d = this.deck;
    if (d.stemHash !== this.hash || !d.stemsActive) {
      this.stop();
      this.onEnd();
      return;
    }
    const now = this.ctx.currentTime;
    if (!d.playing) {
      if (this.wasPlaying) this.synth.releaseAll();
      this.wasPlaying = false;
      return;
    }
    const pos = d.position();
    const rate = d.playRate;
    const loop = d.loopRange;
    // a jump (seek, loop toggled, restart): drop the notes scheduled from the old position
    if (this.wasPlaying && Math.abs(this.predict(this.lastPos, this.lastNow, now, rate, loop) - pos) > 0.04) {
      this.synth.releaseAll();
      this.until = now;
    }
    if (!this.wasPlaying) this.until = now;
    this.wasPlaying = true;
    this.lastNow = now;
    this.lastPos = pos;
    const shift = d.keyLock ? d.keyShift : 12 * Math.log2(rate);
    const end = now + LOOKAHEAD;
    let tAudio = Math.max(this.until, now);
    let p = this.predict(pos, now, tAudio, rate, loop);
    for (let guard = 0; tAudio < end - 1e-4 && guard < 16; guard++) {
      let pEnd = p + (end - tAudio) * rate;
      if (loop && pEnd > loop[1]) pEnd = loop[1];
      for (let i = this.firstAtOrAfter(p); i < this.notes.length && this.notes[i].t < pEnd; i++) {
        const n = this.notes[i];
        this.synth.noteOn(n.midi + shift, n.vel, tAudio + (n.t - p) / rate, n.dur / rate);
      }
      tAudio += (pEnd - p) / rate;
      p = loop && pEnd >= loop[1] ? loop[0] : pEnd;
    }
    this.until = end;
  }

  // deck position at audio time t from a known (pos, now), wrapped in the loop
  private predict(pos: number, now: number, t: number, rate: number, loop: [number, number] | null): number {
    let x = pos + (t - now) * rate;
    if (loop && x >= loop[1]) {
      const len = loop[1] - loop[0];
      if (len > 0) x = loop[0] + ((x - loop[0]) % len);
    }
    return x;
  }

  private firstAtOrAfter(t: number): number {
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

// The bass line of the deck's track, transcribed on the server from its bass stem
// (basic-pitch; cached there per track). Null when the transcription has no bass track.
export async function loadBassLine(deck: Deck, signal: AbortSignal): Promise<MidiNote[] | null> {
  const model = deck.stemModel;
  const get = (hash: string) => fetch(`/api/stems/midi?hash=${hash}&model=${model}`, { signal });
  let r = deck.stemHash ? await get(deck.stemHash) : null;
  if (!r || r.status === 404) {
    const raw = deck.getRawData();
    if (!raw) throw new Error("Morceau indisponible pour la transcription");
    const res = await fetch(`/api/stems/midi?model=${model}`, { method: "POST", body: raw.slice(0), signal });
    if (!res.ok) throw new Error("Transcription impossible");
    const { hash } = (await res.json()) as { hash: string };
    r = await get(hash);
  }
  if (!r.ok) throw new Error("Transcription impossible");
  return readMidiTrack(new Uint8Array(await r.arrayBuffer()), "Bass");
}
