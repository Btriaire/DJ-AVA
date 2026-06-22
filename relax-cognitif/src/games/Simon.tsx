import { useEffect, useRef, useState } from "react";
import WinReward from "../components/WinReward";
import { useGameSession } from "../lib/useGameSession";

type Mode = "entrainement" | "defi";
type Phase = "idle" | "show" | "input" | "done";

// 4 pétales aux teintes douces de l'app.
const PADS = [
  { base: "#4f9d83", lit: "#7fd0b4" }, // vert sauge
  { base: "#c4544a", lit: "#e89084" }, // terracotta
  { base: "#5984c4", lit: "#9bc0f0" }, // bleu
  { base: "#e0a23f", lit: "#f5cf7e" }, // or
];

const SUCCESS_AT = 6; // longueur de séquence atteinte = réussite

export default function Simon() {
  const [mode, setMode] = useState<Mode>("entrainement");
  const [phase, setPhase] = useState<Phase>("idle");
  const [seq, setSeq] = useState<number[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [step, setStep] = useState(0); // position attendue dans la saisie
  const [best, setBest] = useState(0);
  const [wrong, setWrong] = useState(false);
  const session = useGameSession("simon", mode);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const flashMs = mode === "defi" ? 300 : 480;
  const gapMs = mode === "defi" ? 140 : 240;

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  useEffect(() => () => clearTimers(), []);

  // Joue la séquence puis passe à la saisie.
  function playSequence(s: number[]) {
    setPhase("show");
    setActive(null);
    clearTimers();
    let t = 500;
    s.forEach((pad) => {
      timers.current.push(setTimeout(() => setActive(pad), t));
      timers.current.push(setTimeout(() => setActive(null), t + flashMs));
      t += flashMs + gapMs;
    });
    timers.current.push(setTimeout(() => {
      setStep(0);
      setPhase("input");
    }, t));
  }

  function nextRound(prev: number[]) {
    const s = [...prev, Math.floor(Math.random() * 4)];
    setSeq(s);
    playSequence(s);
  }

  function start() {
    session.reset();
    setBest(0);
    setWrong(false);
    nextRound([]);
  }

  function changeMode(m: Mode) {
    clearTimers();
    setMode(m);
    setPhase("idle");
    setSeq([]);
    setStep(0);
    setBest(0);
    setActive(null);
    setWrong(false);
  }

  function tap(pad: number) {
    if (phase !== "input") return;
    // retour visuel
    setActive(pad);
    setTimeout(() => setActive(null), 160);

    if (pad === seq[step]) {
      const ns = step + 1;
      if (ns === seq.length) {
        // séquence complète : niveau réussi
        const reached = seq.length;
        setBest(reached);
        if (reached >= SUCCESS_AT && !session.won) session.record("success");
        setPhase("show");
        timers.current.push(setTimeout(() => nextRound(seq), 650));
      } else {
        setStep(ns);
      }
    } else {
      // erreur : fin de partie
      setWrong(true);
      setBest(Math.max(best, seq.length - 1));
      if (seq.length - 1 < SUCCESS_AT) session.record("failure");
      setPhase("done");
      clearTimers();
    }
  }

  const level = seq.length;

  return (
    <div>
      <div className="seg seg-scroll" style={{ marginBottom: 8 }}>
        <button className={`seg-btn ${mode === "entrainement" ? "active" : ""}`} onClick={() => changeMode("entrainement")}>Entraînement</button>
        <button className={`seg-btn ${mode === "defi" ? "active" : ""}`} onClick={() => changeMode("defi")}>Défi ⚡</button>
      </div>

      <WinReward game="simon" show={session.won} />

      {phase === "idle" ? (
        <div className="rapidite-idle">
          <SimonPad active={null} onTap={() => {}} disabled />
          <p className="page-sub">
            Observez la fleur : ses pétales s'allument l'un après l'autre.
            Reproduisez la suite en les touchant dans le <strong>même ordre</strong>.
            La suite s'allonge à chaque réussite !
          </p>
          <button className="btn" onClick={start}>Démarrer</button>
        </div>
      ) : phase === "done" ? (
        <div className="rapidite-result">
          <p className="rapidite-avg">{best}</p>
          <p className="rapidite-avg-label">pétales mémorisés</p>
          <p className="rapidite-perf">
            {best >= SUCCESS_AT ? "⚡ Quelle mémoire !" : best >= 4 ? "Belle mémoire, encore un effort !" : "Continuez à vous exercer !"}
          </p>
          <button className="btn" onClick={start}>Rejouer</button>
        </div>
      ) : (
        <>
          <p className="rapidite-counter">
            Niveau {level}
            <span className="simon-state">{phase === "show" ? "Observez…" : "À vous !"}</span>
          </p>
          <SimonPad active={active} onTap={tap} disabled={phase !== "input"} wrong={wrong} />
        </>
      )}
    </div>
  );
}

function SimonPad({
  active,
  onTap,
  disabled,
  wrong,
}: {
  active: number | null;
  onTap: (pad: number) => void;
  disabled?: boolean;
  wrong?: boolean;
}) {
  // Disposition en fleur : 4 pétales autour d'un cœur.
  const paths = [
    "M50,50 L50,6 A44,44 0 0 0 6,50 Z", // haut-gauche (vert)
    "M50,50 L94,50 A44,44 0 0 0 50,6 Z", // haut-droite (terracotta)
    "M50,50 L6,50 A44,44 0 0 0 50,94 Z", // bas-gauche (bleu)
    "M50,50 L50,94 A44,44 0 0 0 94,50 Z", // bas-droite (or)
  ];
  return (
    <div className={`simon-wrap ${wrong ? "wrong" : ""}`}>
      <svg viewBox="0 0 100 100" className="simon-svg">
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill={active === i ? PADS[i].lit : PADS[i].base}
            stroke="#fff"
            strokeWidth="2.4"
            style={{
              cursor: disabled ? "default" : "pointer",
              filter: active === i ? "brightness(1.05)" : "none",
              transition: "fill 0.08s ease",
            }}
            onClick={() => !disabled && onTap(i)}
          />
        ))}
        <circle cx="50" cy="50" r="11" fill="var(--surface)" stroke="#fff" strokeWidth="2.4" />
      </svg>
    </div>
  );
}
