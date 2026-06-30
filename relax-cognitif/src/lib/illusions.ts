// Banque d'illusions d'optique, des plus simples (Découverte) aux plus
// complexes (Expert). Chaque item est une question de perception : le joueur
// devine, puis une preuve visuelle se révèle pour le moment « aha ».

export type IllusionLevel = 1 | 2 | 3;

export type IllusionKind =
  | "muller-lyer"
  | "vertical-horizontal"
  | "count-circles"
  | "ebbinghaus"
  | "necker"
  | "gradient-bar"
  | "ponzo"
  | "delboeuf"
  | "jastrow"
  | "cafe-wall"
  | "hermann"
  | "zollner"
  | "hering"
  | "scintillating"
  | "adelson"
  | "kanizsa"
  | "fraser"
  | "contrast"
  | "poggendorff"
  | "white"
  | "shepard"
  | "rubin"
  | "duck-rabbit"
  | "afterimage"
  | "motion-blind"
  | "penrose";

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
  {
    id: "necker",
    level: 1,
    kind: "necker",
    question: "Quelle face de ce cube est devant ?",
    options: ["La face en bas à gauche", "La face en haut à droite", "Les deux : le cube bascule"],
    answer: "Les deux : le cube bascule",
    explain:
      "Le cube de Necker est ambigu : aucune face n'est vraiment « devant ». Le cerveau bascule sans cesse entre deux interprétations.",
  },
  {
    id: "gradient-bar",
    level: 1,
    kind: "gradient-bar",
    question: "La barre grise centrale change-t-elle de teinte de gauche à droite ?",
    options: ["Non, elle est uniforme", "Oui, elle s'assombrit à droite"],
    answer: "Non, elle est uniforme",
    explain:
      "La barre est d'un gris parfaitement uniforme. Le fond en dégradé inversé donne l'impression qu'elle change de teinte (contraste simultané).",
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
  {
    id: "zollner",
    level: 2,
    kind: "zollner",
    question: "Les longues lignes obliques sont-elles parallèles ?",
    options: ["Oui, parfaitement parallèles", "Non, elles se rapprochent"],
    answer: "Oui, parfaitement parallèles",
    explain:
      "Les longues lignes sont rigoureusement parallèles. Les petites barres inclinées en sens contraire créent une fausse impression de pente (illusion de Zöllner).",
  },
  {
    id: "hering",
    level: 2,
    kind: "hering",
    question: "Les deux lignes rouges sont-elles bien droites ?",
    options: ["Oui, parfaitement droites", "Non, elles sont bombées"],
    answer: "Oui, parfaitement droites",
    explain:
      "Les deux lignes rouges sont parfaitement droites et parallèles. Le faisceau qui rayonne derrière elles les fait paraître courbées (illusion de Hering).",
  },
  {
    id: "scintillating",
    level: 2,
    kind: "scintillating",
    question: "Des points sombres clignotent-ils aux intersections grises ?",
    options: ["Oui, des points noirs apparaissent", "Non, les pastilles restent claires"],
    answer: "Oui, des points noirs apparaissent",
    explain:
      "Des points noirs semblent surgir et disparaître aux croisements : c'est la grille scintillante. Ils n'existent pas — fixez un croisement et il reste clair.",
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
  {
    id: "poggendorff",
    level: 3,
    kind: "poggendorff",
    question: "Quelle ligne de droite (A ou B) prolonge exactement la ligne de gauche ?",
    options: ["La ligne A", "La ligne B"],
    answer: "La ligne B",
    explain:
      "C'est la ligne B qui est dans le prolongement exact. La barre masque l'alignement et nous fait choisir la mauvaise (illusion de Poggendorff).",
  },
  {
    id: "white",
    level: 3,
    kind: "white",
    question: "Les deux groupes de barres grises ont-ils la même teinte ?",
    options: ["Oui, exactement le même gris", "Non, l'un est plus clair"],
    answer: "Oui, exactement le même gris",
    explain:
      "Les deux gris sont identiques. Posés sur du noir ou sur du blanc, ils paraissent pourtant différents (illusion de White).",
  },
  {
    id: "shepard",
    level: 3,
    kind: "shepard",
    question: "Les deux plateaux de table ont-ils la même forme ?",
    options: ["Oui, des parallélogrammes identiques", "Non, l'un est plus allongé"],
    answer: "Oui, des parallélogrammes identiques",
    explain:
      "Les deux plateaux sont strictement identiques : même parallélogramme, simplement tourné. Le contexte de « table » trompe totalement notre perception (tables de Shepard).",
  },

  // ── Familles variées (principes différents) ─────────────────────
  {
    id: "rubin",
    level: 1,
    kind: "rubin",
    question: "Que voyez-vous dans cette forme noire ?",
    options: ["Un vase", "Deux visages face à face", "Les deux à la fois"],
    answer: "Les deux à la fois",
    explain:
      "C'est le vase de Rubin. Selon ce que l'œil prend pour le « fond », on voit un vase noir ou deux profils qui se regardent. Le cerveau bascule sans cesse entre figure et fond.",
  },
  {
    id: "duck-rabbit",
    level: 2,
    kind: "duck-rabbit",
    question: "Quel animal se cache dans ce dessin ?",
    options: ["Un canard", "Un lapin", "Les deux, selon le sens"],
    answer: "Les deux, selon le sens",
    explain:
      "Vers la gauche, les deux pointes forment un bec de canard ; vers la droite, ce sont les oreilles d'un lapin. Une même image, deux animaux (canard-lapin de Jastrow).",
  },
  {
    id: "afterimage",
    level: 2,
    kind: "afterimage",
    question: "Fixez le point 15 secondes, puis imaginez un mur blanc : quelles couleurs apparaissent ?",
    options: ["Le drapeau bleu-blanc-rouge", "Les mêmes couleurs", "Aucune image"],
    answer: "Le drapeau bleu-blanc-rouge",
    explain:
      "À force de fixer l'orange et le cyan, vos capteurs de couleur se fatiguent. En regardant le blanc, vous percevez les couleurs complémentaires : le drapeau bleu-blanc-rouge surgit (image rémanente).",
  },
  {
    id: "motion-blind",
    level: 3,
    kind: "motion-blind",
    question: "Fixez la croix rouge au centre : que deviennent les points jaunes ?",
    options: ["Ils disparaissent par moments", "Ils restent toujours visibles", "Ils changent de couleur"],
    answer: "Ils disparaissent par moments",
    explain:
      "Sur un fond qui tourne, des points pourtant bien présents s'effacent quelques instants de votre conscience : c'est la cécité au mouvement (motion-induced blindness). Les points n'ont jamais disparu.",
  },
  {
    id: "penrose",
    level: 3,
    kind: "penrose",
    question: "Ce triangle pourrait-il être construit en vrai, en trois dimensions ?",
    options: ["Oui, sans problème", "Non, c'est une figure impossible"],
    answer: "Non, c'est une figure impossible",
    explain:
      "Chaque coin paraît correct, mais l'ensemble ne peut pas exister en relief : c'est le triangle de Penrose, un objet impossible que seul le dessin autorise.",
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
    // On commence par les plus simples puis on monte en difficulté.
    const ordered = [
      ...shuffle(ILLUSIONS.filter((i) => i.level === 1)),
      ...shuffle(ILLUSIONS.filter((i) => i.level === 2)),
      ...shuffle(ILLUSIONS.filter((i) => i.level === 3)),
    ];
    return ordered.slice(0, n);
  }
  // Au sein d'un même niveau, on garde un ordre aléatoire.
  return shuffle(ILLUSIONS.filter((i) => i.level === level)).slice(0, n);
}
