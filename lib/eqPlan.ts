import type { StemSection } from "@/lib/stemAnalysis";
import type { EqRecipe } from "@/lib/eqPrep";

export interface EqStep {
  t: number;
  recipeId: string;
  bars: number;
  reason: string;
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

export function buildPlan(sections: StemSection[], recipes: EqRecipe[], bpm: number, duration: number): EqStep[] {
  const steps: EqStep[] = [];
  let lastRecipeId: string | null = null;

  for (const section of sections) {
    const sectionDuration = section.end - section.start;
    if (sectionDuration < 4 || section.start > duration - 2) {
      continue;
    }

    let recipeId: string | null = null;
    let reason: string = "";

    if (section.kind === "peak" || (section.drums >= 0.6 && section.level >= 0.7)) {
      recipeId = "boost-basse";
      reason = "Drop : le grave prend la place";
    } else if (section.kind === "blank") {
      recipeId = "surround";
      reason = "Break : la stéréo s'ouvre";
    } else if (section.vocals >= 0.5) {
      recipeId = "devant";
      reason = "Partie chantée : la voix passe devant";
    } else if (section.kind === "normal" && section.drums < 0.3 && section.vocals < 0.3) {
      recipeId = "clair";
      reason = "Passage calme : netteté";
    } else {
      recipeId = "neutre";
      reason = "Retour à plat";
    }

    if (recipeId && recipeId !== lastRecipeId) {
      const recipe = recipes.find(r => r.id === recipeId);
      if (recipe) {
        steps.push({
          t: section.start,
          recipeId,
          bars: recipe.bars,
          reason
        });
        lastRecipeId = recipeId;
      }
    }
  }

  steps.sort((a, b) => a.t - b.t);
  return steps;
}

export function planTest(): void {
  const sections: StemSection[] = [
    { start: 0, end: 20, kind: "normal", drums: 0, vocals: 0, level: 0.2 },
    { start: 20, end: 40, kind: "peak", drums: 0, vocals: 0, level: 0 },
    { start: 40, end: 60, kind: "blank", drums: 0, vocals: 0, level: 0 }
  ];

  const recipes = [
    { id: "boost-basse", bars: 4 },
    { id: "surround", bars: 4 },
    { id: "clair", bars: 4 },
    { id: "neutre", bars: 4 }
  ] as EqRecipe[];

  const plan = buildPlan(sections, recipes, 120, 60);
  const recipeIds = plan.map(step => step.recipeId);
  console.assert(recipeIds.length === 3, "Expected 3 steps");
  console.assert(recipeIds[0] === "clair", "Expected 'clair' first");
  console.assert(recipeIds[1] === "boost-basse", "Expected 'boost-basse' second");
  console.assert(recipeIds[2] === "surround", "Expected 'surround' third");
}
