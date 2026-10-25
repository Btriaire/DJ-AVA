// The automix relay runs in ONE place: the Playlist view, which the page keeps mounted (hidden) so that the
// transitions go on whatever tab is shown. The other libraries (the Console's) start, stop and display the relay
// through this small shared object instead of running their own, which would die when the Console is left.

export interface RelayHostApi {
  start: (playlistId: string | null, startIdx?: number) => void; // null = the singles filed on the decks
  stop: () => void;
}
export interface RelayHostState {
  running: boolean;
  fg: "A" | "B";
  cur: { A: number; B: number };
}

let api: RelayHostApi | null = null;
let state: RelayHostState = { running: false, fg: "A", cur: { A: -1, B: -1 } };
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
  if (next.running === state.running && next.fg === state.fg && next.cur.A === state.cur.A && next.cur.B === state.cur.B) return;
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
