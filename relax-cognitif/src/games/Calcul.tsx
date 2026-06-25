import { useEffect, useMemo, useState } from "react";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { evaluate, newPuzzle, type CalcLevel, type Op } from "../lib/calcul";
import { useGameSession } from "../lib/useGameSession";
import { bumpStreak, resetStreak } from "../lib/store";
import LevelUpHint from "../components/LevelUpHint";

const LEVELS: { id: CalcLevel; label: string }[] = [
  { id: "facile", label: "Facile" },
  { id: "moyen", label: "Moyen" },
  { id: "difficile", label: "Difficile" },
];

export default function Calcul() {
  const [level, setLevel] = useState<CalcLevel>("facile");
  const [seed, setSeed] = useState(0);
  const puzzle = useMemo(() => newPuzzle(level), [level, seed]);

  const [ops, setOps] = useState<Op[]>(() => puzzle.allowed.length ? puzzle.nums.slice(1).map(() => puzzle.allowed[0]) : []);
  const [abandoned, setAbandoned] = useState(false);
  const [, setBumps] = useState(0);
  const session = useGameSession("calcul", level);

  const key = `${level}-${seed}`;
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setOps(puzzle.nums.slice(1).map(() => puzzle.allowed[0]));
    setAbandoned(false);
    session.reset();
  }

  const current = evaluate(puzzle.nums, ops);
  const solved = current === puzzle.target;
  const finished = solved || abandoned;

  useEffect(() => {
    if (solved && !session.won) {
      session.record("success");
      bumpStreak("calcul", level);
      setBumps((b) => b + 1);
    }
  }, [solved, session, level]);

  function cycle(i: number) {
    if (finished) return;
    setOps((prev) => {
      const cur = prev[i];
      const idx = puzzle.allowed.indexOf(cur);
      const next = puzzle.allowed[(idx + 1) % puzzle.allowed.length];
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
  }

  function giveHint() {
    if (finished || !session.useHint()) return;
    // place le premier signe qui diffère de la solution connue
    const i = ops.findIndex((o, k) => o !== puzzle.solution[k]);
    if (i >= 0) {
      setOps((prev) => {
        const copy = [...prev];
        copy[i] = puzzle.solution[i];
        return copy;
      });
    }
  }

  function abandon() {
    session.record("abandon");
    setOps(puzzle.solution);
    setAbandoned(true);
    resetStreak("calcul", level);
    setBumps((b) => b + 1);
  }

  return (
    <div>
      <div className="controls">
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>
          Nouveau calcul
        </button>
      </div>

      <div className="seg seg-scroll">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            className={`seg-btn ${level === l.id ? "active" : ""}`}
            onClick={() => {
              setLevel(l.id);
              setSeed((s) => s + 1);
            }}
          >
            {l.label}
          </button>
        ))}
      </div>

      <LevelUpHint game="calcul" streakLevel={level} difficulty={level} />

      <p className="page-sub">Touchez les signes pour atteindre le résultat.</p>

      <div className="chrono-row">
        <Chrono running={!finished} resetKey={key} />
      </div>

      <WinReward game="calcul" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={solved}
        abandoned={abandoned}
      />

      <div className={`calc-eq ${solved ? "solved" : ""}`}>
        {puzzle.nums.map((n, i) => (
          <span key={i} className="calc-cell">
            <span className="calc-num">{n}</span>
            {i < ops.length && (
              <button
                className="calc-op"
                onClick={() => cycle(i)}
                disabled={finished}
                aria-label={`Signe ${i + 1}`}
              >
                {ops[i]}
              </button>
            )}
          </span>
        ))}
        <span className="calc-eq-mark">=</span>
        <span className="calc-target">{puzzle.target}</span>
      </div>

      <p className={`calc-current ${solved ? "ok" : ""}`}>
        Total actuel : {current}
      </p>

      {finished && (
        <p className={solved ? "status win" : "status"}>
          {abandoned
            ? `Une solution : ${puzzle.nums
                .map((n, i) => `${n}${i < puzzle.solution.length ? " " + puzzle.solution[i] + " " : ""}`)
                .join("")} = ${puzzle.target}`
            : "Bravo, c'est juste !"}{" "}
          <button className="link-btn" onClick={() => setSeed((s) => s + 1)}>
            Suivant →
          </button>
        </p>
      )}
    </div>
  );
}
