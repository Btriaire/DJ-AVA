import { useEffect, useRef, useState } from "react";
import WinReward from "../components/WinReward";
import { useGameSession } from "../lib/useGameSession";

const ROUNDS = 14;

type Mode = "entrainement" | "defi";
type Phase = "idle" | "running" | "done";

// Couleurs accordées à la palette douce de l'app (vert sauge, terracotta, bleu, or, violet).
const COLORS = [
  { name: "Rouge", hex: "#c4544a" },
  { name: "Bleu", hex: "#5984c4" },
  { name: "Vert", hex: "#4f9d83" },
  { name: "Orange", hex: "#e0824f" },
  { name: "Violet", hex: "#9c6cc4" },
];

function rnd(n: number) {
  return Math.floor(Math.random() * n);
}

type Card = { wordIdx: number; inkIdx: number; choices: number[] };

function makeCard(): Card {
  const wordIdx = rnd(COLORS.length);
  // 70 % incongruent (encre ≠ mot) pour solliciter l'inhibition.
  let inkIdx = wordIdx;
  if (Math.random() < 0.72) {
    while (inkIdx === wordIdx) inkIdx = rnd(COLORS.length);
  }
  // 4 propositions incluant la bonne (la couleur de l'encre).
  const set = new Set<number>([inkIdx]);
  while (set.size < 4) set.add(rnd(COLORS.length));
  const choices = [...set].sort(() => Math.random() - 0.5);
  return { wordIdx, inkIdx, choices };
}

export default function Stroop() {
  const [mode, setMode] = useState<Mode>("entrainement");
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState(0);
  const [card, setCard] = useState<Card>(makeCard);
  const [correct, setCorrect] = useState(0);
  const [reactions, setReactions] = useState<number[]>([]);
  const [flash, setFlash] = useState<"ok" | "no" | null>(null);
  const bornRef = useRef(0);
  const lockRef = useRef(false);
  const session = useGameSession("stroop", mode);

  // En défi : limite de temps par carte (sinon raté).
  const timeLimit = mode === "defi" ? 2600 : 0;
  const limitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase !== "running") return;
    if (round >= ROUNDS) { setPhase("done"); return; }
    lockRef.current = false;
    bornRef.current = Date.now();
    if (timeLimit) {
      limitRef.current = setTimeout(() => {
        if (lockRef.current) return;
        lockRef.current = true;
        setFlash("no");
        setTimeout(() => { setFlash(null); advance(); }, 450);
      }, timeLimit);
      return () => { if (limitRef.current) clearTimeout(limitRef.current); };
    }
  }, [phase, round]); // eslint-disable-line

  useEffect(() => {
    if (phase !== "done") return;
    session.record(correct >= 10 ? "success" : "failure");
  }, [phase]); // eslint-disable-line

  function advance() {
    setCard(makeCard());
    setRound(r => r + 1);
  }

  function choose(idx: number) {
    if (phase !== "running" || lockRef.current) return;
    lockRef.current = true;
    if (limitRef.current) clearTimeout(limitRef.current);
    const good = idx === card.inkIdx;
    if (good) {
      setCorrect(c => c + 1);
      setReactions(r => [...r, Date.now() - bornRef.current]);
    }
    setFlash(good ? "ok" : "no");
    setTimeout(() => { setFlash(null); advance(); }, good ? 280 : 520);
  }

  function start() {
    session.reset();
    setRound(0);
    setCorrect(0);
    setReactions([]);
    setCard(makeCard());
    setFlash(null);
    setPhase("running");
  }

  function changeMode(m: Mode) {
    setMode(m);
    setPhase("idle");
    setRound(0);
    setCorrect(0);
    setReactions([]);
  }

  const avgMs = reactions.length
    ? Math.round(reactions.reduce((a, b) => a + b, 0) / reactions.length)
    : 0;
  const pct = Math.round((correct / ROUNDS) * 100);

  return (
    <div>
      <div className="seg seg-scroll" style={{ marginBottom: 8 }}>
        <button className={`seg-btn ${mode === "entrainement" ? "active" : ""}`} onClick={() => changeMode("entrainement")}>Entraînement</button>
        <button className={`seg-btn ${mode === "defi" ? "active" : ""}`} onClick={() => changeMode("defi")}>Défi ⚡</button>
      </div>

      <WinReward game="stroop" show={session.won} />

      {phase === "idle" && (
        <div className="rapidite-idle">
          <div className="stroop-demo" aria-hidden>
            <span style={{ color: COLORS[2].hex }}>ROUGE</span>
          </div>
          <p className="page-sub">
            Un mot de couleur s'affiche, mais écrit dans une <strong>autre</strong> couleur.
            Touchez la couleur de l'<strong>encre</strong>, pas le mot lu !
            {mode === "defi" ? " En défi, soyez rapide : chaque carte est minutée." : ""}
          </p>
          <button className="btn" onClick={start}>Démarrer</button>
        </div>
      )}

      {phase === "running" && (
        <>
          <p className="rapidite-counter">Carte {round + 1} / {ROUNDS}</p>
          <div className={`stroop-stage ${flash ? `flash-${flash}` : ""}`}>
            <span className="stroop-word" style={{ color: COLORS[card.inkIdx].hex }}>
              {COLORS[card.wordIdx].name.toUpperCase()}
            </span>
          </div>
          <p className="stroop-hint">De quelle couleur est le mot écrit ?</p>
          <div className="stroop-choices">
            {card.choices.map((idx) => (
              <button key={idx} className="stroop-choice" onClick={() => choose(idx)}>
                {COLORS[idx].name}
              </button>
            ))}
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="rapidite-result">
          <p className="rapidite-avg">{correct}/{ROUNDS}</p>
          <p className="rapidite-avg-label">bonnes réponses</p>
          <div className="rapidite-stats-row">
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">{pct}%</span>
              <span className="rapidite-stat-lbl">précision</span>
            </div>
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">{avgMs > 0 ? avgMs : "—"}</span>
              <span className="rapidite-stat-lbl">ms / réponse</span>
            </div>
          </div>
          <p className="rapidite-perf">
            {correct >= 13 ? "⚡ Concentration remarquable !" : correct >= 10 ? "Bel exercice de concentration !" : "Continuez, l'esprit s'aiguise !"}
          </p>
          <button className="btn" onClick={start}>Rejouer</button>
        </div>
      )}
    </div>
  );
}
