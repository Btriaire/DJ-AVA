import { useNavigate } from "react-router-dom";
import type { GameId } from "../lib/store";
import { sessionPoints } from "../lib/store";
import { stars } from "../lib/score";
import { nextGame } from "../lib/gameOrder";
import Icon from "./Icon";
import WinReward from "./WinReward";

type Props = {
  game: GameId;
  won: boolean; // diplôme (médaille) affiché seulement si réussite
  score: number;
  total: number;
  onReplay: () => void;
  isRecord?: boolean; // nouveau record personnel sur ce jeu
};

function gradeFor(ratio: number): string {
  if (ratio >= 0.9) return "Excellent !";
  if (ratio >= 0.7) return "Très bien !";
  if (ratio >= 0.5) return "Pas mal !";
  return "Continuez, vous progressez !";
}

/** Bilan de fin de manche, partagé par tous les jeux de questions. */
export default function QuizResult({ game, won, score, total, onReplay, isRecord }: Props) {
  const navigate = useNavigate();
  const upcoming = nextGame(game);
  const ratio = total > 0 ? score / total : 0;
  const starCount = stars(ratio);
  const points = sessionPoints({
    game, outcome: won ? "success" : "failure", durationMs: 0, hintsUsed: 0,
    at: Date.now(), score, maxScore: total,
  });

  return (
    <div>
      {/* Le diplôme/médaille n'apparaît que si le score est suffisant */}
      <WinReward game={game} show={won} />

      <div className="cult-end">
        <div className="quiz-stars" aria-label={`${starCount} étoile${starCount > 1 ? "s" : ""} sur 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`quiz-star ${i < starCount ? "on" : ""}`}>
              <Icon name={i < starCount ? "star-fill" : "star"} size={34} />
            </span>
          ))}
        </div>

        <p className="cult-score-big">{score} / {total}</p>
        <p className="cult-grade">{gradeFor(ratio)}</p>

        {isRecord && score > 0 && (
          <p className="quiz-record">✦ Nouveau record personnel !</p>
        )}
        <p className="quiz-points">+{points} points</p>

        <div className="quiz-end-actions">
          <button className="btn" onClick={onReplay}>Rejouer</button>
          <button
            className="btn btn-ghost"
            onClick={() => navigate(upcoming ? upcoming.to : "/")}
          >
            {upcoming ? `Essayer : ${upcoming.title}` : "Autre exercice"}
          </button>
        </div>
      </div>
    </div>
  );
}
