import { useMemo, useState } from "react";
import PlayingCard from "../components/PlayingCard";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import { makeDeck, rankFull, shuffle, type Card } from "../lib/cards";
import { useGameSession } from "../lib/useGameSession";

// Objectif : enchaîner GOAL bonnes prédictions sans se tromper.
const GOAL = 8;

export default function PlusMoins() {
  const [seed, setSeed] = useState(0);
  const session = useGameSession("plusmoins");

  const deck = useMemo(() => shuffle(makeDeck()), [seed]);

  const [pos, setPos] = useState(0); // index de la carte visible
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState<"" | "good" | "bad" | "equal">("");
  const [reveal, setReveal] = useState<Card | null>(null);
  const [abandoned, setAbandoned] = useState(false);
  const [hintFlash, setHintFlash] = useState<"plus" | "moins" | null>(null);

  const won = score >= GOAL;
  const lost = abandoned || feedback === "bad";
  const finished = won || lost;

  const key = seed;
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setPos(0);
    setScore(0);
    setStreak(0);
    setFeedback("");
    setReveal(null);
    setAbandoned(false);
    session.reset();
  }

  const current = deck[pos];
  const next = deck[pos + 1];

  // Probabilité d'avoir « plus haut » avec le reste du paquet (aide).
  const advice = useMemo(() => {
    const rest = deck.slice(pos + 1);
    if (!rest.length) return null;
    const higher = rest.filter((c) => c.rank > current.rank).length;
    const lower = rest.filter((c) => c.rank < current.rank).length;
    return higher >= lower ? "plus" : "moins";
  }, [deck, pos, current]);

  function guess(dir: "plus" | "moins") {
    if (finished || !next) return;
    setReveal(next);
    const cmp = next.rank - current.rank;
    if (cmp === 0) {
      // Égalité : on offre le point (coup de chance).
      setFeedback("equal");
      setScore((s) => s + 1);
      setStreak((s) => s + 1);
      advance(true);
      return;
    }
    const correct = (dir === "plus" && cmp > 0) || (dir === "moins" && cmp < 0);
    if (correct) {
      setFeedback("good");
      const ns = score + 1;
      setScore(ns);
      setStreak((s) => s + 1);
      advance(ns >= GOAL);
    } else {
      setFeedback("bad");
      setStreak(0);
      session.record("failure");
    }
  }

  function advance(reachedGoal: boolean) {
    if (reachedGoal) {
      session.record("success");
      return;
    }
    // Petite pause pour montrer la carte révélée, puis on avance.
    window.setTimeout(() => {
      setPos((p) => p + 1);
      setReveal(null);
      setFeedback("");
    }, 650);
  }

  function giveHint() {
    if (finished || !session.useHint() || !advice) return;
    setFeedback("");
    // Surligne le bon bouton via l'état advice (déjà calculé) ; on flashe une aide.
    setHintFlash(advice);
    window.setTimeout(() => setHintFlash(null), 1500);
  }

  function abandon() {
    session.record("abandon");
    setAbandoned(true);
  }

  const outOfCards = !next && !finished;

  return (
    <div className="hilo">
      <div className="controls">
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>
          Nouvelle partie
        </button>
      </div>

      <p className="page-sub">
        La carte suivante sera-t-elle <strong>plus haute</strong> ou <strong>plus basse</strong> ?
        Enchaînez {GOAL} bonnes réponses. (As = 1, Roi = 13)
      </p>

      <div className="hilo-scorerow">
        <span className="hilo-chip">Réussites : {score}/{GOAL}</span>
        <span className="hilo-chip">Série : {streak}</span>
        <span className="hilo-chip">Reste : {Math.max(0, deck.length - pos - 1)}</span>
      </div>

      <WinReward game="plusmoins" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={won}
        abandoned={lost}
      />

      <div className={`hilo-stage fb-${feedback}`}>
        <div className="hilo-card-wrap">
          <span className="hilo-card-tag">Carte actuelle</span>
          <PlayingCard card={current} width={92} />
        </div>
        <div className="hilo-arrow" aria-hidden>
          {reveal ? (feedback === "equal" ? "=" : "→") : "?"}
        </div>
        <div className="hilo-card-wrap">
          <span className="hilo-card-tag">Suivante</span>
          {reveal ? (
            <PlayingCard card={reveal} width={92} />
          ) : (
            <PlayingCard faceUp={false} width={92} />
          )}
        </div>
      </div>

      {!finished && !reveal && next && (
        <div className="hilo-buttons">
          <button
            className={`hilo-btn up ${hintFlash === "plus" ? "hint" : ""}`}
            onClick={() => guess("plus")}
          >
            <span className="hilo-btn-ico">▲</span> Plus haute
          </button>
          <button
            className={`hilo-btn down ${hintFlash === "moins" ? "hint" : ""}`}
            onClick={() => guess("moins")}
          >
            <span className="hilo-btn-ico">▼</span> Plus basse
          </button>
        </div>
      )}

      {feedback === "good" && <p className="status win">Bien vu, c'était {rankFull(reveal!.rank)} !</p>}
      {feedback === "equal" && <p className="status win">Égalité — la chance est avec vous !</p>}

      {finished && (
        <p className={won ? "status win" : "status"}>
          {won
            ? `Bravo ! ${GOAL} bonnes réponses d'affilée.`
            : abandoned
            ? "Partie abandonnée."
            : `Raté : c'était ${reveal ? rankFull(reveal.rank) : ""}. Score : ${score}.`}{" "}
          <button className="link-btn" onClick={() => setSeed((s) => s + 1)}>
            Rejouer →
          </button>
        </p>
      )}

      {outOfCards && (
        <p className="status">
          Paquet épuisé.{" "}
          <button className="link-btn" onClick={() => setSeed((s) => s + 1)}>
            Nouvelle partie →
          </button>
        </p>
      )}
    </div>
  );
}
