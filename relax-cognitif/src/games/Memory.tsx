import { useEffect, useMemo, useState } from "react";
import Icon, { MEMORY_SYMBOLS } from "../components/Icon";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { getConfig } from "../lib/store";
import { useGameSession } from "../lib/useGameSession";

const SYMBOLS = MEMORY_SYMBOLS;

type Level = { pairs: number; cols: number };
const LEVELS: Record<string, Level> = {
  facile: { pairs: 6, cols: 4 },
  moyen: { pairs: 8, cols: 4 },
  difficile: { pairs: 10, cols: 5 },
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Memory() {
  const [level, setLevel] = useState<keyof typeof LEVELS>(
    getConfig().defaults.memoryLevel
  );
  const [seed, setSeed] = useState(0);
  const [abandoned, setAbandoned] = useState(false);
  const session = useGameSession("memory", "");

  const deck = useMemo(() => {
    const { pairs } = LEVELS[level];
    const chosen = shuffle(SYMBOLS).slice(0, pairs);
    return shuffle([...chosen, ...chosen]);
  }, [level, seed]);

  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);

  const key = `${level}-${seed}`;
  const [renderedKey, setRenderedKey] = useState(key);
  if (renderedKey !== key) {
    setRenderedKey(key);
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setAbandoned(false);
    session.reset();
  }

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [a, b] = flipped;
    setMoves((m) => m + 1);
    if (deck[a] === deck[b]) {
      setMatched((m) => [...m, a, b]);
      setFlipped([]);
    } else {
      const t = setTimeout(() => setFlipped([]), 900);
      return () => clearTimeout(t);
    }
  }, [flipped, deck]);

  const won = matched.length === deck.length && deck.length > 0;

  useEffect(() => {
    if (won && !abandoned) session.record("success");
  }, [won, abandoned, session]);

  function flip(i: number) {
    if (abandoned || flipped.length === 2 || flipped.includes(i) || matched.includes(i)) return;
    setFlipped((f) => [...f, i]);
  }

  function giveHint() {
    if (!session.useHint()) return;
    const open = new Set([...matched, ...flipped]);
    const seen: Record<string, number> = {};
    for (let i = 0; i < deck.length; i++) {
      if (open.has(i)) continue;
      const sym = deck[i];
      if (sym in seen) {
        const a = seen[sym];
        setFlipped([]);
        setMatched((m) => [...m, a, i]);
        return;
      }
      seen[sym] = i;
    }
  }

  function abandon() {
    session.record("abandon");
    setFlipped([]);
    setMatched(deck.map((_, i) => i));
    setAbandoned(true);
  }

  return (
    <div>
      <div className="controls">
        <div className="seg">
          {(Object.keys(LEVELS) as (keyof typeof LEVELS)[]).map((l) => (
            <button key={l} className={level === l ? "active" : ""} onClick={() => setLevel(l)}>
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>Recommencer</button>
      </div>

      <p className={won && !abandoned ? "status win" : "status"}>
        {abandoned
          ? "Toutes les paires sont révélées."
          : won
          ? `Bravo ! Terminé en ${moves} coups.`
          : `Coups : ${moves}`}
      </p>

      <div className="chrono-row">
        <Chrono running={!won && !abandoned} resetKey={key} />
      </div>

      <WinReward game="memory" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={won}
        abandoned={abandoned}
      />

      <div className="mem-grid" style={{ gridTemplateColumns: `repeat(${LEVELS[level].cols}, 1fr)` }}>
        {deck.map((sym, i) => {
          const show = flipped.includes(i) || matched.includes(i);
          return (
            <button
              key={i}
              className={`mem-card ${show ? "open" : ""} ${matched.includes(i) ? "done" : ""}`}
              onClick={() => flip(i)}
              aria-label={show ? sym : "carte cachée"}
            >
              {show ? <Icon name={sym} size={40} /> : <span className="mem-back">?</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
