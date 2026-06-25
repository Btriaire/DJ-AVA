import { useEffect, useMemo, useState } from "react";
import { newPuzzle, SIZES, type Level } from "../lib/sudoku";
import Icon from "../components/Icon";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import LevelUpHint from "../components/LevelUpHint";
import { getConfig, bumpStreak, resetStreak } from "../lib/store";
import { useGameSession } from "../lib/useGameSession";

export default function Sudoku() {
  const cfg = getConfig();
  const [sizeKey, setSizeKey] = useState(cfg.defaults.sudokuSize);
  const [level, setLevel] = useState<Level>(cfg.defaults.sudokuLevel);
  const [seed, setSeed] = useState(0);

  const { puzzle, solution, size } = useMemo(
    () => newPuzzle(sizeKey, level),
    [sizeKey, level, seed]
  );
  const n = size.n;

  const [cells, setCells] = useState<number[]>(puzzle);
  const [selected, setSelected] = useState<number | null>(null);
  const [abandoned, setAbandoned] = useState(false);
  const [, setBumps] = useState(0);
  const session = useGameSession("sudoku", `${sizeKey} • ${level}`);
  const streakLevel = `${sizeKey} • ${level}`;

  const key = `${sizeKey}-${level}-${seed}`;
  const [renderedKey, setRenderedKey] = useState(key);
  if (renderedKey !== key) {
    setRenderedKey(key);
    setCells(puzzle);
    setSelected(null);
    setAbandoned(false);
    session.reset();
  }

  const fixed = puzzle;
  const solved = cells.every((v, i) => v === solution[i]);

  useEffect(() => {
    if (solved && !session.won) {
      session.record("success");
      bumpStreak("sudoku", streakLevel);
      setBumps((b) => b + 1);
    }
  }, [solved, session, streakLevel]);

  function setValue(v: number) {
    if (abandoned || selected == null || fixed[selected] !== 0) return;
    setCells((c) => {
      const next = [...c];
      next[selected] = next[selected] === v ? 0 : v;
      return next;
    });
  }

  function giveHint() {
    if (!session.useHint()) return;
    setCells((c) => {
      const next = [...c];
      let target =
        selected != null && fixed[selected] === 0 && next[selected] !== solution[selected]
          ? selected
          : -1;
      if (target < 0) {
        for (let i = 0; i < next.length; i++) {
          if (fixed[i] === 0 && next[i] !== solution[i]) {
            target = i;
            break;
          }
        }
      }
      if (target >= 0) next[target] = solution[target];
      return next;
    });
  }

  function abandon() {
    session.record("abandon");
    setCells([...solution]);
    setAbandoned(true);
    resetStreak("sudoku", streakLevel);
    setBumps((b) => b + 1);
  }

  const padCols = n <= 6 ? n + 1 : 5;

  return (
    <div>
      <div className="controls">
        <div className="seg">
          {Object.values(SIZES).map((s) => (
            <button
              key={s.key}
              className={sizeKey === s.key ? "active" : ""}
              onClick={() => setSizeKey(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="controls">
        <div className="seg">
          {(["facile", "moyen", "difficile"] as Level[]).map((l) => (
            <button key={l} className={level === l ? "active" : ""} onClick={() => setLevel(l)}>
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>
          Nouvelle grille
        </button>
      </div>

      <LevelUpHint game="sudoku" streakLevel={streakLevel} difficulty={level} />

      <p className={solved ? "status win" : "status"}>
        {solved
          ? "Bravo, grille terminée !"
          : abandoned
          ? "Voici la solution complète."
          : "Touchez une case, puis choisissez un chiffre."}
      </p>

      <div className="chrono-row">
        <Chrono running={!solved && !abandoned} resetKey={key} />
      </div>

      <WinReward game="sudoku" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={solved}
        abandoned={abandoned}
      />

      <div className="sudoku" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {cells.map((v, i) => {
          const row = Math.floor(i / n);
          const col = i % n;
          const isFixed = fixed[i] !== 0;
          const wrong = v !== 0 && !isFixed && v !== solution[i];
          const br = (col + 1) % size.boxW === 0 && col !== n - 1;
          const bb = (row + 1) % size.boxH === 0 && row !== n - 1;
          const cls = [
            "sk-cell",
            isFixed ? "fixed" : "",
            selected === i ? "sel" : "",
            wrong ? "wrong" : "",
            br ? "br" : "",
            bb ? "bb" : "",
          ].join(" ");
          return (
            <button key={i} className={cls} onClick={() => setSelected(i)}>
              {v !== 0 ? v : ""}
            </button>
          );
        })}
      </div>

      <div className="pad" style={{ gridTemplateColumns: `repeat(${padCols}, 1fr)` }}>
        {Array.from({ length: n }, (_, k) => k + 1).map((num) => (
          <button key={num} className="pad-key" onClick={() => setValue(num)}>
            {num}
          </button>
        ))}
        <button
          className="pad-key erase"
          aria-label="Effacer"
          onClick={() => selected != null && setValue(cells[selected])}
        >
          <Icon name="erase" size={26} />
        </button>
      </div>
    </div>
  );
}
