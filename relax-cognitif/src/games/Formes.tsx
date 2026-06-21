import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { useGameSession } from "../lib/useGameSession";

const PAIRS = [
  ["circle", "hexagon"],
  ["square", "diamond"],
  ["triangle", "star"],
  ["heart", "droplet"],
  ["sun", "flower"],
];
const COLORS = ["#306230", "#6e8b2e"];

type Cell = { shape: string; color: string };

function rnd(n: number) {
  return Math.floor(Math.random() * n);
}

function makeRound(): { cells: Cell[]; intruder: number } {
  const count = 9;
  const byColor = Math.random() < 0.5;
  const intruder = rnd(count);
  if (byColor) {
    const pair = PAIRS[rnd(PAIRS.length)];
    const shape = pair[rnd(2)];
    const base = COLORS[0], odd = COLORS[1];
    const cells = Array.from({ length: count }, (_, i) => ({
      shape,
      color: i === intruder ? odd : base,
    }));
    return { cells, intruder };
  }
  const pair = PAIRS[rnd(PAIRS.length)];
  const color = COLORS[rnd(2)];
  const cells = Array.from({ length: count }, (_, i) => ({
    shape: i === intruder ? pair[1] : pair[0],
    color,
  }));
  return { cells, intruder };
}

export default function Formes() {
  const [seed, setSeed] = useState(0);
  const round = useMemo(() => makeRound(), [seed]);
  const [picked, setPicked] = useState<number | null>(null);
  const [eliminated, setEliminated] = useState<number[]>([]);
  const [abandoned, setAbandoned] = useState(false);
  const session = useGameSession("formes", "");

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
  const correct = picked === round.intruder;

  function pick(i: number) {
    if (finished || eliminated.includes(i)) return;
    setPicked(i);
    session.record(i === round.intruder ? "success" : "failure");
  }

  function giveHint() {
    if (finished || !session.useHint()) return;
    setEliminated((e) => {
      const candidates = round.cells
        .map((_, i) => i)
        .filter((i) => i !== round.intruder && !e.includes(i));
      if (!candidates.length) return e;
      return [...e, candidates[rnd(candidates.length)]];
    });
  }

  function abandon() {
    session.record("abandon");
    setAbandoned(true);
  }

  return (
    <div>
      <div className="controls">
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>
          Nouvelle grille
        </button>
      </div>

      <p className="page-sub">Touchez la forme qui est différente des autres.</p>

      <div className="chrono-row">
        <Chrono running={!finished} resetKey={key} />
      </div>

      <WinReward game="formes" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={picked != null}
        abandoned={abandoned}
      />

      <div className="formes-grid">
        {round.cells.map((cell, i) => {
          const reveal = finished;
          const isIntruder = i === round.intruder;
          const state = reveal
            ? isIntruder
              ? "good"
              : i === picked
              ? "bad"
              : ""
            : eliminated.includes(i)
            ? "out"
            : "";
          return (
            <button
              key={i}
              className={`forme-cell ${state}`}
              style={{ color: cell.color }}
              disabled={finished || eliminated.includes(i)}
              onClick={() => pick(i)}
              aria-label="forme"
            >
              <Icon name={cell.shape} size={44} />
            </button>
          );
        })}
      </div>

      {finished && (
        <p className={correct ? "status win" : "status"}>
          {abandoned
            ? "L'intrus est entouré."
            : correct
            ? "Exact, bravo !"
            : "Ce n'était pas la bonne. L'intrus est entouré."}{" "}
          <button className="link-btn" onClick={() => setSeed((s) => s + 1)}>Suivant →</button>
        </p>
      )}
    </div>
  );
}
