import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import GameActions from "../components/GameActions";
import Chrono from "../components/Chrono";
import NextButton from "../components/NextButton";
import QuizResult from "../components/QuizResult";
import { useGameSession } from "../lib/useGameSession";
import { getSessions } from "../lib/store";
import { bestRatio } from "../lib/score";

const ROUND_SIZE = 20;
const PASS = 14;

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
  const puzzles = useMemo(
    () => Array.from({ length: ROUND_SIZE }, makePuzzle),
    [seed]
  );
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [isRecord, setIsRecord] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [eliminated, setEliminated] = useState<number[]>([]);
  const session = useGameSession("logique", "");

  const key = String(seed);
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setQi(0);
    setPicked(null);
    setScore(0);
    setDone(false);
    setIsRecord(false);
    setShowHint(false);
    setEliminated([]);
    session.reset();
  }

  const puzzle = puzzles[qi];
  const opts = useMemo(() => options(puzzle.answer), [puzzle]);

  function next() {
    if (picked == null) return;
    const newScore = picked === puzzle.answer ? score + 1 : score;
    setScore(newScore);
    if (qi + 1 >= ROUND_SIZE) {
      const prevBest = bestRatio("logique", getSessions());
      session.record(newScore >= PASS ? "success" : "failure", newScore, ROUND_SIZE);
      setIsRecord(newScore / ROUND_SIZE > prevBest);
      setDone(true);
    } else {
      setQi(i => i + 1);
      setPicked(null);
      setShowHint(false);
      setEliminated([]);
    }
  }

  function giveHint() {
    if (!session.useHint()) return;
    setShowHint(true);
    setEliminated((e) => {
      const candidate = opts.find((o) => o !== puzzle.answer && !e.includes(o));
      return candidate == null ? e : [...e, candidate];
    });
  }

  function abandon() {
    session.record("abandon");
    setDone(true);
  }

  function restart() { setSeed(s => s + 1); }

  if (done) {
    return (
      <QuizResult
        game="logique"
        won={session.won}
        score={score}
        total={ROUND_SIZE}
        isRecord={isRecord}
        onReplay={restart}
      />
    );
  }

  return (
    <div>
      <div className="cult-progress">
        <span>Suite {qi + 1} / {ROUND_SIZE}</span>
      </div>

      <p className="page-sub">Quel nombre complète la suite ?</p>

      <div className="chrono-row">
        <Chrono running={!done} resetKey={key} />
      </div>

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={false}
        abandoned={false}
      />

      <div className="seq">
        {puzzle.sequence.map((n, i) => (
          <div key={i} className={`seq-cell ${n === null ? "blank" : ""}`}>
            {n === null ? "?" : n}
          </div>
        ))}
      </div>

      {showHint && (
        <p className="status hint-row">
          <Icon name="bulb" size={18} /> {puzzle.hint}
        </p>
      )}

      <div className="opt-grid">
        {opts.map((o) => (
          <button
            key={o}
            className={`opt ${picked === o ? "chosen" : ""} ${eliminated.includes(o) ? "out" : ""}`}
            disabled={eliminated.includes(o)}
            onClick={() => setPicked(o)}
          >
            {o}
          </button>
        ))}
      </div>

      {picked != null && (
        <div style={{ textAlign: "center" }}>
          <span className="quiz-answered">Répondu</span>
        </div>
      )}

      <NextButton last={qi + 1 >= ROUND_SIZE} disabled={picked == null} onClick={next} />
    </div>
  );
}
