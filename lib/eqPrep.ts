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
      const base = [12, 10, 7, 3, 0][i];  // audible: the sub and the kick lift
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
      return clampGain(Math.max(0, expectedSlope - (val - mix[8])) * 1.2 + 2);
    } else if (i >= 5) {
      return -5;
    } else {
      return 0;
    }
  });
  recipes.push({
    id: "surround",
    label: "Surround",
    title: "Ouvre la stéréo et l'air : relève les aigus qui manquent par rapport à la pente naturelle du mix, creuse le bas-médium",
    gains: surroundGains,
    bars: 2
  });

  if ("vocals" in fx.spectra) {
    const devantGains = mix.map((_, i) => {
      if (i >= 10 && i <= 11) return 8;  // voice presence
      if (i >= 6 && i <= 7) return -5;
      if (i >= 1 && i <= 2) return -4;
      if (i === 12) return 2;
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
    if (i === 12 || i === 13) return 7;  // clarity
    if (i === 11) return -2;
    if (i === 9 || i === 10) return 3;
    return 0;
  });
  recipes.push({
    id: "clair",
    label: "Clair",
    title: "Plus de netteté sans siffler : relève 6,3 et 10 kHz un peu, adoucit 4 kHz",
    gains: clairGains,
    bars: 2
  });

  recipes.push({
    id: "sous-marin",
    label: "Sous-marin",
    title: "Étouffe le son comme sous l'eau : coupe les aigus, relève un peu le grave",
    gains: [
      clampGain(1.5), clampGain(1.5), clampGain(1.5), clampGain(1.5),
      clampGain(0), clampGain(0), clampGain(0), clampGain(0), clampGain(0),
      clampGain(-4), clampGain(-4), clampGain(-4),
      clampGain(-8), clampGain(-8), clampGain(-8)
    ],
    bars: 4
  });
  recipes.push({
    id: "radio",
    label: "Radio",
    title: "Son de poste : coupe les graves et les aigus, garde le médium",
    gains: [
      clampGain(-8), clampGain(-8), clampGain(-8), clampGain(-8),
      clampGain(-3), clampGain(-3),
      clampGain(1.5), clampGain(1.5), clampGain(1.5), clampGain(1.5), clampGain(1.5),
      clampGain(2),
      clampGain(-8), clampGain(-8), clampGain(-8)
    ],
    bars: 2
  });
  recipes.push({
    id: "respire",
    label: "Respire",
    title: "Retire la lourdeur sans perdre l'énergie : cuvette douce dans 400 Hz et 2,5 kHz",
    gains: [clampGain(1), clampGain(1), clampGain(0), clampGain(0), clampGain(0), clampGain(0), clampGain(-2.5), clampGain(0), clampGain(0), clampGain(0), clampGain(-2), clampGain(0), clampGain(0), clampGain(0), clampGain(0)],
    bars: 8
  });
  recipes.push({
    id: "boise",
    label: "Chaleur boisée",
    title: "Arrondit le grave-médium et allège le bas-médium, pour un piano ou une guitare plus chaud",
    gains: [-8,-6,-3,0,2,3,0,-1.5,0,0,0,0,0,1,0],
    bars: 4
  });
  recipes.push({
    id: "corde",
    label: "Corde claire",
    title: "Retire les bruits graves et fait ressortir l'attaque des cordes",
    gains: [-9,-8,-5,-2,0,0,-1.5,0,0,1.5,3,2.5,2,1.5,0],
    bars: 2
  });
  recipes.push({
    id: "salle",
    label: "Air de salle",
    title: "Ajoute de l'air et de la présence, comme dans une salle vivante",
    gains: [-6,-4,-1,0,0,0,0,0,0,0,0.5,1,2.5,3,3],
    bars: 4
  });
  recipes.push({
    id: "piano-rond",
    label: "Piano rond",
    title: "Donne du corps et de la rondeur aux notes graves du piano",
    gains: [-6,-3,1,2.5,2.5,1,0,0,-0.5,0,0,1,1.5,1,0],
    bars: 4
  });
  recipes.push({
    id: "handpan",
    label: "Handpan ouvert",
    title: "Fait chanter le corps du handpan et adoucit les harmoniques dures",
    gains: [-8,-5,0,2,3,3,1.5,0,-1,-2,-1.5,0,2,2.5,1.5],
    bars: 4
  });
  recipes.push({
    id: "zen-doux",
    label: "Zen doux",
    title: "Enlève grondements et aigus pour une écoute apaisée",
    gains: [-9,-7,-3,0,1,1.5,1,0,-1,-2,-3,-3.5,-4,-5,-6],
    bars: 8
  });
  recipes.push({
    id: "cordes",
    label: "Cordes soyeuses",
    title: "adoucit la stridence des violons et garde la chaleur des altos et violoncelles",
    gains: [-8,-6,-3,0,1,1.5,0,-0.5,0,0.5,0,-1.5,-1,1,1],
    bars: 4
  });
  recipes.push({
    id: "cuivres",
    label: "Cuivres doux",
    title: "calme l'éclat des trompettes et trombones sans les étouffer",
    gains: [-8,-6,-2,0,0,0,0,-1,-1.5,-2,-1.5,-2.5,-1,0,0],
    bars: 4
  });
  recipes.push({
    id: "lyrique",
    label: "Voix lyrique",
    title: "met en avant la voix chantée et son timbre, sans souffle ni dureté",
    gains: [-9,-7,-4,-1,0,0,0,0.5,1,1.5,2,1,0,0.5,0.5],
    bars: 4
  });
  recipes.push({
    id: "orchestre",
    label: "Orchestre large",
    title: "ouvre l'image sonore de l'orchestre, du grave profond à l'air des cordes",
    gains: [-4,-2,0,1,1.5,1,0,0,0,0,0.5,1,1.5,2,2],
    bars: 8
  });
  recipes.push({
    id: "piano-concert",
    label: "Piano de concert",
    title: "un piano de concert plein dans le grave, net et brillant dans l'aigu",
    gains: [-7,-4,0,1.5,1.5,0,-1,0,0,0.5,1,1.5,1.5,1,0.5],
    bars: 4
  });
  recipes.push({
    id: "neutre",
    label: "Neutre",
    title: "Remet l'égalisation à plat : annule l'effet de la section précédente",
    gains: new Array(15).fill(0),
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
