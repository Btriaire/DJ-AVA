/**
 * Gestion des plans d'égalisation pour les decks.
 */

import { useSyncExternalStore } from "react";
import type { Deck } from "./audio/Deck";
import type { EqStep } from "./eqPlan";
import type { PlanStep } from "./audio/stemLaneDraw";

const listeners = new Set<() => void>();
const plans = new WeakMap<Deck, PlanStep[]>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  listeners.forEach((cb) => cb());
}

export function setDeckPlan(deck: Deck, steps: EqStep[] | null): void {
  if (!steps || steps.length === 0) {
    plans.delete(deck);
    notify();
    return;
  }

  const bpm = deck.bpm || 120;
  const planSteps: PlanStep[] = steps.map((step) => ({
    start: step.t,
    end: step.t + step.bars * (240 / bpm),
    label: step.reason.length > 24 ? `${step.reason.substring(0, 21)}...` : step.reason,
    color: "#fbbf24",
  }));

  plans.set(deck, planSteps);
  notify();
}

export function deckPlanSteps(deck: Deck): PlanStep[] | undefined {
  return plans.get(deck);
}

export function usePlanSteps(deck: Deck): PlanStep[] | undefined {
  return useSyncExternalStore(subscribe, () => deckPlanSteps(deck));
}
