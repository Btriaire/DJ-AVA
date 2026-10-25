import type { LibTrack } from "@/lib/library";
import { keyCompat } from "@/lib/camelot";

// What state is a set in, and what is the most useful next thing to do with it?
// Pure: the views (set cards, set detail, journey bar, wizard) all read the same answer.

export type SetStatus = "empty" | "draft" | "ready" | "perfect";
export type NextStepId = "add" | "analyze" | "order" | "stems" | "play";

export interface NextStep {
  id: NextStepId;
  label: string; // short imperative, shown on the button
  detail: string; // one sentence of why
}

export interface SetHealth {
  count: number;
  seconds: number;
  bpmMin: number;
  bpmMax: number;
  bpmMissing: number; // titles without a tempo
  keyMissing: number; // titles without a key (transitions can't be judged)
  stemsReady: number;
  smooth: number; // transitions: same / neighbour / relative key
  boost: number; // energy-lift keys
  clash: number; // clashing keys
  unknown: number; // transitions where a key is missing
  status: SetStatus;
  next: NextStep;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function setHealth(trackIds: string[], tracks: ReadonlyMap<string, LibTrack>, stemReady: (id: string) => boolean): SetHealth {
  const list = trackIds.map((id) => tracks.get(id)).filter((t): t is LibTrack => !!t);
  const bpms = list.map((t) => t.bpm).filter((b): b is number => typeof b === "number" && b > 0);
  const bpmMissing = list.length - bpms.length;
  const keyMissing = list.filter((t) => !t.camelot).length;
  const stemsReady = list.filter((t) => stemReady(t.id)).length;

  let smooth = 0;
  let boost = 0;
  let clash = 0;
  let unknown = 0;
  for (let i = 1; i < list.length; i++) {
    const level = keyCompat(list[i - 1].camelot, list[i].camelot).level;
    if (level === "same" || level === "good") smooth++;
    else if (level === "boost") boost++;
    else if (level === "clash") clash++;
    else unknown++;
  }
  const transitions = Math.max(list.length - 1, 0);

  const missing = Math.max(bpmMissing, keyMissing);
  let next: NextStep;
  if (list.length < 2) {
    next = { id: "add", label: "Ajouter des titres", detail: list.length === 0 ? "Un set a besoin d'au moins 2 titres." : "Encore 1 titre pour pouvoir enchaîner." };
  } else if (missing > 0) {
    next = {
      id: "analyze",
      label: `Analyser ${plural(missing, "titre", "titres")}`,
      detail: "Sans tempo ni tonalité, l'ordre et les transitions ne peuvent pas être jugés.",
    };
  } else if (transitions > 0 && clash / transitions > 0.34) {
    next = { id: "order", label: "Réordonner", detail: `${plural(clash, "transition dissonante", "transitions dissonantes")} sur ${transitions} : un nouvel ordre sonnera mieux.` };
  } else if (stemsReady < list.length) {
    next = { id: "stems", label: "Préparer les stems", detail: `${stemsReady}/${list.length} prêts : sans eux, le chargement des stems en direct sera plus long.` };
  } else {
    next = { id: "play", label: "Lancer le relais", detail: "Tout est prêt : tempos, tonalités, ordre et stems." };
  }

  let status: SetStatus;
  if (list.length === 0) status = "empty";
  else if (list.length < 2 || missing > 0) status = "draft";
  else if (stemsReady === list.length && (transitions === 0 || clash / transitions <= 0.34)) status = "perfect";
  else status = "ready";

  return {
    count: list.length,
    seconds: list.reduce((s, t) => s + (t.durationSec ?? 0), 0),
    bpmMin: bpms.length ? Math.round(Math.min(...bpms)) : 0,
    bpmMax: bpms.length ? Math.round(Math.max(...bpms)) : 0,
    bpmMissing,
    keyMissing,
    stemsReady,
    smooth,
    boost,
    clash,
    unknown,
    status,
    next,
  };
}

export const STATUS_LABEL: Record<SetStatus, string> = {
  empty: "Vide",
  draft: "À compléter",
  ready: "Jouable",
  perfect: "Prêt à jouer",
};
