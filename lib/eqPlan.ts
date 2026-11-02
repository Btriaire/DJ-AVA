import type { StemSection } from "@/lib/stemAnalysis";
import type { EqRecipe } from "@/lib/eqPrep";

export interface EqStep { t: number; recipeId: string; bars: number; reason: string }

export function buildPlan(sections: StemSection[], recipes: EqRecipe[], bpm: number, duration: number): EqStep[] {
  const steps: EqStep[] = [];
  const recipeIds = new Set(recipes.map(recipe => recipe.id));

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (section.end - section.start < 4) continue;

    const t = section.start;
    if (t > duration - 2) break;

    let step: EqStep | null = null;

    switch (section.kind) {
      case "peak":
        if (recipeIds.has("boost-basse")) {
          step = { t, recipeId: "boost-basse", bars: recipes.find(r => r.id === "boost-basse")!.bars, reason: "Drop : le grave prend la place" };
        }
        break;
      case "blank":
        if (recipeIds.has("surround")) {
          step = { t, recipeId: "surround", bars: recipes.find(r => r.id === "surround")!.bars, reason: "Break : la stéréo s'ouvre" };
        }
        break;
      case "slow":
        if (section.vocals > 0.5 && recipeIds.has("devant")) {
          step = { t, recipeId: "devant", bars: recipes.find(r => r.id === "devant")!.bars, reason: "Partie chantée : la voix passe devant" };
        }
        break;
      case "normal":
        if (i > 0 && sections[i - 1].kind === "peak" && recipeIds.has("clair")) {
          step = { t, recipeId: "clair", bars: recipes.find(r => r.id === "clair")!.bars, reason: "Retour : on remet de la netteté" };
        }
        break;
    }

    if (step) {
      steps.push(step);
    }
  }

  return steps.sort((a, b) => a.t - b.t);
}

export function planAt(steps: EqStep[], t: number, done: Set<number>): EqStep | null {
  for (let i = 0; i < steps.length; i++) {
    if (!done.has(i) && steps[i].t <= t) {
      done.add(i);
      return steps[i];
    }
  }
  return null;
}

export function planTest(): void {
  const sections: StemSection[] = [
    { start: 0, end: 20, kind: "normal", drums: 0, vocals: 0, level: 0 },
    { start: 20, end: 40, kind: "peak", drums: 0, vocals: 0, level: 0 },
    { start: 40, end: 60, kind: "blank", drums: 0, vocals: 0, level: 0 },
  ];
  const recipes: EqRecipe[] = [
    { id: "boost-basse", label: "Boost basse", title: "", gains: [], bars: 4 },
    { id: "surround", label: "Surround", title: "", gains: [], bars: 4 },
    { id: "devant", label: "Voix devant", title: "", gains: [], bars: 4 },
  ];
  const bpm = 120;
  const duration = 60;

  const steps = buildPlan(sections, recipes, bpm, duration);
  if (steps.length !== 2) throw new Error("eqPlan steps count");
  if (steps[0].t !== 20 || steps[0].recipeId !== "boost-basse") throw new Error("eqPlan step 1");
  if (steps[1].t !== 40 || steps[1].recipeId !== "surround") throw new Error("eqPlan step 2");

  const noSurround = buildPlan(sections, [{ id: "boost-basse", label: "Boost basse", title: "", gains: [], bars: 4 }], bpm, duration);
  if (noSurround.length !== 1) throw new Error("eqPlan no surround");

  const done = new Set<number>();
  const step1 = planAt(steps, 25, done);
  if (!step1 || step1.recipeId !== "boost-basse") throw new Error("eqPlan planAt 1");
  const step2 = planAt(steps, 25, done);
  if (step2 !== null) throw new Error("eqPlan planAt 2");
}

import type { FxMap } from "@/lib/fxAnalysis";
