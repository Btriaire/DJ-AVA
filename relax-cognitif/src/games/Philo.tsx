import { useMemo, useState } from "react";
import Chrono from "../components/Chrono";
import NextButton from "../components/NextButton";
import QuizResult from "../components/QuizResult";
import { pickPhiloRound, type PhiloMode } from "../lib/philo";
import { useGameSession } from "../lib/useGameSession";

const ROUND_SIZE = 20;
const PASS = 14;

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
  const session = useGameSession("philo", mode);

  const questions = useMemo(() => pickPhiloRound(mode, ROUND_SIZE), [mode, seed]);
  const total = Math.min(ROUND_SIZE, questions.length);
  const question = questions[qIdx];

  const roundKey = `${mode}-${seed}`;
  const [rk, setRk] = useState(roundKey);
  if (rk !== roundKey) {
    setRk(roundKey);
    setQIdx(0);
    setScore(0);
    setPicked(null);
    setDone(false);
    session.reset();
  }

  function next() {
    if (picked == null) return;
    const newScore = picked === question.answer ? score + 1 : score;
    setScore(newScore);
    if (qIdx + 1 >= total) {
      session.record(newScore >= PASS ? "success" : "failure");
      setDone(true);
    } else {
      setQIdx(q => q + 1);
      setPicked(null);
    }
  }

  function restart(newMode?: PhiloMode) {
    if (newMode && newMode !== mode) setMode(newMode);
    setSeed(s => s + 1);
  }

  if (done) {
    return (
      <QuizResult
        game="philo"
        won={session.won}
        score={score}
        total={total}
        onReplay={() => restart()}
      />
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
        <Chrono running={!done} resetKey={roundKey} />
        <span className="philo-progress">{qIdx + 1} / {total}</span>
      </div>

      {isAuteur ? (
        <>
          <p className="page-sub">Quelle citation est de…</p>
          <div className="philo-author-display">{question.display}</div>
          <div className="philo-quote-opts">
            {question.options.map(opt => (
              <button
                key={opt}
                className={`philo-quote-btn ${picked === opt ? "chosen" : ""}`}
                onClick={() => setPicked(opt)}
              >
                « {opt} »
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="page-sub">Qui a dit…</p>
          <div className="philo-quote-display">« {question.display} »</div>
          <div className="opt-grid">
            {question.options.map(opt => (
              <button
                key={opt}
                className={`opt ${picked === opt ? "chosen" : ""}`}
                onClick={() => setPicked(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}

      {picked != null && (
        <div style={{ textAlign: "center" }}>
          <span className="quiz-answered">Répondu</span>
        </div>
      )}

      <NextButton last={qIdx + 1 >= total} disabled={picked == null} onClick={next} />
    </div>
  );
}
