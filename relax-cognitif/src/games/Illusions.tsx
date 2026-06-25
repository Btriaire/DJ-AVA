import { useMemo, useState } from "react";
import IllusionArt from "../components/IllusionArt";
import NextButton from "../components/NextButton";
import QuizResult from "../components/QuizResult";
import {
  pickIllusionRound,
  LEVEL_LABEL,
  type IllusionLevel,
} from "../lib/illusions";
import { useGameSession } from "../lib/useGameSession";
import { getSessions } from "../lib/store";
import { bestRatio } from "../lib/score";

const ROUND_SIZE = 10;

type Choice = IllusionLevel | "varie";

const CHOICES: { id: Choice; label: string }[] = [
  { id: 1, label: LEVEL_LABEL[1] },
  { id: 2, label: LEVEL_LABEL[2] },
  { id: 3, label: LEVEL_LABEL[3] },
  { id: "varie", label: "Varié" },
];

export default function Illusions() {
  const [choice, setChoice] = useState<Choice>(1);
  const [seed, setSeed] = useState(0);
  const session = useGameSession("illusions", String(choice));

  const round = useMemo(
    () => pickIllusionRound(choice, ROUND_SIZE),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choice, seed]
  );
  const total = round.length;

  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [isRecord, setIsRecord] = useState(false);

  const key = `${choice}-${seed}`;
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setQi(0);
    setPicked(null);
    setRevealed(false);
    setScore(0);
    setDone(false);
    setIsRecord(false);
    session.reset();
  }

  const q = round[qi];
  const correct = picked === q.answer;

  function choose(opt: string) {
    if (revealed) return;
    setPicked(opt);
    setRevealed(true);
    if (opt === q.answer) setScore((s) => s + 1);
  }

  function next() {
    if (!revealed) return;
    if (qi + 1 >= total) {
      const finalScore = score;
      const prevBest = bestRatio("illusions", getSessions());
      session.record(finalScore >= Math.ceil(total * 0.7) ? "success" : "failure", finalScore, total);
      setIsRecord(total > 0 && finalScore / total > prevBest);
      setDone(true);
    } else {
      setQi((i) => i + 1);
      setPicked(null);
      setRevealed(false);
    }
  }

  function abandon() {
    session.record("abandon");
    setDone(true);
  }

  function restart() {
    setSeed((s) => s + 1);
  }

  if (done) {
    return (
      <QuizResult
        game="illusions"
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
      <div className="controls">
        <div className="seg">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              className={choice === c.id ? "active" : ""}
              onClick={() => {
                setChoice(c.id);
                setSeed((s) => s + 1);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cult-progress">
        <span>
          Illusion {qi + 1} / {total}
        </span>
      </div>

      <p className="ill-question">{q.question}</p>

      <div className="ill-stage">
        <IllusionArt kind={q.kind} reveal={revealed} />
      </div>

      <div className="opt-grid">
        {q.options.map((opt) => {
          const chosen = picked === opt;
          const showGood = revealed && opt === q.answer;
          const showBad = revealed && chosen && opt !== q.answer;
          return (
            <button
              key={opt}
              className={`opt ${chosen ? "chosen" : ""} ${showGood ? "opt-good" : ""} ${
                showBad ? "opt-bad" : ""
              }`}
              disabled={revealed}
              onClick={() => choose(opt)}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div className={`ill-explain ${correct ? "ok" : "ko"}`}>
          <p className="ill-verdict">{correct ? "Bien vu !" : "Surprenant, non ?"}</p>
          <p>{q.explain}</p>
        </div>
      )}

      <NextButton last={qi + 1 >= total} disabled={!revealed} onClick={next} />

      {!revealed && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button className="link-btn" onClick={abandon}>
            J'arrête la manche
          </button>
        </div>
      )}
    </div>
  );
}
