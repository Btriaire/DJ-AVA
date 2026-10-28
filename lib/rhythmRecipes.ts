// Recipes: sets of links that transform the song (its stems), one intensity for the whole set. Written by MaRuche (Falken);
// hints rewritten in plain French, no `any`.
import type { RhythmRoute } from "./audio/rhythmBus";

export type Intensity = "light" | "medium" | "strong";

export interface Recipe {
  id: string;
  label: string;
  hint: string;
  routes: Omit<RhythmRoute, "id" | "on">[];
}

/* ----------  Recipes  ---------- */

export const RECIPES: Recipe[] = [
  {
    id: "house",
    label: "Pompe house",
    hint: "La grosse caisse fait pomper la basse et le reste, la caisse claire lance la reverb de la voix, le charleston fait respirer l'aigu, un reverse à chaque phrase.",
    routes: [
      {
        source: "kick",
        kind: "stemduck",
        arg: "bass",
        amount: 0.8,
        depth: 0.75,
        len: 0.55,
      },
      {
        source: "kick",
        kind: "stemduck",
        arg: "other",
        amount: 0.6,
        depth: 0.4,
        len: 0.5,
      },
      {
        source: "snare",
        kind: "stemsend",
        arg: "vocals:reverb",
        amount: 0.7,
        len: 1,
      },
      {
        source: "hat",
        kind: "stemfilter",
        arg: "other:hp",
        amount: 0.4,
        density: 0.5,
      },
      {
        source: "phrase8",
        kind: "stemfx",
        arg: "other:reverse",
        amount: 0.8,
        len: 1,
      },
    ],
  },
  {
    id: "trance",
    label: "Gate trance",
    hint: "Le reste du morceau est haché en double-croches, la basse pompe sur la grosse caisse, la voix part en écho toutes les 16 mesures.",
    routes: [
      {
        source: "beat",
        kind: "stemduck",
        arg: "other",
        amount: 0.8,
        depth: 0.9,
        len: 0.25,
        grid: 4,
        pattern: "x.xxx.x.x.xxx.x.",
      },
      {
        source: "kick",
        kind: "stemduck",
        arg: "bass",
        amount: 0.7,
        depth: 0.6,
        len: 0.5,
      },
      {
        source: "phrase16",
        kind: "stemfx",
        arg: "vocals:echoout",
        amount: 0.8,
        len: 4,
      },
    ],
  },
  {
    id: "tension",
    label: "Tension de breakdown",
    hint: "L'aigu monte à chaque mesure, des échos de voix sur le charleston, un roll de batterie à chaque phrase : la tension avant le drop.",
    routes: [
      {
        source: "bar",
        kind: "stemfilter",
        arg: "other:hp",
        amount: 0.7,
      },
      {
        source: "hat",
        kind: "stemsend",
        arg: "vocals:delay",
        amount: 0.5,
        len: 0.5,
        prob: 0.5,
      },
      {
        source: "phrase8",
        kind: "stemfx",
        arg: "drums:roll",
        amount: 0.8,
        len: 2,
      },
    ],
  },
  {
    id: "dub",
    label: "Dub",
    hint: "La caisse claire envoie des échos longs, la basse respire lentement, la batterie part en dub toutes les 16 mesures.",
    routes: [
      {
        source: "snare",
        kind: "stemsend",
        arg: "other:delay",
        amount: 0.8,
        len: 2,
      },
      {
        source: "kick",
        kind: "stemduck",
        arg: "bass",
        amount: 0.6,
        depth: 0.5,
        len: 1,
      },
      {
        source: "phrase16",
        kind: "stemfx",
        arg: "drums:dub",
        amount: 0.8,
        len: 4,
      },
    ],
  },
  {
    id: "drop",
    label: "Drop qui claque",
    hint: "Un frein sur le reste à chaque phrase, une pompe profonde de la basse, une reverb courte sur la caisse claire.",
    routes: [
      {
        source: "phrase8",
        kind: "stemfx",
        arg: "other:brake",
        amount: 0.8,
        len: 1,
      },
      {
        source: "kick",
        kind: "stemduck",
        arg: "bass",
        amount: 0.8,
        depth: 0.85,
        len: 0.5,
      },
      {
        source: "snare",
        kind: "stemsend",
        arg: "drums:reverb",
        amount: 0.6,
        len: 0.5,
      },
    ],
  },
];

/* ----------  Helpers  ---------- */

const INTENSITY_FACTOR: Record<Intensity, number> = {
  light: 0.6,
  medium: 1,
  strong: 1.35,
};

/**
 * Scale a recipe according to intensity.
 * Adds `recipe` tag and clamps amount/depth.
 */
export function scaleRecipe(
  r: Recipe,
  k: Intensity,
  recipeTag: string
): Omit<RhythmRoute, "id" | "on">[] {
  if (!recipeTag) throw new Error("recipeTag is required");
  const factor = INTENSITY_FACTOR[k];
  return r.routes.map((route) => {
    const scaled: Omit<RhythmRoute, "id" | "on"> = { ...route, recipe: recipeTag };
    if (typeof route.amount === "number") {
      const a = route.amount * factor;
      scaled.amount = Math.min(1, Math.max(0.1, a));
    }
    if (typeof route.depth === "number") {
      const d = route.depth * factor;
      scaled.depth = Math.min(0.97, Math.max(0.1, d));
    }
    return scaled;
  });
}

/**
 * Run internal sanity checks.
 * Throws on first failure.
 */
export function selfTest(): void {
  // Minimum routes
  for (const rec of RECIPES) {
    if (rec.routes.length < 3) {
      throw new Error(`Recipe ${rec.id} has less than 3 routes`);
    }
  }

  // All routes target stem outputs
  for (const rec of RECIPES) {
    for (const rt of rec.routes) {
      if (!rt.kind.startsWith("stem")) {
        throw new Error(`Recipe ${rec.id} contains non‑stem route kind ${rt.kind}`);
      }
    }
  }

  // Scaling strong stays within bounds
  for (const rec of RECIPES) {
    const scaled = scaleRecipe(rec, "strong", "test");
    for (const rt of scaled) {
      if (rt.amount !== undefined && (rt.amount < 0.1 || rt.amount > 1)) {
        throw new Error(`Strong scaling out of amount bounds in ${rec.id}`);
      }
      if (rt.depth !== undefined && (rt.depth < 0.1 || rt.depth > 0.97)) {
        throw new Error(`Strong scaling out of depth bounds in ${rec.id}`);
      }
    }
  }

  // Light amount must be lower than medium on first route
  for (const rec of RECIPES) {
    const first = rec.routes[0];
    if (typeof first.amount === "number") {
      const light = Math.max(0.1, Math.min(1, first.amount * INTENSITY_FACTOR.light));
      const medium = Math.max(0.1, Math.min(1, first.amount * INTENSITY_FACTOR.medium));
      if (light >= medium) {
        throw new Error(`Light amount not lower than medium in ${rec.id}`);
      }
    }
  }

  // Empty tag must raise error
  const sample = RECIPES[0];
  let threw = false;
  try {
    scaleRecipe(sample, "medium", "");
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error("scaleRecipe did not reject empty recipeTag");
  }
}
