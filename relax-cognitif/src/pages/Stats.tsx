import { Link } from "react-router-dom";
import Medal from "../components/Medal";
import Icon from "../components/Icon";
import {
  fmtDuration, getSessions, GAME_LABELS, medalTier, rankFor,
  statsByGame, totalSuccess, dayStreak, type GameId,
} from "../lib/store";

export default function Stats() {
  const sessions = getSessions();
  const stats = statsByGame(sessions).filter(s => s.total > 0);
  const xp = totalSuccess(sessions);
  const streak = dayStreak(sessions);
  const { rank, next, into, span } = rankFor(xp);
  const pct = span ? Math.min(100, Math.round((into / span) * 100)) : 100;
  const totalTime = sessions.reduce((a, s) => a + s.durationMs, 0);

  return (
    <div>
      {/* Hero chiffres clés */}
      <div className="stats-hero">
        <div className="stats-hero-item">
          <span className="stats-hero-val">{xp}</span>
          <span className="stats-hero-lbl">victoires</span>
        </div>
        <div className="stats-hero-item">
          <span className="stats-hero-val">{streak}</span>
          <span className="stats-hero-lbl">jours consécutifs</span>
        </div>
        <div className="stats-hero-item">
          <span className="stats-hero-val">{sessions.length}</span>
          <span className="stats-hero-lbl">parties</span>
        </div>
        <div className="stats-hero-item">
          <span className="stats-hero-val">{fmtDuration(totalTime)}</span>
          <span className="stats-hero-lbl">temps total</span>
        </div>
      </div>

      {/* Rang */}
      <div className="stats-rank-card">
        <Icon name="trophy" size={22} />
        <div className="stats-rank-text">
          <strong>{rank.name}</strong>
          <span>{next ? `${into} / ${span} vers ${next.name}` : "Voie accomplie !"}</span>
        </div>
      </div>
      <div className="prog-bar" style={{ margin: "0 0 20px" }}>
        <div className="prog-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Par jeu */}
      {stats.length === 0 ? (
        <p className="page-sub">Aucune partie enregistrée pour l'instant.<br />Jouez pour voir vos statistiques ici !</p>
      ) : (
        <div className="stats-list">
          {stats.map(s => {
            const tier = medalTier(s.success);
            return (
              <div key={s.game} className="stats-row">
                <div className="stats-row-head">
                  <span className="stats-row-name">{GAME_LABELS[s.game as GameId]}</span>
                  {tier !== "none" && <Medal tier={tier} size={18} />}
                </div>
                <div className="stats-row-nums">
                  <span>{s.total} partie{s.total > 1 ? "s" : ""}</span>
                  <span>{s.success} victoire{s.success > 1 ? "s" : ""}</span>
                  <span className="stats-pct">{s.successRate}%</span>
                  <span>{fmtDuration(s.avgMs)}</span>
                </div>
                <div className="stats-bar-wrap">
                  <div className="stats-bar-fill" style={{ width: `${s.successRate}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Link className="btn btn-ghost" to="/" style={{ marginTop: 24, display: "block", textAlign: "center" }}>
        ← Retour à l'accueil
      </Link>
    </div>
  );
}
