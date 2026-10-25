import type { TransitionType } from "@/lib/library";

// Every way the relay can go from one song to the next. The first four are blends; the others use the deck
// effects on the song that leaves (echo, reverb, reverse, brake) or a loop / high-pass sweep.
export const TRANSITIONS: { key: TransitionType; label: string; hint: string }[] = [
  { key: "smooth", label: "Doux", hint: "Courbe en S, presque imperceptible." },
  { key: "fade", label: "Fondu", hint: "Fondu enchaîné linéaire, classique." },
  { key: "filter", label: "Filtre", hint: "Le titre qui sort se ferme au filtre passe-bas pendant le fondu." },
  { key: "highpass", label: "Filtre aigu", hint: "Le titre qui sort perd ses basses, monte dans les aigus et s'efface." },
  { key: "loop", label: "Boucle", hint: "La dernière mesure du titre qui sort tourne en boucle pendant que le nouveau entre." },
  { key: "echo", label: "Écho", hint: "Le titre qui sort est coupé et part en échos calés sur le tempo, sous le nouveau." },
  { key: "wash", label: "Réverb", hint: "Le titre qui sort se noie dans une grande réverbération pendant que le nouveau arrive." },
  { key: "brake", label: "Freinage", hint: "Le titre qui sort ralentit jusqu'à l'arrêt comme un vinyle, le nouveau prend la main." },
  { key: "reverse", label: "Rembobinage", hint: "Les derniers temps du titre qui sort repartent à l'envers, puis le nouveau éclate." },
  { key: "eq", label: "Égaliseur", hint: "Les graves, puis les médiums, puis les aigus du titre qui sort s'éteignent pendant que ceux du nouveau s'allument, bande par bande." },
  { key: "dub", label: "Dub", hint: "Écho dub ping-pong filtré : le titre qui sort se disperse en répétitions sous le nouveau." },
  { key: "flanger", label: "Flanger", hint: "Un balayage de flanger tourne sur le titre qui sort pendant le fondu." },
  { key: "gate", label: "Gate", hint: "Le titre qui sort est haché rythmiquement (gate) pendant que le nouveau monte." },
  { key: "noise", label: "Souffle", hint: "Un souffle montant (riser) couvre le fondu, comme un balayage de bruit blanc." },
  { key: "roll", label: "Roulement", hint: "Le titre qui sort se met à rouler (répétitions rapides, roll) puis laisse la place au nouveau." },
  { key: "drop", label: "Coupure + claque", hint: "Le titre qui sort se coupe net dans une réverb, un instant de vide, puis le nouveau claque en plein volume." },
  { key: "cut", label: "Coupe", hint: "Bascule instantanée, sans fondu." },
];

// the blends with an effect on the outgoing song (used by the DJ plan when it wants something other than a plain fade)
export const EFFECT_TRANSITIONS: TransitionType[] = ["echo", "dub", "wash", "flanger", "gate", "noise", "roll", "brake", "reverse", "loop", "highpass", "eq", "drop"];

export const TRANSITION_LABEL = Object.fromEntries(TRANSITIONS.map((t) => [t.key, t.label])) as Record<TransitionType, string>;
export const TRANSITION_HINT = Object.fromEntries(TRANSITIONS.map((t) => [t.key, t.hint])) as Record<TransitionType, string>;

// the deck effect each effect transition engages on the outgoing song, and when (progress 0..1 of the blend)
export const TRANSITION_FX: Partial<Record<TransitionType, { fx: "echo" | "reverb" | "reverse" | "brake" | "dub" | "flanger" | "gate" | "noise" | "roll"; at: number; wet: number; dryCut?: number }>> = {
  echo: { fx: "echo", at: 0.4, wet: 0.85, dryCut: 0.55 }, // the dry song stops, its echoes go on
  wash: { fx: "reverb", at: 0.3, wet: 0.95, dryCut: 0.65 },
  reverse: { fx: "reverse", at: 0.55, wet: 1 },
  brake: { fx: "brake", at: 0.45, wet: 1 },
  dub: { fx: "dub", at: 0.35, wet: 0.8, dryCut: 0.6 },
  flanger: { fx: "flanger", at: 0.2, wet: 0.9 },
  gate: { fx: "gate", at: 0.45, wet: 1 },
  noise: { fx: "noise", at: 0.3, wet: 0.8 },
  roll: { fx: "roll", at: 0.6, wet: 1 },
  drop: { fx: "reverb", at: 0.55, wet: 0.95, dryCut: 0.78 },
};

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// position of the crossfader (0 = all on the outgoing song, 1 = all on the incoming one) at progress k
export function crossfadeAt(type: TransitionType, k: number): number {
  switch (type) {
    case "smooth":
      return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    case "echo":
    case "wash":
    case "dub":
      // the incoming song comes up to the middle while the echoes / reverb of the old one ring out, then takes over
      return k < 0.3 ? 0.5 * smooth(k / 0.3) : k > 0.85 ? 0.5 + 0.5 * smooth((k - 0.85) / 0.15) : 0.5;
    case "drop":
      // the old song keeps the floor until the cut, a moment of empty, then the new one takes it at once
      return k < 0.8 ? 0 : k < 0.86 ? smooth((k - 0.8) / 0.06) : 1;
    case "roll":
    case "reverse":
    case "brake":
      // the old song keeps the floor until its effect plays, then the new one takes it quickly
      return smooth(clamp01((k - 0.5) / 0.5));
    case "flanger":
    case "gate":
    case "noise":
    case "eq":
      return smooth(k);
    default:
      return k;
  }
}
