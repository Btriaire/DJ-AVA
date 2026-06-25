import type { GameId, Session } from "./store";

// Nombre d'étoiles (0 à 3) selon le ratio de bonnes réponses.
export function stars(ratio: number): 0 | 1 | 2 | 3 {
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.7) return 2;
  if (ratio >= 0.5) return 1;
  return 0;
}

// Meilleur ratio (score / maxScore) déjà réalisé sur un jeu donné.
// Sert à détecter un nouveau record personnel.
export function bestRatio(game: GameId, sessions: Session[]): number {
  let best = 0;
  for (const s of sessions) {
    if (s.game === game && s.score != null && s.maxScore && s.maxScore > 0) {
      best = Math.max(best, s.score / s.maxScore);
    }
  }
  return best;
}

// Meilleur score brut (score / maxScore) réalisé sur un jeu, pour l'affichage
// « record 18/20 ». Renvoie null si aucune partie scorée.
export function bestScore(
  game: GameId,
  sessions: Session[]
): { score: number; maxScore: number } | null {
  let best: { score: number; maxScore: number } | null = null;
  for (const s of sessions) {
    if (s.game === game && s.score != null && s.maxScore && s.maxScore > 0) {
      if (!best || s.score / s.maxScore > best.score / best.maxScore) {
        best = { score: s.score, maxScore: s.maxScore };
      }
    }
  }
  return best;
}
