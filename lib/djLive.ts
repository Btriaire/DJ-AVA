import { useSyncExternalStore } from "react";
import { forceOf, type DjForce } from "@/lib/djForce";

// "DJ intelligent" as a switch that is always at hand (in the top bar, on every view, Console included): when it is
// ON the DJ makes its moves on whatever song plays on a deck, a set of the relay or a song you play by hand. Its force
// (1 to 5, lib/djForce.ts) decides how often and how strongly. Transitions of a relay still follow the set's own plan.

export interface DjLive {
  on: boolean;
  force: DjForce;
  action: string | null; // the move the DJ just made, shown in the top bar for a few seconds
}

const KEY = "djsynth.djlive.v1";

function load(): DjLive {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<DjLive>;
    return { on: !!v.on, force: forceOf({ force: v.force }), action: null };
  } catch {
    return { on: false, force: 3, action: null };
  }
}

let state: DjLive = typeof window === "undefined" ? { on: false, force: 3, action: null } : load();
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

export function setDjLive(patch: Partial<Pick<DjLive, "on" | "force">>): void {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify({ on: state.on, force: state.force }));
  } catch {
    // storage blocked: the choice lasts for this session
  }
  emit();
}

let actionTimer: ReturnType<typeof setTimeout> | null = null;
export function showDjAction(label: string): void {
  state = { ...state, action: label };
  emit();
  if (actionTimer) clearTimeout(actionTimer);
  actionTimer = setTimeout(() => {
    state = { ...state, action: null };
    emit();
  }, 4500);
}
