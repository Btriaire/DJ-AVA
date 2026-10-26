import { useSyncExternalStore } from "react";
import { GENRES, forceOf, type DjForce, type Genre } from "@/lib/djForce";

// "DJ intelligent" as a switch that is always at hand (in the top bar, on every view, Console included): when it is
// ON the DJ makes its moves on whatever song plays on a deck, a set of the relay or a song you play by hand. Its force
// (1 to 5, lib/djForce.ts) decides how often and how strongly. Transitions of a relay still follow the set's own plan.

export interface DjLive {
  on: boolean;
  force: DjForce;
  genre: Genre; // the style played: it decides which effects the DJ uses
  stems: number; // how many of the playing songs are played from their stems (0..2)
  stemsAvail: number; // how many of the playing songs have stems (loaded or on disk), used or not yet (0..2)
  action: string | null; // the move the DJ just made, shown in the top bar for a few seconds
  moves: number; // how many moves the DJ has made since it was switched on (proof that it works)
}

const KEY = "djsynth.djlive.v1";

function load(): DjLive {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<DjLive>;
    return { on: !!v.on, force: forceOf({ force: v.force }), genre: GENRES.includes(v.genre as Genre) ? (v.genre as Genre) : "auto", stems: 0, stemsAvail: 0, action: null, moves: 0 };
  } catch {
    return { on: false, force: 3, genre: "auto", stems: 0, stemsAvail: 0, action: null, moves: 0 };
  }
}

let state: DjLive = typeof window === "undefined" ? { on: false, force: 3, genre: "auto", stems: 0, stemsAvail: 0, action: null, moves: 0 } : load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getDjLive = () => state;
export const subscribeDjLive = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
export const useDjLive = () => useSyncExternalStore(subscribeDjLive, getDjLive, getDjLive);

export function setDjStems(active: number, avail: number): void {
  if (active === state.stems && avail === state.stemsAvail) return;
  state = { ...state, stems: active, stemsAvail: avail };
  emit();
}

export function setDjLive(patch: Partial<Pick<DjLive, "on" | "force" | "genre">>): void {
  state = { ...state, ...patch, moves: patch.on === true && !state.on ? 0 : state.moves };
  try {
    localStorage.setItem(KEY, JSON.stringify({ on: state.on, force: state.force, genre: state.genre }));
  } catch {
    // storage blocked: the choice lasts for this session
  }
  emit();
}

let actionTimer: ReturnType<typeof setTimeout> | null = null;
export function showDjAction(label: string): void {
  state = { ...state, action: label, moves: state.moves + 1 };
  emit();
  if (actionTimer) clearTimeout(actionTimer);
  actionTimer = setTimeout(() => {
    state = { ...state, action: null };
    emit();
  }, 6000);
}
