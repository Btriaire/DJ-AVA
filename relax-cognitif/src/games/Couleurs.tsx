import { useMemo, useState } from "react";
import { pickColorRound, NAME_HEX } from "../lib/couleurs";
import GameActions from "../components/GameActions";
import Chrono from "../components/Chrono";
import NextButton from "../components/NextButton";
import QuizResult from "../components/QuizResult";
import { useGameSession } from "../lib/useGameSession";
import { getSessions } from "../lib/store";
import { bestRatio } from "../lib/score";

const ROUND_SIZE = 20;
const PASS = 14;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Couleurs() {
  const [seed, setSeed] = useState(0);
  const round = useMemo(() => pickColorRound(ROUND_SIZE), [seed]);
  const total = round.length;

  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [isRecord, setIsRecord] = useState(false);
  const [eliminated, setEliminated] = useState<string[]>([]);
  const session = useGameSession("couleurs", "");

  const key = String(seed);
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setQi(0);
    setPicked(null);
    setScore(0);
    setDone(false);
    setIsRecord(false);
    setEliminated([]);
    session.reset();
  }

  const q = round[qi];
  const choices = useMemo(() => shuffle([q.answer, ...q.distractors]), [q]);

  function next() {
    if (picked == null) return;
    const newScore = picked === q.answer ? score + 1 : score;
    setScore(newScore);
    if (qi + 1 >= total) {
      const prevBest = bestRatio("couleurs", getSessions());
      session.record(newScore >= PASS ? "success" : "failure", newScore, total);
      setIsRecord(total > 0 && newScore / total > prevBest);
      setDone(true);
    } else {
      setQi(i => i + 1);
      setPicked(null);
      setEliminated([]);
    }
  }

  function giveHint() {
    if (!session.useHint()) return;
    const wrong = choices.find((c) => c !== q.answer && !eliminated.includes(c));
    if (wrong) setEliminated((e) => [...e, wrong]);
  }

  function abandon() {
    session.record("abandon");
    setDone(true);
  }

  function restart() { setSeed(s => s + 1); }

  if (done) {
    return (
      <QuizResult
        game="couleurs"
        won={session.won}
        score={score}
        total={total}
        isRecord={isRecord}
        onReplay={restart}
      />
    );
  }

  return (
    <div>
      <div className="cult-progress">
        <span>Question {qi + 1} / {total}</span>
      </div>

      <p className="page-sub">De toutes les couleurs</p>

      <div className="chrono-row">
        <Chrono running={!done} resetKey={key} />
      </div>

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={false}
        abandoned={false}
      />

      {q.mix ? (
        <div className="color-mix">
          {q.mix.map((m, i) => (
            <span key={i} className="color-mix-item">
              {i > 0 && <span className="color-mix-op">+</span>}
              <span className="color-dot" style={{ background: NAME_HEX[m] ?? "#ccc" }} />
            </span>
          ))}
          <span className="color-mix-op">=</span>
          <span className="color-dot color-dot-q">?</span>
        </div>
      ) : (
        <blockquote className="cit-quote">{q.prompt}</blockquote>
      )}

      <div className={q.mix ? "opt-grid swatch-grid" : "opt-grid"}>
        {choices.map((c) => {
          const out = eliminated.includes(c);
          const chosen = picked === c;
          if (q.mix) {
            return (
              <button
                key={c}
                className={`opt opt-swatch ${chosen ? "chosen" : ""} ${out ? "out" : ""}`}
                disabled={out}
                onClick={() => setPicked(c)}
                aria-label={c}
              >
                <span className="color-dot color-dot-lg" style={{ background: NAME_HEX[c] ?? "#ccc" }} />
              </button>
            );
          }
          return (
            <button
              key={c}
              className={`opt ${chosen ? "chosen" : ""} ${out ? "out" : ""}`}
              disabled={out}
              onClick={() => setPicked(c)}
            >
              {c}
            </button>
          );
        })}
      </div>

      {picked != null && (
        <div style={{ textAlign: "center" }}>
          <span className="quiz-answered">Répondu</span>
        </div>
      )}

      <NextButton last={qi + 1 >= total} disabled={picked == null} onClick={next} />
    </div>
  );
}
