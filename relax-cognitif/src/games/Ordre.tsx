import { useMemo, useRef, useState } from "react";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { useGameSession } from "../lib/useGameSession";

type Mode = "facile" | "defi";
const GRID: Record<Mode, number> = { facile: 4, defi: 5 };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Ordre() {
  const [mode, setMode] = useState<Mode>("facile");
  const size = GRID[mode];
  const total = size * size;
  const session = useGameSession("ordre", mode);

  const [seed, setSeed] = useState(0);
  const cells = useMemo(
    () => shuffle(Array.from({ length: total }, (_, i) => i + 1)),
    [total, seed]
  );

  const [next, setNext] = useState(1);
  const [errors, setErrors] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const done = next > total;

  function tap(n: number) {
    if (done) return;
    if (n === next) {
      const isLast = n === total;
      setNext(n + 1);
      if (isLast) session.record(errors <= 4 ? "success" : "failure");
    } else {
      setErrors(e => e + 1);
      setWrong(n);
      if (wrongTimer.current) clearTimeout(wrongTimer.current);
      wrongTimer.current = setTimeout(() => setWrong(null), 350);
    }
  }

  function restart() {
    session.reset();
    setSeed(s => s + 1);
    setNext(1);
    setErrors(0);
    setWrong(null);
  }

  function changeMode(m: Mode) {
    if (m === mode) return;
    session.reset();
    setMode(m);
    setSeed(s => s + 1);
    setNext(1);
    setErrors(0);
    setWrong(null);
  }

  return (
    <div>
      <div className="seg seg-scroll" style={{ marginBottom: 8 }}>
        <button className={`seg-btn ${mode === "facile" ? "active" : ""}`} onClick={() => changeMode("facile")}>Facile · 4×4</button>
        <button className={`seg-btn ${mode === "defi" ? "active" : ""}`} onClick={() => changeMode("defi")}>Défi · 5×5</button>
      </div>

      <WinReward game="ordre" show={session.won} />

      <p className="ordre-prompt">
        {done ? "Terminé !" : <>Touchez le <strong>{next}</strong></>}
      </p>

      <div className="chrono-row">
        <Chrono running={!done} resetKey={`${mode}-${seed}`} />
      </div>

      {!done ? (
        <div
          className="ordre-grid"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {cells.map((n) => {
            const found = n < next;
            return (
              <button
                key={n}
                className={`ordre-cell ${found ? "found" : ""} ${wrong === n ? "wrong" : ""}`}
                onClick={() => tap(n)}
                disabled={found}
              >
                {n}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rapidite-result">
          <p className="rapidite-avg">{total}/{total}</p>
          <p className="rapidite-avg-label">nombres trouvés dans l'ordre</p>
          <div className="rapidite-stats-row">
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">{errors}</span>
              <span className="rapidite-stat-lbl">erreurs</span>
            </div>
          </div>
          <p className="rapidite-perf">
            {errors === 0 ? "Sans-faute, bravo !" : errors <= 4 ? "Bel enchaînement !" : "Continuez à vous exercer !"}
          </p>
          <button className="btn" onClick={restart}>Rejouer</button>
        </div>
      )}
    </div>
  );
}
