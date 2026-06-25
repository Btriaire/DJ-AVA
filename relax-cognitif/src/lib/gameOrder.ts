import type { GameId } from "./store";

export type GameLink = { game: GameId; to: string; title: string };

// Ordre de progression des jeux (suit l'ordre des sections de l'accueil).
// Sert à enchaîner automatiquement vers le « jeu suivant » après une victoire.
export const GAME_ORDER: GameLink[] = [
  // Réflexion & logique
  { game: "sudoku", to: "/sudoku", title: "Sudoku" },
  { game: "logique", to: "/logique", title: "Suite logique" },
  { game: "calcul", to: "/calcul", title: "Les bons signes" },
  { game: "motscroises", to: "/mots-croises", title: "Mots croisés" },
  { game: "mahjong", to: "/mahjong", title: "Mahjong" },
  { game: "dames", to: "/dames", title: "Dames éclair" },
  { game: "puissance4", to: "/puissance4", title: "Puissance 4" },
  { game: "pyramide", to: "/pyramide", title: "La Pyramide" },
  { game: "plusmoins", to: "/plus-moins", title: "Plus ou moins" },
  // Mémoire & observation
  { game: "memory", to: "/memory", title: "Paires de mémoire" },
  { game: "simon", to: "/simon", title: "Suite lumineuse" },
  { game: "couleurs", to: "/couleurs", title: "De toutes les couleurs" },
  { game: "culture", to: "/culture", title: "Culture générale" },
  { game: "formes", to: "/formes", title: "Intrus des formes" },
  { game: "citations", to: "/citations", title: "Citations" },
  { game: "philo", to: "/philo", title: "Avec le Chat de..." },
  { game: "motmystere", to: "/mot-mystere", title: "Mot mystère" },
  { game: "motsmeles", to: "/mots-meles", title: "Mots mêlés" },
  { game: "anagrammes", to: "/anagrammes", title: "Anagrammes" },
  { game: "illusions", to: "/illusions", title: "Illusions d'optique" },
  { game: "route", to: "/route", title: "Jeu de la Route" },
  // Vitesse & réflexes
  { game: "rapidite", to: "/rapidite", title: "Rapidité au clic" },
  { game: "feuvert", to: "/feu-vert", title: "Feu vert" },
  { game: "ordre", to: "/ordre", title: "Ordre éclair" },
  { game: "stroop", to: "/stroop", title: "Couleurs trompeuses" },
  // Formes & patience
  { game: "tangram", to: "/tangram", title: "Tangram" },
  { game: "puzzle", to: "/puzzle", title: "Puzzle" },
];

// Renvoie le jeu suivant dans l'ordre (boucle au début à la fin de la liste).
export function nextGame(game: GameId): GameLink | null {
  const i = GAME_ORDER.findIndex((g) => g.game === game);
  if (i < 0) return null;
  return GAME_ORDER[(i + 1) % GAME_ORDER.length];
}
