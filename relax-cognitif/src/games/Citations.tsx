import { useMemo, useState } from "react";
import { CITATIONS } from "../lib/citations";
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

export default function Citations() {
  const [seed, setSeed] = useState(0);
  const cit = useMemo(
    () => CITATIONS[Math.floor(Math.random() * CITATIONS.length)],
    [seed]
  );
  const choices = useMemo(
    () => shuffle([cit.answer, ...cit.distractors]),
    [cit]
  );

  const [picked, setPicked] = useState<string | null>(null);
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [revealAuthor, setRevealAuthor] = useState(false);
  const [abandoned, setAbandoned] = useState(false);
  const session = useGameSession("citations", "");

  const key = String(seed);
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setPicked(null);
    setEliminated([]);
    setRevealAuthor(false);
    setAbandoned(false);
    session.reset();
  }

  const finished = picked != null || abandoned;
  const correct = picked === cit.answer;
  const [before, after] = cit.template.split("___");

  function pick(c: string) {
    if (finished) return;
    setPicked(c);
    session.record(c === cit.answer ? "success" : "failure");
  }

  function giveHint() {
    if (finished || !session.useHint()) return;
    const wrong = choices.find((c) => c !== cit.answer && !eliminated.includes(c));
    if (wrong) setEliminated((e) => [...e, wrong]);
    else setRevealAuthor(true);
  }

  function abandon() {
    session.record("abandon");
    setAbandoned(true);
    setRevealAuthor(true);
  }

  return (
    <div>
      <div className="controls">
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>
          Nouvelle citation
        </button>
      </div>

      <p className="page-sub">Quel mot complète la citation ?</p>

      <div className="chrono-row">
        <Chrono running={!finished} resetKey={key} />
      </div>

      <WinReward game="citations" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={picked != null}
        abandoned={abandoned}
      />

      <blockquote className="cit-quote">
        {before}
        <span className={`cit-blank ${finished ? "filled" : ""}`}>
          {finished ? cit.answer : "______"}
        </span>
        {after}
      </blockquote>

      {revealAuthor && <p className="cit-author">— {cit.author}</p>}

      <div className="opt-grid">
        {choices.map((c) => {
          const reveal = picked != null || abandoned;
          const state = !reveal
            ? eliminated.includes(c)
              ? "out"
              : ""
            : c === cit.answer
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
            ? `La réponse était « ${cit.answer} ».`
            : correct
            ? "Exact, bravo !"
            : `La bonne réponse était « ${cit.answer} ».`}{" "}
          <button className="link-btn" onClick={() => setSeed((s) => s + 1)}>Suivant →</button>
        </p>
      )}
    </div>
  );
}
