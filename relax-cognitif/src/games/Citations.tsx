import { useMemo, useState } from "react";
import { CITATIONS } from "../lib/citations";
import GameActions from "../components/GameActions";
import Chrono from "../components/Chrono";
import NextButton from "../components/NextButton";
import QuizResult from "../components/QuizResult";
import { useGameSession } from "../lib/useGameSession";

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

export default function Citations() {
  const [seed, setSeed] = useState(0);
  const round = useMemo(() => shuffle(CITATIONS).slice(0, ROUND_SIZE), [seed]);
  const total = Math.min(ROUND_SIZE, round.length);

  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [revealAuthor, setRevealAuthor] = useState(false);
  const session = useGameSession("citations", "");

  const key = String(seed);
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setQi(0);
    setPicked(null);
    setScore(0);
    setDone(false);
    setEliminated([]);
    setRevealAuthor(false);
    session.reset();
  }

  const cit = round[qi];
  const choices = useMemo(() => shuffle([cit.answer, ...cit.distractors]), [cit]);
  const [before, after] = cit.template.split("___");

  function next() {
    if (picked == null) return;
    const newScore = picked === cit.answer ? score + 1 : score;
    setScore(newScore);
    if (qi + 1 >= total) {
      session.record(newScore >= PASS ? "success" : "failure");
      setDone(true);
    } else {
      setQi(i => i + 1);
      setPicked(null);
      setEliminated([]);
      setRevealAuthor(false);
    }
  }

  function giveHint() {
    if (!session.useHint()) return;
    const wrong = choices.find((c) => c !== cit.answer && !eliminated.includes(c));
    if (wrong) setEliminated((e) => [...e, wrong]);
    else setRevealAuthor(true);
  }

  function abandon() {
    session.record("abandon");
    setDone(true);
  }

  function restart() { setSeed(s => s + 1); }

  if (done) {
    return (
      <QuizResult
        game="citations"
        won={session.won}
        score={score}
        total={total}
        onReplay={restart}
      />
    );
  }

  return (
    <div>
      <div className="cult-progress">
        <span>Citation {qi + 1} / {total}</span>
      </div>

      <p className="page-sub">Quel mot complète la citation ?</p>

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

      <blockquote className="cit-quote">
        {before}
        <span className={`cit-blank ${picked != null ? "filled" : ""}`}>
          {picked != null ? picked : "______"}
        </span>
        {after}
      </blockquote>

      {revealAuthor && <p className="cit-author">— {cit.author}</p>}

      <div className="opt-grid">
        {choices.map((c) => (
          <button
            key={c}
            className={`opt ${picked === c ? "chosen" : ""} ${eliminated.includes(c) ? "out" : ""}`}
            disabled={eliminated.includes(c)}
            onClick={() => setPicked(c)}
          >
            {c}
          </button>
        ))}
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
