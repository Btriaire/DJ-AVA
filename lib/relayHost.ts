// The automix relay runs in ONE place: the Playlist view, which the page keeps mounted (hidden) so that the
// transitions go on whatever tab is shown. The other libraries (the Console's) start, stop and display the relay
// through this small shared object instead of running their own, which would die when the Console is left.

export interface QueueTrack {
  id: string;
  name: string;
  bpm?: number;
  camelot?: string;
  art?: string;
}
export interface RelayHostApi {
  start: (playlistId: string | null, startIdx?: number) => void; // null = the singles filed on the decks
  stop: () => void;
  zap: (k: number) => void; // send the k-th song to come to the end of the set
  swap: (a: number, b: number) => void; // exchange the a-th and the b-th songs to come
  skipNow: () => void; // go to the next song now (the change starts at once)
}
export interface RelayHostState {
  running: boolean;
  fg: "A" | "B";
  cur: { A: number; B: number };
  now: QueueTrack | null; // the song that plays
  upcoming: QueueTrack[]; // the songs to come, in order (the first is already waiting on the other deck)
  editable: boolean; // the order of the set can be changed (a set is playing, not the singles filed on the decks)
  firstLocked: boolean; // the next song is already blending in: it cannot be changed any more
}

let api: RelayHostApi | null = null;
let state: RelayHostState = { running: false, fg: "A", cur: { A: -1, B: -1 }, now: null, upcoming: [], editable: false, firstLocked: false };
const listeners = new Set<() => void>();

export const getRelayHost = () => state;
export const subscribeRelayHost = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function registerRelayHost(a: RelayHostApi): () => void {
  api = a;
  return () => {
    if (api === a) api = null;
  };
}

// what the host publishes after every change (only when something really changed)
export function publishRelayHost(next: RelayHostState): void {
  const same = (a: QueueTrack[], b: QueueTrack[]) => a.length === b.length && a.every((t, i) => t.id === b[i].id);
  if (
    next.running === state.running &&
    next.fg === state.fg &&
    next.cur.A === state.cur.A &&
    next.cur.B === state.cur.B &&
    next.now?.id === state.now?.id &&
    next.editable === state.editable &&
    next.firstLocked === state.firstLocked &&
    same(next.upcoming, state.upcoming)
  )
    return;
  state = next;
  listeners.forEach((l) => l());
}

// true = the host took the order
export function relayHostStart(playlistId: string | null, startIdx?: number): boolean {
  if (!api) return false;
  api.start(playlistId, startIdx);
  return true;
}
export function relayHostStop(): boolean {
  if (!api) return false;
  api.stop();
  return true;
}

export function relayHostZap(k: number): void {
  api?.zap(k);
}
export function relayHostSwap(a: number, b: number): void {
  api?.swap(a, b);
}
export function relayHostSkipNow(): void {
  api?.skipNow();
}
