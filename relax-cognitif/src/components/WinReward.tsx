import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSessions,
  medalTier,
  nextMedal,
  rankFor,
  successCount,
  totalSuccess,
  type GameId,
} from "../lib/store";
import { nextGame } from "../lib/gameOrder";
import { randomQuote } from "../lib/memoryQuotes";
import Medal from "./Medal";

const TIER_LABEL: Record<string, string> = {
  bronze: "Médaille de bronze",
  argent: "Médaille d'argent",
  or: "Médaille d'or",
};

export default function WinReward({ game, show }: { game: GameId; show: boolean }) {
  const quote = useMemo(() => randomQuote(), [show]);
  const navigate = useNavigate();
  const [wasShown, setWasShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const upcoming = nextGame(game);

  if (show && !wasShown) {
    setWasShown(true);
    setDismissed(false);
  }
  if (!show && wasShown) setWasShown(false);

  if (!show || dismissed) return null;

  const sessions = getSessions();
  const count = successCount(game, sessions);
  const tier = medalTier(count);
  const next = nextMedal(count);

  const xp = totalSuccess(sessions);
  const { rank, next: nextRank, into, span } = rankFor(xp);
  const pct = span ? Math.min(100, Math.round((into / span) * 100)) : 100;

  return (
    <div className="reward-overlay" role="status">
      <div className="reward-card">
        <div className="reward-rays" aria-hidden />
        <p className="reward-kicker">Bravo !</p>

        <div className="reward-medal-wrap">
          {tier !== "none" ? (
            <Medal tier={tier} size={48} />
          ) : (
            <div className="reward-seed" aria-hidden>
              ✦
            </div>
          )}
        </div>

        <p className="reward-medal-label">
          {tier !== "none" ? TIER_LABEL[tier] : "Une victoire de plus"}
        </p>
        <p className="reward-count">
          {count} victoire{count > 1 ? "s" : ""} à ce jeu
        </p>
        {next && (
          <p className="reward-next">
            Plus que {next.need} pour la {TIER_LABEL[next.tier].toLowerCase()}
          </p>
        )}

        <div className="reward-voie">
          <div className="reward-voie-head">
            <span className="reward-voie-name">{rank.name}</span>
            <span className="reward-voie-sub">
              {nextRank ? `${into} / ${span} vers ${nextRank.name}` : "Voie accomplie"}
            </span>
          </div>
          <div className="prog-bar">
            <div className="prog-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <p className="reward-quote">« {quote.text} »</p>
        <p className="reward-author">— {quote.author}</p>

        <div className="reward-actions">
          <button className="btn reward-btn" onClick={() => setDismissed(true)}>
            Continuer ici
          </button>
          {upcoming && (
            <button
              className="btn btn-soft reward-next-btn"
              onClick={() => {
                setDismissed(true);
                navigate(upcoming.to);
              }}
            >
              {upcoming.title} ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
