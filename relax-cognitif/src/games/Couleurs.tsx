import { useMemo, useState } from "react";
import { randomColorQ } from "../lib/couleurs";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { useGameSession } from "../lib/useGameSession";

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
  const q = useMemo(() => randomColorQ(), [seed]);
  const choices = useMemo(() => shuffle([q.answer, ...q.distractors]), [q]);

  const [picked, setPicked] = useState<string | null>(null);
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [abandoned, setAbandoned] = useState(false);
  const session = useGameSession("couleurs", "");

  const key = String(seed);
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setPicked(null);
    setEliminated([]);
    setAbandoned(false);
    session.reset();
  }

  const finished = picked != null || abandoned;
  const correct = picked === q.answer;

  function pick(c: string) {
    if (finished) return;
    setPicked(c);
    session.record(c === q.answer ? "success" : "failure");
  }

  function giveHint() {
    if (finished || !session.useHint()) return;
    const wrong = choices.find((c) => c !== q.answer && !eliminated.includes(c));
    if (wrong) setEliminated((e) => [...e, wrong]);
  }

  function abandon() {
    session.record("abandon");
    setAbandoned(true);
  }

  return (
    <div>
      <div className="controls">
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>
          Nouvelle question
        </button>
      </div>

      <p className="page-sub">De toutes les couleurs</p>

      <div className="chrono-row">
        <Chrono running={!finished} resetKey={key} />
      </div>

      <WinReward game="couleurs" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={picked != null}
        abandoned={abandoned}
      />

      <blockquote className="cit-quote">{q.prompt}</blockquote>

      <div className="opt-grid">
        {choices.map((c) => {
          const reveal = picked != null || abandoned;
          const state = !reveal
            ? eliminated.includes(c)
              ? "out"
              : ""
            : c === q.answer
            ? "good"
            : c === picked
            ? "bad"
            : "";
          return (
            <button
              key={c}
              className={`opt ${state}`}
              disabled={finished || eliminated.includes(c)}
              onClick={() => pick(c)}
            >
              {c}
            </button>
          );
        })}
      </div>

      {finished && (
        <p className={correct ? "status win" : "status"}>
          {abandoned
            ? `La réponse était « ${q.answer} ».`
            : correct
            ? "Exact, bravo !"
            : `La bonne réponse était « ${q.answer} ».`}
          {q.note ? ` (${q.note})` : ""}{" "}
          <button className="link-btn" onClick={() => setSeed((s) => s + 1)}>
            Suivant →
          </button>
        </p>
      )}
    </div>
  );
}
