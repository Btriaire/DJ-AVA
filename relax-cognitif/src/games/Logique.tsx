import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { useGameSession } from "../lib/useGameSession";

type Puzzle = { sequence: (number | null)[]; answer: number; hint: string };

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makePuzzle(): Puzzle {
  const kind = rnd(0, 6);
  if (kind === 0) {
    const start = rnd(1, 9);
    const d = rnd(2, 9);
    const full = [0, 1, 2, 3, 4].map((i) => start + i * d);
    return { sequence: [...full.slice(0, 4), null], answer: full[4], hint: `On ajoute ${d} à chaque fois.` };
  }
  if (kind === 1) {
    const start = rnd(1, 4);
    const r = rnd(2, 3);
    const full = [0, 1, 2, 3, 4].map((i) => start * r ** i);
    return { sequence: [...full.slice(0, 4), null], answer: full[4], hint: `On multiplie par ${r} à chaque fois.` };
  }
  if (kind === 2) {
    const start = rnd(1, 6);
    const full: number[] = [start];
    for (let i = 1; i < 5; i++) full.push(full[i - 1] + i);
    return { sequence: [...full.slice(0, 4), null], answer: full[4], hint: "On ajoute 1, puis 2, puis 3..." };
  }
  if (kind === 3) {
    const start = rnd(1, 6);
    const a = rnd(2, 5);
    const b = rnd(2, 5);
    const full: number[] = [start];
    for (let i = 1; i < 5; i++) full.push(full[i - 1] + (i % 2 === 1 ? a : b));
    return { sequence: [...full.slice(0, 4), null], answer: full[4], hint: `On ajoute ${a}, puis ${b}, en alternance.` };
  }
  if (kind === 4) {
    const d = rnd(2, 7);
    const start = d * 4 + rnd(1, 9);
    const full = [0, 1, 2, 3, 4].map((i) => start - i * d);
    return { sequence: [...full.slice(0, 4), null], answer: full[4], hint: `On retire ${d} à chaque fois.` };
  }
  if (kind === 5) {
    const a = rnd(1, 4);
    const b = rnd(2, 5);
    const full: number[] = [a, b];
    for (let i = 2; i < 5; i++) full.push(full[i - 1] + full[i - 2]);
    return { sequence: [...full.slice(0, 4), null], answer: full[4], hint: "Chaque nombre est la somme des deux précédents." };
  }
  const base = rnd(1, 3);
  const full = [0, 1, 2, 3, 4].map((i) => (base + i) ** 2);
  return { sequence: [...full.slice(0, 4), null], answer: full[4], hint: "Ce sont des carrés successifs." };
}

function options(answer: number): number[] {
  const set = new Set<number>([answer]);
  while (set.size < 4) {
    const delta = rnd(-6, 6);
    if (delta !== 0) set.add(Math.max(0, answer + delta));
  }
  return [...set].sort(() => Math.random() - 0.5);
}

export default function Logique() {
  const [seed, setSeed] = useState(0);
  const puzzle = useMemo(() => makePuzzle(), [seed]);
  const opts = useMemo(() => options(puzzle.answer), [puzzle]);
  const [picked, setPicked] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [eliminated, setEliminated] = useState<number[]>([]);
  const [abandoned, setAbandoned] = useState(false);
  const [streak, setStreak] = useState(0);
  const session = useGameSession("logique", "");

  const key = String(seed);
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setPicked(null);
    setShowHint(false);
    setEliminated([]);
    setAbandoned(false);
    session.reset();
  }

  const finished = picked != null || abandoned;
  const correct = picked === puzzle.answer;

  function pick(o: number) {
    if (finished) return;
    setPicked(o);
    const ok = o === puzzle.answer;
    session.record(ok ? "success" : "failure");
    setStreak(ok ? s => s + 1 : 0);
  }

  function giveHint() {
    if (finished || !session.useHint()) return;
    setShowHint(true);
    setEliminated((e) => {
      const candidate = opts.find((o) => o !== puzzle.answer && !e.includes(o));
      return candidate == null ? e : [...e, candidate];
    });
  }

  function abandon() {
    session.record("abandon");
    setAbandoned(true);
    setStreak(0);
  }

  return (
    <div>
      <div className="controls">
        <button className="btn btn-ghost" onClick={() => setSeed((s) => s + 1)}>Nouvelle suite</button>
      </div>

      {streak >= 3 && <p className="streak-banner">🔥 {streak} bonnes réponses d'affilée !</p>}

      <p className="page-sub">Quel nombre complète la suite ?</p>

      <div className="chrono-row">
        <Chrono running={!finished} resetKey={key} />
      </div>

      <WinReward game="logique" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={picked != null}
        abandoned={abandoned}
      />

      <div className="seq">
        {puzzle.sequence.map((n, i) => (
          <div key={i} className={`seq-cell ${n === null ? "blank" : ""}`}>
            {n === null ? (abandoned ? puzzle.answer : "?") : n}
          </div>
        ))}
      </div>

      {showHint && (
        <p className="status hint-row">
          <Icon name="bulb" size={18} /> {puzzle.hint}
        </p>
      )}

      <div className="opt-grid">
        {opts.map((o) => {
          const reveal = picked != null || abandoned;
          const state = !reveal
            ? eliminated.includes(o)
              ? "out"
              : ""
            : o === puzzle.answer
            ? "good"
            : o === picked
            ? "bad"
            : "";
          return (
            <button
              key={o}
              className={`opt ${state}`}
              disabled={finished || eliminated.includes(o)}
              onClick={() => pick(o)}
            >
              {o}
            </button>
          );
        })}
      </div>

      {(picked != null || abandoned) && (
        <p className={correct ? "status win" : "status"}>
          {abandoned
            ? `La réponse était ${puzzle.answer}. ${puzzle.hint}`
            : correct
            ? "Exact, bravo !"
            : `La bonne réponse était ${puzzle.answer}. ${puzzle.hint}`}{" "}
          <button className="link-btn" onClick={() => setSeed((s) => s + 1)}>Suivant →</button>
        </p>
      )}
    </div>
  );
}
