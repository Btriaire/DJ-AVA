import { useNavigate } from "react-router-dom";
import type { GameId } from "../lib/store";
import { nextGame } from "../lib/gameOrder";
import WinReward from "./WinReward";

type Props = {
  game: GameId;
  won: boolean; // diplôme (médaille) affiché seulement si réussite
  score: number;
  total: number;
  onReplay: () => void;
};

function gradeFor(score: number, total: number): string {
  const r = score / total;
  if (r >= 0.9) return "Excellent !";
  if (r >= 0.7) return "Très bien !";
  if (r >= 0.5) return "Pas mal !";
  return "Continuez à pratiquer !";
}

/** Bilan de fin de manche, partagé par tous les jeux de questions. */
export default function QuizResult({ game, won, score, total, onReplay }: Props) {
  const navigate = useNavigate();
  const upcoming = nextGame(game);

  return (
    <div>
      {/* Le diplôme/médaille n'apparaît que si le score est suffisant */}
      <WinReward game={game} show={won} />

      <div className="cult-end">
        <p className="cult-score-big">{score} / {total}</p>
        <p className="cult-grade">{gradeFor(score, total)}</p>
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
