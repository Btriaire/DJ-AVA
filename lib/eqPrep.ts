import type { FxMap } from "@/lib/fxAnalysis";

export const EQ_BAND_HZ = [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000];

export interface EqRecipe {
  id: string;
  label: string;
  title: string;
  stem?: string;
  gains: number[];
  bars: number;
}

export function clampGain(g: number): number {
  const clamped = Math.max(-12, Math.min(9, g));
  return Math.round(clamped * 2) / 2;
}

export function buildRecipes(fx: FxMap): EqRecipe[] {
  const recipes: EqRecipe[] = [];
  const stems = ["vocals", "bass", "drums", "other", "guitar", "piano"];
  const mix = fx.spectra["mix"];

  stems.forEach(stem => {
    if (stem in fx.spectra) {
      const stemSpectrum = fx.spectra[stem];
      const gains = stemSpectrum.map((val, i) => {
        const diff = val - mix[i];
        return clampGain(diff > 0 ? 0.5 * diff - 3 : 0.25 * diff - 1);
      });
      recipes.push({
        id: `iso-${stem}`,
        label: `Isoler ${stem === "vocals" ? "Voix" : stem === "bass" ? "Basse" : stem === "drums" ? "Batterie" : stem === "guitar" ? "Guitare" : stem === "piano" ? "Piano" : "Autre"}`,
        title: `Met en avant ce stem dans le mix : monte les bandes où il domine le mix, coupe là où les autres dominent`,
        stem,
        gains,
        bars: 4
      });
    }
  });

  const bassRef = fx.spectra["bass"] || mix;
  const bassMean = bassRef.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const bassMax = Math.max(...bassRef.slice(0, 5));
  const bassGains = bassRef.map((val, i) => {
    if (i < 5) {
      const base = [5, 4, 3, 1, 0][i];
      return clampGain(base + 0.15 * (val - bassMax));
    } else if (i < 8) {
      return -1.5;
    } else {
      return 0;
    }
  });
  recipes.push({
    id: "boost-basse",
    label: "Boost basse",
    title: "Renforce le grave là où la basse et la grosse caisse jouent, sans rendre le mix boueux",
    gains: bassGains,
    bars: 8
  });

  const surroundGains = mix.map((val, i) => {
    if (i >= 9) {
      const expectedSlope = -3 * (i - 8) * 1.2;
      return clampGain(Math.max(0, expectedSlope - (val - mix[8])) * 0.5 + 1);
    } else if (i >= 5) {
      return -1.5;
    } else {
      return 0;
    }
  });
  recipes.push({
    id: "surround",
    label: "Surround",
    title: "Ouvre la stéréo et l'air : relève les aigus qui manquent par rapport à la pente naturelle du mix, creuse le bas-médium",
    gains: surroundGains,
    bars: 4
  });

  if ("vocals" in fx.spectra) {
    const devantGains = mix.map((_, i) => {
      if (i >= 10 && i <= 11) return 2.5;
      if (i >= 6 && i <= 7) return -2;
      if (i >= 1 && i <= 2) return -2;
      return 0;
    });
    recipes.push({
      id: "devant",
      label: "Voix devant",
      title: "Fait passer la voix devant le mix : présence et creux dans le bas-médium du reste",
      gains: devantGains,
      bars: 2
    });
  }

  const clairGains = mix.map((_, i) => {
    if (i === 12 || i === 13) return 2;
    if (i === 11) return -1.5;
    return 0;
  });
  recipes.push({
    id: "clair",
    label: "Clair",
    title: "Plus de netteté sans siffler : relève 6,3 et 10 kHz un peu, adoucit 4 kHz",
    gains: clairGains,
    bars: 4
  });

  return recipes;
}

export function planPrep(recipes: EqRecipe[], bpm: number, bars: number): number {
  const totalBars = recipes.reduce((sum, recipe) => sum + recipe.bars, 0) + bars;
  return Math.max(0.5, totalBars * 4 * 60 / bpm);
}

export function eqPrepTest(): void {
  const flat = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const withVoice: FxMap = {
    version: 1, lufs: -14, phraseEnds: [],
    spectra: { mix: flat, vocals: [0, 0, 0, 0, 0, 0, 0, 0, 0, 12, 12, 0, 0, 0, 0], bass: flat },
  };
  const recipes = buildRecipes(withVoice);
  const iso = recipes.find((r) => r.id === "iso-vocals");
  if (!iso) throw new Error("eqPrep iso-vocals missing");
  if (!(iso.gains[10] > 0) || !(iso.gains[0] < 0)) throw new Error("eqPrep iso-vocals gains wrong");
  for (const r of recipes) {
    if (r.gains.length !== 15) throw new Error(`eqPrep ${r.id}: 15 gains expected`);
    for (const g of r.gains) {
      if (g < -12 || g > 9 || Math.round(g * 2) !== g * 2) throw new Error(`eqPrep ${r.id}: gain ${g} out of range or not 0.5`);
    }
  }
  if (!recipes.some((r) => r.id === "devant")) throw new Error("eqPrep devant missing with vocals");
  const noVoice = buildRecipes({ ...withVoice, spectra: { mix: flat, bass: flat } });
  if (noVoice.some((r) => r.id === "iso-vocals" || r.id === "devant")) throw new Error("eqPrep vocals recipes without vocals");
  if (!(planPrep(recipes, 120, 4) > 0)) throw new Error("eqPrep plan");
}
