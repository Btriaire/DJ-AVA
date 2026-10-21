import type { Deck, DeckSettings } from "./Deck";

// Per-deck "REC": records what is done to a song while it plays (mixer, EQ, FX,
// stems, loops, rack, retouch) at the song position where it happened, and plays
// those actions back the next time that song plays, on either deck.
// It works by wrapping the setters of the deck instance and of its FX rack, studio
// rack and retouch, so every control that drives the deck is captured without
// touching the UI components.

type Target = "deck" | "fx" | "rack" | "retouch";
export interface AutoEvent { t: number; o: Target; m: string; a: unknown[] }
export interface AutoTake {
  snap: DeckSettings; // deck state when the first recording started
  stems: boolean; // stems mode was on at that moment
  stemVol: number[];
  events: AutoEvent[]; // sorted by t (song position, seconds)
  savedAt: number;
}

const RECORDED: Record<Target, string[]> = {
  deck: [
    "setTrim", "setVolume", "setEQ", "setFilter", "setHold", "rampFilter", "setPitch", "toggleKeyLock", "setKeyShift",
    "setCrowd", "setAutotune", "setAutotuneAmount", "setAutotuneRetune", "setAutotuneScale",
    "setStemsActive", "setStemVol", "toggleStemFxTarget", "resetStemFx", "setStemReverbSend", "setStemDelaySend",
    "setStemFxVol", "setStemReverbDecay", "setStemDelayTime", "setStemDelayFeedback", "setStemFilter", "setStemDrive",
    "setStemMakeup", "setStemPump", "setFxWet", "setFxParam", "setBeatLoop", "setLoopRange", "clearLoop",
    "setStemBeatLoop", "clearStemLoop", "clearAllStemLoops", "resizeStemLoop", "shiftStemLoop", "setStemLoopSmooth",
    "setStemLoopRoll", "recallStemLoop",
  ],
  fx: ["setWet", "setBeat", "setParam"],
  rack: ["setEnabled", "setMix", "setParam", "setFlag", "move", "setOrder", "setMacro", "toggleMacroTarget"],
  retouch: ["setParam", "setBypass", "applyPreset"],
};
// bulk operations whose inner setter calls must not be recorded one by one
const SILENT = ["reset", "applySettings", "unload", "load", "loadStreaming", "loadStreamingUrl"];

const STORE = "djsynth.deckauto.v1";

// bumped whenever a replay changes a deck, so panels that read the audio objects
// at render time (FX pads, rack, EQ, retouch) redraw
let version = 0;
const listeners = new Set<() => void>();
export function subscribeAutomation(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getAutomationVersion(): number {
  return version;
}
function changed(): void {
  version++;
  listeners.forEach((cb) => cb());
}
const MAX_EVENTS = 20000;

function loadTakes(): Record<string, AutoTake> {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}") as Record<string, AutoTake>;
  } catch {
    return {};
  }
}
function saveTakes(takes: Record<string, AutoTake>): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(takes));
  } catch {
    // storage full or blocked: the take stays in memory for this session
  }
}

// a new pass replaces the old events inside the song range it covered (punch-in)
export function mergeEvents(old: AutoEvent[], fresh: AutoEvent[], from: number, to: number): AutoEvent[] {
  return [...old.filter((e) => e.t < from || e.t > to), ...fresh].sort((x, y) => x.t - y.t);
}

// index of the first event strictly after `pos`
export function cursorAfter(events: AutoEvent[], pos: number): number {
  let i = 0;
  while (i < events.length && events[i].t <= pos) i++;
  return i;
}

export class DeckAutomation {
  recording = false;
  replay = true; // play back the take of the loaded song
  private takes = loadTakes();
  private depth = 0; // > 0 while inside a wrapped call: only the outermost one is recorded
  private replaying = false;
  private fresh: AutoEvent[] = [];
  private recKey = "";
  private recFrom = 0;
  private recTo = 0;
  private recSnap: Omit<AutoTake, "events" | "savedAt"> | null = null;
  private key = "";
  private cursor = 0;
  private lastPos = 0;
  private primed = false; // start state applied for the current play-through

  constructor(private deck: Deck) {
    this.wrap(deck, "deck", RECORDED.deck, false);
    this.wrap(deck, "deck", SILENT, true);
    this.wrap(deck.fxRack, "fx", RECORDED.fx, false);
    this.wrap(deck.rack, "rack", RECORDED.rack, false);
    this.wrap(deck.retouchFx, "retouch", RECORDED.retouch, false);
    setInterval(() => this.tick(), 40);
  }

  get take(): AutoTake | null {
    return this.takes[this.deck.name] ?? null;
  }
  get recordedCount(): number {
    return this.fresh.length;
  }

  start(): void {
    const key = this.deck.name;
    if (!key || this.recording) return;
    const pos = this.deck.position();
    this.recording = true;
    this.recKey = key;
    this.fresh = [];
    this.recFrom = this.recTo = pos;
    this.recSnap = { snap: this.deck.getSettings(), stems: this.deck.stemsActive, stemVol: [...this.deck.stemVol] };
  }

  stop(): void {
    if (!this.recording) return;
    this.recording = false;
    const old = this.takes[this.recKey];
    if (this.fresh.length > 0 || old) {
      this.takes[this.recKey] = {
        ...(old ?? this.recSnap!),
        events: mergeEvents(old?.events ?? [], this.fresh, this.recFrom, this.recTo).slice(0, MAX_EVENTS),
        savedAt: Date.now(),
      };
      saveTakes(this.takes);
    }
    this.fresh = [];
    this.resync(this.deck.position(), false);
  }

  toggleReplay(): void {
    this.replay = !this.replay;
  }

  clear(): void {
    if (this.recording) this.stop();
    delete this.takes[this.deck.name];
    saveTakes(this.takes);
  }

  private wrap(obj: object, target: Target, methods: string[], silent: boolean): void {
    const o = obj as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const m of methods) {
      const orig = o[m];
      if (typeof orig !== "function") continue;
      o[m] = (...a: unknown[]) => {
        if (!silent && this.depth === 0 && this.recording && !this.replaying && this.deck.name === this.recKey) {
          const pos = this.deck.position();
          this.recFrom = Math.min(this.recFrom, pos);
          this.recTo = Math.max(this.recTo, pos);
          if (this.fresh.length < MAX_EVENTS) this.fresh.push({ t: Math.round(pos * 1000) / 1000, o: target, m, a });
        }
        this.depth++;
        try {
          return orig.apply(obj, a);
        } finally {
          this.depth--;
        }
      };
    }
  }

  private apply(e: AutoEvent): void {
    const obj = e.o === "deck" ? this.deck : e.o === "fx" ? this.deck.fxRack : e.o === "rack" ? this.deck.rack : this.deck.retouchFx;
    const fn = (obj as unknown as Record<string, (...a: unknown[]) => unknown>)[e.m];
    try {
      fn?.(...e.a);
    } catch (err) {
      console.warn("[deck auto] action ignorée", e.m, err);
    }
  }

  // put the deck in the recorded state for `pos`: start state, then every action up to pos
  private resync(pos: number, applyState: boolean): void {
    const take = this.take;
    this.lastPos = pos;
    if (!take) {
      this.cursor = 0;
      return;
    }
    if (applyState) {
      this.replaying = true;
      try {
        this.deck.applySettings(take.snap);
        if (take.stems && !this.deck.stemsActive) this.deck.setStemsActive(true);
        take.stemVol.forEach((v, i) => this.deck.setStemVol(i, v));
        for (const e of take.events) {
          if (e.t > pos) break;
          this.apply(e);
        }
      } finally {
        this.replaying = false;
      }
      changed();
    }
    this.cursor = cursorAfter(take.events, pos);
  }

  private tick(): void {
    const deck = this.deck;
    if (deck.name !== this.key) {
      if (this.recording) this.stop(); // song changed while recording: keep what was done on the old one
      this.key = deck.name;
      this.primed = false;
      this.cursor = 0;
      this.lastPos = 0;
    }
    const take = this.take;
    if (!take || !this.replay || this.recording || !deck.playing) return;
    const pos = deck.position();
    // first play of this song, or a jump back (cue, hot cue, seek): rebuild the state at pos
    if (!this.primed || pos < this.lastPos - 0.25) {
      this.primed = true;
      this.resync(pos, true);
      return;
    }
    const before = this.cursor;
    this.replaying = true;
    try {
      while (this.cursor < take.events.length && take.events[this.cursor].t <= pos) this.apply(take.events[this.cursor++]);
    } finally {
      this.replaying = false;
    }
    if (this.cursor !== before) changed();
    this.lastPos = pos;
  }
}

const instances = new WeakMap<Deck, DeckAutomation>();
export function automationFor(deck: Deck): DeckAutomation {
  let a = instances.get(deck);
  if (!a) {
    a = new DeckAutomation(deck);
    instances.set(deck, a);
  }
  return a;
}
