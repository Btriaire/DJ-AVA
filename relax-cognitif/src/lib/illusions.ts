// Banque d'illusions d'optique, des plus simples (Découverte) aux plus
// complexes (Expert). Chaque item est une question de perception : le joueur
// devine, puis une preuve visuelle se révèle pour le moment « aha ».

export type IllusionLevel = 1 | 2 | 3;

export type IllusionKind =
  | "muller-lyer"
  | "vertical-horizontal"
  | "count-circles"
  | "ebbinghaus"
  | "ponzo"
  | "delboeuf"
  | "jastrow"
  | "cafe-wall"
  | "hermann"
  | "adelson"
  | "kanizsa"
  | "fraser"
  | "contrast";

export type Illusion = {
  id: string;
  level: IllusionLevel;
  kind: IllusionKind;
  question: string;
  options: string[];
  answer: string;
  explain: string;
};

export const LEVEL_LABEL: Record<IllusionLevel, string> = {
  1: "Découverte",
  2: "Curieux",
  3: "Expert",
};

export const ILLUSIONS: Illusion[] = [
  // ── Niveau 1 · Découverte ───────────────────────────────────────
  {
    id: "muller-lyer",
    level: 1,
    kind: "muller-lyer",
    question: "Quel trait horizontal est le plus long ?",
    options: ["Le trait du haut", "Le trait du bas", "Ils sont égaux"],
    answer: "Ils sont égaux",
    explain:
      "Les deux traits ont exactement la même longueur. Les pointes vers l'extérieur « étirent » le trait du bas dans notre perception (illusion de Müller-Lyer).",
  },
  {
    id: "vertical-horizontal",
    level: 1,
    kind: "vertical-horizontal",
    question: "Quel trait est le plus long ?",
    options: ["Le trait vertical", "Le trait horizontal", "Ils sont égaux"],
    answer: "Ils sont égaux",
    explain:
      "Les deux traits sont identiques. Nous surestimons toujours les lignes verticales par rapport aux horizontales.",
  },
  {
    id: "count-circles",
    level: 1,
    kind: "count-circles",
    question: "Combien de disques bleus voyez-vous ?",
    options: ["5", "6", "7", "8"],
    answer: "6",
    explain: "Il y a bien 6 disques. Prendre le temps de compter calme l'œil.",
  },
  {
    id: "ebbinghaus",
    level: 1,
    kind: "ebbinghaus",
    question: "Quel disque orange central est le plus grand ?",
    options: ["Celui de gauche", "Celui de droite", "Ils sont identiques"],
    answer: "Ils sont identiques",
    explain:
      "Les deux disques oranges sont de taille identique. Entourés de petits cercles, ils paraissent plus grands (illusion d'Ebbinghaus).",
  },

  // ── Niveau 2 · Curieux ──────────────────────────────────────────
  {
    id: "ponzo",
    level: 2,
    kind: "ponzo",
    question: "Quelle barre jaune est la plus longue ?",
    options: ["Celle du haut", "Celle du bas", "Elles sont égales"],
    answer: "Elles sont égales",
    explain:
      "Les deux barres sont égales. Les rails qui convergent donnent une impression de profondeur : la barre du haut semble plus lointaine, donc plus grande (illusion de Ponzo).",
  },
  {
    id: "delboeuf",
    level: 2,
    kind: "delboeuf",
    question: "Quel disque noir est le plus grand ?",
    options: ["Celui de gauche", "Celui de droite", "Ils sont identiques"],
    answer: "Ils sont identiques",
    explain:
      "Les deux disques noirs sont identiques. Un anneau proche le fait paraître plus grand, un anneau éloigné plus petit (illusion de Delbœuf).",
  },
  {
    id: "jastrow",
    level: 2,
    kind: "jastrow",
    question: "Quelle pièce courbe est la plus grande ?",
    options: ["Celle du haut", "Celle du bas", "Elles sont identiques"],
    answer: "Elles sont identiques",
    explain:
      "Les deux pièces sont strictement identiques. Le petit côté de l'une touche le grand côté de l'autre, ce qui trompe la comparaison (illusion de Jastrow).",
  },
  {
    id: "cafe-wall",
    level: 2,
    kind: "cafe-wall",
    question: "Les longues lignes grises sont-elles parallèles ?",
    options: ["Oui, parfaitement parallèles", "Non, elles penchent"],
    answer: "Oui, parfaitement parallèles",
    explain:
      "Les lignes grises sont parfaitement horizontales et parallèles. Le décalage des carrés noirs et blancs crée une illusion de pente (mur du café).",
  },
  {
    id: "hermann",
    level: 2,
    kind: "hermann",
    question: "Des points gris apparaissent-ils aux croisements blancs ?",
    options: ["Oui, des points gris clignotent", "Non, les croisements sont blancs"],
    answer: "Non, les croisements sont blancs",
    explain:
      "Tous les croisements sont blancs. Les points gris « fantômes » sont fabriqués par votre rétine (grille de Hermann) et disparaissent si vous les fixez.",
  },

  // ── Niveau 3 · Expert ───────────────────────────────────────────
  {
    id: "adelson",
    level: 3,
    kind: "adelson",
    question: "Les cases A et B ont-elles la même teinte de gris ?",
    options: ["Oui, exactement la même", "Non, A est plus foncée"],
    answer: "Oui, exactement la même",
    explain:
      "A et B sont rigoureusement de la même teinte. Comme B est dans l'ombre, le cerveau la « corrige » et la croit plus claire (échiquier d'Adelson).",
  },
  {
    id: "kanizsa",
    level: 3,
    kind: "kanizsa",
    question: "Le triangle blanc central est-il réellement dessiné ?",
    options: ["Oui, ses bords sont tracés", "Non, il est imaginé"],
    answer: "Non, il est imaginé",
    explain:
      "Aucun bord n'est tracé : le triangle central n'existe pas. Votre cerveau le reconstruit à partir des coins (triangle de Kanizsa).",
  },
  {
    id: "fraser",
    level: 3,
    kind: "fraser",
    question: "Voyez-vous une spirale ou des cercles séparés ?",
    options: ["Une spirale continue", "Des cercles concentriques"],
    answer: "Des cercles concentriques",
    explain:
      "Ce sont des cercles parfaitement séparés et concentriques. Les segments inclinés créent une fausse spirale (spirale de Fraser).",
  },
  {
    id: "contrast",
    level: 3,
    kind: "contrast",
    question: "Les deux petits carrés gris ont-ils la même teinte ?",
    options: ["Oui, identiques", "Non, l'un est plus clair"],
    answer: "Oui, identiques",
    explain:
      "Les deux carrés gris sont identiques. Sur fond sombre, un gris paraît plus clair ; sur fond clair, plus foncé (contraste simultané).",
  },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Compose une manche. En mode « varié », on présente les illusions par
 * difficulté croissante (Découverte → Curieux → Expert) ; sinon on mélange
 * les illusions du niveau choisi.
 */
export function pickIllusionRound(
  level: IllusionLevel | "varie",
  n: number
): Illusion[] {
  if (level === "varie") {
    const ordered = [
      ...shuffle(ILLUSIONS.filter((i) => i.level === 1)),
      ...shuffle(ILLUSIONS.filter((i) => i.level === 2)),
      ...shuffle(ILLUSIONS.filter((i) => i.level === 3)),
    ];
    return ordered.slice(0, n);
  }
  return shuffle(ILLUSIONS.filter((i) => i.level === level)).slice(0, n);
}
