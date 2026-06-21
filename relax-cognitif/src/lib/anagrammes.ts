export type AnaLevel = "facile" | "moyen" | "difficile";
export type AnaWord = { word: string; hint: string };

export const ANA_WORDS: Record<AnaLevel, AnaWord[]> = {
  facile: [
    { word: "CHAT", hint: "Animal domestique qui miaule" },
    { word: "PAIN", hint: "On l'achète chez le boulanger" },
    { word: "FLEUR", hint: "Elle pousse dans le jardin" },
    { word: "POMME", hint: "Fruit rouge ou vert" },
    { word: "TABLE", hint: "On y prend ses repas" },
    { word: "LIVRE", hint: "On le lit page après page" },
    { word: "SOLEIL", hint: "Il brille dans le ciel" },
    { word: "MAISON", hint: "On y habite" },
    { word: "CHIEN", hint: "Le meilleur ami de l'homme" },
    { word: "ARBRE", hint: "Il a des branches et des feuilles" },
    { word: "ROUTE", hint: "On y roule en voiture" },
    { word: "PORTE", hint: "On l'ouvre pour entrer" },
    { word: "LUNE", hint: "Elle éclaire la nuit" },
    { word: "EAU", hint: "On la boit chaque jour" },
    { word: "PLAGE", hint: "Sable au bord de la mer" },
    { word: "OISEAU", hint: "Il vole avec ses ailes" },
    { word: "JARDIN", hint: "On y cultive des fleurs" },
    { word: "FROMAGE", hint: "Spécialité française qui se mange" },
    { word: "CHAISE", hint: "On s'y assoit" },
    { word: "GATEAU", hint: "Dessert d'anniversaire" },
    { word: "ROSE", hint: "Fleur à épines" },
    { word: "POIRE", hint: "Fruit allongé et juteux" },
    { word: "NEIGE", hint: "Elle tombe en hiver" },
    { word: "TRAIN", hint: "Il roule sur des rails" },
    { word: "MONTRE", hint: "Elle donne l'heure au poignet" },
  ],
  moyen: [
    { word: "BOUTEILLE", hint: "On y met l'eau ou le vin" },
    { word: "FENETRE", hint: "On regarde dehors à travers" },
    { word: "VOITURE", hint: "Véhicule à quatre roues" },
    { word: "CUISINE", hint: "Pièce où l'on prépare les repas" },
    { word: "MUSIQUE", hint: "On l'écoute avec plaisir" },
    { word: "JOURNAL", hint: "On y lit les nouvelles" },
    { word: "LUMIERE", hint: "Elle chasse l'obscurité" },
    { word: "VILLAGE", hint: "Petite commune à la campagne" },
    { word: "BALCON", hint: "Terrasse en hauteur d'un appartement" },
    { word: "PRINTEMPS", hint: "Saison des fleurs" },
    { word: "BICYCLE", hint: "Ancien nom du vélo" },
    { word: "CHATEAU", hint: "Grande demeure de roi" },
    { word: "ORANGE", hint: "Agrume et couleur" },
    { word: "BOULANGER", hint: "Il fait le pain" },
    { word: "JARDINIER", hint: "Il entretient le jardin" },
    { word: "TELEPHONE", hint: "On l'utilise pour appeler" },
    { word: "MONTAGNE", hint: "Très haut relief naturel" },
    { word: "RIVIERE", hint: "Cours d'eau qui se jette dans un fleuve" },
    { word: "PARAPLUIE", hint: "Il protège de la pluie" },
    { word: "ESCALIER", hint: "On le monte marche par marche" },
    { word: "FAUTEUIL", hint: "Siège confortable avec accoudoirs" },
    { word: "GUITARE", hint: "Instrument à cordes" },
    { word: "PEINTURE", hint: "Art avec pinceaux et couleurs" },
    { word: "VOYAGE", hint: "Déplacement vers un autre lieu" },
    { word: "FORMAGE", hint: "Action de donner une forme" },
  ],
  difficile: [
    { word: "ORDINATEUR", hint: "Machine pour travailler ou jouer" },
    { word: "BIBLIOTHEQUE", hint: "Lieu rempli de livres" },
    { word: "PARAPLUIE", hint: "Il protège de la pluie" },
    { word: "ANNIVERSAIRE", hint: "On le fête chaque année" },
    { word: "RESTAURANT", hint: "On y mange au dehors" },
    { word: "TELEVISION", hint: "On y regarde des émissions" },
    { word: "PHARMACIE", hint: "On y achète des médicaments" },
    { word: "AVENTURE", hint: "Expérience pleine de péripéties" },
    { word: "GOUVERNEMENT", hint: "Il dirige le pays" },
    { word: "ELECTRICITE", hint: "Elle fait fonctionner les appareils" },
    { word: "PHOTOGRAPHIE", hint: "Image capturée par un appareil" },
    { word: "ARCHITECTE", hint: "Il conçoit les bâtiments" },
    { word: "GEOGRAPHIE", hint: "Science des pays et des reliefs" },
    { word: "PARLEMENT", hint: "Les députés y siègent" },
    { word: "ORCHESTRE", hint: "Grand ensemble de musiciens" },
    { word: "MAGNIFIQUE", hint: "Synonyme de superbe" },
    { word: "DICTIONNAIRE", hint: "Il définit tous les mots" },
    { word: "TEMPERATURE", hint: "Le thermomètre la mesure" },
    { word: "INTELLIGENCE", hint: "Capacité à comprendre et raisonner" },
    { word: "PROFESSEUR", hint: "Il enseigne aux élèves" },
    { word: "CHAMPIGNON", hint: "Il pousse dans les bois en automne" },
    { word: "HORIZON", hint: "Ligne où ciel et terre se rejoignent" },
    { word: "PAYSAGE", hint: "Étendue de pays que l'on contemple" },
    { word: "CALENDRIER", hint: "Il indique les jours et les mois" },
    { word: "SOUVENIR", hint: "Image gardée en mémoire" },
  ],
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Mélange les lettres en garantissant un résultat différent du mot d'origine */
export function scramble(word: string): string[] {
  const letters = word.split("");
  if (letters.length < 2) return letters;
  let out = shuffle(letters);
  let tries = 0;
  while (out.join("") === word && tries < 20) {
    out = shuffle(letters);
    tries++;
  }
  return out;
}

export function randomAnaWord(level: AnaLevel): AnaWord {
  const pool = ANA_WORDS[level];
  return pool[Math.floor(Math.random() * pool.length)];
}
