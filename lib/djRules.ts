import { useSyncExternalStore } from "react";
import type { AccentKind } from "@/lib/djForce";
import type { TransitionType } from "@/lib/library";
import type { StemTech } from "@/lib/stemMix";

// What the intelligent DJ is allowed to do. Everything is allowed by default; the Préparation panels let the user
// forbid single filters, effects, transitions and stem techniques, keep the DJ away from the voices, slow the stems
// down, or cap the strength of its moves. The rules of a set live in its DJ options (dj.rules); the last ones chosen
// also apply to songs played by hand (the global store below).

export interface DjRules {
  noMoves?: AccentKind[]; // moves made during a song that are forbidden
  noTransitions?: TransitionType[]; // blends that are forbidden (the DJ takes a plain fade instead)
  noTechs?: StemTech[]; // stem techniques of a change that are forbidden
  autoStems?: boolean; // false: the DJ does not switch a song to its stems by itself (default true)
  touchVoices?: boolean; // false: no move and no technique plays with the voice (default true)
  stemFade?: "soft" | "normal" | "quick"; // how slowly the stems go down and come back (default normal)
  maxAmount?: number; // strength of the moves, at most this (0.3..1, default 1)
}

export const VOICE_MOVES: readonly AccentKind[] = ["voiceout", "vocalsolo", "vocalecho"];
export const VOICE_TECHS: readonly StemTech[] = ["vocalhandoff", "stripout"];
export const FADE_FACTOR = { soft: 1.8, normal: 1, quick: 0.6 } as const;
export const FADE_LABEL = { soft: "Très doux", normal: "Doux", quick: "Vif" } as const;

export const moveAllowed = (k: AccentKind, r?: DjRules): boolean => !r || (!r.noMoves?.includes(k) && (r.touchVoices !== false || !VOICE_MOVES.includes(k)));
export const transitionAllowed = (t: TransitionType, r?: DjRules): boolean => !r?.noTransitions?.includes(t);
export const techAllowed = (t: StemTech, r?: DjRules): boolean => !r || (!r.noTechs?.includes(t) && (r.touchVoices !== false || !VOICE_TECHS.includes(t)));
export const fadeFactor = (r?: DjRules): number => FADE_FACTOR[r?.stemFade ?? "normal"];
export const capAmount = (a: number, r?: DjRules): number => Math.min(a, Math.max(0.3, Math.min(1, r?.maxAmount ?? 1)));
export const hasRules = (r?: DjRules): boolean => !!r && (!!r.noMoves?.length || !!r.noTransitions?.length || !!r.noTechs?.length || r.touchVoices === false || r.autoStems === false || (r.stemFade ?? "normal") !== "normal" || (r.maxAmount ?? 1) < 1);

// ---- the rules that also serve songs played by hand ----
const KEY = "djsynth.djrules.v1";
function load(): DjRules {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as DjRules;
  } catch {
    return {};
  }
}
let state: DjRules = typeof window === "undefined" ? {} : load();
const listeners = new Set<() => void>();
export const getDjRules = () => state;
export const setDjRules = (r: DjRules) => {
  state = r;
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    // storage blocked: the choice lasts for this session
  }
  listeners.forEach((l) => l());
};
export const useDjRules = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getDjRules,
    getDjRules
  );
