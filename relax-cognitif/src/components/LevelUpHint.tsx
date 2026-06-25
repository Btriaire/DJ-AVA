import { levelUpSuggestion } from "../lib/store";

type Props = {
  game: string;
  /** Clé de série utilisée pour bumpStreak/resetStreak (souvent = difficulty). */
  streakLevel: string;
  /** Difficulté courante : "facile" | "moyen" | "difficile". */
  difficulty: string;
};

/**
 * Bannière douce et non intrusive : invite à essayer la difficulté supérieure
 * après plusieurs victoires d'affilée. Le joueur garde toujours le choix manuel.
 */
export default function LevelUpHint({ game, streakLevel, difficulty }: Props) {
  const sug = levelUpSuggestion(game, streakLevel, difficulty);
  if (!sug) return null;
  return (
    <p className="streak-banner">
      Vous maîtrisez {sug.currentLabel} — prêt pour {sug.nextLabel} ? ↑
    </p>
  );
}
