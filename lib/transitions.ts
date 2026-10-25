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
  { key: "cut", label: "Coupe", hint: "Bascule instantanée, sans fondu." },
];

export const TRANSITION_LABEL = Object.fromEntries(TRANSITIONS.map((t) => [t.key, t.label])) as Record<TransitionType, string>;
export const TRANSITION_HINT = Object.fromEntries(TRANSITIONS.map((t) => [t.key, t.hint])) as Record<TransitionType, string>;

// the deck effect each effect transition engages on the outgoing song, and when (progress 0..1 of the blend)
export const TRANSITION_FX: Partial<Record<TransitionType, { fx: "echo" | "reverb" | "reverse" | "brake"; at: number; wet: number; dryCut?: number }>> = {
  echo: { fx: "echo", at: 0.4, wet: 0.85, dryCut: 0.55 }, // the dry song stops, its echoes go on
  wash: { fx: "reverb", at: 0.3, wet: 0.95, dryCut: 0.65 },
  reverse: { fx: "reverse", at: 0.55, wet: 1 },
  brake: { fx: "brake", at: 0.45, wet: 1 },
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
      // the incoming song comes up to the middle while the echoes / reverb of the old one ring out, then takes over
      return k < 0.3 ? 0.5 * smooth(k / 0.3) : k > 0.85 ? 0.5 + 0.5 * smooth((k - 0.85) / 0.15) : 0.5;
    case "reverse":
    case "brake":
      // the old song keeps the floor until its effect plays, then the new one takes it quickly
      return smooth(clamp01((k - 0.5) / 0.5));
    default:
      return k;
  }
}
