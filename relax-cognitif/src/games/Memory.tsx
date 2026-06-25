import { useEffect, useMemo, useState } from "react";
import Icon, { MEMORY_SYMBOLS } from "../components/Icon";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import LevelUpHint from "../components/LevelUpHint";
import { getConfig, bumpStreak, resetStreak } from "../lib/store";
import { useGameSession } from "../lib/useGameSession";

const SYMBOLS = MEMORY_SYMBOLS;

type Level = { groups: number; cols: number };
type Mode = "paires" | "trio";

// Mode « Paires » : retrouver 2 cartes identiques (classique).
// Mode « Trio » : retrouver 3 cartes identiques (inspiré de TommysG).
const LEVELS: Record<Mode, Record<string, Level>> = {
  paires: {
    facile: { groups: 6, cols: 4 },
    moyen: { groups: 8, cols: 4 },
    difficile: { groups: 10, cols: 5 },
  },
  trio: {
    facile: { groups: 4, cols: 4 },
    moyen: { groups: 6, cols: 6 },
    difficile: { groups: 8, cols: 6 },
  },
};

const MODE_LABEL: Record<Mode, string> = { paires: "Paires", trio: "Trios" };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Memory() {
  const [mode, setMode] = useState<Mode>("paires");
  const [level, setLevel] = useState<keyof typeof LEVELS.paires>(
    getConfig().defaults.memoryLevel
  );
  const [seed, setSeed] = useState(0);
  const [abandoned, setAbandoned] = useState(false);
  const session = useGameSession("memory", mode);

  const groupSize = mode === "trio" ? 3 : 2;
  const conf = LEVELS[mode][level];

  const deck = useMemo(() => {
    const chosen = shuffle(SYMBOLS).slice(0, conf.groups);
    const full: string[] = [];
    for (let g = 0; g < groupSize; g++) full.push(...chosen);
    return shuffle(full);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, level, seed]);

  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [, setBumps] = useState(0);
  const streakLevel = `${mode}-${level}`;

  const key = `${mode}-${level}-${seed}`;
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
    if (flipped.length !== groupSize) return;
    setMoves((m) => m + 1);
    const sym = deck[flipped[0]];
    const allSame = flipped.every((i) => deck[i] === sym);
    if (allSame) {
      setMatched((m) => [...m, ...flipped]);
      setFlipped([]);
    } else {
      const t = setTimeout(() => setFlipped([]), 1000);
      return () => clearTimeout(t);
    }
  }, [flipped, deck, groupSize]);

  const won = matched.length === deck.length && deck.length > 0;

  useEffect(() => {
    if (won && !abandoned && !session.won) {
      session.record("success");
      bumpStreak("memory", streakLevel);
      setBumps((b) => b + 1);
    }
  }, [won, abandoned, session, streakLevel]);

  function flip(i: number) {
    if (abandoned || flipped.length >= groupSize || flipped.includes(i) || matched.includes(i)) return;
    setFlipped((f) => [...f, i]);
  }

  function giveHint() {
    if (!session.useHint()) return;
    const open = new Set([...matched, ...flipped]);
    const groups: Record<string, number[]> = {};
    for (let i = 0; i < deck.length; i++) {
      if (open.has(i)) continue;
      (groups[deck[i]] ??= []).push(i);
      if (groups[deck[i]].length === groupSize) {
        setFlipped([]);
        setMatched((m) => [...m, ...groups[deck[i]]]);
        return;
      }
    }
  }

  function abandon() {
    session.record("abandon");
    setFlipped([]);
    setMatched(deck.map((_, i) => i));
    setAbandoned(true);
    resetStreak("memory", streakLevel);
    setBumps((b) => b + 1);
  }

  return (
    <div>
      <div className="controls">
        <div className="seg">
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button key={m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="seg">
          {(Object.keys(LEVELS[mode]) as (keyof typeof LEVELS.paires)[]).map((l) => (
            <button key={l} className={level === l ? "active" : ""} onClick={() => setLevel(l)}>
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>Recommencer</button>
      </div>

      <LevelUpHint game="memory" streakLevel={streakLevel} difficulty={level} />

      <p className={won && !abandoned ? "status win" : "status"}>
        {abandoned
          ? `Tous les ${mode === "trio" ? "trios" : "paires"} sont révélés.`
          : won
          ? `Bravo ! Terminé en ${moves} coups.`
          : mode === "trio"
          ? `Trouvez 3 cartes identiques. Coups : ${moves}`
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

      <div className="mem-grid" style={{ gridTemplateColumns: `repeat(${conf.cols}, 1fr)` }}>
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
