import { useMemo, useState } from "react";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { pickPhiloRound, type PhiloMode } from "../lib/philo";
import { useGameSession } from "../lib/useGameSession";

const ROUND_SIZE = 10;

const MODES: { id: PhiloMode; label: string }[] = [
  { id: "citation", label: "Qui a dit ?" },
  { id: "auteur", label: "Laquelle ?" },
];

export default function Philo() {
  const [mode, setMode] = useState<PhiloMode>("citation");
  const [seed, setSeed] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [abandoned, setAbandoned] = useState(false);
  const session = useGameSession("philo", mode);

  const questions = useMemo(() => pickPhiloRound(mode, ROUND_SIZE), [mode, seed]);
  const question = questions[qIdx];
  const correct = picked === question.answer;
  const finished = picked !== null;

  const roundKey = `${mode}-${seed}`;
  const [rk, setRk] = useState(roundKey);
  if (rk !== roundKey) {
    setRk(roundKey);
    setQIdx(0);
    setScore(0);
    setPicked(null);
    setDone(false);
    setAbandoned(false);
    session.reset();
  }

  function pick(opt: string) {
    if (finished || abandoned) return;
    setPicked(opt);
    if (opt === question.answer) setScore(s => s + 1);
  }

  function next() {
    if (qIdx + 1 >= ROUND_SIZE) {
      session.record(score >= 7 ? "success" : "failure");
      setDone(true);
    } else {
      setQIdx(q => q + 1);
      setPicked(null);
    }
  }

  function abandon() {
    session.record("abandon");
    setAbandoned(true);
  }

  function restart(newMode?: PhiloMode) {
    if (newMode && newMode !== mode) {
      setMode(newMode);
    }
    setSeed(s => s + 1);
  }

  if (done) {
    const grade =
      score >= 9 ? "Excellent !" :
      score >= 7 ? "Très bien !" :
      score >= 5 ? "Bien essayé." :
      "Continuez à philosopher !";
    return (
      <div>
        <WinReward game="philo" show={session.won} />
        <div className="cult-end">
          <p className="cult-score-big">{score} / {ROUND_SIZE}</p>
          <p className="cult-grade">{grade}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
            <button className="btn" onClick={() => restart()}>Rejouer</button>
            <button className="btn btn-ghost" onClick={() => restart(mode === "citation" ? "auteur" : "citation")}>
              {mode === "citation" ? "Essayer « Laquelle ? »" : "Essayer « Qui a dit ? »"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isAuteur = question.mode === "auteur";

  return (
    <div>
      <div className="controls">
        <div className="seg">
          {MODES.map(m => (
            <button
              key={m.id}
              className={`seg-btn ${mode === m.id ? "active" : ""}`}
              onClick={() => restart(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chrono-row">
        <Chrono running={!finished && !abandoned} resetKey={`${roundKey}-${qIdx}`} />
        <span className="philo-progress">{qIdx + 1} / {ROUND_SIZE}</span>
      </div>

      <WinReward game="philo" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={() => {}}
        onAbandon={abandon}
        finished={finished}
        abandoned={abandoned}
      />

      {isAuteur ? (
        <>
          <p className="page-sub">Quelle citation est de…</p>
          <div className="philo-author-display">{question.display}</div>
          <div className="philo-quote-opts">
            {question.options.map(opt => {
              const reveal = picked !== null || abandoned;
              const state = !reveal ? ""
                : opt === question.answer ? "good"
                : opt === picked ? "bad"
                : "dim";
              return (
                <button
                  key={opt}
                  className={`philo-quote-btn ${state}`}
                  disabled={finished || abandoned}
                  onClick={() => pick(opt)}
                >
                  « {opt} »
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <p className="page-sub">Qui a dit…</p>
          <div className="philo-quote-display">« {question.display} »</div>
          <div className="opt-grid">
            {question.options.map(opt => {
              const reveal = picked !== null || abandoned;
              const state = !reveal ? ""
                : opt === question.answer ? "good"
                : opt === picked ? "bad"
                : "";
              return (
                <button
                  key={opt}
                  className={`opt ${state}`}
                  disabled={finished || abandoned}
                  onClick={() => pick(opt)}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </>
      )}

      {(picked !== null || abandoned) && (
        <p className={correct && !abandoned ? "status win" : "status"}>
          {abandoned
            ? `La réponse : ${question.answer}`
            : correct
            ? "Exact !"
            : `C'était ${question.answer}.`}{" "}
          {!abandoned && (
            <button className="link-btn" onClick={next}>
              {qIdx + 1 >= ROUND_SIZE ? "Voir le score →" : "Suivant →"}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
