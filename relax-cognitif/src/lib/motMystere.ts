// ── « Le Mot Mystère » (façon Motus) ──────────────────────────────
// Deux registres : mots COURANTS, et mots SOUTENUS / de vieux français
// (littéraires, archaïques, féodaux). Chaque mot porte sa définition,
// dans le style d'un dictionnaire, affichée en fin de partie.
//
// Les mots sont stockés en MAJUSCULES sans accent (le clavier reste
// simple), mais les définitions gardent l'orthographe complète.

export type MMRegister = "courant" | "soutenu";

export type MMWord = { word: string; def: string };

export const REGISTER_LABEL: Record<MMRegister, string> = {
  courant: "Courant",
  soutenu: "Soutenu",
};

export const MM_WORDS: Record<MMRegister, MMWord[]> = {
  courant: [
    { word: "MAISON", def: "Bâtiment d'habitation, lieu où l'on vit." },
    { word: "JARDIN", def: "Terrain où l'on cultive des fleurs, des plantes ou des légumes." },
    { word: "SOLEIL", def: "Astre lumineux autour duquel gravite la Terre." },
    { word: "ETOILE", def: "Astre qui brille dans le ciel nocturne." },
    { word: "VOYAGE", def: "Déplacement d'une personne vers un lieu éloigné." },
    { word: "ORANGE", def: "Fruit comestible de l'oranger ; couleur entre le rouge et le jaune." },
    { word: "NATURE", def: "Ensemble du monde physique et des êtres vivants." },
    { word: "CADEAU", def: "Objet que l'on offre à quelqu'un pour lui faire plaisir." },
    { word: "BOUGIE", def: "Bâton de cire muni d'une mèche, qui éclaire en brûlant." },
    { word: "MOULIN", def: "Machine ou bâtiment servant à moudre le grain." },
    { word: "FROMAGE", def: "Aliment obtenu par la coagulation du lait." },
    { word: "BONHEUR", def: "État de complète et durable satisfaction." },
    { word: "LUMIERE", def: "Rayonnement qui rend les objets visibles à l'œil." },
    { word: "MUSIQUE", def: "Art de combiner les sons de manière harmonieuse." },
    { word: "CUISINE", def: "Pièce où l'on prépare les repas." },
    { word: "VILLAGE", def: "Petite agglomération rurale." },
    { word: "FENETRE", def: "Ouverture dans un mur laissant entrer l'air et la lumière." },
    { word: "COURAGE", def: "Force morale qui permet d'affronter le danger ou l'épreuve." },
    { word: "CHATEAU", def: "Vaste demeure seigneuriale ou royale." },
    { word: "RIVIERE", def: "Cours d'eau qui se jette dans un fleuve." },
    { word: "BALANCE", def: "Instrument qui sert à peser." },
    { word: "CHANSON", def: "Texte mis en musique, destiné à être chanté." },
    { word: "FAMILLE", def: "Ensemble formé par les parents et leurs enfants." },
    { word: "POMMIER", def: "Arbre fruitier qui produit des pommes." },
    { word: "HORLOGE", def: "Appareil qui indique l'heure." },
    { word: "SOURIRE", def: "Léger mouvement des lèvres exprimant la joie ou la bienveillance." },
    { word: "MONTAGNE", def: "Importante élévation naturelle du sol." },
    { word: "DIMANCHE", def: "Septième jour de la semaine, consacré au repos." },
    { word: "PRINTEMPS", def: "Saison qui suit l'hiver, où la nature refleurit." },
    { word: "FONTAINE", def: "Construction d'où jaillit ou coule de l'eau." },
  ],
  soutenu: [
    { word: "QUIDAM", def: "Personne dont on ignore ou tait le nom ; un individu quelconque." },
    { word: "IDOINE", def: "Qui convient parfaitement à un usage ; approprié." },
    { word: "LIESSE", def: "Joie collective et débordante." },
    { word: "GOUPIL", def: "Ancien nom du renard, en français médiéval." },
    { word: "MANANT", def: "Autrefois, paysan ; par mépris, homme grossier (vieilli)." },
    { word: "VASSAL", def: "Homme lié à un seigneur par l'hommage féodal." },
    { word: "PROBITE", def: "Honnêteté scrupuleuse ; droiture, intégrité." },
    { word: "VETILLE", def: "Chose insignifiante, sans importance." },
    { word: "BESOGNE", def: "Travail, ouvrage que l'on doit accomplir." },
    { word: "NAGUERE", def: "Il y a peu de temps ; récemment (littéraire)." },
    { word: "FELONIE", def: "Trahison du vassal envers son seigneur ; déloyauté." },
    { word: "ADOUBER", def: "Armer chevalier par la cérémonie de l'adoubement." },
    { word: "ONIRIQUE", def: "Qui se rapporte au rêve, qui en a le caractère." },
    { word: "CLEMENCE", def: "Vertu qui incline à pardonner les fautes." },
    { word: "OPULENCE", def: "Grande abondance de biens ; richesse." },
    { word: "ATARAXIE", def: "Tranquillité de l'âme, absence de trouble (philosophie)." },
    { word: "DESTRIER", def: "Cheval de bataille du chevalier, au Moyen Âge." },
    { word: "PALEFROI", def: "Cheval de marche ou de parade, au Moyen Âge." },
    { word: "SENECHAL", def: "Officier au service d'un seigneur ou d'un roi, au Moyen Âge." },
    { word: "COURROUX", def: "Vive et noble colère (littéraire)." },
    { word: "ALACRITE", def: "Vivacité enjouée, entrain joyeux." },
    { word: "CELERITE", def: "Grande rapidité dans l'exécution." },
    { word: "DULCINEE", def: "Femme aimée, en langage galant ou plaisant." },
    { word: "FELICITE", def: "Bonheur parfait et durable ; béatitude." },
    { word: "AMBROISIE", def: "Nourriture des dieux dans la mythologie ; mets délicieux." },
    { word: "BENIGNITE", def: "Bienveillance, bonté indulgente." },
    { word: "QUERELLE", def: "Vif désaccord, dispute animée." },
    { word: "OUTRANCE", def: "Excès qui dépasse la mesure." },
    { word: "MANSUETUDE", def: "Douceur d'âme, disposition à pardonner." },
    { word: "MIRIFIQUE", def: "Étonnant, merveilleux (souvent par plaisanterie)." },
  ],
};

export type LetterStatus = "good" | "present" | "absent";

/**
 * Compare une proposition au mot cible et renvoie le statut de chaque
 * lettre (façon Motus / Wordle), en gérant correctement les doublons.
 */
export function evaluateGuess(guess: string, target: string): LetterStatus[] {
  const n = target.length;
  const res: LetterStatus[] = new Array(n).fill("absent");
  const counts: Record<string, number> = {};
  for (const ch of target) counts[ch] = (counts[ch] ?? 0) + 1;

  // 1er passage : lettres bien placées
  for (let i = 0; i < n; i++) {
    if (guess[i] === target[i]) {
      res[i] = "good";
      counts[guess[i]]--;
    }
  }
  // 2e passage : lettres présentes mais mal placées
  for (let i = 0; i < n; i++) {
    if (res[i] === "good") continue;
    const ch = guess[i];
    if (ch && counts[ch] > 0) {
      res[i] = "present";
      counts[ch]--;
    }
  }
  return res;
}

const PRIORITY: Record<LetterStatus, number> = { absent: 0, present: 1, good: 2 };

/** Meilleur statut connu pour chaque lettre du clavier. */
export function keyboardStatuses(
  guesses: string[],
  target: string
): Record<string, LetterStatus> {
  const map: Record<string, LetterStatus> = {};
  for (const g of guesses) {
    const ev = evaluateGuess(g, target);
    for (let i = 0; i < g.length; i++) {
      const ch = g[i];
      const st = ev[i];
      if (!map[ch] || PRIORITY[st] > PRIORITY[map[ch]]) map[ch] = st;
    }
  }
  return map;
}

export function randomMMWord(register: MMRegister): MMWord {
  const pool = MM_WORDS[register];
  return pool[Math.floor(Math.random() * pool.length)];
}

// Disposition AZERTY pour le clavier tactile.
export const AZERTY_ROWS: string[][] = [
  ["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["Q", "S", "D", "F", "G", "H", "J", "K", "L", "M"],
  ["W", "X", "C", "V", "B", "N"],
];
