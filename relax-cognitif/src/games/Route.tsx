import { useMemo, useState } from "react";
import PlateArt from "../components/PlateArt";
import RoadSign from "../components/RoadSign";
import NextButton from "../components/NextButton";
import QuizResult from "../components/QuizResult";
import {
  pickRouteRound,
  fakePlate,
  ROUTE_LEVEL_LABEL,
  type RouteLevel,
} from "../lib/route";
import { useGameSession } from "../lib/useGameSession";
import { getSessions } from "../lib/store";
import { bestRatio } from "../lib/score";

const ROUND_SIZE = 12;

const CHOICES: { id: RouteLevel; label: string }[] = [
  { id: "plaques", label: ROUTE_LEVEL_LABEL.plaques },
  { id: "routes", label: ROUTE_LEVEL_LABEL.routes },
  { id: "varie", label: ROUTE_LEVEL_LABEL.varie },
];

export default function JeuRoute() {
  const [level, setLevel] = useState<RouteLevel>("plaques");
  const [seed, setSeed] = useState(0);
  const session = useGameSession("route", level);

  const round = useMemo(
    () => pickRouteRound(level, ROUND_SIZE),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, seed]
  );
  const total = round.length;

  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [isRecord, setIsRecord] = useState(false);

  const key = `${level}-${seed}`;
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
  // plaque factice stable pour la question courante
  const plate = useMemo(() => fakePlate(), [q?.id]);
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
      const prevBest = bestRatio("route", getSessions());
      session.record(
        finalScore >= Math.ceil(total * 0.7) ? "success" : "failure",
        finalScore,
        total
      );
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
        game="route"
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
              className={level === c.id ? "active" : ""}
              onClick={() => {
                setLevel(c.id);
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
          Question {qi + 1} / {total}
        </span>
      </div>

      <div className="route-stage">
        {q.theme === "plaque" ? (
          <PlateArt dep={q.plateDep ?? ""} plate={plate} />
        ) : (
          <RoadSign label={q.sign?.label ?? ""} type={q.sign?.type ?? "emblem"} />
        )}
      </div>

      <p className="route-question">{q.question}</p>

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
          <p className="ill-verdict">{correct ? "Bonne route !" : "Mauvais virage…"}</p>
          {q.explain && <p>{q.explain}</p>}
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
